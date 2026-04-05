import { withGenerationApiRetries } from "./generationRetry";

const FFMPEG_API_KEY = process.env.FFMPEG_API_KEY || "ffmpeg_KfTAf98EY9OCuriwBtLT34ZtWZLJtnXX";

const RETRYABLE_ERROR_CODES = new Set(["EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
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
      console.warn(`[FFMPEG] fetch attempt ${attempt}/${maxRetries} failed (${causeCode}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

// Helper function to get watermark URL from public storage
export async function getWatermarkUrl(): Promise<string | null> {
  return "https://neonvideo.b-cdn.net/logos/neonlogo.png";
}

export async function getAudioDurationFromFile(filePath: string): Promise<number> {
  try {
    const { parseFile } = await import('music-metadata');
    console.log(`Getting audio duration from file: ${filePath}`);

    const metadata = await parseFile(filePath);
    // Use Math.ceil to ensure we don't lose any audio content
    const duration = Math.ceil(metadata.format.duration || 0);

    console.log(`Audio duration: ${duration} seconds`);
    return duration;
  } catch (error) {
    console.error("Get audio duration error:", error);
    throw new Error("Failed to get audio duration: " + (error as Error).message);
  }
}

const FFMPEG_TRIM_VIDEO_URL = process.env.FFMPEG_TRIM_VIDEO_URL || "https://ffmpegapi-production.up.railway.app/api/trim_video";

export interface TrimVideoResult {
  success: boolean;
  download_url: string;
  message?: string;
}

export async function trimVideo(videoUrl: string, startTime: number, endTime: number): Promise<TrimVideoResult> {
  try {
    console.log(`[FFMPEG] Trimming video: ${startTime}s - ${endTime}s`);

    const response = await fetchWithRetry(FFMPEG_TRIM_VIDEO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        start_time: startTime,
        end_time: endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG trim video error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as TrimVideoResult;
    if (!result.success) {
      throw new Error(result.message || "Video trim failed");
    }
    console.log(`[FFMPEG] Video trimmed successfully: ${result.download_url}`);
    return result;
  } catch (error) {
    console.error("Trim video error:", error);
    throw new Error("Failed to trim video: " + (error as Error).message);
  }
}

export async function trimAudio(audioUrl: string, desiredLength: number): Promise<{ download_url: string; filename: string; trimmed_length: number }> {
  try {
    console.log(`Trimming audio to ${desiredLength} seconds`);
    console.log(`Audio URL: ${audioUrl}`);

    const response = await fetchWithRetry("https://ffmpegapi-production.up.railway.app/api/trim_audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        desired_length: desiredLength,
        fade_duration: 5  // Always use 5 seconds fade as specified
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Audio trimming failed: ${result.message || "Unknown error"}`);
    }

    console.log(`Audio trimmed successfully: ${result.filename}`);
    return {
      download_url: result.download_url,
      filename: result.filename,
      trimmed_length: result.trimmed_length
    };
  } catch (error) {
    console.error("Audio trimming error:", error);
    throw new Error("Failed to trim audio: " + (error as Error).message);
  }
}

// Split audio by time range using /api/split_audio_time (for user-selected portions)
export async function splitAudioByTime(audioUrl: string, startTime: number, endTime: number): Promise<{ download_url: string; filename: string }> {
  try {
    console.log(`Splitting audio from ${startTime}ms to ${endTime}ms`);
    console.log(`Audio URL: ${audioUrl}`);

    const response = await fetchWithRetry("https://ffmpegapi-production.up.railway.app/api/split_audio_time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        start_time: startTime, // in milliseconds
        end_time: endTime, // in milliseconds
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Audio splitting failed: ${result.message || "Unknown error"}`);
    }

    console.log(`Audio split successfully: ${result.filename || result.download_url}`);
    return {
      download_url: result.download_url,
      filename: result.filename || "trimmed_audio.mp3"
    };
  } catch (error) {
    console.error("Audio splitting by time error:", error);
    throw new Error("Failed to split audio by time: " + (error as Error).message);
  }
}

export interface AudioSegment {
  part: string;
  download_url: string;
  duration: number; // Duration of this specific segment in seconds
}

// Split audio into equal parts using /api/split_audio (for AI-generated songs)
export async function splitAudioByParts(audioUrl: string, parts: number, totalDurationSeconds?: number): Promise<AudioSegment[]> {
  try {
    console.log(`Splitting audio into ${parts} equal parts using /api/split_audio (total duration: ${totalDurationSeconds || 'unknown'}s)`);

    const response = await fetchWithRetry("https://ffmpegapi-production.up.railway.app/api/split_audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        parts: parts
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    console.log("=== FFMPEG SPLIT AUDIO BY PARTS RESPONSE ===");
    console.log("Full response:", JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(`Audio splitting failed: ${result.message || "Unknown error"}`);
    }

    // Parse audio parts from API response
    // The /api/split_audio endpoint returns:
    // { audio_parts: [{ part: "split_part_01.mp3", download_url: "..." }, ...], parts: 4 }
    const audioParts = result.audio_parts || [];
    const segmentsWithDurations: AudioSegment[] = [];

    // Calculate duration per segment (equal parts)
    const durationPerPart = totalDurationSeconds ? totalDurationSeconds / parts : 6;

    console.log(`API returned ${audioParts.length} audio parts (requested: ${parts})`);

    for (let i = 0; i < audioParts.length; i++) {
      segmentsWithDurations.push({
        part: audioParts[i].part,
        download_url: audioParts[i].download_url,
        duration: durationPerPart
      });

      console.log(`Part ${i + 1}: ${durationPerPart.toFixed(2)} seconds (API url: ${audioParts[i].download_url})`);
    }

    console.log(`Successfully split audio into ${segmentsWithDurations.length} equal parts`);
    return segmentsWithDurations;
  } catch (error) {
    console.error("Audio splitting by parts error:", error);
    throw new Error("Failed to split audio by parts: " + (error as Error).message);
  }
}

// Split audio into fixed 6-second segments using /api/split_audio_segments (for user-uploaded songs)
export async function splitAudio(audioUrl: string, parts: number = 4, totalDurationSeconds?: number): Promise<AudioSegment[]> {
  try {
    // Split audio into fixed 6-second segments for consistent video generation
    // This ensures both lipsync (wavespeed-ai/infinitetalk-fast) and non-lipsync (bytedance/seedance) models
    // work with 6-second segments
    const segmentDuration = 6; // 6 seconds per segment

    console.log(`Splitting audio into ${segmentDuration}-second segments using /api/split_audio_segments (total duration: ${totalDurationSeconds || 'unknown'}s)`);

    // Use the new /api/split_audio_segments endpoint which properly splits by segment duration
    // This ensures each segment is exactly 6 seconds (except the last one which is the remainder)
    const response = await fetchWithRetry("https://ffmpegapi-production.up.railway.app/api/split_audio_segments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        segment_duration: segmentDuration,
        async: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    console.log("=== FFMPEG SPLIT AUDIO SEGMENTS RESPONSE ===");
    console.log("Full response:", JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(`Audio splitting failed: ${result.message || "Unknown error"}`);
    }

    // Parse audio segments from API response
    // The new /api/split_audio_segments endpoint returns:
    // { segments: [{ segment: "segment_01.mp3", download_url: "..." }, ...], total_segments: 7 }
    const segments = result.segments || [];
    const segmentsWithDurations: AudioSegment[] = [];

    console.log(`API returned ${segments.length} audio segments (total_segments: ${result.total_segments})`);

    for (let i = 0; i < segments.length; i++) {
      let segDuration: number;

      // Calculate duration: all segments except last are 6 seconds
      if (totalDurationSeconds) {
        if (i < segments.length - 1) {
          segDuration = segmentDuration;
        } else {
          // Last segment gets the remainder
          const usedDuration = (segments.length - 1) * segmentDuration;
          segDuration = totalDurationSeconds - usedDuration;
          // Minimum 1 second for edge cases
          segDuration = Math.max(1, segDuration);
        }
      } else {
        // Fallback: assume 6 seconds per segment
        segDuration = segmentDuration;
      }

      segmentsWithDurations.push({
        part: segments[i].segment,
        download_url: segments[i].download_url,
        duration: segDuration
      });

      console.log(`Segment ${i + 1}: ${segDuration} seconds (API url: ${segments[i].download_url})`);
    }

    console.log(`Successfully split audio into ${segmentsWithDurations.length} parts with calculated durations`);
    return segmentsWithDurations;
  } catch (error) {
    console.error("Audio splitting error:", error);
    throw new Error("Failed to split audio: " + (error as Error).message);
  }
}

export async function pictureInPicture(mainVideoUrl: string, pipVideoUrl: string): Promise<{ download_url: string; filename: string }> {
  try {
    const requestBody = {
      main_video_url: mainVideoUrl,
      pip_video_url: pipVideoUrl,
      position: "middle",
      scale: "iw:ih",
      audio_option: "video1"
    };

    console.log("=== FFMPEG PICTURE-IN-PICTURE REQUEST ===");
    console.log("Endpoint: https://ffmpegapi-production.up.railway.app/api/picture_in_picture");
    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetchWithRetry("https://ffmpegapi-production.up.railway.app/api/picture_in_picture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG PiP API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Picture-in-picture failed: ${result.message || "Unknown error"}`);
    }

    return {
      download_url: result.download_url,
      filename: result.filename,
    };
  } catch (error) {
    console.error("Picture-in-picture error:", error);
    throw new Error("Failed to create picture-in-picture: " + (error as Error).message);
  }
}

// Base URL for frame extraction (get first/last frame). Override with FFMPEG_API_BASE if your deployment uses different hosts.
const FFMPEG_API_BASE = process.env.FFMPEG_API_BASE || "https://ffmpegapi-production.up.railway.app";

export interface FrameImageResult {
  success: boolean;
  image_url: string;
  download_url?: string;
  filename?: string;
  message?: string;
}

export async function getLastFrameImage(videoUrl: string): Promise<FrameImageResult> {
  const url = `${FFMPEG_API_BASE}/api/get_last_frame_image`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": FFMPEG_API_KEY,
    },
    body: JSON.stringify({ video_url: videoUrl }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FFMPEG get last frame error: ${response.status} - ${errorText}`);
  }
  const result = (await response.json()) as FrameImageResult;
  if (!result.success || !result.image_url) {
    throw new Error(result.message || "Failed to extract last frame");
  }
  return result;
}

export async function getFirstFrameImage(videoUrl: string): Promise<FrameImageResult> {
  const url = `${FFMPEG_API_BASE}/api/get_first_frame_image`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": FFMPEG_API_KEY,
    },
    body: JSON.stringify({ video_url: videoUrl }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FFMPEG get first frame error: ${response.status} - ${errorText}`);
  }
  const result = (await response.json()) as FrameImageResult;
  if (!result.success || !result.image_url) {
    throw new Error(result.message || "Failed to extract first frame");
  }
  return result;
}

export interface VideoLoopResult {
  success: boolean;
  message?: string;
  download_url: string;
  filename: string;
  loops?: number;
  video_duration_seconds?: number;
  audio_duration_seconds?: number;
  estimated_total_duration_seconds?: number;
}

/** Loop a short video to match audio length (ffmpegapi video_loop). */
export async function videoLoop(videoUrl: string, audioUrl: string, watermarkUrl?: string | null): Promise<VideoLoopResult> {
  const url = `${FFMPEG_API_BASE}/api/video_loop`;
  const body: Record<string, string> = { video_url: videoUrl, audio_url: audioUrl };
  if (watermarkUrl) {
    body.watermark_url = watermarkUrl;
  }
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": FFMPEG_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FFMPEG video_loop error: ${response.status} - ${errorText}`);
  }
  const result = (await response.json()) as VideoLoopResult;
  if (!result.success || !result.download_url) {
    throw new Error(result.message || "Video loop failed");
  }
  return result;
}

const NEONVIDEO_MERGE_URL = process.env.FFMPEG_NEONVIDEO_MERGE_URL || "https://ffmpegapi-production.up.railway.app/api/neonvideo_merge_videos";

// Generic merge_videos endpoint (no outro). Used for loop-video and any 2+ video merge without outro.
const MERGE_VIDEOS_URL = process.env.FFMPEG_MERGE_VIDEOS_URL || `${FFMPEG_API_BASE}/api/merge_videos`;

async function mergeVideosInternal(
  videoUrls: string[],
  audioUrl?: string,
  subtitleUrl?: string,
  watermarkUrl?: string,
  outroUrl?: string,
  dimensions?: string,
): Promise<{ download_url: string; filename: string }> {
  const useNeonvideoApi = !!outroUrl;
  const useRemoteMergeNoOutro = !outroUrl && (videoUrls.length >= 2 || !!audioUrl);

  if (useNeonvideoApi) {
    console.log("=== FFMPEG NEONVIDEO MERGE (remote API) ===");
    console.log("Endpoint:", NEONVIDEO_MERGE_URL);
    console.log("Number of scene videos:", videoUrls.length);
    console.log("Outro URL:", outroUrl);
    console.log("Audio URL:", audioUrl || "Not provided");
    console.log("Subtitle URL:", subtitleUrl || "Not provided");
    console.log("Watermark URL:", watermarkUrl || "Not provided");
    console.log("Dimensions:", dimensions || "Not provided");

    try {
      const body: Record<string, unknown> = {
        video_urls: videoUrls,
        audio_url: audioUrl ?? "",
        outro_url: outroUrl,
        subtitle_url: subtitleUrl ?? undefined,
        watermark_url: watermarkUrl ?? undefined,
        dimensions: dimensions ?? undefined,
        async: false,
      };
      const response = await fetchWithRetry(NEONVIDEO_MERGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": FFMPEG_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Neonvideo merge API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Neonvideo merge failed: ${result.message || "Unknown error"}`);
      }

      const downloadUrl = result.download_url;
      const filename = result.filename || "merged.mp4";
      console.log("=== NEONVIDEO MERGE COMPLETE ===");
      console.log("Download URL:", downloadUrl);
      console.log("Filename:", filename);
      return { download_url: downloadUrl, filename };
    } catch (error) {
      console.error("Neonvideo merge API error:", error);
      throw new Error("Failed to merge videos (neonvideo API): " + (error as Error).message);
    }
  }

  if (useRemoteMergeNoOutro) {
    console.log("=== FFMPEG REMOTE MERGE (merge_videos API, no outro) ===");
    console.log("Endpoint:", MERGE_VIDEOS_URL);
    console.log("Number of videos to merge:", videoUrls.length);
    console.log("Audio URL:", audioUrl || "Not provided");
    console.log("Dimensions:", dimensions || "Not provided");

    try {
      const body: Record<string, unknown> = {
        video_urls: videoUrls,
        audio_url: audioUrl ?? "",
        dimensions: dimensions ?? undefined,
        subtitle_url: subtitleUrl ?? undefined,
        watermark_url: watermarkUrl ?? undefined,
      };
      const response = await fetchWithRetry(MERGE_VIDEOS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": FFMPEG_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FFMPEG merge_videos API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Merge failed: ${result.message || result.error || "Unknown error"}`);
      }

      const downloadUrl = result.download_url;
      const filename = result.filename || "merged.mp4";
      console.log("=== REMOTE MERGE COMPLETE ===");
      console.log("Download URL:", downloadUrl);
      return { download_url: downloadUrl, filename };
    } catch (error) {
      console.error("FFMPEG merge_videos API error:", error);
      throw new Error("Failed to merge videos (remote API): " + (error as Error).message);
    }
  }

  console.log("=== FFMPEG LOCAL MERGE VIDEOS ===");
  console.log("Number of videos to merge:", videoUrls.length);
  console.log("Audio URL (full song):", audioUrl || "Not provided");
  console.log("Subtitle URL (.ass file):", subtitleUrl || "Not provided");
  console.log("Watermark URL:", watermarkUrl || "Not provided");

  try {
    const { localMergeVideos } = await import("./ffmpegLocal.js");
    const result = await localMergeVideos(videoUrls, audioUrl, subtitleUrl, watermarkUrl, dimensions);

    const port = process.env.PORT || "5000";
    const fullDownloadUrl = `http://localhost:${port}${result.download_url}`;

    console.log("=== LOCAL MERGE COMPLETE ===");
    console.log("Download URL:", fullDownloadUrl);
    console.log("Filename:", result.filename);

    return {
      download_url: fullDownloadUrl,
      filename: result.filename,
    };
  } catch (error) {
    console.error("Local video merging error:", error);
    throw new Error("Failed to merge videos locally: " + (error as Error).message);
  }
}

export async function mergeVideos(
  videoUrls: string[],
  audioUrl?: string,
  subtitleUrl?: string,
  watermarkUrl?: string,
  outroUrl?: string,
  dimensions?: string,
): Promise<{ download_url: string; filename: string }> {
  return withGenerationApiRetries(
    "mergeVideos",
    () =>
      mergeVideosInternal(
        videoUrls,
        audioUrl,
        subtitleUrl,
        watermarkUrl,
        outroUrl,
        dimensions,
      ),
    {
      shouldRetry: (err) =>
        !/merge videos locally|Failed to merge videos locally|ffprobe|ENOENT|spawn ffprobe/i.test(
          err.message,
        ),
    },
  );
}
