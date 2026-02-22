const FFMPEG_API_KEY = process.env.FFMPEG_API_KEY || "";
// Use internal Railway URL when set (e.g. FFMPEG_CAPTIONS_URL), otherwise public
const FFMPEG_CAPTIONS_URL = process.env.FFMPEG_CAPTIONS_URL || "https://ffmpegapi-production.up.railway.app/api/videos/add-tiktok-captions";
const FFMPEG_TEXT_OVERLAY_URL = process.env.FFMPEG_TEXT_OVERLAY_URL || "https://ffmpegapi-production.up.railway.app/api/videos/add-text-overlay-captions";

const RETRYABLE_ERROR_CODES = new Set(["EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err: any) {
      const causeCode = err?.cause?.code || err?.code;
      const isRetryable = RETRYABLE_ERROR_CODES.has(causeCode) || err?.message?.includes("fetch failed");
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.warn(`[FFMPEG-CAPTIONS] fetch attempt ${attempt}/${maxRetries} failed (${causeCode}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

const ASPECT_RATIO_MAP: Record<string, string> = {
  "3:4": "9:16",
  "9:16": "9:16",
  "16:9": "16:9",
};

export interface AddTikTokCaptionsResult {
  success: boolean;
  download_url: string;
  captions_json_url: string;
  srt_url: string;
  vtt_url: string;
  word_count: number;
  message: string;
}

export interface AddTextOverlayResult {
  success: boolean;
  download_url: string;
  message: string;
}

export async function addTextOverlayCaptions(opts: {
  videoUrl: string;
  text: string;
  subtitleStyle?: string;
  position?: string;
  durationPerLine?: number;
}): Promise<AddTextOverlayResult> {
  const subtitleStyle = opts.subtitleStyle || "yellow-bg";
  const position = opts.position || "center";
  const durationPerLine = opts.durationPerLine ?? 5;

  console.log(`[FFMPEG-TEXT-OVERLAY] Adding text overlay to video`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   video_url: ${opts.videoUrl}`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   subtitle_style: ${subtitleStyle}`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   position: ${position}`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   duration_per_line: ${durationPerLine}`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   text lines: ${opts.text.split("\n").length}`);

  const response = await fetchWithRetry(FFMPEG_TEXT_OVERLAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": FFMPEG_API_KEY,
    },
    body: JSON.stringify({
      video_url: opts.videoUrl,
      text: opts.text,
      subtitle_style: subtitleStyle,
      position,
      duration_per_line: durationPerLine,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ffmpegapi text overlay error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as AddTextOverlayResult;

  if (!result.success) {
    throw new Error(`ffmpegapi text overlay failed: ${result.message || "Unknown error"}`);
  }

  console.log(`[FFMPEG-TEXT-OVERLAY] Text overlay added successfully`);
  console.log(`[FFMPEG-TEXT-OVERLAY]   download_url: ${result.download_url}`);

  return result;
}

export async function addTikTokCaptions(opts: {
  videoUrl: string;
  subtitleStyle?: string;
  language?: string;
  aspectRatio?: string | null;
  position?: string | null;
  maxCharsPerLine?: number;
  maxLines?: number;
}): Promise<AddTikTokCaptionsResult> {
  const subtitleStyle = opts.subtitleStyle || "yellow-bg";
  const language = opts.language || "auto";
  const aspectRatio = ASPECT_RATIO_MAP[opts.aspectRatio || "3:4"] || "9:16";
  const position = opts.position || "bottom";
  const maxCharsPerLine = opts.maxCharsPerLine ?? 20;
  const maxLines = opts.maxLines ?? 1;

  console.log(`[FFMPEG-CAPTIONS] Adding TikTok captions to video`);
  console.log(`[FFMPEG-CAPTIONS]   video_url: ${opts.videoUrl}`);
  console.log(`[FFMPEG-CAPTIONS]   subtitle_style: ${subtitleStyle}`);
  console.log(`[FFMPEG-CAPTIONS]   language: ${language}`);
  console.log(`[FFMPEG-CAPTIONS]   aspect_ratio: ${aspectRatio}`);
  console.log(`[FFMPEG-CAPTIONS]   position: ${position}`);

  const response = await fetchWithRetry(FFMPEG_CAPTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": FFMPEG_API_KEY,
    },
    body: JSON.stringify({
      video_url: opts.videoUrl,
      subtitle_style: subtitleStyle,
      language,
      aspect_ratio: aspectRatio,
      position,
      max_chars_per_line: maxCharsPerLine,
      max_lines: maxLines,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ffmpegapi captions error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as AddTikTokCaptionsResult;

  if (!result.success) {
    throw new Error(`ffmpegapi captions failed: ${result.message || "Unknown error"}`);
  }

  console.log(`[FFMPEG-CAPTIONS] Captions added successfully (${result.word_count} words)`);
  console.log(`[FFMPEG-CAPTIONS]   download_url: ${result.download_url}`);

  return result;
}
