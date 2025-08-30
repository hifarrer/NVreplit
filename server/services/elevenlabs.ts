import { writeFileSync } from "fs";
import { join } from "path";

export async function generateSong(tags: string, lyrics?: string): Promise<{ audioUrl: string; duration: number }> {
  const API_KEY = process.env.ELEVENLABS_API_KEY || "sk_5bf8f177633d87f37c096114bb424d36907c101fdc6268e4";
  
  let prompt = `Create a song with this style: ${tags}`;
  if (lyrics && lyrics.trim()) {
    prompt += ` and these lyrics: ${lyrics}`;
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        music_length_ms: 120000, // 2 minutes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Check if response is audio (binary) or JSON
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("audio") || contentType?.includes("application/octet-stream")) {
      // Handle binary audio response
      const audioBuffer = await response.arrayBuffer();
      const audioData = new Uint8Array(audioBuffer);
      
      // Save the audio file locally
      const fileName = `generated-song-${Date.now()}.mp3`;
      const filePath = join(process.cwd(), "public", fileName);
      writeFileSync(filePath, audioData);
      
      return {
        audioUrl: `/${fileName}`,
        duration: 120 // 2 minutes in seconds
      };
    } else {
      // Handle JSON response (URL or status)
      const result = await response.json();
      
      return {
        audioUrl: result.audio_url || result.url || result.audio,
        duration: result.duration || 120
      };
    }
  } catch (error) {
    console.error("ElevenLabs generation error:", error);
    throw new Error("Failed to generate song: " + (error as Error).message);
  }
}
