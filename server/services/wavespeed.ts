const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || process.env.WAVESPEED_API_KEY_ENV_VAR || "default_key";

export async function generateVideoSegment(
  audioUrl: string,
  imageUrl: string,
  prompt: string,
  model: 'multitalk' | 'seedance' = 'multitalk'
): Promise<string> {
  try {
    console.log("=== GENERATING VIDEO SEGMENT ===");
    console.log("Audio URL:", audioUrl);
    console.log("Image URL:", imageUrl);
    console.log("Prompt:", prompt);
    console.log("Model:", model);
    
    // Submit video generation request
    const requestBody = model === 'multitalk' ? {
      audio: audioUrl,
      image: imageUrl,
      prompt: prompt,
      seed: -1,
    } : {
      camera_fixed: false,
      duration: 10,
      image: imageUrl,
      prompt: prompt,
      seed: -1,
    };
    
    const endpoint = model === 'multitalk' 
      ? "https://api.wavespeed.ai/api/v3/wavespeed-ai/multitalk"
      : "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-lite-i2v-480p";
    
    console.log("Wavespeed request body:", JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Wavespeed API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const requestId = result.data?.id || result.id;

    if (!requestId) {
      console.error("Wavespeed response:", JSON.stringify(result, null, 2));
      throw new Error("No request ID received from Wavespeed");
    }
    
    console.log(`Video segment submission successful, request ID: ${requestId}`);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes with 10-second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      const statusResponse = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
        headers: {
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json();
      
      if (statusResult.data?.status === "completed" && statusResult.data.outputs && statusResult.data.outputs.length > 0) {
        return statusResult.data.outputs[0];
      } else if (statusResult.data?.status === "failed") {
        throw new Error(`Video generation failed: ${statusResult.data.error || "Unknown error"}`);
      }

      attempts++;
    }

    throw new Error("Video generation timed out");
  } catch (error) {
    console.error("Wavespeed generation error:", error);
    throw new Error("Failed to generate video segment: " + (error as Error).message);
  }
}

// Dynamic video generation based on configuration
export async function generateAllVideoSegmentsDynamic(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[],
  config: {
    numberOfVideosRegularApi: number,
    numberOfVideosLipsync: number,
    makeCharacterSing: boolean
  }
): Promise<{ videoUrls: string[], segmentPairs: Array<{a: string, b: string}> }> {
  console.log(`Starting dynamic video generation:`);
  console.log(`- Audio segments: ${audioSegments.length}`);
  console.log(`- Scene images: ${imageUrls.length}`);
  console.log(`- Regular videos (seedance): ${config.numberOfVideosRegularApi}`);
  console.log(`- Lipsync videos (multitalk): ${config.numberOfVideosLipsync}`);
  console.log(`- Make character sing: ${config.makeCharacterSing}`);
  
  const totalVideos = config.numberOfVideosRegularApi + (config.makeCharacterSing ? config.numberOfVideosLipsync : 0);
  
  if (audioSegments.length !== imageUrls.length || audioSegments.length !== prompts.length) {
    throw new Error(`Mismatch in segments: ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`);
  }
  
  // Generate videos using intercalated pattern when makeCharacterSing is enabled
  const videoPromises: Promise<string>[] = [];
  const videoTypes: ('seedance' | 'multitalk')[] = [];
  
  if (config.makeCharacterSing) {
    // Intercalate between seedance and multitalk models
    let seedanceCount = 0;
    let multitalkCount = 0;
    
    for (let i = 0; i < audioSegments.length; i++) {
      let model: 'seedance' | 'multitalk';
      
      // Always start with seedance, then alternate
      if (i % 2 === 0) {
        // Even indices: Use seedance if we haven't reached the limit
        if (seedanceCount < config.numberOfVideosRegularApi) {
          model = 'seedance';
          seedanceCount++;
        } else {
          model = 'multitalk';
          multitalkCount++;
        }
      } else {
        // Odd indices: Use multitalk if we haven't reached the limit
        if (multitalkCount < config.numberOfVideosLipsync) {
          model = 'multitalk';
          multitalkCount++;
        } else {
          model = 'seedance';
          seedanceCount++;
        }
      }
      
      console.log(`Generating video segment ${i + 1} using ${model} model`);
      videoTypes.push(model);
      
      if (model === 'multitalk') {
        // Multitalk requires audio for lipsync
        videoPromises.push(
          generateVideoSegment(audioSegments[i], imageUrls[i], prompts[i], 'multitalk')
        );
      } else {
        // Seedance doesn't use audio
        videoPromises.push(
          generateVideoSegment('', imageUrls[i], prompts[i], 'seedance')
        );
      }
    }
  } else {
    // Only use seedance model when makeCharacterSing is disabled
    for (let i = 0; i < audioSegments.length; i++) {
      console.log(`Generating video segment ${i + 1} using seedance model (no lipsync)`);
      videoTypes.push('seedance');
      videoPromises.push(
        generateVideoSegment('', imageUrls[i], prompts[i], 'seedance')
      );
    }
  }
  
  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);
  
  // For backward compatibility, create segment pairs (will be empty for new dynamic approach)
  const segmentPairs: Array<{a: string, b: string}> = [];
  
  return { videoUrls, segmentPairs };
}

// Legacy function for backward compatibility
export async function generateAllVideoSegments(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[]
): Promise<{ videoUrls: string[], segmentPairs: Array<{a: string, b: string}> }> {
  console.log(`Starting video generation for ${audioSegments.length} audio segments and ${imageUrls.length} scenes`);
  
  if (audioSegments.length !== 4 || imageUrls.length !== 8 || prompts.length !== 8) {
    throw new Error(`Expected 4 audio segments and 8 scenes, got ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`);
  }
  
  // Generate videos in parallel
  const videoPromises: Promise<string>[] = [];
  
  // Generate 4 videos with audio using multitalk (part_1a, part_2a, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}a`;
    console.log(`Generating video segment ${segmentLabel} using multitalk model with audio`);
    console.log(`Audio URL: ${audioSegments[i]}`);
    console.log(`Image URL: ${imageUrls[i * 2]}`); // Use every other image for 'a' videos
    console.log(`Prompt: ${prompts[i * 2]}`);
    
    videoPromises.push(
      generateVideoSegment(audioSegments[i], imageUrls[i * 2], prompts[i * 2], 'multitalk')
    );
  }
  
  // Generate 4 short videos without audio using seedance (part_1b, part_2b, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}b`;
    console.log(`Generating video segment ${segmentLabel} using seedance model (no audio, 10 seconds)`);
    console.log(`Image URL: ${imageUrls[i * 2 + 1]}`); // Use alternate images for 'b' videos
    console.log(`Prompt: ${prompts[i * 2 + 1]}`);
    
    // Seedance doesn't use audio, pass empty string
    videoPromises.push(
      generateVideoSegment('', imageUrls[i * 2 + 1], prompts[i * 2 + 1], 'seedance')
    );
  }
  
  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);
  
  // Group videos into pairs for picture-in-picture
  // First 4 are 'a' videos, last 4 are 'b' videos
  const segmentPairs: Array<{a: string, b: string}> = [];
  for (let i = 0; i < 4; i++) {
    segmentPairs.push({
      a: videoUrls[i],     // multitalk video with audio (1a, 2a, 3a, 4a)
      b: videoUrls[i + 4]  // seedance video without audio (1b, 2b, 3b, 4b)
    });
  }
  
  return { videoUrls, segmentPairs };
}
