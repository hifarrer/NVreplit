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

/**
 * Model configurations for scene generation
 */
type WavespeedModel = {
  name: string;
  endpoint: string;
  buildRequestBody: (imageUrl: string, prompt: string, aspectRatio?: string) => any;
};

const WAVESPEED_MODELS: { primary: WavespeedModel; fallback: WavespeedModel } = {
  primary: {
    name: "google/nano-banana/edit",
    endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana/edit",
    buildRequestBody: (imageUrl: string, prompt: string, aspectRatio: string = "16:9") => ({
      enable_base64_output: false,
      enable_sync_mode: false,
      images: [imageUrl],
      output_format: "jpeg",
      prompt: prompt,
      aspect_ratio: aspectRatio,
    }),
  },
  fallback: {
    name: "alibaba/wan-2.5/image-edit",
    endpoint: "https://api.wavespeed.ai/api/v3/alibaba/wan-2.5/image-edit",
    buildRequestBody: (imageUrl: string, prompt: string, aspectRatio?: string) => ({
      images: [imageUrl],
      prompt: prompt,
      seed: -1,
    }),
  },
};

/**
 * Helper function to submit and poll a scene generation request to Wavespeed
 * Supports both primary and fallback models
 */
async function submitAndPollSceneGeneration(
  model: WavespeedModel,
  imageUrl: string,
  prompt: string,
  sceneLabel: string = "scene",
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  const requestBody = model.buildRequestBody(imageUrl, prompt, aspectRatio);

  console.log(
    `[${model.name}] Submitting ${sceneLabel} generation with prompt: "${prompt.substring(0, 50)}..."`,
  );
  console.log(
    `[${model.name}] Request body:`,
    JSON.stringify(requestBody, null, 2),
  );

  // Submit generation request
  const response = await fetch(model.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${model.name}] ${sceneLabel} submission failed:`, errorText);
    throw new Error(
      `${model.name} submission failed: ${response.status} - ${errorText}`,
    );
  }

  const result = await response.json();
  console.log(
    `[${model.name}] ${sceneLabel} submission result:`,
    JSON.stringify(result, null, 2),
  );

  const requestId = result.data?.id;
  if (!requestId) {
    throw new Error(`No request ID received from ${model.name} for ${sceneLabel}`);
  }

  console.log(`[${model.name}] Got ${sceneLabel} request ID: ${requestId}`);

  // Poll for results
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
      console.error(`[${model.name}] ${sceneLabel} status check failed:`, errorText);
      throw new Error(
        `Status check failed for ${sceneLabel}: ${statusResponse.status} - ${errorText}`,
      );
    }

    const statusResult = await statusResponse.json();

    if (statusResult.data?.status === "completed") {
      console.log(`[${model.name}] ${sceneLabel} generation completed!`);

      if (statusResult.data.outputs && statusResult.data.outputs.length > 0) {
        const imageUrl = statusResult.data.outputs[0];
        console.log(`[${model.name}] Found ${sceneLabel} image URL: ${imageUrl}`);
        return imageUrl;
      } else {
        console.error(
          `[${model.name}] No outputs found in ${sceneLabel} results:`,
          statusResult,
        );
        throw new Error(`No outputs in ${sceneLabel} results from ${model.name}`);
      }
    } else if (statusResult.data?.status === "failed") {
      const errorMsg = statusResult.data?.error || "Unknown error";
      console.error(`[${model.name}] ${sceneLabel} generation failed:`, statusResult);
      throw new Error(`${sceneLabel} generation failed with ${model.name}: ${errorMsg}`);
    }

    attempts++;
  }

  throw new Error(
    `${sceneLabel} generation with ${model.name} timed out after ${maxAttempts} attempts`,
  );
}

/**
 * Generate a single scene image with automatic fallback to alibaba model if google model fails
 */
async function generateSceneWithFallback(
  imageUrl: string,
  prompt: string,
  sceneLabel: string = "scene",
  aspectRatio: string = "16:9",
): Promise<{ imageUrl: string; modelUsed: string }> {
  // Try primary model first
  try {
    const resultUrl = await submitAndPollSceneGeneration(
      WAVESPEED_MODELS.primary,
      imageUrl,
      prompt,
      sceneLabel,
      aspectRatio,
    );
    return { imageUrl: resultUrl, modelUsed: WAVESPEED_MODELS.primary.name };
  } catch (primaryError) {
    console.warn(
      `[Fallback] Primary model ${WAVESPEED_MODELS.primary.name} failed for ${sceneLabel}:`,
      primaryError instanceof Error ? primaryError.message : primaryError,
    );
    console.log(
      `[Fallback] Attempting fallback to ${WAVESPEED_MODELS.fallback.name}...`,
    );

    // Try fallback model
    try {
      const resultUrl = await submitAndPollSceneGeneration(
        WAVESPEED_MODELS.fallback,
        imageUrl,
        prompt,
        sceneLabel,
        aspectRatio,
      );
      console.log(
        `[Fallback] Successfully generated ${sceneLabel} using fallback model ${WAVESPEED_MODELS.fallback.name}`,
      );
      return { imageUrl: resultUrl, modelUsed: WAVESPEED_MODELS.fallback.name };
    } catch (fallbackError) {
      // Both models failed
      const errorMsg =
        `Both models failed for ${sceneLabel}.\n` +
        `Primary (${WAVESPEED_MODELS.primary.name}): ${primaryError instanceof Error ? primaryError.message : primaryError}\n` +
        `Fallback (${WAVESPEED_MODELS.fallback.name}): ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`;
      console.error(`[Fallback] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }
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
  aspectRatio: string = "16:9",
): Promise<string> {
  console.log(`Starting single scene generation with prompt: ${prompt}`);
  console.log(`Input character image URL: ${characterImageUrl}`);
  console.log(`Aspect ratio: ${aspectRatio}`);

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for Wavespeed API`);

  // Use the fallback system (tries google/nano-banana/edit first, falls back to alibaba/wan-2.5/image-edit if it fails)
  const result = await generateSceneWithFallback(
    publicCharacterImageUrl,
    prompt,
    "single scene",
    aspectRatio,
  );

  console.log(`Single scene generated successfully using model: ${result.modelUsed}`);
  
  // Download and store the scene image permanently
  console.log(`Downloading and storing scene image permanently...`);
  const { downloadAndStoreImage } = await import("./imageStorage");
  const storedImage = await downloadAndStoreImage(result.imageUrl, "scenes");
  console.log(`Scene image stored permanently at: ${storedImage.storedUrl}`);
  
  return storedImage.storedUrl;
}

export async function generateSceneImages(
  prompts: string[],
  characterImageUrl: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  console.log(
    `Starting parallel scene generation for ${prompts.length} scenes`,
  );
  console.log(`Input character image URL: ${characterImageUrl}`);
  console.log(`Aspect ratio: ${aspectRatio}`);

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for ${prompts.length} scenes`);

  // Generate all scenes in parallel using the fallback system
  // Each scene will automatically try google/nano-banana/edit first, then alibaba/wan-2.5/image-edit if it fails
  const sceneGenerationPromises = prompts.map((prompt, index) =>
    generateSceneWithFallback(
      publicCharacterImageUrl,
      prompt,
      `scene ${index + 1}`,
      aspectRatio,
    ),
  );

  console.log(
    `Submitting ${prompts.length} scene generation requests in parallel with automatic fallback...`,
  );

  // Wait for all scenes to complete (with automatic retries/fallback built-in)
  const results = await Promise.allSettled(sceneGenerationPromises);

  // Process results
  const successfulScenes: string[] = [];
  const failedScenes: { index: number; reason: string }[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulScenes.push(result.value.imageUrl);
      console.log(
        `✓ Scene ${index + 1} generated successfully using ${result.value.modelUsed}`,
      );
    } else {
      failedScenes.push({
        index: index + 1,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      console.error(`✗ Scene ${index + 1} failed:`, result.reason);
    }
  });

  // If any scenes failed, throw an error with details
  if (failedScenes.length > 0) {
    const failedIndices = failedScenes.map((f) => f.index).join(", ");
    const failureDetails = failedScenes
      .map((f) => `Scene ${f.index}: ${f.reason}`)
      .join("\n");

    throw new Error(
      `Failed to generate ${failedScenes.length} scene(s) after trying both models.\n` +
        `Failed scenes: ${failedIndices}\n\n` +
        `Details:\n${failureDetails}`,
    );
  }

  console.log(
    `✓ All ${prompts.length} scenes generated successfully (with automatic fallback support)`,
  );
  
  // Download and store all scene images permanently
  console.log(`Downloading and storing ${successfulScenes.length} scene images permanently...`);
  const { downloadAndStoreImage } = await import("./imageStorage");
  
  const storePromises = successfulScenes.map(async (sceneUrl, index) => {
    console.log(`Storing scene ${index + 1}...`);
    const storedImage = await downloadAndStoreImage(sceneUrl, "scenes");
    console.log(`Scene ${index + 1} stored permanently at: ${storedImage.storedUrl}`);
    return storedImage.storedUrl;
  });
  
  const storedSceneUrls = await Promise.all(storePromises);
  console.log(`✓ All ${storedSceneUrls.length} scene images stored permanently`);
  
  return storedSceneUrls;
}
