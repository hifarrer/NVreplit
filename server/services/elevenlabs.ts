import { writeFileSync } from "fs";
import { join } from "path";

export async function generateSong(tags: string, lyrics?: string, duration: number = 60): Promise<{ audioUrl: string; duration: number }> {
  const API_KEY = process.env.ELEVENLABS_API_KEY || "sk_5bf8f177633d87f37c096114bb424d36907c101fdc6268e4";
  
  let prompt = `Create a song with this style: ${tags}`;
  if (lyrics && lyrics.trim()) {
    prompt += ` and these lyrics: ${lyrics}`;
  }
  
  console.log("ElevenLabs prompt:", prompt);
  console.log("Tags:", tags);
  console.log("Lyrics:", lyrics);

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        music_length_ms: duration * 1000, // Convert seconds to milliseconds
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // ElevenLabs typically returns binary audio data directly
    // Get the response as ArrayBuffer to handle binary data
    const audioBuffer = await response.arrayBuffer();
    
    // Check if this is actually JSON by looking at the first few bytes
    const firstBytes = new Uint8Array(audioBuffer.slice(0, 10));
    const isJSON = firstBytes[0] === 123; // 123 is '{' in ASCII
    
    if (isJSON) {
      // Convert buffer back to text and parse as JSON
      const textDecoder = new TextDecoder();
      const jsonText = textDecoder.decode(audioBuffer);
      const result = JSON.parse(jsonText);
      
      return {
        audioUrl: result.audio_url || result.url || result.audio,
        duration: result.duration || duration
      };
    } else {
      // Handle as binary audio data
      const audioData = new Uint8Array(audioBuffer);
      
      // Save the audio file locally
      const fileName = `generated-song-${Date.now()}.mp3`;
      const filePath = join(process.cwd(), "public", fileName);
      writeFileSync(filePath, audioData);
      
      return {
        audioUrl: `/${fileName}`,
        duration: duration // Use the requested duration
      };
    }
  } catch (error) {
    console.error("ElevenLabs generation error:", error);
    throw new Error("Failed to generate song: " + (error as Error).message);
  }
}
