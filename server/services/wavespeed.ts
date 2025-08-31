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
