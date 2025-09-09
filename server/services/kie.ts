import { downloadAndStoreImage } from "./imageStorage";

export interface TimestampedWord {
  word: string;
  success: boolean;
  startS: number;
  endS: number;
  palign: number;
}

export interface KieTimestampedLyricsResponse {
  code: number;
  msg: string;
  data: {
    alignedWords: TimestampedWord[];
    waveformData: number[];
    hootCer: number;
    isStreamed: boolean;
  };
}

export async function generateSong(tags: string, lyrics?: string, duration: number = 60, description?: string): Promise<{ songs: Array<{ audioUrl: string; duration: number; title: string; id: string; taskId?: string; audioId?: string }> }> {
  const KIE_API_TOKEN = process.env.KIE_API_TOKEN || "f27547e627af203de39b3345de70c32b";
  
  console.log("KIE.ai song generation request:");
  console.log("Tags:", tags);
  console.log("Lyrics:", lyrics);
  console.log("Duration:", duration);

  try {
    // Submit song generation request to KIE.ai
    const response = await fetch("https://api.kie.ai/api/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: lyrics || `A song with the style: ${tags}`,
        style: tags,
        title: description && description.length > 30 ? description.substring(0, 30).trim() + '...' : description || `Generated Song - ${tags}`,
        customMode: true,
        instrumental: false, // We want vocals since we have lyrics
        model: "V4",
        callBackUrl: "https://api.example.com/callback", // Required parameter - matches docs format
        negativeTags: "",
        vocalGender: "m", // male vocals
        styleWeight: 0.65,
        weirdnessConstraint: 0.65,
        audioWeight: 0.65
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`KIE.ai API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("KIE.ai submission result:", JSON.stringify(result, null, 2));

    if (!result.data?.taskId) {
      throw new Error("No task ID received from KIE.ai");
    }

    const taskId = result.data.taskId;
    console.log(`Got KIE.ai task ID: ${taskId}`);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 180; // Poll for up to 15 minutes

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between polls

      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}...`);
      console.log(`Checking status at: https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`);

      const statusResponse = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: {
          "Authorization": `Bearer ${KIE_API_TOKEN}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error("Status check failed:", errorText);
        throw new Error(`Status check failed: ${statusResponse.status} - ${errorText}`);
      }

      const statusResult = await statusResponse.json();
      console.log(`Status response status: ${statusResponse.status}`);
      console.log(`Status result:`, JSON.stringify(statusResult, null, 2));

      if (statusResult.data?.status === "SUCCESS") {
        console.log("Song generation completed!");

        if (statusResult.data.response?.sunoData && statusResult.data.response.sunoData.length > 0) {
          console.log(`Found ${statusResult.data.response.sunoData.length} songs`);
          
          const songs = [];
          
          // Process all generated songs (usually 2)
          for (let i = 0; i < statusResult.data.response.sunoData.length; i++) {
            const song = statusResult.data.response.sunoData[i];
            const audioUrl = song.audioUrl;
            const actualDuration = song.duration || duration;
            
            console.log(`Processing song ${i + 1}: ${audioUrl}`);
            console.log(`Song ${i + 1} duration: ${actualDuration} seconds`);

            // Download and store each audio file in our object storage
            console.log(`Downloading and storing song ${i + 1}...`);
            const storedUrl = await downloadAndStoreAudio(audioUrl, "songs");
            console.log(`Song ${i + 1} stored at: ${storedUrl}`);

            // Use the title from the song response, which includes our formatted description
            const songTitle = song.title || (description && description.length > 30 ? description.substring(0, 30).trim() + '...' : description) || `Generated Song ${i + 1}`;
            
            songs.push({
              audioUrl: storedUrl,
              duration: actualDuration,
              title: songTitle,
              id: song.id,
              taskId: taskId, // Include for subtitle generation
              audioId: song.id // The KIE.ai audio ID for timestamped lyrics
            });
          }

          return { songs };
        } else {
          console.error("No audio data found in results:", statusResult);
          throw new Error("No audio data found in song generation results");
        }
      } else if (statusResult.data?.status === "FAIL" || statusResult.data?.errorCode) {
        console.error("Song generation failed:", statusResult.data?.errorMessage || statusResult.data?.errorCode);
        throw new Error(`Song generation failed: ${statusResult.data?.errorMessage || "Unknown error"}`);
      } else {
        console.log("Task still in progress, continuing to poll...");
      }

      attempts++;
    }

    throw new Error("Song generation timed out");
  } catch (error) {
    console.error("KIE.ai song generation error:", error);
    throw new Error("Failed to generate song: " + (error as Error).message);
  }
}

/**
 * Downloads an audio file from an external URL and stores it permanently in object storage
 */
async function downloadAndStoreAudio(
  audioUrl: string,
  category: string = "songs"
): Promise<string> {
  try {
    console.log(`Downloading audio from: ${audioUrl}`);
    
    // Download the audio from the external URL
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    // Get the audio content as buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // Get content type and determine file extension
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const extension = getAudioFileExtension(contentType);
    
    // Generate unique filename
    const { randomUUID } = await import("crypto");
    const filename = `${category}/${randomUUID()}${extension}`;
    
    console.log(`Storing audio as: ${filename}`);
    
    // Get object storage service
    const { ObjectStorageService, objectStorageClient } = await import("../objectStorage");
    const objectStorageService = new ObjectStorageService();
    const privateObjectDir = objectStorageService.getPrivateObjectDir();
    
    // Create full path in private directory
    const fullPath = `${privateObjectDir}/${filename}`;
    
    // Parse the path to get bucket and object name
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    // Upload the audio buffer
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(audioBuffer, {
      metadata: {
        contentType,
        metadata: {
          originalUrl: audioUrl,
          category,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    
    console.log(`Audio stored successfully at: ${fullPath}`);
    
    // Return the stored URL that can be served via our API
    const storedUrl = `/objects/${filename}`;
    
    return storedUrl;
  } catch (error) {
    console.error("Error downloading and storing audio:", error);
    throw new Error(`Failed to store audio: ${(error as Error).message}`);
  }
}

/**
 * Gets file extension from audio content type
 */
function getAudioFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3", 
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/m4a": ".m4a",
  };
  
  return extensions[contentType.toLowerCase()] || ".mp3";
}

/**
 * Parses object path into bucket name and object name
 */
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

export async function getTimestampedLyrics(taskId: string, audioId: string): Promise<KieTimestampedLyricsResponse> {
  console.log("Getting timestamped lyrics from KIE.ai...");
  console.log("Task ID:", taskId);
  console.log("Audio ID:", audioId);

  const KIE_API_TOKEN = process.env.KIE_API_TOKEN || "f27547e627af203de39b3345de70c32b";

  if (!KIE_API_TOKEN) {
    throw new Error("KIE_API_TOKEN is not configured");
  }

  const response = await fetch("https://api.kie.ai/api/v1/generate/get-timestamped-lyrics", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KIE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId,
      audioId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIE.ai timestamped lyrics API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  console.log("=== KIE.AI TIMESTAMPED LYRICS RESPONSE ===");
  console.log("Response code:", result.code);
  console.log("Number of aligned words:", result.data?.alignedWords?.length || 0);
  
  if (result.code !== 200) {
    throw new Error(`KIE.ai API error: ${result.msg || "Unknown error"}`);
  }

  return result;
}

export function convertTimestampedLyricsToASS(timestampedWords: TimestampedWord[]): string {
  console.log("Converting timestamped lyrics to .ass format...");
  
  // .ass file header
  const assHeader = `[Script Info]
ScriptType: v4.00
Collisions: Normal
; screen resolution, of the author of this file.
PlayResX: 1920
PlayResY: 1080
PlayDepth: 0
; play at 100% speed.
Timer: 100,0000

; For further info on all these fields, refer to the document
; "Sub Station Alpha v4.00+ Script Format"

[V4 Styles]
; this line is actually ignored by the parser, but I include it for improving readability.
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
; 153 specifies the red RGB color 0x000099. Note that the order is 0xBBGGRR.
; and note that 153 is the value of 0x000099, in base 10.
; 6 specifies the alignment of the text.
; for centered alignment, we specify 2. To then move it to the top, we add 4.
; so we end up with 2 + 4 = 6
Style: Default,Arial,90,153,153,153,153,0,0,0,0,0,6,30,30,30,0,0

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Convert timestamped words to dialogue lines
  const dialogues: string[] = [];
  
  for (const word of timestampedWords) {
    if (word.success && word.word.trim()) {
      // Convert seconds to ASS time format (H:MM:SS.CC)
      const startTime = formatTimeForASS(word.startS);
      const endTime = formatTimeForASS(word.endS);
      
      // Clean up the word text (remove newlines and format)
      const cleanText = word.word.replace(/\n/g, ' ').trim();
      
      dialogues.push(`Dialogue: Marked=0,${startTime},${endTime},Default,,0000,0000,0000,,${cleanText}`);
    }
  }
  
  const assContent = assHeader + '\n' + dialogues.join('\n');
  
  console.log(`Generated .ass file with ${dialogues.length} dialogue lines`);
  
  return assContent;
}

export async function storeSubtitleFile(assContent: string, songId?: string): Promise<string> {
  try {
    console.log("Storing subtitle file...");
    
    // Get object storage service
    const { ObjectStorageService, objectStorageClient } = await import("../objectStorage");
    const objectStorageService = new ObjectStorageService();
    const privateObjectDir = objectStorageService.getPrivateObjectDir();
    
    // Generate filename using song ID if available, otherwise random UUID
    const { randomUUID } = await import("crypto");
    const fileId = songId || randomUUID();
    const filename = `subtitles/${fileId}.ass`;
    
    // Create full path in private directory
    const fullPath = `${privateObjectDir}/${filename}`;
    
    // Parse the path to get bucket and object name
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    // Upload the subtitle file
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(Buffer.from(assContent, 'utf-8'), {
      metadata: {
        contentType: 'text/plain',
        metadata: {
          fileType: 'subtitle',
          format: 'ass',
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    
    console.log(`Subtitle file stored successfully at: ${fullPath}`);
    
    // Return the stored URL that can be served via our API
    const storedUrl = `/objects/${filename}`;
    
    return storedUrl;
  } catch (error) {
    console.error("Error storing subtitle file:", error);
    throw new Error(`Failed to store subtitle file: ${(error as Error).message}`);
  }
}

function formatTimeForASS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}