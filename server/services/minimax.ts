import fetch from "node-fetch";
import { randomUUID } from "crypto";

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;

export interface MinimaxSongResult {
  audioUrl: string;
  title: string;
  duration: number; // Actual duration in seconds
}

// API response types for Wavespeed
interface WavespeedSubmissionResponse {
  data?: { id?: string };
  id?: string;
}

interface WavespeedStatusResponse {
  data?: {
    status?: string;
    outputs?: string[];
    error?: string;
  };
}

export async function generateSongWithMinimax(
  tags: string,
  lyrics?: string,
  durationSeconds: number = 60,
  description?: string
): Promise<MinimaxSongResult> {
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY is not configured");
  }

  try {
    // Build the prompt including all parameters
    // Duration is included in prompt since the API doesn't have a separate parameter for it
    const promptParts: string[] = [];
    
    // Add music style/tags
    if (tags && tags.trim()) {
      promptParts.push(tags.trim());
    }
    
    // Add song description if provided
    if (description && description.trim()) {
      promptParts.push(description.trim());
    }
    
    // Add duration guidance in the prompt (the model doesn't accept duration as a parameter)
    promptParts.push(`${durationSeconds} seconds`);
    
    const prompt = promptParts.join(", ");
    
    console.log("=== GENERATING SONG WITH MINIMAX MUSIC 02 ===");
    console.log("Prompt:", prompt);
    console.log("Lyrics:", lyrics ? lyrics.substring(0, 100) + "..." : "No lyrics");
    console.log("Requested duration:", durationSeconds, "seconds");

    // Make the API request to Minimax Music 02 via Wavespeed
    const response = await fetch("https://api.wavespeed.ai/api/v3/minimax/music-02", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        bitrate: 256000,
        lyrics: lyrics || "",
        prompt: prompt,
        sample_rate: 44100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Minimax Music 02 API error:", errorText);
      throw new Error(`Minimax Music 02 API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as WavespeedSubmissionResponse;
    const requestId = result.data?.id || result.id;

    if (!requestId) {
      console.error("Minimax response:", JSON.stringify(result, null, 2));
      throw new Error("No request ID received from Minimax Music 02");
    }

    console.log(`Minimax Music 02 submission successful, request ID: ${requestId}`);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 120; // 20 minutes with 10-second intervals (music generation can take longer)

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

      const statusResponse = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
        {
          headers: {
            Authorization: `Bearer ${WAVESPEED_API_KEY}`,
          },
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Minimax status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json() as WavespeedStatusResponse;
      const status = statusResult.data?.status;

      // Log status for debugging
      if (attempts % 6 === 0) {
        console.log(`Minimax status check: ${status || 'unknown'}`);
      }

      if (
        status === "completed" &&
        statusResult.data?.outputs &&
        statusResult.data.outputs.length > 0
      ) {
        const audioExternalUrl = statusResult.data.outputs[0];
        console.log("Minimax Music 02 generation completed!");
        console.log("External audio URL:", audioExternalUrl);

        // Download and store the audio in our object storage
        const { audioUrl, actualDuration } = await downloadAndStoreMinimaxAudio(audioExternalUrl);
        
        console.log("Song stored at:", audioUrl);
        console.log("Actual song duration:", actualDuration, "seconds");

        return {
          audioUrl,
          title: "NeonVideo Song",
          duration: actualDuration,
        };
      } else if (status === "failed") {
        throw new Error(
          `Minimax Music 02 generation failed: ${statusResult.data?.error || "Unknown error"}`
        );
      } else if (status && !["pending", "processing", "queued", "starting"].includes(status)) {
        // Log unexpected status for debugging
        console.warn(`Unexpected Minimax status: ${status}`, JSON.stringify(statusResult.data, null, 2));
      }

      attempts++;
    }

    throw new Error("Minimax Music 02 generation timed out after 20 minutes");
  } catch (error) {
    console.error("Minimax Music 02 song generation error:", error);
    throw new Error(
      `Failed to generate song with Minimax Music 02: ${(error as Error).message}`
    );
  }
}

async function downloadAndStoreMinimaxAudio(
  externalUrl: string
): Promise<{ audioUrl: string; actualDuration: number }> {
  try {
    console.log("Downloading Minimax audio from:", externalUrl);

    // Download the audio from Wavespeed's CDN
    const response = await fetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log("Downloaded audio buffer, size:", audioBuffer.length);

    // Get actual duration from the audio buffer using music-metadata
    let actualDuration: number;
    try {
      const { parseBuffer } = await import("music-metadata");
      const metadata = await parseBuffer(audioBuffer);
      actualDuration = Math.ceil(metadata.format.duration || 0);
      console.log("Detected audio duration:", actualDuration, "seconds");
    } catch (metadataError) {
      console.warn("Could not detect audio duration, falling back to estimate:", metadataError);
      // Fallback: estimate based on buffer size (MP3 at 256kbps = ~32KB per second)
      actualDuration = Math.ceil(audioBuffer.length / (256000 / 8));
    }

    // Guard against zero/invalid duration
    if (actualDuration <= 0) {
      console.warn("Duration detection failed, defaulting to 60 seconds");
      actualDuration = 60; // Fallback to reasonable default
    }

    // Store in object storage
    const songId = randomUUID();
    const fileName = `songs/${songId}.mp3`;

    const { ObjectStorageService } = await import("../objectStorage");
    const objectStorageService = new ObjectStorageService();

    console.log("Uploading Minimax audio to object storage:", fileName);
    const objectUrl = await objectStorageService.uploadAudioBuffer(audioBuffer, fileName);

    return {
      audioUrl: objectUrl,
      actualDuration,
    };
  } catch (error) {
    console.error("Error downloading and storing Minimax audio:", error);
    throw new Error(`Failed to store Minimax audio: ${(error as Error).message}`);
  }
}

/**
 * Calculate the number of video segments needed for a given song duration.
 * Video segments can be 5 or 10 seconds.
 * 
 * This function calculates the optimal combination of 10-second and 5-second segments
 * to cover the entire song duration.
 * 
 * Examples:
 * - 60 seconds = 6 x 10s segments
 * - 68 seconds = 7 x 10s segments (covers 70s, slightly longer than song)
 * - 72 seconds = 7 x 10s + 1 x 5s (covers 75s)
 * - 65 seconds = 6 x 10s + 1 x 5s (covers 65s exactly)
 * 
 * The last segment might be slightly longer than the remaining audio,
 * but the video will simply have a brief moment of silence at the end.
 */
export function calculateVideoSegments(durationSeconds: number): {
  numberOfSegments: number;
  segmentDurations: number[];
} {
  // Guard against zero/invalid duration - minimum 5 seconds (shortest video segment)
  if (!durationSeconds || durationSeconds <= 0) {
    console.warn(`Invalid duration ${durationSeconds}, defaulting to minimum 5s segment`);
    return {
      numberOfSegments: 1,
      segmentDurations: [5],
    };
  }

  // For very short songs (< 5 seconds), use a single 5-second segment
  if (durationSeconds < 5) {
    console.log(`Very short duration ${durationSeconds}s, using minimum 5s segment`);
    return {
      numberOfSegments: 1,
      segmentDurations: [5],
    };
  }

  // Calculate base number of 10-second segments
  const baseTenSecondSegments = Math.floor(durationSeconds / 10);
  const remainder = durationSeconds % 10;

  let segmentDurations: number[] = [];

  // Fill with 10-second segments first
  for (let i = 0; i < baseTenSecondSegments; i++) {
    segmentDurations.push(10);
  }

  // Handle the remainder
  if (remainder > 0) {
    // If remainder is more than 5 seconds, add a 10-second segment
    // If remainder is 5 seconds or less, add a 5-second segment (minimum allowed by video model)
    if (remainder > 5) {
      segmentDurations.push(10);
    } else {
      segmentDurations.push(5);
    }
  }

  console.log(`Song duration: ${durationSeconds}s`);
  console.log(`Calculated segments: ${segmentDurations.length} segments`);
  console.log(`Segment durations: ${segmentDurations.join(", ")}s`);
  console.log(`Total coverage: ${segmentDurations.reduce((a, b) => a + b, 0)}s`);

  return {
    numberOfSegments: segmentDurations.length,
    segmentDurations,
  };
}
