import { downloadAndStoreImage } from "./imageStorage";

export async function generateSong(tags: string, lyrics?: string, duration: number = 60, description?: string): Promise<{ songs: Array<{ audioUrl: string; duration: number; title: string; id: string }> }> {
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
    const maxAttempts = 60; // Poll for up to 5 minutes

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
              id: song.id
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