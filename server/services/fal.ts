const FAL_KEY = process.env.FAL_KEY || "b479bcce-ae9a-439a-a9d6-3bf0ab5cf8f0:d9afcc34d42d7e0f0dc04607a81c60a0";

export async function generateCharacterImage(prompt: string): Promise<string> {
  console.log("Starting Fal.ai character generation with prompt:", prompt);
  console.log("Using FAL_KEY:", FAL_KEY ? "Key present" : "Key missing");
  
  try {
    console.log("Submitting request to Fal.ai...");
    
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

    console.log("Submission response status:", response.status);
    console.log("Submission response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Submission failed:", errorText);
      throw new Error(`Fal.ai submission error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Fal.ai submission result:", JSON.stringify(result, null, 2));
    const requestId = result.request_id;

    if (!requestId) {
      console.error("No request_id in response:", result);
      throw new Error("No request ID received from Fal.ai");
    }
    
    console.log("Got request ID:", requestId);

    // Poll for results every 5 seconds
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    
    console.log("Starting polling for completion...");

    while (attempts < maxAttempts) {
      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusUrl = `https://queue.fal.run/fal-ai/imagen4/requests/${requestId}/status`;
      console.log("Checking status at:", statusUrl);
      
      const statusResponse = await fetch(statusUrl, {
        headers: {
          "Authorization": `Key ${FAL_KEY}`,
        },
      });

      console.log("Status response status:", statusResponse.status);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error("Status check failed:", errorText);
        throw new Error(`Status check failed: ${statusResponse.status} - ${errorText}`);
      }

      const statusResult = await statusResponse.json();
      console.log("Status result:", JSON.stringify(statusResult, null, 2));
      
      if (statusResult.status === "COMPLETED") {
        console.log("Generation completed! Fetching results...");
        
        // When status is COMPLETED, we need to fetch the actual results from response_url
        if (statusResult.response_url) {
          console.log("Fetching results from:", statusResult.response_url);
          
          const resultsResponse = await fetch(statusResult.response_url, {
            headers: {
              "Authorization": `Key ${FAL_KEY}`,
            },
          });
          
          if (!resultsResponse.ok) {
            throw new Error(`Failed to fetch results: ${resultsResponse.status}`);
          }
          
          const resultsData = await resultsResponse.json();
          console.log("Final results:", JSON.stringify(resultsData, null, 2));
          
          if (resultsData.images && resultsData.images.length > 0) {
            const imageUrl = resultsData.images[0].url;
            console.log("Found image URL:", imageUrl);
            return imageUrl;
          } else {
            console.error("No images found in results:", resultsData);
            throw new Error("No images in results");
          }
        } else if (statusResult.images && statusResult.images.length > 0) {
          // Fallback: images directly in status response
          const imageUrl = statusResult.images[0].url;
          console.log("Found image URL:", imageUrl);
          return imageUrl;
        } else {
          console.error("No images or response_url found:", statusResult);
          throw new Error("No images in completed response");
        }
      } else if (statusResult.status === "failed") {
        console.error("Fal.ai generation failed:", statusResult.error || statusResult);
        throw new Error(`Image generation failed: ${statusResult.error || "Unknown error"}`);
      } else {
        console.log(`Status: ${statusResult.status}, continuing to poll...`);
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
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  console.log(`Starting parallel scene generation for ${prompts.length} scenes`);
  console.log(`Using character image: ${characterImageUrl}`);

  try {
    // Submit all scene generation requests in parallel
    const submissionPromises = prompts.map(async (prompt, index) => {
      console.log(`Submitting scene ${index + 1}: ${prompt}`);
      
      const requestBody = {
        enable_base64_output: false,
        enable_sync_mode: false,
        images: [characterImageUrl],
        output_format: "jpeg",
        prompt: prompt
      };
      
      console.log(`Scene ${index + 1} request body:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch("https://api.wavespeed.ai/api/v3/google/nano-banana/edit", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Scene ${index + 1} submission failed:`, errorText);
        throw new Error(`Scene submission failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`Scene ${index + 1} submission result:`, JSON.stringify(result, null, 2));
      
      const requestId = result.data?.id;
      if (!requestId) {
        throw new Error(`No request ID received for scene ${index + 1}`);
      }

      console.log(`Got scene ${index + 1} request ID: ${requestId}`);
      return { requestId, index, prompt };
    });

    // Wait for all submissions to complete
    const submissions = await Promise.all(submissionPromises);
    console.log("All scene submissions completed, starting parallel polling...");

    // Poll for results in parallel
    const resultPromises = submissions.map(async ({ requestId, index, prompt }) => {
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        const statusResponse = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
          headers: {
            "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
          },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`Scene ${index + 1} status check failed:`, errorText);
          throw new Error(`Status check failed for scene ${index + 1}: ${statusResponse.status} - ${errorText}`);
        }

        const statusResult = await statusResponse.json();
        
        if (statusResult.data?.status === "completed") {
          console.log(`Scene ${index + 1} generation completed!`);
          
          if (statusResult.data.outputs && statusResult.data.outputs.length > 0) {
            const imageUrl = statusResult.data.outputs[0];
            console.log(`Found scene ${index + 1} image URL: ${imageUrl}`);
            return { index, imageUrl };
          } else {
            console.error(`No outputs found in scene ${index + 1} results:`, statusResult);
            throw new Error(`No outputs in scene ${index + 1} results`);
          }
        } else if (statusResult.data?.status === "failed") {
          console.error(`Scene ${index + 1} generation failed:`, statusResult);
          throw new Error(`Scene ${index + 1} generation failed: ${statusResult.data?.error || "Unknown error"}`);
        }

        attempts++;
      }

      throw new Error(`Scene ${index + 1} generation timed out after ${maxAttempts} attempts`);
    });

    // Wait for all results and sort by original index
    const results = await Promise.all(resultPromises);
    results.sort((a, b) => a.index - b.index);
    
    const imageUrls = results.map(result => result.imageUrl);
    console.log("All scene images generated successfully:", imageUrls);
    return imageUrls;

  } catch (error) {
    console.error("Scene generation error:", error);
    throw new Error(`Failed to generate scene images: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
