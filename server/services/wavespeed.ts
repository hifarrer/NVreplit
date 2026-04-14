import { normalizeStoryVoiceId } from "@shared/storyConstants";
import { parseAssToTimestampedWords } from "./captions";
import { withGenerationApiRetries } from "./generationRetry";

const WAVESPEED_API_KEY =
  process.env.WAVESPEED_API_KEY ||
  process.env.WAVESPEED_API_KEY_ENV_VAR ||
  "default_key";

// Retryable network/processing errors (e.g. WaveSpeed unable to fetch from ffmpegapi)
const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: options.signal });
      return res;
    } catch (err: unknown) {
      const e = err as { cause?: { code?: string }; code?: string; message?: string };
      const code = e?.cause?.code ?? e?.code;
      const isRetryable =
        RETRYABLE_NETWORK_CODES.has(code) ||
        (e?.message && /fetch failed|failed to fetch|timeout|econnreset|socket hang up/i.test(e.message));
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.warn(
        `[Wavespeed] fetch attempt ${attempt}/${maxRetries} failed (${code ?? e?.message}), retrying in ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

// Interface for timestamped words from subtitles
interface TimestampedWord {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string;
}

// Function to parse .ass subtitle file and extract timestamped words
export function parseAssSubtitles(assContent: string): TimestampedWord[] {
  return parseAssToTimestampedWords(assContent);
}

// Function to check if a time segment contains lyrics
export function segmentHasLyrics(
  segmentStartTime: number,
  segmentEndTime: number,
  timestampedWords: TimestampedWord[]
): boolean {
  // Check if any word overlaps with this segment
  let wordCount = 0;
  for (const word of timestampedWords) {
    // Word overlaps if it starts before segment ends AND ends after segment starts
    if (word.start < segmentEndTime && word.end > segmentStartTime) {
      wordCount++;
    }
  }

  if (wordCount > 0) {
    console.log(`Segment ${segmentStartTime.toFixed(1)}s-${segmentEndTime.toFixed(1)}s contains ${wordCount} word(s)`);
  } else {
    console.log(`Segment ${segmentStartTime.toFixed(1)}s-${segmentEndTime.toFixed(1)}s has NO lyrics`);
  }

  return wordCount > 0;
}

// Safe fallback prompt when content is flagged as sensitive
const SAFE_FALLBACK_PROMPT = "the character dances gracefully";

// Video quality type for different AI models
export type VideoQuality = "quick" | "medium" | "premium";

// Internal function that generates a single video segment attempt
async function generateVideoSegmentInternal(
  audioUrl: string,
  imageUrl: string,
  prompt: string,
  model: "infinitetalk" | "seedance" = "infinitetalk",
  segmentDuration: number = 10,
  videoQuality: VideoQuality = "quick",
  aspectRatio: string = "16:9",
): Promise<string> {
  console.log("=== GENERATING VIDEO SEGMENT ===");
  console.log("Audio URL:", audioUrl);
  console.log("Image URL:", imageUrl);
  console.log("Prompt:", prompt);
  console.log("Model:", model);
  console.log("Video Quality:", videoQuality);
  console.log("Segment Duration:", segmentDuration, "seconds");
  console.log("Aspect Ratio:", aspectRatio);

  // Determine endpoint and request body based on video quality and model type
  let endpoint: string;
  let requestBody: any;

  if (model === "infinitetalk") {
    // Lipsync model: wavespeed-ai/infinitetalk-fast (audio + image + prompt + seed)
    endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk-fast";
    requestBody = {
      audio: audioUrl,
      image: imageUrl,
      prompt: prompt,
      seed: -1,
    };
  } else {
    // Non-lipsync models (seedance for quick, Alibaba Wan 2.5 for medium/premium)
    // Seedance v1.5 Pro requires minimum 4 seconds, Wan 2.5 requires minimum 2 seconds
    let minDuration: number;
    let maxDuration: number;

    if (videoQuality === "quick") {
      // Seedance v1.5 Pro requires minimum 4 seconds
      minDuration = 4;
      maxDuration = 12;
    } else {
      // Alibaba Wan 2.5 requires minimum 2 seconds
      minDuration = 2;
      maxDuration = 12;
    }

    const roundedDuration = Math.min(maxDuration, Math.max(minDuration, Math.round(segmentDuration)));
    console.log(`Video duration: ${segmentDuration}s → rounded to ${roundedDuration}s (valid range: ${minDuration}-${maxDuration})`);

    // Select model based on video quality
    switch (videoQuality) {
      case "premium":
        // Alibaba Wan 2.5 - Premium quality with 720p resolution (supports lipsync)
        endpoint = "https://api.wavespeed.ai/api/v3/alibaba/wan-2.5/image-to-video";
        requestBody = {
          audio: audioUrl,
          duration: roundedDuration,
          enable_prompt_expansion: false,
          image: imageUrl,
          prompt: prompt,
          resolution: "720p",
          seed: -1,
        };
        break;
      case "medium":
        // Alibaba Wan 2.5 - Medium quality with 480p resolution (supports lipsync)
        endpoint = "https://api.wavespeed.ai/api/v3/alibaba/wan-2.5/image-to-video";
        requestBody = {
          audio: audioUrl,
          duration: roundedDuration,
          enable_prompt_expansion: false,
          image: imageUrl,
          prompt: prompt,
          resolution: "480p",
          seed: -1,
        };
        break;
      case "quick":
      default: {
        // Seedance v1.5 Pro - Quick quality (new default)
        // Use at least 6s: 5s clips often cut off overlaid/lipsync audio; longer requested segments unchanged.
        const seedanceDuration = Math.min(maxDuration, Math.max(6, roundedDuration));
        if (seedanceDuration !== roundedDuration) {
          console.log(`Seedance v1.5 Pro duration: ${roundedDuration}s → ${seedanceDuration}s (minimum 6s for this model)`);
        }
        endpoint = "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video-fast";
        requestBody = {
          aspect_ratio: aspectRatio, // Dynamic aspect ratio from project settings
          camera_fixed: false,
          duration: seedanceDuration,
          generate_audio: false,
          image: imageUrl,
          prompt: prompt,
          resolution: "720p",
          seed: -1,
        };
        break;
      }
    }
  }

  console.log("Selected endpoint:", endpoint);

  console.log(
    "Wavespeed request body:",
    JSON.stringify(requestBody, null, 2),
  );

  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed");
  }

  console.log(
    `Video segment submission successful, request ID: ${requestId}`,
  );

  // Poll for results
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes with 10-second intervals

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      },
    );

    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();

    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      return statusResult.data.outputs[0];
    } else if (statusResult.status === "failed" || statusResult.data?.status === "failed") {
      // Handle both response formats: statusResult.status or statusResult.data.status
      const errorDetails = statusResult.error || statusResult.data?.error || "Unknown error";
      const errorMessage = typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails);
      console.error(`Video generation failed with error: ${errorMessage}`);
      throw new Error(
        `Video generation failed: ${errorMessage}`,
      );
    }

    attempts++;
  }

  throw new Error("Video generation timed out");
}

// Check if error is due to sensitive content flagging
function isSensitiveContentError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return errorMessage.includes('sensitive') ||
    errorMessage.includes('flagged') ||
    errorMessage.includes('content policy') ||
    errorMessage.includes('nsfw') ||
    errorMessage.includes('inappropriate');
}

// Check if error is a transient/retryable network error or processing error
function isTransientError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes("connection aborted") ||
    errorMessage.includes("remotedisconnected") ||
    errorMessage.includes("remote end closed connection") ||
    errorMessage.includes("econnreset") ||
    errorMessage.includes("socket hang up") ||
    errorMessage.includes("network error") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("timed out") || // e.g. "Read timed out" from WaveSpeed/ffmpegapi
    errorMessage.includes("502") ||
    errorMessage.includes("503") ||
    errorMessage.includes("504") ||
    errorMessage.includes("ffmpeg") ||
    errorMessage.includes("ffmpegapi") || // WaveSpeed failed to fetch from ffmpegapi.net
    errorMessage.includes("httpsconnectionpool") || // e.g. HTTPSConnectionPool read timeout
    errorMessage.includes("error during processing") ||
    errorMessage.includes("video generation failed") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("failed to fetch")
  );
}

// Maximum number of retries for transient errors
const MAX_TRANSIENT_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds between retries

export async function generateVideoSegment(
  audioUrl: string,
  imageUrl: string,
  prompt: string,
  model: "infinitetalk" | "seedance" = "infinitetalk",
  segmentDuration: number = 10,
  videoQuality: VideoQuality = "quick",
  aspectRatio: string = "16:9",
): Promise<string> {
  return withGenerationApiRetries(
    `Video segment (${model})`,
    async () => {
      let lastError: Error | null = null;
      let currentPrompt = prompt;

      for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          console.log(`Video segment generation attempt ${attempt}/${MAX_TRANSIENT_RETRIES}`);
          return await generateVideoSegmentInternal(
            audioUrl,
            imageUrl,
            currentPrompt,
            model,
            segmentDuration,
            videoQuality,
            aspectRatio,
          );
        } catch (error) {
          const err = error as Error;
          lastError = err;

          if (isSensitiveContentError(err)) {
            console.log(`\n=== SENSITIVE CONTENT DETECTED ===`);
            console.log(`Original prompt was flagged: "${currentPrompt}"`);
            console.log(`Retrying with safe fallback prompt: "${SAFE_FALLBACK_PROMPT}"`);
            console.log(`================================\n`);
            currentPrompt = SAFE_FALLBACK_PROMPT;
            continue;
          }

          if (isTransientError(err) && attempt < MAX_TRANSIENT_RETRIES) {
            console.log(`\n=== TRANSIENT ERROR DETECTED (attempt ${attempt}/${MAX_TRANSIENT_RETRIES}) ===`);
            console.log(`Error: ${err.message}`);
            console.log(`Waiting ${RETRY_DELAY_MS / 1000} seconds before retry...`);
            console.log(`================================================\n`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }

          break;
        }
      }

      console.error("Wavespeed generation error after all retries:", lastError);
      throw new Error(
        "Failed to generate video segment after " +
          MAX_TRANSIENT_RETRIES +
          " attempts: " +
          (lastError?.message || "Unknown error"),
      );
    },
  );
}

// Dynamic video generation based on configuration with smart lyrics detection
export async function generateAllVideoSegmentsDynamic(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[],
  config: {
    numberOfVideosRegularApi: number;
    numberOfVideosLipsync: number;
    makeCharacterSing: boolean;
    videoQuality?: VideoQuality;
    sceneLipsyncSettings?: (boolean | null)[]; // Per-scene lipsync toggle settings (null means use default pattern)
    isInstrumental?: boolean; // Flag to indicate instrumental videos (never use infinitetalk)
    aspectRatio?: string; // Aspect ratio for video generation (e.g., "16:9", "9:16", "3:4")
  },
  subtitleData?: {
    assContent?: string;
    totalDuration?: number;
  },
  segmentDurations?: number[] // Duration of each segment in seconds (important for last segment)
): Promise<{
  videoUrls: string[];
  segmentPairs: Array<{ a: string; b: string }>;
}> {
  const videoQuality = config.videoQuality || "quick";
  const sceneLipsyncSettings = config.sceneLipsyncSettings;
  const aspectRatio = config.aspectRatio || "16:9";

  // CRITICAL: For instrumental videos, never use infinitetalk
  const isInstrumental = config.isInstrumental === true;
  if (isInstrumental) {
    console.log(`⚠️ INSTRUMENTAL VIDEO DETECTED - Forcing seedance only (no infinitetalk lipsync)`);
    config.makeCharacterSing = false;
    config.numberOfVideosLipsync = 0;
  }

  console.log(`Starting dynamic video generation:`);
  console.log(`- Audio segments: ${audioSegments.length}`);
  console.log(`- Scene images: ${imageUrls.length}`);
  console.log(
    `- Regular videos (seedance): ${config.numberOfVideosRegularApi}`,
  );
  console.log(`- Lipsync videos (infinitetalk-fast): ${config.numberOfVideosLipsync}`);
  console.log(`- Make character sing: ${config.makeCharacterSing}`);
  console.log(`- Is instrumental: ${isInstrumental}`);
  console.log(`- Video quality: ${videoQuality}`);
  console.log(`- Has subtitle data: ${!!subtitleData?.assContent}`);
  console.log(`- Segment durations provided: ${segmentDurations ? segmentDurations.join(', ') + 's' : 'using defaults'}`);
  console.log(`- Per-scene lipsync settings: ${sceneLipsyncSettings ? JSON.stringify(sceneLipsyncSettings) : 'using default pattern'}`);

  const totalVideos =
    config.numberOfVideosRegularApi +
    (config.makeCharacterSing ? config.numberOfVideosLipsync : 0);

  if (
    audioSegments.length !== imageUrls.length ||
    audioSegments.length !== prompts.length
  ) {
    throw new Error(
      `Mismatch in segments: ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`,
    );
  }

  // Parse subtitle data if available for smart lyrics detection
  let timestampedWords: TimestampedWord[] = [];
  if (subtitleData?.assContent) {
    timestampedWords = parseAssSubtitles(subtitleData.assContent);
    console.log(`Parsed ${timestampedWords.length} timestamped words from subtitles for smart lyrics detection`);
  } else {
    console.log("No subtitle data available - will not use lipsync for segments without detected lyrics");
  }

  // Use provided segment durations or calculate from total duration
  // For proper sync, each segment should be 6 seconds except potentially the last one
  const totalDuration = subtitleData?.totalDuration || (audioSegments.length * 6);

  // Helper to get segment duration for a given index
  const getSegmentDuration = (index: number): number => {
    if (segmentDurations && segmentDurations[index] !== undefined) {
      // Use provided segment duration, but ensure minimum of 1 second
      return Math.max(1, segmentDurations[index]);
    }
    // Fallback: calculate based on total duration
    const defaultDuration = 6;
    if (index < audioSegments.length - 1) {
      return defaultDuration;
    }
    // Last segment gets remainder - use actual remainder value for proper sync
    // For exact multiples of 6, the remainder is 0 but the segment still exists,
    // so default to 6 seconds in that case
    const usedDuration = (audioSegments.length - 1) * defaultDuration;
    const remainder = totalDuration - usedDuration;
    // Cap at 6, minimum of 1 second (handle edge case of exact multiples)
    return Math.min(defaultDuration, Math.max(1, remainder));
  };

  // Log calculated segment durations
  for (let i = 0; i < audioSegments.length; i++) {
    console.log(`Segment ${i + 1} duration: ${getSegmentDuration(i)}s`);
  }

  // Helper function to determine if a scene should use lipsync
  // Priority: 1) Explicit per-scene setting, 2) Duration check for last segment, 3) Default pattern based on scene number
  const shouldUseLipsync = (index: number, segDuration: number): { useLipsync: boolean; reason: string } => {
    const isLastSegment = index === audioSegments.length - 1;
    const sceneNumber = index + 1; // 1-indexed

    // Check if there's an explicit per-scene lipsync setting
    if (sceneLipsyncSettings && sceneLipsyncSettings[index] !== null && sceneLipsyncSettings[index] !== undefined) {
      const explicitSetting = sceneLipsyncSettings[index];
      return {
        useLipsync: explicitSetting === true,
        reason: `per-scene toggle = ${explicitSetting ? 'LIPSYNC' : 'REGULAR'}`
      };
    }

    // IMPORTANT: If last segment is less than 4 seconds, do NOT use lipsync (infinitetalk-fast)
    // Very short audio segments can cause errors with lipsync models
    if (isLastSegment && segDuration < 4) {
      console.log(`⚠️ Last segment duration (${segDuration}s) is too short for lipsync - forcing REGULAR (seedance)`);
      return { useLipsync: false, reason: `last segment ${segDuration}s < 4s → forcing REGULAR (too short for lipsync)` };
    }

    // For last segment between 4-6 seconds, we can use lipsync if needed
    // Seedance requires minimum 2 seconds, so segments < 6s can still use seedance
    if (isLastSegment && segDuration < 6) {
      // Use default pattern for segments 4-6 seconds (can use either model)
      // Continue to pattern logic below
    }

    // Default pattern for 18-second videos (3 segments): Scene 1 = regular, Scenes 2-3 = lipsync
    // Note: With 6-second segments, 30-second videos have 5 segments and use ODD/EVEN pattern
    if (audioSegments.length === 3) {
      if (index === 0) {
        return { useLipsync: false, reason: '30s pattern: Scene 1 → REGULAR' };
      } else {
        // For scene 2-3, check if it's the last segment and too short
        if (isLastSegment && segDuration < 4) {
          return { useLipsync: false, reason: `30s pattern: Scene ${sceneNumber} → REGULAR (${segDuration}s too short for lipsync)` };
        }
        return { useLipsync: true, reason: `30s pattern: Scene ${sceneNumber} → LIPSYNC` };
      }
    }

    // Default pattern for longer videos: ODD scenes = regular, EVEN scenes = lipsync
    if (sceneNumber % 2 === 1) {
      return { useLipsync: false, reason: 'ODD scene → REGULAR' };
    } else {
      // For even scenes, check if it's the last segment and too short
      if (isLastSegment && segDuration < 4) {
        return { useLipsync: false, reason: `EVEN scene → REGULAR (${segDuration}s too short for lipsync)` };
      }
      return { useLipsync: true, reason: 'EVEN scene → LIPSYNC' };
    }
  };

  // Generate videos using intercalated pattern when makeCharacterSing is enabled
  const videoPromises: Promise<string>[] = [];
  const videoTypes: ("seedance" | "infinitetalk")[] = [];

  if (config.makeCharacterSing) {
    // Generate videos for each segment using per-scene lipsync settings or default pattern
    for (let i = 0; i < audioSegments.length; i++) {
      const segDuration = getSegmentDuration(i);
      const sceneNumber = i + 1;

      // Calculate time range for logging
      let cumulativeStart = 0;
      for (let j = 0; j < i; j++) {
        cumulativeStart += getSegmentDuration(j);
      }
      const segmentEnd = cumulativeStart + segDuration;

      console.log(`\n=== SEGMENT ${i + 1} (${cumulativeStart.toFixed(1)}s-${segmentEnd.toFixed(1)}s, duration: ${segDuration}s) ===`);
      console.log(`  - Scene ${sceneNumber} (index ${i})`);

      // Determine model based on per-scene lipsync setting or default pattern
      const { useLipsync, reason } = shouldUseLipsync(i, segDuration);
      const model: "seedance" | "infinitetalk" = useLipsync ? "infinitetalk" : "seedance";

      console.log(`  - ${reason} → using ${model}`);

      videoTypes.push(model);

      if (model === "infinitetalk") {
        // Infinitetalk requires audio for lipsync (duration comes from audio)
        console.log(`  → Audio URL: ${audioSegments[i].substring(0, 50)}...`);
        videoPromises.push(
          generateVideoSegment(
            audioSegments[i],
            imageUrls[i],
            prompts[i],
            "infinitetalk",
            segDuration,
            videoQuality,
            aspectRatio,
          ),
        );
      } else {
        // Seedance uses explicit duration parameter
        // For medium/premium quality, pass audio URL since wan-2.5 supports audio-synced video
        console.log(`  → Using seedance with duration: ${segDuration}s`);
        const seedanceAudioUrl = (videoQuality === "medium" || videoQuality === "premium") ? audioSegments[i] : "";
        videoPromises.push(
          generateVideoSegment(seedanceAudioUrl, imageUrls[i], prompts[i], "seedance", segDuration, videoQuality, aspectRatio),
        );
      }
    }
  } else {
    // Only use seedance model when makeCharacterSing is disabled
    // Note: For the last segment with duration < 6s, seedance will still generate 6s
    // but since there's no lipsync, sync issues are not a concern - the audio simply ends first
    for (let i = 0; i < audioSegments.length; i++) {
      const segDuration = getSegmentDuration(i);
      // Seedance requires minimum 6 seconds, use full 6s for short last segment
      const effectiveDuration = Math.max(6, segDuration);

      console.log(
        `Generating video segment ${i + 1} using seedance model (no lipsync, ${effectiveDuration}s)`,
      );
      videoTypes.push("seedance");
      // For medium/premium quality, pass audio URL since wan-2.5 supports audio-synced video
      const seedanceAudioUrl = (videoQuality === "medium" || videoQuality === "premium") ? audioSegments[i] : "";
      videoPromises.push(
        generateVideoSegment(seedanceAudioUrl, imageUrls[i], prompts[i], "seedance", effectiveDuration, videoQuality, aspectRatio),
      );
    }
  }

  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);

  // Create segment pairs for Picture-in-Picture compositions
  // Group videos into pairs based on their types: infinitetalk (main) + seedance (overlay)
  const segmentPairs: Array<{ a: string; b: string }> = [];

  if (config.makeCharacterSing) {
    // Separate videos by type
    const lipsyncVideos: string[] = [];
    const seedanceVideos: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      if (videoTypes[i] === "infinitetalk") {
        lipsyncVideos.push(videoUrls[i]);
      } else {
        seedanceVideos.push(videoUrls[i]);
      }
    }

    console.log(
      `Separating videos for PiP: ${lipsyncVideos.length} infinitetalk, ${seedanceVideos.length} seedance`,
    );

    // Create pairs: lipsync as main video (a), seedance as overlay (b)
    const pairCount = Math.min(lipsyncVideos.length, seedanceVideos.length);
    for (let i = 0; i < pairCount; i++) {
      segmentPairs.push({
        a: lipsyncVideos[i], // Main video (infinitetalk)
        b: seedanceVideos[i], // Overlay video (seedance)
      });
    }

    console.log(
      `Created ${segmentPairs.length} segment pairs for PiP composition`,
    );
  } else {
    // When makeCharacterSing is disabled, we only have seedance videos
    // For PiP composition, we need pairs, so we'll pair adjacent videos
    console.log(
      `Make character sing disabled - pairing adjacent seedance videos for PiP`,
    );
    for (let i = 0; i < videoUrls.length - 1; i += 2) {
      if (i + 1 < videoUrls.length) {
        segmentPairs.push({
          a: videoUrls[i], // First video as main
          b: videoUrls[i + 1], // Second video as overlay
        });
      }
    }
    console.log(
      `Created ${segmentPairs.length} segment pairs from seedance videos`,
    );
  }

  return { videoUrls, segmentPairs };
}

// Legacy function for backward compatibility
export async function generateAllVideoSegments(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[],
): Promise<{
  videoUrls: string[];
  segmentPairs: Array<{ a: string; b: string }>;
}> {
  console.log(
    `Starting video generation for ${audioSegments.length} audio segments and ${imageUrls.length} scenes`,
  );

  if (
    audioSegments.length !== 4 ||
    imageUrls.length !== 8 ||
    prompts.length !== 8
  ) {
    throw new Error(
      `Expected 4 audio segments and 8 scenes, got ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`,
    );
  }

  // Generate videos in parallel
  const videoPromises: Promise<string>[] = [];

  // Generate 4 videos with audio using infinitetalk (part_1a, part_2a, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}a`;
    console.log(
      `Generating video segment ${segmentLabel} using infinitetalk model with audio`,
    );
    console.log(`Audio URL: ${audioSegments[i]}`);
    console.log(`Image URL: ${imageUrls[i * 2]}`); // Use every other image for 'a' videos
    console.log(`Prompt: ${prompts[i * 2]}`);

    videoPromises.push(
      generateVideoSegment(
        audioSegments[i],
        imageUrls[i * 2],
        prompts[i * 2],
        "infinitetalk",
        10,
        "quick",
        "16:9", // Legacy function uses default aspect ratio
      ),
    );
  }

  // Generate 4 short videos without audio using seedance (part_1b, part_2b, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}b`;
    console.log(
      `Generating video segment ${segmentLabel} using seedance model (no audio, 6 seconds)`,
    );
    console.log(`Image URL: ${imageUrls[i * 2 + 1]}`); // Use alternate images for 'b' videos
    console.log(`Prompt: ${prompts[i * 2 + 1]}`);

    // Seedance doesn't use audio, pass empty string
    videoPromises.push(
      generateVideoSegment(
        "",
        imageUrls[i * 2 + 1],
        prompts[i * 2 + 1],
        "seedance",
        6,
        "quick",
        "16:9", // Legacy function uses default aspect ratio
      ),
    );
  }

  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);

  // Group videos into pairs for picture-in-picture
  // First 4 are 'a' videos, last 4 are 'b' videos
  const segmentPairs: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < 4; i++) {
    segmentPairs.push({
      a: videoUrls[i], // infinitetalk video with audio (1a, 2a, 3a, 4a)
      b: videoUrls[i + 4], // seedance video without audio (1b, 2b, 3b, 4b)
    });
  }

  return { videoUrls, segmentPairs };
}

// Image-to-Image Hyper Real Enhancement
export async function enhanceImageHyperReal(
  imageUrl: string,
  prompt: string
): Promise<string> {
  console.log("=== ENHANCING IMAGE TO HYPER REAL ===");
  console.log("Image URL:", imageUrl);
  console.log("Prompt:", prompt);

  const response = await fetchWithRetry(
    "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image-turbo/image-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        enable_base64_output: false,
        enable_sync_mode: false,
        image: imageUrl,
        output_format: "jpeg",
        prompt: prompt,
        seed: -1,
        size: "1024*1024",
        strength: 0.8,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed image-to-image API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed image-to-image API");
  }

  console.log(`Hyper real enhancement submitted, request ID: ${requestId}`);

  // Poll for results
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes with 5-second intervals

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      },
    );

    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    console.log(`Poll attempt ${attempts + 1}: status = ${statusResult.data?.status}`);
    console.log(`Poll response:`, JSON.stringify(statusResult, null, 2));

    if (statusResult.data?.status === "completed") {
      // Handle various WaveSpeed response formats
      let enhancedImageUrl: string | undefined;

      if (statusResult.data.outputs && statusResult.data.outputs.length > 0) {
        // Format: { data: { outputs: ["url1", "url2"] } }
        enhancedImageUrl = statusResult.data.outputs[0];
      } else if (statusResult.data.output) {
        // Format: { data: { output: "url" } } or { data: { output: ["url"] } }
        enhancedImageUrl = Array.isArray(statusResult.data.output)
          ? statusResult.data.output[0]
          : statusResult.data.output;
      } else if (statusResult.data.image) {
        // Format: { data: { image: "url" } }
        enhancedImageUrl = statusResult.data.image;
      }

      if (enhancedImageUrl) {
        console.log("Hyper real enhancement completed:", enhancedImageUrl);
        return enhancedImageUrl;
      }
    } else if (statusResult.data?.status === "failed") {
      throw new Error(
        `Hyper real enhancement failed: ${statusResult.data.error || "Unknown error"}`
      );
    }

    attempts++;
  }

  throw new Error("Hyper real enhancement timed out");
}

// Text-to-Image via nano-banana-2 (used by Video Shorts)
export async function generateImageFromText(
  prompt: string,
  aspectRatio: string = "9:16",
): Promise<string> {
  console.log("=== GENERATING IMAGE FROM TEXT (nano-banana-2) ===");
  console.log("Prompt:", prompt);
  console.log("Aspect Ratio:", aspectRatio);

  const response = await fetchWithRetry(
    "https://api.wavespeed.ai/api/v3/google/nano-banana-2/text-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        aspect_ratio: aspectRatio,
        enable_base64_output: false,
        enable_sync_mode: false,
        output_format: "jpeg",
        prompt,
        resolution: "1k",
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed text-to-image API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed text-to-image API");
  }

  console.log(`Text-to-image submitted, request ID: ${requestId}`);

  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );

    if (!statusResponse.ok) {
      throw new Error(`Text-to-image status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    console.log(`Text-to-image poll attempt ${attempts + 1}: status = ${statusResult.data?.status}`);

    if (statusResult.data?.status === "completed") {
      let imageUrl: string | undefined;
      if (statusResult.data.outputs && statusResult.data.outputs.length > 0) {
        imageUrl = statusResult.data.outputs[0];
      } else if (statusResult.data.output) {
        imageUrl = Array.isArray(statusResult.data.output)
          ? statusResult.data.output[0]
          : statusResult.data.output;
      } else if (statusResult.data.image) {
        imageUrl = statusResult.data.image;
      }

      if (imageUrl) {
        console.log("Text-to-image completed:", imageUrl);
        return imageUrl;
      }
    } else if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
      const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
      throw new Error(`Text-to-image generation failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`);
    }

    attempts++;
  }

  throw new Error("Text-to-image generation timed out");
}

// Image-to-Video via seedance-v1.5-pro (used by Video Shorts)
export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  aspectRatio: string = "9:16",
  duration: number = 12,
): Promise<string> {
  console.log("=== GENERATING VIDEO FROM IMAGE (seedance-v1.5-pro) ===");
  console.log("Image URL:", imageUrl);
  console.log("Prompt:", prompt);
  console.log("Aspect Ratio:", aspectRatio);
  const seedanceDuration = Math.min(12, Math.max(6, Math.round(duration)));
  console.log("Duration:", duration, "→ API:", seedanceDuration, "s (seedance v1.5 min 6s)");
  const response = await fetchWithRetry(
    "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video-fast",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        aspect_ratio: aspectRatio,
        camera_fixed: false,
        duration: seedanceDuration,
        generate_audio: false,
        image: imageUrl,
        prompt,
        resolution: "720p",
        seed: -1,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed image-to-video API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed image-to-video API");
  }

  console.log(`Image-to-video submitted, request ID: ${requestId}`);

  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );

    if (!statusResponse.ok) {
      throw new Error(`Image-to-video status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    console.log(`Image-to-video poll attempt ${attempts + 1}: status = ${statusResult.data?.status}`);

    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      console.log("Image-to-video completed:", statusResult.data.outputs[0]);
      return statusResult.data.outputs[0];
    } else if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
      const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
      throw new Error(`Image-to-video generation failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`);
    }

    attempts++;
  }

  throw new Error("Image-to-video generation timed out");
}

const SEEDANCE_I2V_ENDPOINT = "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video";

async function pollSeedanceResult(requestId: string, label: string, pollIntervalMs = 10000): Promise<string> {
  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );
    if (!statusResponse.ok) {
      throw new Error(`${label} status check failed: ${statusResponse.status}`);
    }
    const statusResult = await statusResponse.json();
    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      return statusResult.data.outputs[0];
    }
    if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
      const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
      throw new Error(`${label} failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`);
    }
    attempts++;
  }
  throw new Error(`${label} timed out`);
}

/** Original 12s video for loop (single image, 480p, non-fast endpoint). */
export async function generateVideoFromImageLoop(
  imageUrl: string,
  prompt: string,
  aspectRatio: string = "3:4",
  duration: number = 12,
): Promise<string> {
  console.log("=== GENERATING LOOP ORIGINAL VIDEO (seedance-v1.5-pro image-to-video) ===");
  const response = await fetchWithRetry(SEEDANCE_I2V_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify({
      aspect_ratio: aspectRatio,
      camera_fixed: false,
      duration,
      generate_audio: false,
      image: imageUrl,
      prompt,
      resolution: "480p",
      seed: -1,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed image-to-video (loop) API error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  const requestId = result.data?.id || result.id;
  if (!requestId) {
    throw new Error("No request ID received from Wavespeed image-to-video (loop)");
  }
  return pollSeedanceResult(requestId, "Loop original video");
}

/** Transition video from last frame to first frame (12s, 480p, non-fast endpoint with last_image). */
export async function generateVideoFromImageTransition(
  imageUrl: string,
  lastImageUrl: string,
  prompt: string,
  aspectRatio: string = "3:4",
  duration: number = 12,
): Promise<string> {
  console.log("=== GENERATING LOOP TRANSITION VIDEO (seedance-v1.5-pro image-to-video + last_image) ===");
  const response = await fetchWithRetry(SEEDANCE_I2V_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify({
      aspect_ratio: aspectRatio,
      camera_fixed: false,
      duration,
      generate_audio: false,
      image: imageUrl,
      last_image: lastImageUrl,
      prompt,
      resolution: "480p",
      seed: -1,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed image-to-video (transition) API error: ${response.status} - ${errorText}`);
  }
  const result = await response.json();
  const requestId = result.data?.id || result.id;
  if (!requestId) {
    throw new Error("No request ID received from Wavespeed image-to-video (transition)");
  }
  return pollSeedanceResult(requestId, "Loop transition video");
}

export async function generateStoryAudio(
  text: string,
  voiceId: string,
): Promise<string> {
  const resolvedVoice = normalizeStoryVoiceId(voiceId);
  const trimmed =
    typeof text === "string" ? text.trim() : String(text ?? "").trim();
  if (!trimmed) {
    throw new Error(
      "Story TTS requires non-empty dialogue text (scene is missing `audio` or it is blank)",
    );
  }

  return withGenerationApiRetries(`Story TTS (${resolvedVoice})`, async () => {
    const preview =
      trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
    console.log(
      `[Story TTS] Inworld Mini TTS voice "${resolvedVoice}" (requested: "${voiceId}"), text: "${preview}"`,
    );

    const response = await fetchWithRetry(
      "https://api.wavespeed.ai/api/v3/inworld/inworld-1.5-mini/text-to-speech",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          speaking_rate: 1,
          temperature: 1,
          text: trimmed,
          voice_id: resolvedVoice,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Story TTS API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const requestId = result.data?.id || result.id;
    if (!requestId) {
      throw new Error("No request ID received from Story TTS API");
    }

    console.log(`[Story TTS] Got request ID: ${requestId}, polling for result...`);

    let attempts = 0;
    const maxAttempts = 120;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const statusResponse = await fetchWithRetry(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
        { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
      );

      if (!statusResponse.ok) {
        throw new Error(`Story TTS status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json();

      if (
        statusResult.data?.status === "completed" &&
        statusResult.data.outputs &&
        statusResult.data.outputs.length > 0
      ) {
        const audioUrl = statusResult.data.outputs[0];
        console.log(`[Story TTS] Audio generated: ${audioUrl}`);
        return audioUrl;
      }

      if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
        const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
        throw new Error(
          `Story TTS failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`,
        );
      }

      attempts++;
      if (attempts % 10 === 0) {
        console.log(`[Story TTS] Still processing... (${attempts * 3}s elapsed)`);
      }
    }

    throw new Error("Story TTS generation timed out after " + maxAttempts * 3 + "s");
  });
}

export type InfinitetalkMultiOrder = "left_right" | "right_left" | "meanwhile";

async function generateInfinitetalkMultiVideoSegmentInternal(
  imageUrl: string,
  leftAudioUrl: string,
  rightAudioUrl: string,
  order: InfinitetalkMultiOrder,
  prompt: string,
  resolution: "480p" | "720p",
): Promise<string> {
  const endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk/multi";
  const requestBody = {
    image: imageUrl,
    left_audio: leftAudioUrl,
    right_audio: rightAudioUrl,
    order,
    prompt: prompt || "",
    resolution,
    seed: -1,
  };

  console.log("=== GENERATING INFINITETALK MULTI SEGMENT ===");
  console.log("Endpoint:", endpoint);
  console.log("Order:", order, "Resolution:", resolution);

  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed infinitetalk/multi error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;
  if (!requestId) {
    throw new Error("No request ID received from Wavespeed (infinitetalk/multi)");
  }

  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );
    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }
    const statusResult = await statusResponse.json();
    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      return statusResult.data.outputs[0];
    }
    if (statusResult.status === "failed" || statusResult.data?.status === "failed") {
      const errorDetails = statusResult.error || statusResult.data?.error || "Unknown error";
      const errorMessage = typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails);
      throw new Error(`Infinitetalk multi failed: ${errorMessage}`);
    }
    attempts++;
  }
  throw new Error("Infinitetalk multi generation timed out");
}

/** Two-character image + left/right audio (WaveSpeed infinitetalk/multi). */
export async function generateInfinitetalkMultiVideoSegment(
  imageUrl: string,
  leftAudioUrl: string,
  rightAudioUrl: string,
  order: InfinitetalkMultiOrder,
  prompt: string,
  resolution: "480p" | "720p" = "480p",
): Promise<string> {
  return withGenerationApiRetries("Infinitetalk multi", async () => {
    let lastError: Error | null = null;
    let currentPrompt = prompt;
    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        return await generateInfinitetalkMultiVideoSegmentInternal(
          imageUrl,
          leftAudioUrl,
          rightAudioUrl,
          order,
          currentPrompt,
          resolution,
        );
      } catch (error) {
        const err = error as Error;
        lastError = err;
        if (isSensitiveContentError(err)) {
          currentPrompt = SAFE_FALLBACK_PROMPT;
          continue;
        }
        if (isTransientError(err) && attempt < MAX_TRANSIENT_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        break;
      }
    }
    throw new Error(
      "Failed infinitetalk/multi after " + MAX_TRANSIENT_RETRIES + " attempts: " + (lastError?.message || "unknown"),
    );
  });
}

// ─── ALL-PURPOSE VIDEO CLIP GENERATION ────────────────────────────────────

export type AllPurposeVideoModel = "seedance-v1.5-pro" | "wan-2.6" | "kling-v2.6-pro";

const ALL_PURPOSE_MODEL_ENDPOINTS: Record<AllPurposeVideoModel, string> = {
  "seedance-v1.5-pro": "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video",
  "wan-2.6": "https://api.wavespeed.ai/api/v3/alibaba/wan-2.6/image-to-video",
  "kling-v2.6-pro": "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v2.6-pro/image-to-video",
};

function buildAllPurposeRequestBody(
  model: AllPurposeVideoModel,
  imageUrl: string,
  prompt: string,
  resolution: "720p" | "1080p",
  useAudio: boolean,
  aspectRatio: string,
  duration: number,
): Record<string, unknown> {
  switch (model) {
    case "seedance-v1.5-pro":
      return {
        aspect_ratio: aspectRatio,
        camera_fixed: false,
        duration,
        generate_audio: useAudio,
        image: imageUrl,
        prompt,
        resolution,
        seed: -1,
      };
    case "wan-2.6":
      return {
        duration,
        enable_prompt_expansion: false,
        image: imageUrl,
        prompt,
        resolution,
        seed: -1,
        shot_type: "single",
      };
    case "kling-v2.6-pro":
      return {
        cfg_scale: 0.5,
        duration,
        image: imageUrl,
        prompt,
        sound: useAudio,
        voice_list: [],
      };
  }
}

async function generateAllPurposeVideoClipInternal(
  imageUrl: string,
  prompt: string,
  model: AllPurposeVideoModel,
  resolution: "720p" | "1080p",
  useAudio: boolean,
  aspectRatio: string,
  duration: number = 10,
): Promise<string> {
  const endpoint = ALL_PURPOSE_MODEL_ENDPOINTS[model];
  const requestBody = buildAllPurposeRequestBody(model, imageUrl, prompt, resolution, useAudio, aspectRatio, duration);

  console.log(`[All-Purpose] Generating clip: model=${model}, resolution=${resolution}, duration=${duration}s`);
  console.log(`[All-Purpose] Endpoint: ${endpoint}`);

  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WaveSpeed API error (${model}): ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;
  if (!requestId) {
    throw new Error(`No request ID from WaveSpeed (${model})`);
  }

  console.log(`[All-Purpose] Submitted ${model}, requestId=${requestId}`);

  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 10000));

    const statusResponse = await fetchWithRetry(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );

    if (!statusResponse.ok) {
      throw new Error(`Status check failed for ${model}: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();
    if (statusResult.data?.status === "completed" && statusResult.data.outputs?.length > 0) {
      console.log(`[All-Purpose] Clip ready (${model}): ${statusResult.data.outputs[0]}`);
      return statusResult.data.outputs[0];
    }
    if (statusResult.status === "failed" || statusResult.data?.status === "failed") {
      const errorMsg = statusResult.error || statusResult.data?.error || "Unknown error";
      throw new Error(`Video generation failed (${model}): ${typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg)}`);
    }

    attempts++;
    if (attempts % 6 === 0) {
      console.log(`[All-Purpose] Still processing ${model}... (${attempts * 10}s elapsed)`);
    }
  }
  throw new Error(`Video generation timed out for ${model}`);
}

/** Generate a motion-control video via Kling v2.6 (transfers motion from a reference video onto an image). */
export async function generateMotionControlVideo(
  videoUrl: string,
  imageUrl: string,
  prompt?: string,
): Promise<string> {
  console.log("=== GENERATING MOTION CONTROL VIDEO (kling-v2.6-std) ===");
  console.log("Video URL:", videoUrl);
  console.log("Image URL:", imageUrl);
  console.log("Prompt:", prompt || "(none)");

  const requestBody: Record<string, unknown> = {
    character_orientation: "video",
    image: imageUrl,
    keep_original_sound: true,
    video: videoUrl,
  };
  if (prompt && prompt.trim().length > 0) {
    requestBody.prompt = prompt.trim();
  }

  const response = await fetchWithRetry(
    "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v2.6-std/motion-control",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed motion-control API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed motion-control response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed motion-control API");
  }

  console.log(`Motion-control submitted, request ID: ${requestId}`);

  let attempts = 0;
  const maxAttempts = 270; // ~45 minutes (270 × 10s) — motion control can take 30+ minutes
  const POLL_INTERVAL_MS = 10000;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let statusResponse;
    try {
      statusResponse = await fetchWithRetry(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
        { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
      );
    } catch (fetchErr) {
      console.warn(`Motion-control poll attempt ${attempts + 1}: network error, retrying...`, (fetchErr as Error).message);
      attempts++;
      continue;
    }

    if (!statusResponse.ok) {
      console.warn(`Motion-control poll attempt ${attempts + 1}: HTTP ${statusResponse.status}, retrying...`);
      attempts++;
      continue;
    }

    const statusResult = await statusResponse.json();
    const elapsedMin = ((attempts + 1) * POLL_INTERVAL_MS / 60000).toFixed(1);
    console.log(`Motion-control poll attempt ${attempts + 1} (${elapsedMin}m): status = ${statusResult.data?.status}`);

    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      console.log("Motion-control completed:", statusResult.data.outputs[0]);
      return statusResult.data.outputs[0];
    } else if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
      const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
      throw new Error(`Motion-control generation failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`);
    }

    attempts++;
  }

  throw new Error("Motion-control video generation timed out after 45 minutes");
}

export type PixverseSwapMode = "person" | "object" | "background";

/** Replace person, object, or background in a video using a reference image (Pixverse swap via WaveSpeed). */
export async function generatePixverseSwapVideo(
  videoUrl: string,
  imageUrl: string,
  mode: PixverseSwapMode,
): Promise<string> {
  console.log("=== GENERATING PIXVERSE SWAP VIDEO ===");
  console.log("Video URL:", videoUrl);
  console.log("Image URL:", imageUrl);
  console.log("Mode:", mode);

  const requestBody = {
    image: imageUrl,
    mode,
    resolution: "540p",
    video: videoUrl,
    model_id: "pixverse/swap",
  };

  const response = await fetchWithRetry("https://api.wavespeed.ai/api/v3/pixverse/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed pixverse/swap API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed pixverse/swap response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed pixverse/swap API");
  }

  console.log(`Pixverse swap submitted, request ID: ${requestId}`);

  let attempts = 0;
  const maxAttempts = 270;
  const POLL_INTERVAL_MS = 10000;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let statusResponse;
    try {
      statusResponse = await fetchWithRetry(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
        { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
      );
    } catch (fetchErr) {
      console.warn(`Pixverse swap poll attempt ${attempts + 1}: network error, retrying...`, (fetchErr as Error).message);
      attempts++;
      continue;
    }

    if (!statusResponse.ok) {
      console.warn(`Pixverse swap poll attempt ${attempts + 1}: HTTP ${statusResponse.status}, retrying...`);
      attempts++;
      continue;
    }

    const statusResult = await statusResponse.json();
    const elapsedMin = ((attempts + 1) * POLL_INTERVAL_MS / 60000).toFixed(1);
    console.log(`Pixverse swap poll attempt ${attempts + 1} (${elapsedMin}m): status = ${statusResult.data?.status}`);

    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      console.log("Pixverse swap completed:", statusResult.data.outputs[0]);
      return statusResult.data.outputs[0];
    } else if (statusResult.data?.status === "failed" || statusResult.status === "failed") {
      const errorDetails = statusResult.data?.error || statusResult.error || "Unknown error";
      throw new Error(
        `Pixverse swap generation failed: ${typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails)}`,
      );
    }

    attempts++;
  }

  throw new Error("Pixverse swap video generation timed out after 45 minutes");
}

/** Generate a single video clip for all-purpose video using the user-selected model. */
export async function generateAllPurposeVideoClip(
  imageUrl: string,
  prompt: string,
  model: AllPurposeVideoModel,
  resolution: "720p" | "1080p",
  useAudio: boolean,
  aspectRatio: string,
  duration: number = 10,
): Promise<string> {
  return withGenerationApiRetries(`All-Purpose ${model}`, async () => {
    let lastError: Error | null = null;
    let currentPrompt = prompt;
    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        return await generateAllPurposeVideoClipInternal(
          imageUrl, currentPrompt, model, resolution, useAudio, aspectRatio, duration,
        );
      } catch (error) {
        const err = error as Error;
        lastError = err;
        if (isSensitiveContentError(err)) {
          currentPrompt = SAFE_FALLBACK_PROMPT;
          continue;
        }
        if (isTransientError(err) && attempt < MAX_TRANSIENT_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      }
    }
    throw new Error(`Failed ${model} after ${MAX_TRANSIENT_RETRIES} attempts: ${lastError?.message || "unknown"}`);
  });
}
