const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || process.env.WAVESPEED_API_KEY_ENV_VAR || "default_key";

export async function generateVideoSegment(
  audioUrl: string,
  imageUrl: string,
  prompt: string
): Promise<string> {
  try {
    // Submit video generation request
    const response = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/multitalk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        audio: audioUrl,
        image: imageUrl,
        prompt: prompt,
        seed: -1,
      }),
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
): Promise<string[]> {
  console.log(`Starting parallel video generation for ${audioSegments.length} segments`);
  
  // Generate all video segments in parallel
  const videoPromises = audioSegments.map(async (audioUrl, index) => {
    console.log(`Generating video segment ${index + 1}/${audioSegments.length}`);
    console.log(`Audio URL: ${audioUrl}`);
    console.log(`Image URL: ${imageUrls[index]}`);
    console.log(`Prompt: ${prompts[index]}`);
    
    return await generateVideoSegment(audioUrl, imageUrls[index], prompts[index]);
  });
  
  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);
  
  return videoUrls;
}
