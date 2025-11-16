const FAL_KEY =
  process.env.FAL_KEY ||
  "b479bcce-ae9a-439a-a9d6-3bf0ab5cf8f0:d9afcc34d42d7e0f0dc04607a81c60a0";
const KIE_API_TOKEN = "f27547e627af203de39b3345de70c32b";

/**
 * Helper function to ensure character image URLs are always converted to signed URLs
 * before being sent to external APIs like Wavespeed.
 * 
 * This function:
 * 1. Detects if the URL is an internal object storage path
 * 2. Converts it to a Google Cloud Storage signed URL
 * 3. Validates that the result is a proper HTTP/HTTPS URL
 * 4. Throws detailed errors if conversion fails
 * 
 * @param characterImageUrl - The character image URL (may be relative path or full URL)
 * @param ttlSec - Time-to-live for the signed URL in seconds (default: 86400 = 24 hours)
 * @returns A validated HTTP/HTTPS URL ready to be used with external APIs
 */
async function ensurePublicImageUrl(characterImageUrl: string, ttlSec: number = 86400): Promise<string> {
  console.log(`[ensurePublicImageUrl] Input URL: ${characterImageUrl}`);
  
  // If it's already a full HTTP/HTTPS URL, validate and return it
  if (characterImageUrl.startsWith("http://") || characterImageUrl.startsWith("https://")) {
    console.log(`[ensurePublicImageUrl] Already a public URL, returning as-is`);
    return characterImageUrl;
  }
  
  // If it's an internal path, convert it to a signed URL
  if (characterImageUrl.startsWith("/objects/") || characterImageUrl.startsWith("/")) {
    console.log(`[ensurePublicImageUrl] Detected internal path, converting to signed URL...`);
    
    try {
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      const signedUrl = await objectStorageService.getSignedUrlForPath(
        characterImageUrl,
        ttlSec,
      );
      
      console.log(`[ensurePublicImageUrl] Successfully converted to signed URL`);
      
      // Final validation
      if (!signedUrl.startsWith("http://") && !signedUrl.startsWith("https://")) {
        throw new Error(
          `Signed URL generation returned invalid URL format: ${signedUrl}`
        );
      }
      
      return signedUrl;
    } catch (error) {
      console.error(`[ensurePublicImageUrl] Conversion failed:`, error);
      throw new Error(
        `Failed to convert internal path to signed URL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  
  // If we get here, the URL format is unrecognized
  const errorMsg = `Invalid image URL format: ${characterImageUrl}. Expected HTTP/HTTPS URL or internal path starting with /objects/`;
  console.error(`[ensurePublicImageUrl] ${errorMsg}`);
  throw new Error(errorMsg);
}

// New Wavespeed.ai character generation function
export async function generateCharacterImageWavespeed(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Enhanced prompt for Wavespeed.ai
  const enhancedPrompt = `front shot of a ${prompt} `;

  console.log(
    "Starting Wavespeed.ai character generation with prompt:",
    enhancedPrompt,
  );

  try {
    // Submit generation request to Wavespeed.ai using seedream-v4 model
    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          enable_base64_output: false,
          enable_sync_mode: false,
          prompt: enhancedPrompt,
          size: "1280*720",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Wavespeed.ai submission failed:", errorText);
      throw new Error(
        `Wavespeed.ai submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      "Wavespeed.ai submission result:",
      JSON.stringify(result, null, 2),
    );

    if (result.code !== 200) {
      throw new Error(
        `Wavespeed.ai API error: ${result.message || "Unknown error"}`,
      );
    }

    const requestId = result.data?.id;
    if (!requestId) {
      console.error("No request ID in response:", result);
      throw new Error("No request ID received from Wavespeed.ai");
    }

    console.log("Got request ID:", requestId);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 180; // 15 minutes with 5-second intervals

    console.log("Starting polling for completion...");

    while (attempts < maxAttempts) {
      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}...`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusUrl = `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`;
      console.log("Checking status at:", statusUrl);

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error("Status check failed:", errorText);
        throw new Error(
          `Status check failed: ${statusResponse.status} - ${errorText}`,
        );
      }

      const statusResult = await statusResponse.json();
      console.log("Status result:", JSON.stringify(statusResult, null, 2));

      if (
        statusResult.code === 200 &&
        statusResult.data?.status === "completed"
      ) {
        console.log("Generation completed! Processing results...");

        const outputs = statusResult.data?.outputs;
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
          const imageUrl = outputs[0];
          console.log("Found image URL:", imageUrl);
          return imageUrl;
        } else {
          console.error("No output URLs found:", statusResult);
          throw new Error("No images in results");
        }
      } else if (statusResult.data?.status === "failed") {
        console.error(
          "Wavespeed.ai generation failed:",
          statusResult.data.error || "Unknown error",
        );
        throw new Error(
          `Image generation failed: ${statusResult.data.error || "Unknown error"}`,
        );
      } else {
        console.log(
          `Task still in progress (status: ${statusResult.data?.status}), continuing to poll...`,
        );
      }

      attempts++;
    }

    throw new Error("Image generation timed out");
  } catch (error) {
    console.error("Wavespeed.ai character generation error:", error);
    throw new Error(
      "Failed to generate character image: " + (error as Error).message,
    );
  }
}

// Updated to use Wavespeed.ai for character generation
export async function generateCharacterImages(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  // Use Wavespeed.ai for character generation (returns single image)
  const imageUrl = await generateCharacterImageWavespeed(prompt, aspectRatio);
  return [imageUrl]; // Return as array for compatibility
}

// Original KIE.ai implementation (kept for potential future use)
export async function generateCharacterImagesKIE(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  // Always prepend "A front shot of " to ensure we get a front-facing character image
  const enhancedPrompt = `A front face shot of ${prompt} `;

  console.log(
    "Starting KIE.ai character generation with prompt:",
    enhancedPrompt,
  );
  console.log("Aspect ratio:", aspectRatio);

  try {
    console.log("Submitting request to KIE.ai...");

    // Submit generation request
    const response = await fetch("https://api.kie.ai/api/v1/mj/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KIE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskType: "mj_txt2img",
        speed: "turbo",
        prompt: enhancedPrompt,
        aspectRatio: aspectRatio,
        version: "7",
        variety: 10,
        stylization: 1,
        weirdness: 1,
        waterMark: "",
        enableTranslation: false,
        ow: 500,
        videoBatchSize: 1,
      }),
    });

    console.log("Submission response status:", response.status);
    console.log(
      "Submission response headers:",
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("KIE.ai submission failed:", errorText);
      throw new Error(
        `KIE.ai submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log("KIE.ai submission result:", JSON.stringify(result, null, 2));

    if (result.code !== 200) {
      throw new Error(`KIE.ai API error: ${result.msg || "Unknown error"}`);
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
      console.error("No taskId in response:", result);
      throw new Error("No task ID received from KIE.ai");
    }

    console.log("Got task ID:", taskId);

    // Poll for results every 10 seconds
    let attempts = 0;
    const maxAttempts = 90; // 15 minutes with 10-second intervals

    console.log("Starting polling for completion...");

    while (attempts < maxAttempts) {
      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}...`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

      const statusUrl = `https://api.kie.ai/api/v1/mj/record-info?taskId=${taskId}`;
      console.log("Checking status at:", statusUrl);

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${KIE_API_TOKEN}`,
        },
      });

      console.log("Status response status:", statusResponse.status);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error("Status check failed:", errorText);
        throw new Error(
          `Status check failed: ${statusResponse.status} - ${errorText}`,
        );
      }

      const statusResult = await statusResponse.json();
      console.log("Status result:", JSON.stringify(statusResult, null, 2));

      if (statusResult.code === 200 && statusResult.data?.successFlag === 1) {
        console.log("Generation completed! Processing results...");

        const resultUrls = statusResult.data?.resultInfoJson?.resultUrls;
        if (resultUrls && Array.isArray(resultUrls) && resultUrls.length > 0) {
          const imageUrls = resultUrls.map((item: any) => item.resultUrl);
          console.log("Found image URLs:", imageUrls);
          return imageUrls;
        } else {
          console.error("No result URLs found:", statusResult);
          throw new Error("No images in results");
        }
      } else if (statusResult.data?.errorCode) {
        console.error(
          "KIE.ai generation failed:",
          statusResult.data.errorMessage || statusResult.data.errorCode,
        );
        throw new Error(
          `Image generation failed: ${statusResult.data.errorMessage || "Unknown error"}`,
        );
      } else {
        console.log(`Task still in progress, continuing to poll...`);
      }

      attempts++;
    }

    throw new Error("Image generation timed out");
  } catch (error) {
    console.error("KIE.ai character generation error:", error);
    throw new Error(
      "Failed to generate character images: " + (error as Error).message,
    );
  }
}

// Backward compatibility function - returns the first image URL
export async function generateCharacterImage(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const imageUrls = await generateCharacterImages(prompt, aspectRatio);
  return imageUrls[0]; // Return the first image for backward compatibility
}

export async function generateSingleSceneImage(
  prompt: string,
  characterImageUrl: string,
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  console.log(`Starting single scene generation with prompt: ${prompt}`);
  console.log(`Input character image URL: ${characterImageUrl}`);

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for Wavespeed API`);

  try {
    const requestBody = {
      enable_base64_output: false,
      enable_sync_mode: false,
      images: [publicCharacterImageUrl],
      output_format: "jpeg",
      prompt: prompt,
      aspect_ratio: "16:9",
    };

    console.log(
      `Single scene request body:`,
      JSON.stringify(requestBody, null, 2),
    );

    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/google/nano-banana/edit",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Single scene submission failed:`, errorText);
      throw new Error(
        `Scene submission failed: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      `Single scene submission result:`,
      JSON.stringify(result, null, 2),
    );

    const requestId = result.data?.id;
    if (!requestId) {
      throw new Error(`No request ID received for single scene`);
    }

    console.log(`Got single scene request ID: ${requestId}`);

    // Poll for result
    let attempts = 0;
    const maxAttempts = 180; // 15 minutes with 3-second intervals

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds

      const statusResponse = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
        {
          headers: {
            Authorization: `Bearer ${WAVESPEED_API_KEY}`,
          },
        },
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error(`Single scene status check failed:`, errorText);
        throw new Error(
          `Status check failed for single scene: ${statusResponse.status} - ${errorText}`,
        );
      }

      const statusResult = await statusResponse.json();

      if (statusResult.data?.status === "completed") {
        console.log(`Single scene generation completed!`);

        if (statusResult.data.outputs && statusResult.data.outputs.length > 0) {
          const imageUrl = statusResult.data.outputs[0];
          console.log(`Found single scene image URL: ${imageUrl}`);
          return imageUrl;
        } else {
          console.error(
            `No outputs found in single scene results:`,
            statusResult,
          );
          throw new Error(`No outputs in single scene results`);
        }
      } else if (statusResult.data?.status === "failed") {
        console.error(`Single scene generation failed:`, statusResult);
        throw new Error(
          `Single scene generation failed: ${statusResult.data?.error || "Unknown error"}`,
        );
      }

      attempts++;
    }

    throw new Error(
      `Single scene generation timed out after ${maxAttempts} attempts`,
    );
  } catch (error) {
    console.error("Single scene generation error:", error);
    throw new Error(
      `Failed to generate single scene image: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function generateSceneImages(
  prompts: string[],
  characterImageUrl: string,
): Promise<string[]> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  console.log(
    `Starting parallel scene generation for ${prompts.length} scenes`,
  );
  console.log(`Input character image URL: ${characterImageUrl}`);

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for ${prompts.length} scenes`);

  try {
    // Submit all scene generation requests in parallel
    const submissionPromises = prompts.map(async (prompt, index) => {
      console.log(`Submitting scene ${index + 1}: ${prompt}`);

      const requestBody = {
        enable_base64_output: false,
        enable_sync_mode: false,
        images: [publicCharacterImageUrl],
        output_format: "jpeg",
        prompt: prompt,
        aspect_ratio: "16:9",
      };

      console.log(
        `Scene ${index + 1} request body:`,
        JSON.stringify(requestBody, null, 2),
      );

      const response = await fetch(
        "https://api.wavespeed.ai/api/v3/google/nano-banana/edit",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WAVESPEED_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Scene ${index + 1} submission failed:`, errorText);
        throw new Error(
          `Scene submission failed: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      console.log(
        `Scene ${index + 1} submission result:`,
        JSON.stringify(result, null, 2),
      );

      const requestId = result.data?.id;
      if (!requestId) {
        throw new Error(`No request ID received for scene ${index + 1}`);
      }

      console.log(`Got scene ${index + 1} request ID: ${requestId}`);
      return { requestId, index, prompt };
    });

    // Wait for all submissions to complete
    const submissions = await Promise.all(submissionPromises);
    console.log(
      "All scene submissions completed, starting parallel polling...",
    );

    // Poll for results in parallel
    const resultPromises = submissions.map(
      async ({ requestId, index, prompt }) => {
        let attempts = 0;
        const maxAttempts = 180; // 15 minutes with 3-second intervals

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds

          const statusResponse = await fetch(
            `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
            {
              headers: {
                Authorization: `Bearer ${WAVESPEED_API_KEY}`,
              },
            },
          );

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error(`Scene ${index + 1} status check failed:`, errorText);
            throw new Error(
              `Status check failed for scene ${index + 1}: ${statusResponse.status} - ${errorText}`,
            );
          }

          const statusResult = await statusResponse.json();

          if (statusResult.data?.status === "completed") {
            console.log(`Scene ${index + 1} generation completed!`);

            if (
              statusResult.data.outputs &&
              statusResult.data.outputs.length > 0
            ) {
              const imageUrl = statusResult.data.outputs[0];
              console.log(`Found scene ${index + 1} image URL: ${imageUrl}`);
              return { index, imageUrl };
            } else {
              console.error(
                `No outputs found in scene ${index + 1} results:`,
                statusResult,
              );
              throw new Error(`No outputs in scene ${index + 1} results`);
            }
          } else if (statusResult.data?.status === "failed") {
            console.error(
              `Scene ${index + 1} generation failed:`,
              statusResult,
            );
            throw new Error(
              `Scene ${index + 1} generation failed: ${statusResult.data?.error || "Unknown error"}`,
            );
          }

          attempts++;
        }

        throw new Error(
          `Scene ${index + 1} generation timed out after ${maxAttempts} attempts`,
        );
      },
    );

    // Wait for all results and sort by original index
    let results: { index: number; imageUrl: string }[] = [];
    let failedIndices: number[] = [];
    let failureReasons: Map<number, string> = new Map();

    try {
      results = await Promise.all(resultPromises);
      results.sort((a, b) => a.index - b.index);
    } catch (error) {
      // If any scene failed, we need to handle it gracefully
      console.log("Some scenes failed, implementing retry logic...");

      // Process each promise individually to identify failures
      const individualResults = await Promise.allSettled(resultPromises);

      for (let i = 0; i < individualResults.length; i++) {
        const result = individualResults[i];
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          failedIndices.push(i);
          const errorMessage = result.reason.message || "Unknown error";
          failureReasons.set(i, errorMessage);
          console.log(`Scene ${i + 1} failed:`, errorMessage);
        }
      }

      results.sort((a, b) => a.index - b.index);
    }

    // Retry failed scenes using successful prompts
    if (failedIndices.length > 0 && results.length > 0) {
      console.log(
        `Retrying ${failedIndices.length} failed scenes using successful prompts...`,
      );

      for (const failedIndex of failedIndices) {
        const failureReason = failureReasons.get(failedIndex) || "";
        const isSensitiveContent = failureReason.toLowerCase().includes("sensitive") || 
                                    failureReason.toLowerCase().includes("flagged");
        
        let fallbackPrompt: string;
        
        if (isSensitiveContent) {
          // For sensitive content errors, use a very safe, generic prompt
          fallbackPrompt = "Character in a simple, clean environment. Neutral expression. Camera steady.";
          console.log(
            `Scene ${failedIndex + 1} was flagged for sensitive content. Retrying with safe, generic prompt: ${fallbackPrompt}`,
          );
        } else {
          // For other errors, choose a fallback prompt based on the failed index
          let fallbackPromptIndex: number;
          if (failedIndex === 0 && results.find((r) => r.index === 1)) {
            fallbackPromptIndex = 1;
          } else if (failedIndex === 1 && results.find((r) => r.index === 0)) {
            fallbackPromptIndex = 0;
          } else if (failedIndex === 2 && results.find((r) => r.index === 1)) {
            fallbackPromptIndex = 1;
          } else if (failedIndex === 3 && results.find((r) => r.index === 2)) {
            fallbackPromptIndex = 2;
          } else {
            // Use the first successful result's index
            fallbackPromptIndex = results[0].index;
          }

          fallbackPrompt = prompts[fallbackPromptIndex];
          console.log(
            `Retrying scene ${failedIndex + 1} with fallback prompt from scene ${fallbackPromptIndex + 1}: ${fallbackPrompt}`,
          );
        }

        try {
          // Submit retry request
          const retryRequestBody = {
            enable_base64_output: false,
            enable_sync_mode: false,
            images: [characterImageUrl],
            output_format: "jpeg",
            prompt: fallbackPrompt,
            aspect_ratio: "16:9",
          };

          const retryResponse = await fetch(
            "https://api.wavespeed.ai/api/v3/google/nano-banana/edit",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${WAVESPEED_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(retryRequestBody),
            },
          );

          if (retryResponse.ok) {
            const retrySubmission = await retryResponse.json();
            const retryRequestId = retrySubmission.data.id;
            console.log(
              `Retry for scene ${failedIndex + 1} submitted with ID: ${retryRequestId}`,
            );

            // Poll for retry result using the same logic
            const maxAttempts = 20;
            let attempts = 0;

            while (attempts < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 3000));

              const statusResponse = await fetch(
                `https://api.wavespeed.ai/api/v3/predictions/${retryRequestId}/result`,
                {
                  headers: {
                    Authorization: `Bearer ${WAVESPEED_API_KEY}`,
                  },
                },
              );

              if (statusResponse.ok) {
                const statusResult = await statusResponse.json();

                if (statusResult.data?.status === "completed") {
                  if (
                    statusResult.data.outputs &&
                    statusResult.data.outputs.length > 0
                  ) {
                    const retryImageUrl = statusResult.data.outputs[0];
                    console.log(
                      `Retry for scene ${failedIndex + 1} succeeded: ${retryImageUrl}`,
                    );
                    results.push({
                      index: failedIndex,
                      imageUrl: retryImageUrl,
                    });
                    break;
                  }
                } else if (statusResult.data?.status === "failed") {
                  console.log(
                    `Retry for scene ${failedIndex + 1} also failed:`,
                    statusResult.data,
                  );
                  break;
                }
              }

              attempts++;
            }
          }
        } catch (retryError) {
          console.error(
            `Retry failed for scene ${failedIndex + 1}:`,
            retryError,
          );
        }
      }

      results.sort((a, b) => a.index - b.index);
    }

    // Check if we have all expected images based on the number of prompts
    const expectedScenes = prompts.length;
    if (results.length < expectedScenes) {
      const missingIndices = [];
      const sensitiveContentFailures = [];
      
      for (let i = 0; i < expectedScenes; i++) {
        if (!results.find((r) => r.index === i)) {
          missingIndices.push(i + 1);
          const reason = failureReasons.get(i) || "";
          if (reason.toLowerCase().includes("sensitive") || reason.toLowerCase().includes("flagged")) {
            sensitiveContentFailures.push(i + 1);
          }
        }
      }
      
      let errorMessage = `Failed to generate ${missingIndices.length} scene images after retries. Missing scenes: ${missingIndices.join(", ")}`;
      
      if (sensitiveContentFailures.length > 0) {
        errorMessage += `. Scene(s) ${sensitiveContentFailures.join(", ")} were flagged for sensitive content. This is usually due to the character image. Try using a different character image or simpler scene descriptions.`;
      }
      
      throw new Error(errorMessage);
    }

    const imageUrls = results.map((result) => result.imageUrl);
    console.log(
      "All scene images generated successfully (including retries):",
      imageUrls,
    );
    return imageUrls;
  } catch (error) {
    console.error("Scene generation error:", error);
    throw new Error(
      `Failed to generate scene images: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
