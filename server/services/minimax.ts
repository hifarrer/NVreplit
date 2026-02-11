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

const MAX_SONG_DURATION = 240; // 4 minutes maximum

export async function generateSongWithMinimax(
  tags: string,
  lyrics?: string,
  durationSeconds: number = 60,
  description?: string
): Promise<MinimaxSongResult> {
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY is not configured");
  }

  const effectiveRequestDuration = Math.min(durationSeconds, MAX_SONG_DURATION);
  const maxAcceptableDuration = Math.min(effectiveRequestDuration * 2, MAX_SONG_DURATION);
  const maxRetries = 2;
  
  console.log("=== GENERATING SONG WITH MINIMAX MUSIC 02 (ROBUST MODE) ===");
  console.log("Requested duration:", durationSeconds, "seconds");
  console.log("Effective request duration (capped at 4 min):", effectiveRequestDuration, "seconds");
  console.log("Max acceptable duration (100% tolerance, capped at 4 min):", maxAcceptableDuration, "seconds");
  console.log("Will generate 2 parallel songs");

  for (let retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt++) {
    if (retryAttempt > 0) {
      console.log(`\n=== RETRY ATTEMPT ${retryAttempt}/${maxRetries} ===`);
    }

    try {
      const songs = await generateMultipleSongsInParallel(
        tags,
        lyrics,
        effectiveRequestDuration,
        description,
        2
      );

      if (songs.length === 0) {
        throw new Error("No songs were generated successfully");
      }

      console.log(`\n=== SELECTING BEST SONG ===`);
      console.log(`Songs available: ${songs.length}`);
      songs.forEach((song, i) => {
        console.log(`  Song ${i + 1}: duration=${song.duration}s, url=${song.audioUrl.substring(0, 50)}...`);
      });
      
      const selectedSong = selectBestSong(songs, effectiveRequestDuration, maxAcceptableDuration);

      if (selectedSong) {
        if (selectedSong.duration > MAX_SONG_DURATION) {
          console.log(`Selected song exceeds absolute max of ${MAX_SONG_DURATION}s, will retry`);
          continue; // Explicitly continue to next retry
        }
        console.log(`\n=== SONG SELECTION COMPLETE ===`);
        console.log(`Selected song duration: ${selectedSong.duration}s (requested: ${effectiveRequestDuration}s)`);
        console.log(`Duration difference: ${Math.abs(selectedSong.duration - effectiveRequestDuration)}s`);
        return selectedSong;
      }

      console.log(`\n=== NO SUITABLE SONG FOUND ===`);
      console.log(`All ${songs.length} generated songs exceeded max acceptable duration of ${maxAcceptableDuration}s`);
      
      if (retryAttempt < maxRetries) {
        console.log("Will retry with 2 more generations...");
      }
    } catch (error) {
      console.error(`Generation attempt ${retryAttempt + 1} failed:`, error);
      if (retryAttempt >= maxRetries) {
        throw error;
      }
    }
  }

  throw new Error(
    `Failed to generate a song within acceptable duration after ${maxRetries + 1} attempts. ` +
    `Requested ${durationSeconds}s, max acceptable was ${maxAcceptableDuration}s.`
  );
}

const SONG_GENERATION_TIMEOUT_MS = 200 * 1000; // 200 seconds per song

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  songIndex: number
): Promise<T | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[Song ${songIndex}] Generation timed out after ${timeoutMs / 1000}s - continuing without this song`);
      resolve(null);
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error(`[Song ${songIndex}] Generation failed:`, error.message);
        resolve(null);
      });
  });
}

async function generateMultipleSongsInParallel(
  tags: string,
  lyrics: string | undefined,
  durationSeconds: number,
  description: string | undefined,
  count: number
): Promise<MinimaxSongResult[]> {
  console.log(`\nStarting ${count} parallel song generations...`);
  console.log(`Per-song timeout: ${SONG_GENERATION_TIMEOUT_MS / 1000}s (200 seconds)`);

  const generationPromises = Array.from({ length: count }, (_, i) =>
    withTimeout(
      generateSingleSong(tags, lyrics, durationSeconds, description, i + 1),
      SONG_GENERATION_TIMEOUT_MS,
      i + 1
    )
  );

  const results = await Promise.all(generationPromises);
  const successfulSongs = results.filter((s): s is MinimaxSongResult => s !== null);

  console.log(`\n${successfulSongs.length}/${count} songs generated successfully`);
  if (successfulSongs.length < count) {
    console.log(`  ${count - successfulSongs.length} song(s) failed or timed out`);
  }
  successfulSongs.forEach((song, i) => {
    console.log(`  Song ${i + 1}: ${song.duration}s`);
  });

  return successfulSongs;
}

// Generate 2 songs for user selection (no automatic selection)
export async function generateMultipleSongsForSelection(
  tags: string,
  lyrics: string | undefined,
  durationSeconds: number,
  description: string | undefined
): Promise<MinimaxSongResult[]> {
  const effectiveRequestDuration = Math.min(durationSeconds, MAX_SONG_DURATION);
  const maxRetries = 2; // Retry up to 2 times if both songs fail/timeout
  
  console.log("=== GENERATING 2 SONGS FOR USER SELECTION ===");
  console.log("Requested duration:", durationSeconds, "seconds");
  console.log("Effective request duration (capped at 4 min):", effectiveRequestDuration, "seconds");
  console.log("Per-song timeout: 200 seconds");
  
  for (let retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt++) {
    if (retryAttempt > 0) {
      console.log(`\n=== RETRY ATTEMPT ${retryAttempt}/${maxRetries} (both songs failed or timed out) ===`);
    }
    
    const songs = await generateMultipleSongsInParallel(
      tags,
      lyrics,
      effectiveRequestDuration,
      description,
      2
    );

    // If at least 1 song was generated, return it immediately
    if (songs.length > 0) {
      console.log(`\n=== GENERATED ${songs.length} SONG(S) FOR USER SELECTION ===`);
      songs.forEach((song, i) => {
        console.log(`  Song ${i + 1}: duration=${song.duration}s, url=${song.audioUrl.substring(0, 50)}...`);
      });
      return songs;
    }

    // If both songs failed or timed out, retry if we have attempts left
    if (retryAttempt < maxRetries) {
      console.log(`\n=== BOTH SONGS FAILED OR TIMED OUT ===`);
      console.log(`Retrying generation (attempt ${retryAttempt + 1}/${maxRetries})...`);
    }
  }

  // If we exhausted all retries and still have no songs, throw error
  throw new Error("Failed to generate any songs after retries. Both songs timed out or failed.");
}

function selectBestSong(
  songs: MinimaxSongResult[],
  requestedDuration: number,
  maxAcceptableDuration: number
): MinimaxSongResult | null {
  console.log("\n=== SONG SELECTION ANALYSIS ===");
  console.log(`  Input songs: ${songs.length}`);
  console.log(`  Requested duration: ${requestedDuration}s`);
  console.log(`  Max acceptable duration: ${maxAcceptableDuration}s`);
  console.log(`  Absolute max duration: ${MAX_SONG_DURATION}s`);
  
  const sortedSongs = songs
    .filter((song) => song.duration <= MAX_SONG_DURATION)
    .map((song) => ({
      song,
      difference: Math.abs(song.duration - requestedDuration),
      withinLimit: song.duration <= maxAcceptableDuration,
    }))
    .sort((a, b) => a.difference - b.difference);

  console.log(`  Filtered ${songs.length - sortedSongs.length} songs exceeding ${MAX_SONG_DURATION}s absolute max`);
  console.log(`  Remaining songs after filter: ${sortedSongs.length}`);
  
  sortedSongs.forEach(({ song, difference, withinLimit }, i) => {
    console.log(
      `  ${i + 1}. Duration: ${song.duration}s, Diff: ${difference}s, Within limit (${song.duration} <= ${maxAcceptableDuration}): ${withinLimit}`
    );
  });

  const bestWithinLimit = sortedSongs.find((s) => s.withinLimit);
  if (bestWithinLimit) {
    console.log(`  Selected: ${bestWithinLimit.song.duration}s song (difference: ${bestWithinLimit.difference}s)`);
    return bestWithinLimit.song;
  }

  console.log(`  No song found within acceptable limit of ${maxAcceptableDuration}s`);
  return null;
}

export async function generateSingleSong(
  tags: string,
  lyrics: string | undefined,
  durationSeconds: number,
  description: string | undefined,
  songIndex: number = 1
): Promise<MinimaxSongResult> {
  const promptParts: string[] = [];

  if (tags && tags.trim()) {
    promptParts.push(tags.trim());
  }

  if (description && description.trim()) {
    promptParts.push(description.trim());
  }

  // Duration removed from prompt - let the model generate naturally
  const prompt = promptParts.join(", ");

  console.log(`[Song ${songIndex}] Starting generation...`);
  console.log(`[Song ${songIndex}] Prompt: ${prompt.substring(0, 100)}...`);

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
    console.error(`[Song ${songIndex}] API error:`, errorText);
    throw new Error(`Minimax Music 02 API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as WavespeedSubmissionResponse;
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    throw new Error(`[Song ${songIndex}] No request ID received`);
  }

  console.log(`[Song ${songIndex}] Request ID: ${requestId}`);

  let attempts = 0;
  const maxAttempts = 120;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const statusResponse = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      }
    );

    if (!statusResponse.ok) {
      throw new Error(`[Song ${songIndex}] Status check failed: ${statusResponse.status}`);
    }

    const statusResult = (await statusResponse.json()) as WavespeedStatusResponse;
    const status = statusResult.data?.status;

    if (attempts % 6 === 0) {
      console.log(`[Song ${songIndex}] Status: ${status || "unknown"}`);
    }

    if (
      status === "completed" &&
      statusResult.data?.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      const audioExternalUrl = statusResult.data.outputs[0];
      console.log(`[Song ${songIndex}] Generation completed!`);

      const { audioUrl, actualDuration } = await downloadAndStoreMinimaxAudio(audioExternalUrl);

      console.log(`[Song ${songIndex}] Duration: ${actualDuration}s, URL: ${audioUrl}`);

      return {
        audioUrl,
        title: "NeonVideo Song",
        duration: actualDuration,
      };
    } else if (status === "failed") {
      throw new Error(
        `[Song ${songIndex}] Generation failed: ${statusResult.data?.error || "Unknown error"}`
      );
    }

    attempts++;
  }

  throw new Error(`[Song ${songIndex}] Generation timed out after 20 minutes`);
}

async function downloadAndStoreMinimaxAudio(
  externalUrl: string
): Promise<{ audioUrl: string; actualDuration: number }> {
  try {
    console.log("Downloading Minimax audio from:", externalUrl);

    const response = await fetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log("Downloaded audio buffer, size:", audioBuffer.length);

    let actualDuration: number;
    try {
      const { parseBuffer } = await import("music-metadata");
      const metadata = await parseBuffer(audioBuffer);
      actualDuration = Math.ceil(metadata.format.duration || 0);
      console.log("Detected audio duration:", actualDuration, "seconds");
    } catch (metadataError) {
      console.warn("Could not detect audio duration, falling back to estimate:", metadataError);
      actualDuration = Math.ceil(audioBuffer.length / (256000 / 8));
    }

    if (actualDuration <= 0) {
      console.warn("Duration detection failed, defaulting to 60 seconds");
      actualDuration = 60;
    }

    if (actualDuration > MAX_SONG_DURATION) {
      console.warn(`Song duration ${actualDuration}s exceeds max ${MAX_SONG_DURATION}s, skipping storage`);
      throw new Error(`Song duration ${actualDuration}s exceeds maximum allowed ${MAX_SONG_DURATION}s`);
    }

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
 * 
 * CRITICAL RULE: ALL video segments MUST be exactly 6 seconds, ONLY the last segment
 * can be shorter (the remainder). This ensures proper lipsync synchronization.
 * 
 * Examples:
 * - 30 seconds = [6, 6, 6, 6, 6] (5 segments)
 * - 18 seconds = [6, 6, 6] (3 segments)
 * - 20 seconds = [6, 6, 6, 2] (4 segments, last is 2s)
 * - 25 seconds = [6, 6, 6, 6, 1] (5 segments, last is 1s - will be skipped if < 2s)
 */
export function calculateVideoSegments(durationSeconds: number): {
  numberOfSegments: number;
  segmentDurations: number[];
} {
  // Guard against zero/invalid duration - minimum 2 seconds (shortest video segment for seedance)
  if (!durationSeconds || durationSeconds <= 0) {
    console.warn(`Invalid duration ${durationSeconds}, defaulting to minimum 6s segment`);
    return {
      numberOfSegments: 1,
      segmentDurations: [6],
    };
  }

  // For very short songs (< 2 seconds), use a single 6-second segment
  // The video will be slightly longer than the audio
  if (durationSeconds < 2) {
    console.log(`Very short duration ${durationSeconds}s, using minimum 6s segment`);
    return {
      numberOfSegments: 1,
      segmentDurations: [6],
    };
  }

  // Calculate number of full 6-second segments
  const fullSegments = Math.floor(durationSeconds / 6);
  const remainder = durationSeconds % 6;

  let segmentDurations: number[] = [];

  // Fill with 6-second segments first
  for (let i = 0; i < fullSegments; i++) {
    segmentDurations.push(6);
  }

  // Add remainder as the last segment if there's any remaining time
  // BUT: If remainder is less than 2 seconds, skip it (AI models require minimum 2 seconds)
  if (remainder > 0) {
    if (remainder >= 2) {
      segmentDurations.push(remainder);
    } else {
      console.log(`⚠️ Last segment would be ${remainder}s (less than 2s minimum) - skipping it`);
      console.log(`Total coverage: ${segmentDurations.reduce((a, b) => a + b, 0)}s (original: ${durationSeconds}s)`);
    }
  }

  // If we ended up with no segments (shouldn't happen), add one 6s segment
  if (segmentDurations.length === 0) {
    segmentDurations.push(6);
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
