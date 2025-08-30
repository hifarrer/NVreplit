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

    const result = await response.json();
    
    // ElevenLabs typically returns a URL or requires polling for completion
    // This implementation assumes the API returns the audio URL directly
    return {
      audioUrl: result.audio_url || result.url,
      duration: 120 // 2 minutes in seconds
    };
  } catch (error) {
    console.error("ElevenLabs generation error:", error);
    throw new Error("Failed to generate song: " + (error as Error).message);
  }
}
