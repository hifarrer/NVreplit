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
  console.log(`Starting parallel video generation for ${audioSegments.length} segments`);
  
  if (audioSegments.length !== 8 || imageUrls.length !== 8 || prompts.length !== 8) {
    throw new Error(`Expected 8 segments, got ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`);
  }
  
  // Generate all video segments in parallel, alternating between models
  const videoPromises = audioSegments.map(async (audioUrl, index) => {
    // Determine which model to use based on index
    // 0 (1a) -> multitalk, 1 (1b) -> seedance, 2 (2a) -> multitalk, etc.
    const model = index % 2 === 0 ? 'multitalk' : 'seedance';
    const segmentLabel = `${Math.floor(index / 2) + 1}${index % 2 === 0 ? 'a' : 'b'}`;
    
    console.log(`Generating video segment ${segmentLabel} (${index + 1}/8) using ${model} model`);
    console.log(`Audio URL: ${audioUrl}`);
    console.log(`Image URL: ${imageUrls[index]}`);
    console.log(`Prompt: ${prompts[index]}`);
    
    return await generateVideoSegment(audioUrl, imageUrls[index], prompts[index], model);
  });
  
  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);
  
  // Group videos into pairs for picture-in-picture
  const segmentPairs: Array<{a: string, b: string}> = [];
  for (let i = 0; i < videoUrls.length; i += 2) {
    segmentPairs.push({
      a: videoUrls[i],   // multitalk video (1a, 2a, 3a, 4a)
      b: videoUrls[i + 1] // seedance video (1b, 2b, 3b, 4b)
    });
  }
  
  return { videoUrls, segmentPairs };
}
