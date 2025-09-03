import fetch from "node-fetch";
import { randomUUID } from "crypto";
import FormData from "form-data";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/music";
const ELEVENLABS_FORCED_ALIGNMENT_URL =
  "https://api.elevenlabs.io/v1/forced-alignment";

// Import storage client from objectStorage.ts
import { objectStorageClient } from "../objectStorage";

// ElevenLabs Forced Alignment Types
export interface ElevenLabsAlignmentCharacter {
  text: string;
  start: number;
  end: number;
}

export interface ElevenLabsAlignmentWord {
  text: string;
  start: number;
  end: number;
  loss: number;
}

export interface ElevenLabsForcedAlignmentResponse {
  characters: ElevenLabsAlignmentCharacter[];
  words: ElevenLabsAlignmentWord[];
  loss: number;
}

export async function generateSongWithElevenLabs(
  tags: string,
  lyrics?: string,
  durationMs: number = 120000,
): Promise<{ audioUrl: string; title: string; duration: number }> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  try {
    // Build the prompt
    let prompt = `Create a song with this style: ${tags}`;
    if (lyrics && lyrics.trim()) {
      prompt += ` and these lyrics: ${lyrics}`;
    }

    console.log("Generating song with ElevenLabs:", { prompt, durationMs });

    // Make the API request
    const response = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: durationMs,
        model_id: "music_v1",
        output_format: "mp3_44100_128",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("ElevenLabs API error:", error);
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    // The API returns the audio directly as binary data
    const audioBuffer = await response.buffer();
    console.log(
      "Received audio buffer from ElevenLabs, size:",
      audioBuffer.length,
    );

    // Store the audio in object storage
    const songId = randomUUID();
    const fileName = `songs/${songId}.mp3`;

    // Get the private object directory from environment
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      throw new Error("PRIVATE_OBJECT_DIR not configured");
    }

    // Parse the bucket and path
    const bucketName = privateDir.split("/")[1];
    const pathPrefix = privateDir.split("/").slice(2).join("/");
    const objectPath = pathPrefix ? `${pathPrefix}/${fileName}` : fileName;

    console.log("Storing audio as:", objectPath);

    // Upload to object storage
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);
    await file.save(audioBuffer, {
      metadata: {
        contentType: "audio/mpeg",
      },
    });

    const objectUrl = `/objects/${fileName}`;
    console.log("Song stored at:", objectUrl);

    return {
      audioUrl: objectUrl,
      title: "AI Generated Song",
      duration: Math.round(durationMs / 1000), // Convert to seconds
    };
  } catch (error) {
    console.error("ElevenLabs song generation error:", error);
    throw new Error(
      `Failed to generate song with ElevenLabs: ${(error as Error).message}`,
    );
  }
}

export async function createForcedAlignment(
  audioUrl: string,
  lyrics: string,
): Promise<ElevenLabsForcedAlignmentResponse> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  try {
    // Clean lyrics by removing structural tags like [Verse 1], [Chorus], etc.
    const cleanedLyrics = lyrics
      .replace(/\[.*?\]/g, "")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    console.log("Creating forced alignment with ElevenLabs:", {
      audioUrl,
      lyrics: cleanedLyrics.substring(0, 100) + "...",
    });

    // Download the audio file from our object storage
    const audioBuffer = await downloadAudioFile(audioUrl);

    // Create form data for the API request
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: "audio.mp3",
      contentType: "audio/mpeg",
    });
    formData.append("text", cleanedLyrics);

    console.log("Making forced alignment request to ElevenLabs...");

    // Make the API request
    const response = await fetch(ELEVENLABS_FORCED_ALIGNMENT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("ElevenLabs Forced Alignment API error:", error);
      throw new Error(
        `ElevenLabs Forced Alignment API error: ${response.status} - ${error}`,
      );
    }

    const result = (await response.json()) as ElevenLabsForcedAlignmentResponse;
    console.log("Forced alignment response:", {
      charactersCount: result.characters?.length || 0,
      wordsCount: result.words?.length || 0,
      loss: result.loss,
    });

    return result;
  } catch (error) {
    console.error("ElevenLabs forced alignment error:", error);
    throw new Error(
      `Failed to create forced alignment: ${(error as Error).message}`,
    );
  }
}

async function downloadAudioFile(audioUrl: string): Promise<Buffer> {
  try {
    console.log("Downloading audio file from:", audioUrl);

    // Handle both internal object URLs and external URLs
    let fetchUrl: string;
    if (audioUrl.startsWith("/objects/")) {
      // Internal object storage URL - need to fetch from local server
      fetchUrl = `http://localhost:5000${audioUrl}`;
    } else {
      // External URL
      fetchUrl = audioUrl;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download audio: ${response.status} ${response.statusText}`,
      );
    }

    const buffer = await response.buffer();
    console.log("Downloaded audio file, size:", buffer.length);

    return buffer;
  } catch (error) {
    console.error("Error downloading audio file:", error);
    throw new Error(
      `Failed to download audio file: ${(error as Error).message}`,
    );
  }
}

export function convertElevenLabsAlignmentToASS(
  alignment: ElevenLabsForcedAlignmentResponse,
): string {
  console.log("Converting ElevenLabs alignment to .ass format...");

  // .ass file header
  const assHeader = `[Script Info]
ScriptType: v4.00
Collisions: Normal
PlayResX: 1920
PlayResY: 1080
PlayDepth: 0
Timer: 100,0000

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: Default,Arial,90,16777215,16777215,0,0,-1,0,1,3,0,2,30,30,30,0,0

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Convert words to dialogue lines
  const dialogues: string[] = [];

  for (const word of alignment.words) {
    if (word.text.trim()) {
      // Convert seconds to ASS time format (H:MM:SS.CC)
      const startTime = formatTimeForASS(word.start);
      const endTime = formatTimeForASS(word.end);

      // Clean up the word text
      const cleanText = word.text.replace(/\n/g, " ").trim();

      dialogues.push(
        `Dialogue: Marked=0,${startTime},${endTime},Default,,0000,0000,0000,,${cleanText}`,
      );
    }
  }

  const assContent = assHeader + "\n" + dialogues.join("\n");

  console.log(
    `Generated .ass file with ${dialogues.length} dialogue lines from ElevenLabs alignment`,
  );

  return assContent;
}

export async function storeElevenLabsSubtitleFile(
  assContent: string,
  songId?: string,
): Promise<string> {
  try {
    console.log("Storing ElevenLabs subtitle file...");

    // Get object storage service
    const { ObjectStorageService, objectStorageClient } = await import(
      "../objectStorage"
    );
    const objectStorageService = new ObjectStorageService();
    const privateObjectDir = objectStorageService.getPrivateObjectDir();

    // Generate filename using song ID if available, otherwise random UUID
    const fileId = songId || randomUUID();
    const filename = `subtitles/${fileId}.ass`;

    // Create full path in private directory
    const fullPath = `${privateObjectDir}/${filename}`;

    // Parse the path to get bucket and object name
    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Upload the subtitle file
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(Buffer.from(assContent, "utf-8"), {
      metadata: {
        contentType: "text/plain",
        metadata: {
          fileType: "subtitle",
          format: "ass",
          source: "elevenlabs",
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`ElevenLabs subtitle file stored successfully at: ${fullPath}`);

    // Return the stored URL that can be served via our API
    const storedUrl = `/objects/${filename}`;

    return storedUrl;
  } catch (error) {
    console.error("Error storing ElevenLabs subtitle file:", error);
    throw new Error(
      `Failed to store subtitle file: ${(error as Error).message}`,
    );
  }
}

function formatTimeForASS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);

  return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
