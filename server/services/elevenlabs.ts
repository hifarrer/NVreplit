import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/music';

// Import storage client from objectStorage.ts
import { objectStorageClient } from '../objectStorage';

export async function generateSongWithElevenLabs(
  tags: string,
  lyrics?: string,
  durationMs: number = 120000
): Promise<{ audioUrl: string; title: string; duration: number }> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  try {
    // Build the prompt
    let prompt = `Create a song with this style: ${tags}`;
    if (lyrics && lyrics.trim()) {
      prompt += ` and these lyrics: ${lyrics}`;
    }

    console.log('Generating song with ElevenLabs:', { prompt, durationMs });

    // Make the API request
    const response = await fetch(ELEVENLABS_API_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: durationMs,
        model_id: 'music_v1',
        output_format: 'mp3_44100_128'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    // The API returns the audio directly as binary data
    const audioBuffer = await response.buffer();
    console.log('Received audio buffer from ElevenLabs, size:', audioBuffer.length);

    // Store the audio in object storage
    const songId = randomUUID();
    const fileName = `songs/${songId}.mp3`;
    
    // Get the private object directory from environment
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }
    
    // Parse the bucket and path
    const bucketName = privateDir.split('/')[1];
    const pathPrefix = privateDir.split('/').slice(2).join('/');
    const objectPath = pathPrefix ? `${pathPrefix}/${fileName}` : fileName;
    
    console.log('Storing audio as:', objectPath);
    
    // Upload to object storage
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);
    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
      },
    });
    
    const objectUrl = `/objects/${fileName}`;
    console.log('Song stored at:', objectUrl);

    return {
      audioUrl: objectUrl,
      title: 'AI Generated Song',
      duration: Math.round(durationMs / 1000), // Convert to seconds
    };
  } catch (error) {
    console.error('ElevenLabs song generation error:', error);
    throw new Error(`Failed to generate song with ElevenLabs: ${(error as Error).message}`);
  }
}