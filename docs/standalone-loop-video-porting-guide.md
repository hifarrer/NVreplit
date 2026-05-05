# Standalone Loop Video API - Porting Guide

This document explains how NeonVideo's loop-video style works so you can recreate it in a separate project as a standalone API.

The focus is the backend loop pipeline used by:

- `POST /api/loop-video` (prompt + user-provided audio URL)
- `GET /api/auto-generate-loop-video` (fully automated prompt + song + loop generation)

---

## 1. High-level architecture (models and APIs first)

The loop-video system builds a seamless visual loop in seven core stages:

1. Generate a still image from text.
2. Generate a 12s original video from that image.
3. Extract first and last frames from that 12s clip.
4. Generate a second 12s transition clip that goes from last frame back to first frame.
5. Merge original + transition into one looping source clip.
6. Loop that merged clip to match full audio length and mux audio.
7. Store final MP4 in object storage and return URL.

### AI models and external APIs used

- **WaveSpeed** (generation)
  - Text-to-image: `google/nano-banana-2/text-to-image`
  - Image-to-video (original and transition): `bytedance/seedance-v1.5-pro/image-to-video`
  - Async prediction polling: `/api/v3/predictions/{id}/result`
- **ffmpeg API** (video utilities)
  - Frame extraction: `/api/get_first_frame_image`, `/api/get_last_frame_image`
  - Clip merge: `/api/merge_videos`
  - Loop + audio mux: `/api/video_loop`
- **OpenAI** (only for auto-generate mode orchestration text)
  - `gpt-4o-mini` for:
    - themed song/video descriptions
    - music prompt creation
    - final loop-scene prompt creation
- **WaveSpeed Minimax music** (auto-generate mode only)
  - `minimax/music-02` for generating song audio from lyrics + prompt

### Internal services involved in this repo

- `server/routes.ts` - `processLoopVideo(...)`, `/api/loop-video`, `/api/auto-generate-loop-video`
- `server/services/wavespeed.ts`
  - `generateImageFromText(...)`
  - `generateVideoFromImageLoop(...)`
  - `generateVideoFromImageTransition(...)`
- `server/services/ffmpeg.ts`
  - `getFirstFrameImage(...)`
  - `getLastFrameImage(...)`
  - `mergeVideos(...)`
  - `videoLoop(...)`
- `server/services/loopVideoThemes.ts` - theme registry for auto-generate mode
- `server/services/openai.ts` + `server/services/minimax.ts` - text + song generation for auto mode

---

## 2. End-to-end loop pipeline

### 2.1 Inputs

Required:

- `prompt` (string)
- `audioUrl` (public MP3/WAV/AAC URL)

Optional:

- `aspectRatio` (`3:4`, `9:16`, `16:9`, default `3:4`)

### 2.2 Processing flow

1. **Image generation**
   - Call WaveSpeed Nano Banana 2 text-to-image with `aspect_ratio` and prompt.
2. **Original clip**
   - Call Seedance image-to-video for a 12s clip (`resolution: "480p"`).
3. **Frame extraction**
   - Extract both first and last frame from the original clip using ffmpeg API.
4. **Transition clip**
   - Call Seedance image-to-video again using:
     - `image = lastFrame`
     - `last_image = firstFrame`
   - This creates a visual bridge back toward frame 1.
5. **Merge**
   - Merge original + transition with ffmpeg merge endpoint.
6. **Loop-to-audio**
   - Call ffmpeg `video_loop` with merged clip URL + full `audioUrl`.
   - API returns loop count and final downloadable MP4.
7. **Persist output**
   - Upload final MP4 into your own object storage and return stable CDN URL.

---

## 3. Required environment variables (standalone API)

Minimum:

- `WAVESPEED_API_KEY`
- `FFMPEG_API_KEY`

Recommended:

- `FFMPEG_API_BASE` (default in this repo: `https://ffmpegapi-production.up.railway.app`)
- `OPENAI_API_KEY` (if you implement auto-generate mode)
- storage credentials for your own final asset hosting (S3/R2/Bunny/etc.)

---

## 4. Standalone code samples (TypeScript)

The snippets below are intentionally self-contained so an AI agent can copy and adapt them in a new project.

### 4.1 Shared polling helper for WaveSpeed predictions

```ts
type WavespeedPollResult = {
  data?: {
    status?: string;
    outputs?: string[];
    error?: unknown;
  };
  status?: string;
  error?: unknown;
};

async function pollWavespeedForOutput(
  requestId: string,
  apiKey: string,
  label: string,
  intervalMs = 10_000,
  maxAttempts = 60,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${label} poll failed: ${res.status}`);

    const json = (await res.json()) as WavespeedPollResult;
    const status = json.data?.status ?? json.status;

    if (status === "completed" && json.data?.outputs?.length) {
      return json.data.outputs[0];
    }
    if (status === "failed") {
      const err = json.data?.error ?? json.error ?? "Unknown error";
      throw new Error(`${label} failed: ${typeof err === "string" ? err : JSON.stringify(err)}`);
    }
  }
  throw new Error(`${label} timed out`);
}
```

### 4.2 Generate image from prompt (WaveSpeed nano-banana-2)

```ts
async function generateImageFromText(prompt: string, aspectRatio: "3:4" | "9:16" | "16:9", apiKey: string) {
  const res = await fetch("https://api.wavespeed.ai/api/v3/google/nano-banana-2/text-to-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      aspect_ratio: aspectRatio,
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: "jpeg",
      prompt,
      resolution: "1k",
    }),
  });

  if (!res.ok) throw new Error(`Text-to-image error: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const requestId = json?.data?.id ?? json?.id;
  if (!requestId) throw new Error("No request ID returned for text-to-image");

  return pollWavespeedForOutput(requestId, apiKey, "text-to-image", 5_000, 60);
}
```

### 4.3 Generate original and transition videos (Seedance)

```ts
async function submitSeedanceI2V(body: Record<string, unknown>, apiKey: string, label: string) {
  const res = await fetch("https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`${label} submit failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const requestId = json?.data?.id ?? json?.id;
  if (!requestId) throw new Error(`${label}: missing request ID`);

  return pollWavespeedForOutput(requestId, apiKey, label, 10_000, 60);
}

async function generateOriginalVideo(imageUrl: string, prompt: string, aspectRatio: string, apiKey: string) {
  return submitSeedanceI2V(
    {
      aspect_ratio: aspectRatio,
      camera_fixed: false,
      duration: 12,
      generate_audio: false,
      image: imageUrl,
      prompt,
      resolution: "480p",
      seed: -1,
    },
    apiKey,
    "original-loop-video",
  );
}

async function generateTransitionVideo(lastFrameUrl: string, firstFrameUrl: string, aspectRatio: string, apiKey: string) {
  return submitSeedanceI2V(
    {
      aspect_ratio: aspectRatio,
      camera_fixed: false,
      duration: 12,
      generate_audio: false,
      image: lastFrameUrl,
      last_image: firstFrameUrl,
      prompt: "a slow smooth transition between images",
      resolution: "480p",
      seed: -1,
    },
    apiKey,
    "transition-loop-video",
  );
}
```

### 4.4 Frame extraction + merge + loop-to-audio (ffmpeg API)

```ts
async function getFrameImage(videoUrl: string, endpoint: "get_first_frame_image" | "get_last_frame_image", ffmpegApiBase: string, ffmpegApiKey: string) {
  const res = await fetch(`${ffmpegApiBase}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ffmpegApiKey,
    },
    body: JSON.stringify({ video_url: videoUrl }),
  });
  if (!res.ok) throw new Error(`${endpoint} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.success || !json.image_url) throw new Error(`${endpoint} returned invalid payload`);
  return json.image_url as string;
}

async function mergeVideos(videoUrls: string[], dimensions: string, ffmpegApiBase: string, ffmpegApiKey: string) {
  const res = await fetch(`${ffmpegApiBase}/api/merge_videos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ffmpegApiKey,
    },
    body: JSON.stringify({
      video_urls: videoUrls,
      dimensions,
    }),
  });
  if (!res.ok) throw new Error(`merge_videos failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.success || !json.download_url) throw new Error("merge_videos returned invalid payload");
  return json.download_url as string;
}

async function loopVideoToAudio(videoUrl: string, audioUrl: string, ffmpegApiBase: string, ffmpegApiKey: string) {
  const res = await fetch(`${ffmpegApiBase}/api/video_loop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ffmpegApiKey,
    },
    body: JSON.stringify({
      video_url: videoUrl,
      audio_url: audioUrl,
    }),
  });
  if (!res.ok) throw new Error(`video_loop failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.success || !json.download_url) throw new Error("video_loop returned invalid payload");
  return {
    downloadUrl: json.download_url as string,
    loops: (json.loops as number | undefined) ?? null,
  };
}
```

### 4.5 Orchestrator function (core standalone loop API)

```ts
type AspectRatio = "3:4" | "9:16" | "16:9";

function aspectToDimensions(aspectRatio: AspectRatio): string {
  if (aspectRatio === "9:16") return "1080x1920";
  if (aspectRatio === "3:4") return "1080x1440";
  return "1920x1080";
}

export async function createLoopVideo(params: {
  prompt: string;
  audioUrl: string;
  aspectRatio?: AspectRatio;
  wavespeedApiKey: string;
  ffmpegApiKey: string;
  ffmpegApiBase: string;
  persistFinalVideo: (sourceUrl: string) => Promise<string>;
}) {
  const {
    prompt,
    audioUrl,
    aspectRatio = "3:4",
    wavespeedApiKey,
    ffmpegApiKey,
    ffmpegApiBase,
    persistFinalVideo,
  } = params;

  if (!prompt.trim()) throw new Error("prompt is required");
  if (!audioUrl.trim()) throw new Error("audioUrl is required");

  const imageUrl = await generateImageFromText(prompt.trim(), aspectRatio, wavespeedApiKey);
  const originalVideoUrl = await generateOriginalVideo(imageUrl, prompt.trim(), aspectRatio, wavespeedApiKey);

  const lastFrame = await getFrameImage(originalVideoUrl, "get_last_frame_image", ffmpegApiBase, ffmpegApiKey);
  const firstFrame = await getFrameImage(originalVideoUrl, "get_first_frame_image", ffmpegApiBase, ffmpegApiKey);

  const transitionVideoUrl = await generateTransitionVideo(lastFrame, firstFrame, aspectRatio, wavespeedApiKey);
  const mergedVideoUrl = await mergeVideos(
    [originalVideoUrl, transitionVideoUrl],
    aspectToDimensions(aspectRatio),
    ffmpegApiBase,
    ffmpegApiKey,
  );

  const { downloadUrl, loops } = await loopVideoToAudio(
    mergedVideoUrl,
    audioUrl.trim(),
    ffmpegApiBase,
    ffmpegApiKey,
  );

  const finalVideoUrl = await persistFinalVideo(downloadUrl);
  return { finalVideoUrl, loops };
}
```

### 4.6 Minimal Express endpoint wrapper

```ts
import express from "express";

const app = express();
app.use(express.json());

app.post("/api/loop-video", async (req, res) => {
  try {
    const { prompt, audioUrl, aspectRatio } = req.body as {
      prompt?: string;
      audioUrl?: string;
      aspectRatio?: "3:4" | "9:16" | "16:9";
    };

    if (!prompt || !audioUrl) {
      return res.status(400).json({ error: "prompt and audioUrl are required" });
    }

    const result = await createLoopVideo({
      prompt,
      audioUrl,
      aspectRatio,
      wavespeedApiKey: process.env.WAVESPEED_API_KEY!,
      ffmpegApiKey: process.env.FFMPEG_API_KEY!,
      ffmpegApiBase: process.env.FFMPEG_API_BASE || "https://ffmpegapi-production.up.railway.app",
      persistFinalVideo: async (sourceUrl) => {
        // Replace with your own object-storage upload logic.
        return sourceUrl;
      },
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
```

---

## 5. Auto-generate mode (optional)

If you also want full automation (no user prompt/audio input), replicate this order:

1. Select theme (`loopVideoThemes` style).
2. Use OpenAI (`gpt-4o-mini`) to generate:
   - song description
   - video description
3. Generate lyrics (OpenAI helper).
4. Generate song prompt (OpenAI helper).
5. Generate song audio (WaveSpeed Minimax `music-02`).
6. Generate final loop-scene prompt (OpenAI helper).
7. Run the same `createLoopVideo(...)` pipeline with generated `videoPrompt + audioUrl`.

This keeps auto and manual modes sharing one loop-generation core.

---

## 6. Porting checklist

1. Add required env vars (`WAVESPEED_API_KEY`, `FFMPEG_API_KEY`, optional `OPENAI_API_KEY`).
2. Implement the six API wrappers shown above (T2I, I2V, frame extract, merge, loop, poll).
3. Implement one orchestration function (`createLoopVideo`) and keep it stateless.
4. Ensure all URLs you pass to WaveSpeed/ffmpeg are publicly fetchable HTTP(S) URLs.
5. Persist final output to your own storage so URL remains stable.
6. Add idempotent progress logging in your new project (recommended for long-running jobs).
7. Add retries/backoff around all external API calls (recommended for production).

---

*Generated from repository implementation in `server/routes.ts`, `server/services/wavespeed.ts`, `server/services/ffmpeg.ts`, `server/services/loopVideoThemes.ts`, `server/services/openai.ts`, and `server/services/minimax.ts`.*
