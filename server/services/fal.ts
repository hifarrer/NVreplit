const FAL_KEY = process.env.FAL_KEY || "b479bcce-ae9a-439a-a9d6-3bf0ab5cf8f0:d9afcc34d42d7e0f0dc04607a81c60a0";

export async function generateCharacterImage(prompt: string): Promise<string> {
  try {
    // Submit generation request
    const response = await fetch("https://queue.fal.run/fal-ai/imagen4/preview", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fal.ai submission error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const requestId = result.request_id;

    if (!requestId) {
      throw new Error("No request ID received from Fal.ai");
    }

    // Poll for results
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      const statusResponse = await fetch(`https://queue.fal.run/fal-ai/imagen4/requests/${requestId}/status`, {
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json();
      
      if (statusResult.status === "completed" && statusResult.images && statusResult.images.length > 0) {
        return statusResult.images[0].url;
      } else if (statusResult.status === "failed") {
        throw new Error("Image generation failed");
      }

      attempts++;
    }

    throw new Error("Image generation timed out");
  } catch (error) {
    console.error("Fal.ai character generation error:", error);
    throw new Error("Failed to generate character image: " + (error as Error).message);
  }
}

export async function generateSceneImages(prompts: string[], characterImageUrl: string): Promise<string[]> {
  const imageUrls: string[] = [];

  for (const prompt of prompts) {
    try {
      // Submit generation request
      const response = await fetch("https://queue.fal.run/fal-ai/nano-banana/edit", {
        method: "POST",
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          image_urls: [characterImageUrl],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fal.ai submission error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const requestId = result.request_id;

      if (!requestId) {
        throw new Error("No request ID received from Fal.ai");
      }

      // Poll for results
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const statusResponse = await fetch(`https://queue.fal.run/fal-ai/nano-banana/requests/${requestId}`, {
          headers: {
            "Authorization": `Key ${FAL_KEY}`,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Status check failed: ${statusResponse.status}`);
        }

        const statusResult = await statusResponse.json();
        
        if (statusResult.status === "completed" && statusResult.images && statusResult.images.length > 0) {
          imageUrls.push(statusResult.images[0].url);
          break;
        } else if (statusResult.status === "failed") {
          throw new Error("Scene image generation failed");
        }

        attempts++;
      }

      if (imageUrls.length === 0 || imageUrls.length !== prompts.indexOf(prompt) + 1) {
        throw new Error("Scene image generation timed out");
      }
    } catch (error) {
      console.error(`Scene image generation error for prompt "${prompt}":`, error);
      throw new Error(`Failed to generate scene image: ${(error as Error).message}`);
    }
  }

  return imageUrls;
}
