const FAL_KEY = process.env.FAL_KEY;
const KIE_API_TOKEN = process.env.KIE_API_TOKEN;

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
 * Central mapping: aspect ratio -> size (width*height) for all image generation APIs.
 * Used wherever an API expects a size parameter instead of aspect ratio.
 */
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1280*720",
  "9:16": "720*1280",
  "9:15": "720*1280",
  "4:3": "1152*864",
  "3:4": "864*1152",
};

function aspectRatioToSize(aspectRatio: string = "16:9"): string {
  return ASPECT_RATIO_TO_SIZE[aspectRatio] ?? ASPECT_RATIO_TO_SIZE["16:9"];
}

/**
 * Size for bytedance/seedream-v4.5/edit (Regenerate Image button only).
 * API requires at least 3686400 pixels; use high-res mapping (1:1→2048*2048, 16:9→2560*1440, etc.).
 */
function seedreamV45EditSizeForAspectRatio(aspectRatio: string = "16:9"): string {
  return SEEDREAM_IMAGE_TO_IMAGE_SIZE[aspectRatio] ?? SEEDREAM_IMAGE_TO_IMAGE_SIZE["16:9"];
}

/**
 * Size for seedream-v4.5/edit when used for Upload tab image-to-image (character style change).
 * This model uses different dimensions than the general character generation.
 */
const SEEDREAM_IMAGE_TO_IMAGE_SIZE: Record<string, string> = {
  "1:1": "2048*2048",
  "16:9": "2560*1440",
  "9:16": "1440*2560",
  "9:15": "1440*2560",
  "4:3": "2304*1728",
  "3:4": "1728*2304",
};

function seedreamImageToImageSizeForAspectRatio(aspectRatio: string = "1:1"): string {
  return SEEDREAM_IMAGE_TO_IMAGE_SIZE[aspectRatio] ?? SEEDREAM_IMAGE_TO_IMAGE_SIZE["1:1"];
}

/**
 * Model configurations for scene generation
 */
type WavespeedModel = {
  name: string;
  endpoint: string;
  buildRequestBody: (imageUrl: string, prompt: string, aspectRatio?: string) => any;
};

/**
 * Model configuration for edit-plus that supports multiple images
 */
type WavespeedEditPlusModel = {
  name: string;
  endpoint: string;
  buildRequestBody: (imageUrls: string[], prompt: string, aspectRatio?: string) => any;
};

const WAVESPEED_MODELS: { primary: WavespeedModel; fallback: WavespeedModel } = {
  primary: {
    name: "wavespeed-ai/qwen-image/edit",
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/edit",
    buildRequestBody: (imageUrl: string, prompt: string, aspectRatio: string = "16:9") => ({
      enable_base64_output: false,
      enable_sync_mode: false,
      image: imageUrl, // Qwen uses "image" (singular) instead of "images" array
      output_format: "jpeg",
      prompt: prompt,
      seed: -1,
      size: aspectRatioToSize(aspectRatio), // Qwen uses size instead of aspect_ratio
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

const WAVESPEED_EDIT_PLUS_MODEL: WavespeedEditPlusModel = {
  name: "wavespeed-ai/qwen-image/edit-plus",
  endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/edit-plus",
  buildRequestBody: (imageUrls: string[], prompt: string, aspectRatio: string = "16:9") => ({
    enable_base64_output: false,
    enable_sync_mode: false,
    images: imageUrls,
    output_format: "jpeg",
    prompt: prompt,
    seed: -1,
    size: aspectRatioToSize(aspectRatio),
  }),
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
  const sceneRequestId = `SCENE-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const sceneStartTime = Date.now();
  
  console.log(`[WAVESPEED-API ${new Date().toISOString()}] ${sceneLabel} API call started`);
  console.log(`[WAVESPEED-API] Request ID: ${sceneRequestId}`);
  console.log(`[WAVESPEED-API] Model: ${model.name}`);
  
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
      const sceneDuration = Date.now() - sceneStartTime;
      console.log(`[WAVESPEED-API ${sceneRequestId}] ${sceneLabel} generation COMPLETED in ${sceneDuration}ms`);
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
 * Helper function to submit and poll a scene generation request to Wavespeed using edit-plus model with multiple images
 */
async function submitAndPollSceneGenerationWithMultipleImages(
  model: WavespeedEditPlusModel,
  imageUrls: string[],
  prompt: string,
  sceneLabel: string = "scene",
  aspectRatio: string = "16:9",
): Promise<string> {
  const sceneRequestId = `SCENE-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const sceneStartTime = Date.now();
  
  console.log(`[WAVESPEED-API ${new Date().toISOString()}] ${sceneLabel} API call started (edit-plus)`);
  console.log(`[WAVESPEED-API] Request ID: ${sceneRequestId}`);
  console.log(`[WAVESPEED-API] Model: ${model.name}`);
  console.log(`[WAVESPEED-API] Number of images: ${imageUrls.length}`);
  
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  const requestBody = model.buildRequestBody(imageUrls, prompt, aspectRatio);

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
      const sceneDuration = Date.now() - sceneStartTime;
      console.log(`[WAVESPEED-API ${sceneRequestId}] ${sceneLabel} generation COMPLETED in ${sceneDuration}ms`);
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

/**
 * Submit and poll bytedance/seedream-v4.5/edit for Regenerate Image button only.
 * Size is determined by aspectRatioToSize (see ASPECT_RATIO_TO_SIZE mapping).
 */
async function submitAndPollSeedreamV45EditForRegenerate(
  characterImageUrl: string,
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  const size = seedreamV45EditSizeForAspectRatio(aspectRatio);
  const endpoint = "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit";

  console.log(`[seedream-v4.5/edit] Regenerate Image: size=${size}, aspectRatio=${aspectRatio}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify({
      enable_base64_output: false,
      enable_sync_mode: false,
      images: [characterImageUrl],
      prompt,
      size,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[seedream-v4.5/edit] submission failed:`, errorText);
    throw new Error(`seedream-v4.5/edit submission failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  if (result.code !== 200) {
    throw new Error(`seedream-v4.5/edit API error: ${result.message || "Unknown error"}`);
  }

  const requestId = result.data?.id ?? result.id;
  if (!requestId) {
    throw new Error("No request ID received from WaveSpeed");
  }

  const maxAttempts = 180;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusResponse = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      { headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` } },
    );
    if (!statusResponse.ok) {
      const err = await statusResponse.text();
      throw new Error(`Status check failed: ${statusResponse.status} - ${err}`);
    }
    const statusResult = await statusResponse.json();
    if (statusResult.code === 200 && statusResult.data?.status === "completed") {
      const outputs = statusResult.data?.outputs;
      if (outputs && Array.isArray(outputs) && outputs.length > 0) {
        return outputs[0];
      }
      throw new Error("No images in results");
    }
    if (statusResult.data?.status === "failed") {
      throw new Error(`Generation failed: ${statusResult.data?.error || "Unknown error"}`);
    }
  }
  throw new Error("seedream-v4.5/edit generation timed out");
}

/**
 * AI Image Edit: run bytedance/seedream-v4.5/edit for a user-provided image and prompt.
 * Used by the standalone AI Image Edit tool (create page). Resolves internal URLs and returns the result image URL.
 */
export async function generateAiImageEdit(
  imageUrl: string,
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const publicImageUrl = await ensurePublicImageUrl(imageUrl, 86400);
  return submitAndPollSeedreamV45EditForRegenerate(publicImageUrl, prompt, aspectRatio);
}

// New Wavespeed.ai character generation function (used for 3D and Cartoon styles)
export async function generateCharacterImageWavespeed(
  prompt: string,
  aspectRatio: string = "16:9",
  style: string = "3d",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Enhanced prompt with style-specific suffix
  const styleDescriptions: Record<string, string> = {
    "cartoon": "cartoon style",
    "anime": "anime style",
    "3d": "3D animation style"
  };
  const styleDescription = styleDescriptions[style] || "3D animation style";
  const enhancedPrompt = `front shot of a ${prompt}, ${styleDescription}`;

  const imageSize = aspectRatioToSize(aspectRatio);
  console.log(
    "Starting Wavespeed.ai character generation with prompt:",
    enhancedPrompt,
  );
  console.log(`Using aspect ratio: ${aspectRatio}, image size: ${imageSize}`);

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
          size: imageSize,
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

// Safe fallback when album cover is flagged as potentially sensitive
const ALBUM_COVER_SAFE_FALLBACK_PROMPT = "music album cover";

/** Sanitize user input for album cover prompt to reduce risk of content-flagging. */
function sanitizeAlbumCoverPrompt(description: string): string {
  if (!description || typeof description !== "string") return "music";
  // Keep only letters, digits, spaces, commas; collapse spaces; truncate
  const cleaned = description
    .replace(/[^\w\s,]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "music";
}

function isAlbumCoverSensitiveError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("potentially sensitive") ||
    msg.includes("content flagged") ||
    msg.includes("sensitive") && msg.includes("prompt")
  );
}

/**
 * Generate an album cover image using WaveSpeed google/nano-banana-2/text-to-image.
 * Used as fallback when seedream-v5.0-lite fails.
 */
async function generateAlbumCoverNanoBanana2(prompt: string): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  console.log("[Album cover] Fallback: nano-banana-2 with prompt:", prompt.substring(0, 80) + (prompt.length > 80 ? "..." : ""));

  const response = await fetch(
    "https://api.wavespeed.ai/api/v3/google/nano-banana-2/text-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        aspect_ratio: "1:1",
        enable_base64_output: false,
        enable_sync_mode: false,
        enable_web_search: false,
        output_format: "jpeg",
        prompt,
        resolution: "1k",
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Album cover] nano-banana-2 submission failed:", errorText);
    throw new Error(`Wavespeed nano-banana-2 error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  if (result.code !== 200) {
    throw new Error(
      `Wavespeed API error: ${result.message || "Unknown error"}`,
    );
  }

  const requestId = result.data?.id;
  if (!requestId) {
    console.error("[Album cover] No request ID in nano-banana-2 response:", result);
    throw new Error("No request ID received from Wavespeed.ai");
  }

  let attempts = 0;
  const maxAttempts = 180;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

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
      throw new Error(`Album cover (nano-banana-2) status check failed: ${statusResponse.status} - ${errorText}`);
    }

    const statusResult = await statusResponse.json();

    if (
      statusResult.code === 200 &&
      statusResult.data?.status === "completed"
    ) {
      const outputs = statusResult.data?.outputs;
      if (outputs && Array.isArray(outputs) && outputs.length > 0) {
        const imageUrl = outputs[0];
        console.log("[Album cover] Fallback nano-banana-2 generated:", imageUrl?.substring(0, 50) + "...");
        return imageUrl;
      }
      throw new Error("No images in album cover results (nano-banana-2)");
    } else if (statusResult.data?.status === "failed") {
      const errMsg = statusResult.data?.error || "Unknown error";
      throw new Error(`Album cover generation failed (nano-banana-2): ${errMsg}`);
    }

    attempts++;
  }

  throw new Error("Album cover generation timed out (nano-banana-2)");
}

/**
 * Generate an album cover image using WaveSpeed seedream-v5.0-lite.
 * Used for Music Tools Create Song and song library thumbnails.
 * Sanitizes the prompt to avoid sensitive content; on "potentially sensitive" error, retries with a simple prompt.
 * On any other failure, falls back to google/nano-banana-2/text-to-image.
 */
export async function generateAlbumCoverSeedreamV5Lite(
  songDescription: string,
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  const sanitized = sanitizeAlbumCoverPrompt(songDescription);
  const promptFirst = `Generate a music album cover for this song ${sanitized}`.trim();

  async function runOneAttempt(prompt: string): Promise<string> {
    console.log("[Album cover] Starting seedream-v5.0-lite with prompt:", prompt.substring(0, 80) + (prompt.length > 80 ? "..." : ""));

    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/bytedance/seedream-v5.0-lite",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          enable_base64_output: false,
          enable_sync_mode: false,
          prompt,
          size: "2048*2048",
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Album cover] Submission failed:", errorText);
      throw new Error(`Wavespeed seedream-v5.0-lite error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    if (result.code !== 200) {
      throw new Error(
        `Wavespeed API error: ${result.message || "Unknown error"}`,
      );
    }

    const requestId = result.data?.id;
    if (!requestId) {
      console.error("[Album cover] No request ID in response:", result);
      throw new Error("No request ID received from Wavespeed.ai");
    }

    let attempts = 0;
    const maxAttempts = 180;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

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
        throw new Error(`Album cover status check failed: ${statusResponse.status} - ${errorText}`);
      }

      const statusResult = await statusResponse.json();

      if (
        statusResult.code === 200 &&
        statusResult.data?.status === "completed"
      ) {
        const outputs = statusResult.data?.outputs;
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
          const imageUrl = outputs[0];
          console.log("[Album cover] Generated:", imageUrl?.substring(0, 50) + "...");
          return imageUrl;
        }
        throw new Error("No images in album cover results");
      } else if (statusResult.data?.status === "failed") {
        const errMsg = statusResult.data?.error || "Unknown error";
        throw new Error(`Album cover generation failed: ${errMsg}`);
      }

      attempts++;
    }

    throw new Error("Album cover generation timed out");
  }

  try {
    return await runOneAttempt(promptFirst);
  } catch (error) {
    const err = error as Error;
    if (isAlbumCoverSensitiveError(err)) {
      try {
        console.warn("[Album cover] Content flagged as potentially sensitive. Retrying with simpler prompt:", ALBUM_COVER_SAFE_FALLBACK_PROMPT);
        return await runOneAttempt(ALBUM_COVER_SAFE_FALLBACK_PROMPT);
      } catch (retryErr) {
        console.warn("[Album cover] seedream-v5.0-lite retry failed, using nano-banana-2 fallback:", (retryErr as Error).message);
        return generateAlbumCoverNanoBanana2(ALBUM_COVER_SAFE_FALLBACK_PROMPT);
      }
    }
    console.warn("[Album cover] seedream-v5.0-lite failed, using nano-banana-2 fallback:", err.message);
    return generateAlbumCoverNanoBanana2(promptFirst);
  }
}

// Realistic character generation using text-to-image-2512-lora model
export async function generateCharacterImageRealistic(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Enhanced prompt for realistic character with photorealistic style
  const enhancedPrompt = `front shot of a ${prompt}, photorealistic style`;

  const imageSize = aspectRatioToSize(aspectRatio);
  console.log(
    "Starting Wavespeed.ai REALISTIC character generation with prompt:",
    enhancedPrompt,
  );
  console.log(`Using aspect ratio: ${aspectRatio}, image size: ${imageSize}`);
  console.log("Using model: text-to-image-2512-lora");

  try {
    // Submit generation request using text-to-image-2512-lora model
    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/text-to-image-2512-lora",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          enable_base64_output: false,
          enable_sync_mode: false,
          loras: [],
          output_format: "jpeg",
          prompt: enhancedPrompt,
          seed: -1,
          size: imageSize,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Wavespeed.ai realistic submission failed:", errorText);
      throw new Error(
        `Wavespeed.ai realistic submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      "Wavespeed.ai realistic submission result:",
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
        console.log("Realistic generation completed! Processing results...");

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
          "Wavespeed.ai realistic generation failed:",
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
    console.error("Wavespeed.ai realistic character generation error:", error);
    throw new Error(
      "Failed to generate realistic character image: " + (error as Error).message,
    );
  }
}

// Radiant character generation using Wavespeed CogView-4 model
export async function generateCharacterImageRadiant(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Enhanced prompt for radiant character
  const enhancedPrompt = `front shot of a ${prompt}, radiant style`;

  const imageSize = aspectRatioToSize(aspectRatio);
  console.log(
    "Starting Wavespeed.ai RADIANT character generation with prompt:",
    enhancedPrompt,
  );
  console.log(`Using aspect ratio: ${aspectRatio}, image size: ${imageSize}`);
  console.log("Using model: z-ai/cogview-4");

  try {
    // Submit generation request using cogview-4 model
    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/z-ai/cogview-4",
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
          quality: "hd",
          size: imageSize,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Wavespeed.ai radiant submission failed:", errorText);
      throw new Error(
        `Wavespeed.ai radiant submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      "Wavespeed.ai radiant submission result:",
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
        console.log("Radiant generation completed! Processing results...");

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
          "Wavespeed.ai radiant generation failed:",
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
    console.error("Wavespeed.ai radiant character generation error:", error);
    throw new Error(
      "Failed to generate radiant character image: " + (error as Error).message,
    );
  }
}

// Artistic character generation using Wavespeed Chroma model
export async function generateCharacterImageArtistic(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Enhanced prompt for artistic character
  const enhancedPrompt = `front shot of a ${prompt}, artistic style`;

  const imageSize = aspectRatioToSize(aspectRatio);
  console.log(
    "Starting Wavespeed.ai ARTISTIC character generation with prompt:",
    enhancedPrompt,
  );
  console.log(`Using aspect ratio: ${aspectRatio}, image size: ${imageSize}`);
  console.log("Using model: wavespeed-ai/chroma");

  try {
    // Submit generation request using chroma model
    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/wavespeed-ai/chroma",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          enable_base64_output: false,
          enable_sync_mode: false,
          output_format: "jpeg",
          prompt: enhancedPrompt,
          seed: -1,
          size: imageSize,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Wavespeed.ai artistic submission failed:", errorText);
      throw new Error(
        `Wavespeed.ai artistic submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      "Wavespeed.ai artistic submission result:",
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
        console.log("Artistic generation completed! Processing results...");

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
          "Wavespeed.ai artistic generation failed:",
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
    console.error("Wavespeed.ai artistic character generation error:", error);
    throw new Error(
      "Failed to generate artistic character image: " + (error as Error).message,
    );
  }
}

// Updated to use Wavespeed.ai for character generation with style support
// Generic function to generate character image using any Wavespeed model
async function generateCharacterImageWithModel(
  prompt: string,
  model: string,
  promptEnhancer: string | null,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Build enhanced prompt: "front shot of a " + user_prompt + prompt_enhancer
  let enhancedPrompt = `front shot of a ${prompt}`;
  if (promptEnhancer) {
    enhancedPrompt += `, ${promptEnhancer}`;
  }

  const imageSize = aspectRatioToSize(aspectRatio);
  console.log(`Starting character generation with model: ${model}`);
  console.log(`Enhanced prompt: ${enhancedPrompt}`);
  console.log(`Using aspect ratio: ${aspectRatio}, image size: ${imageSize}`);

  const endpoint = `https://api.wavespeed.ai/api/v3/${model}`;

  // Build request body based on model type
  let requestBody: any = {
    enable_base64_output: false,
    enable_sync_mode: false,
    prompt: enhancedPrompt,
    size: imageSize,
  };

  // Model-specific request body configurations
  if (model === "z-ai/cogview-4") {
    requestBody.quality = "hd";
  } else if (model === "wavespeed-ai/qwen-image/text-to-image-2512-lora") {
    requestBody.loras = [];
    requestBody.output_format = "jpeg";
    requestBody.seed = -1;
  } else if (model === "alibaba/wan-2.5/text-to-image") {
    requestBody.enable_prompt_expansion = false;
    requestBody.seed = -1;
  } else if (model === "bytedance/seedream-v4") {
    // seedream-v4 uses default config
  } else if (model === "wavespeed-ai/z-image/turbo") {
    // z-image/turbo uses default config
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Wavespeed.ai submission failed for ${model}:`, errorText);
      throw new Error(
        `Wavespeed.ai submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      `Wavespeed.ai submission result for ${model}:`,
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
    console.error(`Wavespeed.ai character generation error for ${model}:`, error);
    throw new Error(
      `Failed to generate character image: ${(error as Error).message}`,
    );
  }
}

// Image-to-image generation using seedream-v4.5/edit model
export async function generateCharacterImageToImage(
  imageUrl: string,
  prompt: string,
  promptEnhancer: string | null,
  aspectRatio: string = "1:1",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicImageUrl = await ensurePublicImageUrl(imageUrl, 86400);
  console.log(`✓ Using validated image URL for Wavespeed API`);

  // Build enhanced prompt: "front shot of a " + user_prompt + prompt_enhancer
  let enhancedPrompt = `front shot of a ${prompt}`;
  if (promptEnhancer) {
    enhancedPrompt += `, ${promptEnhancer}`;
  }

  const size = seedreamImageToImageSizeForAspectRatio(aspectRatio);
  console.log(`Starting image-to-image generation with seedream-v4.5/edit`);
  console.log(`Image URL: ${publicImageUrl}`);
  console.log(`Enhanced prompt: ${enhancedPrompt}`);
  console.log(`Aspect ratio: ${aspectRatio}, size: ${size}`);

  const endpoint = "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify({
        enable_base64_output: false,
        enable_sync_mode: false,
        images: [publicImageUrl],
        prompt: enhancedPrompt,
        size,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Wavespeed.ai image-to-image submission failed:`, errorText);
      throw new Error(
        `Wavespeed.ai image-to-image submission error: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      `Wavespeed.ai image-to-image submission result:`,
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
        console.log("Image-to-image generation completed! Processing results...");

        const outputs = statusResult.data?.outputs;
        if (outputs && Array.isArray(outputs) && outputs.length > 0) {
          const resultImageUrl = outputs[0];
          console.log("Found image URL:", resultImageUrl);
          return resultImageUrl;
        } else {
          console.error("No output URLs found:", statusResult);
          throw new Error("No images in results");
        }
      } else if (statusResult.data?.status === "failed") {
        console.error(
          "Wavespeed.ai image-to-image generation failed:",
          statusResult.data.error || "Unknown error",
        );
        throw new Error(
          `Image-to-image generation failed: ${statusResult.data.error || "Unknown error"}`,
        );
      } else {
        console.log(
          `Task still in progress (status: ${statusResult.data?.status}), continuing to poll...`,
        );
      }

      attempts++;
    }

    throw new Error("Image-to-image generation timed out");
  } catch (error) {
    console.error(`Wavespeed.ai image-to-image generation error:`, error);
    throw new Error(
      `Failed to generate image-to-image: ${(error as Error).message}`,
    );
  }
}

export async function generateCharacterImages(
  prompt: string,
  aspectRatio: string = "16:9",
  style: string = "3d",
  model?: string,
  promptEnhancer?: string | null,
): Promise<string[]> {
  // If model and promptEnhancer are provided, use the new style-based approach
  if (model !== undefined) {
    console.log(`Using style-based generation with model: ${model}`);
    const imageUrl = await generateCharacterImageWithModel(
      prompt,
      model,
      promptEnhancer || null,
      aspectRatio,
    );
    return [imageUrl];
  }

  // Fallback to old style-based logic for backward compatibility
  if (style === "realistic") {
    console.log("Using REALISTIC model (text-to-image-2512-lora) for character generation");
    const imageUrl = await generateCharacterImageRealistic(prompt, aspectRatio);
    return [imageUrl];
  } else if (style === "artistic") {
    console.log("Using ARTISTIC model (chroma) for character generation");
    const imageUrl = await generateCharacterImageArtistic(prompt, aspectRatio);
    return [imageUrl];
  } else if (style === "radiant") {
    console.log("Using RADIANT model (cogview-4) for character generation");
    const imageUrl = await generateCharacterImageRadiant(prompt, aspectRatio);
    return [imageUrl];
  } else {
    // 3D and Cartoon styles both use seedream-v4
    console.log(`Using ${style.toUpperCase()} model (seedream-v4) for character generation`);
    const imageUrl = await generateCharacterImageWavespeed(prompt, aspectRatio, style);
    return [imageUrl];
  }
}

// Original KIE.ai implementation (kept for potential future use)
export async function generateCharacterImagesKIE(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  if (!KIE_API_TOKEN) {
    throw new Error("KIE_API_TOKEN environment variable is required");
  }

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
  style: string = "3d",
): Promise<string> {
  const imageUrls = await generateCharacterImages(prompt, aspectRatio, style);
  return imageUrls[0]; // Return the first image for backward compatibility
}

/**
 * Generate a single scene image from text only (for instrumental videos)
 * Uses seedream-v4 text-to-image model
 */
async function generateSingleSceneImageFromText(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  console.log(`[TEXT-TO-IMAGE] Generating single scene from text`);
  console.log(`[TEXT-TO-IMAGE] Prompt: ${prompt}`);
  console.log(`[TEXT-TO-IMAGE] Aspect ratio: ${aspectRatio}`);

  const size = aspectRatioToSize(aspectRatio);
  console.log(`[TEXT-TO-IMAGE] Using size: ${size} for aspect ratio: ${aspectRatio}`);

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
        prompt: prompt,
        size: size,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TEXT-TO-IMAGE] Wavespeed.ai submission failed:", errorText);
    throw new Error(
      `Wavespeed.ai submission error: ${response.status} - ${errorText}`,
    );
  }

  const result = await response.json();
  console.log(
    "[TEXT-TO-IMAGE] Wavespeed.ai submission result:",
    JSON.stringify(result, null, 2),
  );

  if (result.code !== 200) {
    throw new Error(
      `Wavespeed.ai API error: ${result.message || "Unknown error"}`,
    );
  }

  const requestId = result.data?.id;
  if (!requestId) {
    console.error("[TEXT-TO-IMAGE] No request ID in response:", result);
    throw new Error("No request ID received from Wavespeed.ai");
  }

  console.log("[TEXT-TO-IMAGE] Got request ID:", requestId);

  // Poll for results
  let attempts = 0;
  const maxAttempts = 180; // 15 minutes with 5-second intervals

  console.log("[TEXT-TO-IMAGE] Starting polling for completion...");

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      },
    );

    if (!statusResponse.ok) {
      throw new Error(
        `[TEXT-TO-IMAGE] Status check failed: ${statusResponse.status}`,
      );
    }

    const statusResult = await statusResponse.json();
    const status = statusResult.data?.status;

    if (attempts % 12 === 0) {
      console.log(`[TEXT-TO-IMAGE] Status: ${status || "unknown"}`);
    }

    if (
      status === "completed" &&
      statusResult.data?.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      const imageUrl = statusResult.data.outputs[0];
      console.log(`[TEXT-TO-IMAGE] Generation completed! Image URL: ${imageUrl}`);

      // Download and store the scene image permanently
      console.log(`[TEXT-TO-IMAGE] Downloading and storing scene image permanently...`);
      const { downloadAndStoreImage } = await import("./imageStorage");
      const storedImage = await downloadAndStoreImage(imageUrl, "scenes");
      console.log(`[TEXT-TO-IMAGE] Scene image stored permanently at: ${storedImage.storedUrl}`);

      return storedImage.storedUrl;
    } else if (status === "failed") {
      throw new Error(
        `[TEXT-TO-IMAGE] Generation failed: ${statusResult.data?.error || "Unknown error"}`,
      );
    }

    attempts++;
  }

  throw new Error("[TEXT-TO-IMAGE] Generation timed out after 15 minutes");
}

export async function generateSingleSceneImage(
  prompt: string,
  characterImageUrl: string | undefined,
  aspectRatio: string = "16:9",
  currentSceneImageUrl?: string,
): Promise<string> {
  console.log(`Starting single scene generation with prompt: ${prompt}`);
  console.log(`Aspect ratio: ${aspectRatio}`);
  
  // If no character image URL is provided, use text-to-image generation (for instrumental videos)
  if (!characterImageUrl) {
    console.log(`[INSTRUMENTAL] No character image URL provided, using text-to-image generation`);
    return await generateSingleSceneImageFromText(prompt, aspectRatio);
  }

  console.log(`Input character image URL: ${characterImageUrl}`);
  if (currentSceneImageUrl) {
    console.log(`Current scene image URL provided: ${currentSceneImageUrl}`);
  }

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for Wavespeed API`);

  // Regenerate Image button: always use bytedance/seedream-v4.5/edit with character image and size by aspect ratio
  console.log(`Using bytedance/seedream-v4.5/edit for Regenerate Image (size: ${seedreamV45EditSizeForAspectRatio(aspectRatio)})`);
  const resultImageUrl = await submitAndPollSeedreamV45EditForRegenerate(
    publicCharacterImageUrl,
    prompt,
    aspectRatio,
  );

  console.log(`Single scene generated successfully using model: bytedance/seedream-v4.5/edit`);
  
  // Download and store the scene image permanently
  console.log(`Downloading and storing scene image permanently...`);
  const { downloadAndStoreImage } = await import("./imageStorage");
  const storedImage = await downloadAndStoreImage(resultImageUrl, "scenes");
  console.log(`Scene image stored permanently at: ${storedImage.storedUrl}`);
  
  return storedImage.storedUrl;
}

/**
 * Generate scene images using sequential batch generation (seedream-v4.5/edit-sequential)
 * This generates multiple images in a single API call
 */
async function generateSceneImagesSequential(
  prompts: string[],
  characterImageUrl: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  const batchId = `SEQUENTIAL-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const batchStartTime = Date.now();
  
  console.log(`\n========================================`);
  console.log(`[SEQUENTIAL-GEN ${new Date().toISOString()}] SEQUENTIAL BATCH STARTED`);
  console.log(`[SEQUENTIAL-GEN] Batch ID: ${batchId}`);
  console.log(`[SEQUENTIAL-GEN] Scene count: ${prompts.length}`);
  console.log(`[SEQUENTIAL-GEN] Character Image: ${characterImageUrl?.substring(0, 80)}...`);
  console.log(`[SEQUENTIAL-GEN] Aspect Ratio: ${aspectRatio}`);
  console.log(`========================================\n`);

  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  // Ensure we have a valid public HTTP/HTTPS URL for Wavespeed API
  const publicCharacterImageUrl = await ensurePublicImageUrl(characterImageUrl, 86400);
  console.log(`✓ Using validated character image URL for sequential generation`);

  // edit-sequential requires at least 3686400 pixels; use seedream-v4.5 size mapping (1:1→2048*2048, 16:9→2560*1440, etc.)
  const size = seedreamImageToImageSizeForAspectRatio(aspectRatio);
  console.log(`[SEQUENTIAL-GEN] Using size: ${size} for aspect ratio: ${aspectRatio}`);

  // Format the prompts directly into the sequential format matching user's example
  // Format: "Generate a sequence of N images using the same style as the reference image.\n\nScene 1 – ...\n..."
  let sequentialPrompt = `Generate a sequence of ${prompts.length} images using the same style as the reference image.\n\n`;
  
  prompts.forEach((prompt, index) => {
    sequentialPrompt += `Scene ${index + 1} – ${prompt}\n`;
  });
  
  sequentialPrompt += `\nKeep the characters and setting consistent across all ${prompts.length} images so they feel like same time of day in the exact same location.`;

  // Handle batching: max 15 images per API call (using 12 for safety)
  const MAX_IMAGES_PER_CALL = 12;
  const batches: string[][] = [];
  for (let i = 0; i < prompts.length; i += MAX_IMAGES_PER_CALL) {
    batches.push(prompts.slice(i, i + MAX_IMAGES_PER_CALL));
  }

  console.log(`[SEQUENTIAL-GEN] Split into ${batches.length} batch(es) (max ${MAX_IMAGES_PER_CALL} images per batch)`);

  const allImageUrls: string[] = [];

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStartIndex = batchIndex * MAX_IMAGES_PER_CALL;
    
    console.log(`[SEQUENTIAL-GEN] Processing batch ${batchIndex + 1}/${batches.length} (scenes ${batchStartIndex + 1}-${batchStartIndex + batch.length})`);

    // Create sequential prompt for this batch (same format as main prompt)
    let batchSequentialPrompt = `Generate a sequence of ${batch.length} images using the same style as the reference image.\n\n`;
    
    batch.forEach((prompt, index) => {
      batchSequentialPrompt += `Scene ${batchStartIndex + index + 1} – ${prompt}\n`;
    });
    
    batchSequentialPrompt += `\nKeep the characters and setting consistent across all ${batch.length} images so they feel like same time of day in the exact same location.`;

    const requestId = `SEQ-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} request ID: ${requestId}`);

    // Submit sequential generation request
    const requestBody = {
      enable_base64_output: false,
      enable_sync_mode: false,
      images: [publicCharacterImageUrl],
      max_images: batch.length,
      prompt: batchSequentialPrompt,
      size: size,
    };

    console.log(`[SEQUENTIAL-GEN] Submitting batch ${batchIndex + 1} with ${batch.length} images...`);
    console.log(`[SEQUENTIAL-GEN] Prompt preview: ${batchSequentialPrompt.substring(0, 100)}...`);

    const response = await fetch(
      "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit-sequential",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} submission failed:`, errorText);
      throw new Error(
        `Sequential generation submission failed for batch ${batchIndex + 1}: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    console.log(
      `[SEQUENTIAL-GEN] Batch ${batchIndex + 1} submission result:`,
      JSON.stringify(result, null, 2),
    );

    const apiRequestId = result.data?.id;
    if (!apiRequestId) {
      console.error(`[SEQUENTIAL-GEN] No request ID in response for batch ${batchIndex + 1}:`, result);
      throw new Error(`No request ID received from sequential API for batch ${batchIndex + 1}`);
    }

    console.log(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} got request ID: ${apiRequestId}`);

    // Poll for results
    let attempts = 0;
    const maxAttempts = 300; // 25 minutes with 5-second intervals (longer for batch)

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${apiRequestId}/result`,
        {
          headers: {
            Authorization: `Bearer ${WAVESPEED_API_KEY}`,
          },
        },
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} status check failed:`, errorText);
        throw new Error(
          `Status check failed for batch ${batchIndex + 1}: ${statusResponse.status} - ${errorText}`,
        );
      }

      const statusResult = await statusResponse.json();

      if (statusResult.data?.status === "completed") {
        console.log(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} generation COMPLETED`);

        if (statusResult.data.outputs && Array.isArray(statusResult.data.outputs)) {
          const batchImageUrls = statusResult.data.outputs;
          console.log(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} returned ${batchImageUrls.length} images`);
          allImageUrls.push(...batchImageUrls);
          break; // Exit polling loop
        } else {
          console.error(
            `[SEQUENTIAL-GEN] No outputs found in batch ${batchIndex + 1} results:`,
            statusResult,
          );
          throw new Error(`No outputs in batch ${batchIndex + 1} results from sequential API`);
        }
      } else if (statusResult.data?.status === "failed") {
        const errorMsg = statusResult.data?.error || "Unknown error";
        console.error(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} generation failed:`, statusResult);
        throw new Error(`Batch ${batchIndex + 1} generation failed: ${errorMsg}`);
      }

      attempts++;
      if (attempts % 12 === 0) {
        console.log(`[SEQUENTIAL-GEN] Batch ${batchIndex + 1} still processing... (${attempts * 5}s elapsed)`);
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error(
        `Batch ${batchIndex + 1} generation timed out after ${maxAttempts} attempts (${maxAttempts * 5}s)`,
      );
    }
  }

  // Validate we got the expected number of images
  if (allImageUrls.length !== prompts.length) {
    console.warn(
      `[SEQUENTIAL-GEN] Expected ${prompts.length} images but got ${allImageUrls.length}. This may indicate an issue.`,
    );
  }

  console.log(
    `✓ All ${allImageUrls.length} scenes generated successfully via sequential API`,
  );

  // Download and store all scene images permanently
  console.log(`[SEQUENTIAL-GEN ${batchId}] Downloading and storing ${allImageUrls.length} scene images permanently...`);
  const { downloadAndStoreImage } = await import("./imageStorage");

  const storePromises = allImageUrls.map(async (sceneUrl, index) => {
    console.log(`[SEQUENTIAL-GEN ${batchId}] Storing scene ${index + 1}...`);
    const storedImage = await downloadAndStoreImage(sceneUrl, "scenes");
    console.log(`[SEQUENTIAL-GEN ${batchId}] Scene ${index + 1} stored permanently at: ${storedImage.storedUrl}`);
    return storedImage.storedUrl;
  });

  const storedSceneUrls = await Promise.all(storePromises);

  const batchDuration = Date.now() - batchStartTime;
  console.log(`\n========================================`);
  console.log(`[SEQUENTIAL-GEN ${new Date().toISOString()}] SEQUENTIAL BATCH COMPLETED`);
  console.log(`[SEQUENTIAL-GEN] Batch ID: ${batchId}`);
  console.log(`[SEQUENTIAL-GEN] Duration: ${batchDuration}ms`);
  console.log(`[SEQUENTIAL-GEN] Scenes stored: ${storedSceneUrls.length}`);
  console.log(`========================================\n`);

  return storedSceneUrls;
}

export async function generateSceneImages(
  prompts: string[],
  characterImageUrl: string,
  aspectRatio: string = "16:9",
): Promise<string[]> {
  // Use sequential generation for initial scene generation
  // This generates all scenes in a single (or batched) API call using seedream-v4.5/edit-sequential
  console.log(`[generateSceneImages] Using sequential generation for ${prompts.length} scenes`);
  
  try {
    return await generateSceneImagesSequential(prompts, characterImageUrl, aspectRatio);
  } catch (error) {
    console.error(`[generateSceneImages] Sequential generation failed, falling back to parallel generation:`, error);
    // Fallback to parallel generation if sequential fails
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const batchStartTime = Date.now();
    
    console.log(`\n========================================`);
    console.log(`[FAL-SERVICE ${new Date().toISOString()}] SCENE BATCH STARTED (FALLBACK)`);
    console.log(`[FAL-SERVICE] Batch ID: ${batchId}`);
    console.log(`[FAL-SERVICE] Scene count: ${prompts.length}`);
    console.log(`[FAL-SERVICE] Character Image: ${characterImageUrl?.substring(0, 80)}...`);
    console.log(`[FAL-SERVICE] Aspect Ratio: ${aspectRatio}`);
    console.log(`========================================\n`);
    
    console.log(
      `Starting parallel scene generation for ${prompts.length} scenes (fallback mode)`,
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
    console.log(`[FAL-SERVICE ${batchId}] Downloading and storing ${successfulScenes.length} scene images permanently...`);
    const { downloadAndStoreImage } = await import("./imageStorage");
    
    const storePromises = successfulScenes.map(async (sceneUrl, index) => {
      console.log(`[FAL-SERVICE ${batchId}] Storing scene ${index + 1}...`);
      const storedImage = await downloadAndStoreImage(sceneUrl, "scenes");
      console.log(`[FAL-SERVICE ${batchId}] Scene ${index + 1} stored permanently at: ${storedImage.storedUrl}`);
      return storedImage.storedUrl;
    });
    
    const storedSceneUrls = await Promise.all(storePromises);
    
    const batchDuration = Date.now() - batchStartTime;
    console.log(`\n========================================`);
    console.log(`[FAL-SERVICE ${new Date().toISOString()}] SCENE BATCH COMPLETED`);
    console.log(`[FAL-SERVICE] Batch ID: ${batchId}`);
    console.log(`[FAL-SERVICE] Duration: ${batchDuration}ms`);
    console.log(`[FAL-SERVICE] Scenes stored: ${storedSceneUrls.length}`);
    console.log(`========================================\n`);
    
    return storedSceneUrls;
  }
}

/**
 * Generate scene images using text-to-image (seedream-v4/sequential) for instrumental videos
 * This generates images directly from prompts without needing a character image
 */
export async function generateSceneImagesFromText(
  prompts: string[],
  aspectRatio: string = "16:9",
): Promise<string[]> {
  const batchId = `TEXT-TO-IMAGE-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const batchStartTime = Date.now();
  
  console.log(`\n========================================`);
  console.log(`[TEXT-TO-IMAGE ${new Date().toISOString()}] TEXT-TO-IMAGE BATCH STARTED`);
  console.log(`[TEXT-TO-IMAGE] Batch ID: ${batchId}`);
  console.log(`[TEXT-TO-IMAGE] Scene count: ${prompts.length}`);
  console.log(`[TEXT-TO-IMAGE] Aspect Ratio: ${aspectRatio}`);
  console.log(`========================================\n`);

  const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;
  if (!WAVESPEED_API_KEY) {
    throw new Error("WAVESPEED_API_KEY environment variable is required");
  }

  const size = aspectRatioToSize(aspectRatio);
  console.log(`[TEXT-TO-IMAGE] Using size: ${size} for aspect ratio: ${aspectRatio}`);

  // Format the prompts into sequential format
  let sequentialPrompt = `Generate a sequence of ${prompts.length} consecutive illustrations.\n\n`;
  
  prompts.forEach((prompt, index) => {
    sequentialPrompt += `Scene ${index + 1} – ${prompt}\n`;
  });
  
  sequentialPrompt += `\nKeep the style and setting consistent across all ${prompts.length} images so they feel like the same time of day in the exact same location.`;

  // Handle batching: max 15 images per API call (using 12 for safety)
  const MAX_IMAGES_PER_CALL = 12;
  const batches: string[][] = [];
  for (let i = 0; i < prompts.length; i += MAX_IMAGES_PER_CALL) {
    batches.push(prompts.slice(i, i + MAX_IMAGES_PER_CALL));
  }

  console.log(`[TEXT-TO-IMAGE] Split into ${batches.length} batch(es) (max ${MAX_IMAGES_PER_CALL} images per batch)`);

  const allImageUrls: string[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    let remainingPrompts = [...batch];
    let batchImageUrls: string[] = [];
    let retryCount = 0;
    const maxRetries = 3; // Maximum retries for missing images

    while (remainingPrompts.length > 0 && retryCount <= maxRetries) {
      const expectedCount = remainingPrompts.length;
      const batchPrompt = retryCount === 0 && batchIndex === 0
        ? sequentialPrompt 
        : `Generate a sequence of ${expectedCount} consecutive illustrations.\n\n${remainingPrompts.map((p, i) => `Scene ${i + 1} – ${p}`).join('\n')}\n\nKeep the style and setting consistent across all ${expectedCount} images so they feel like the same time of day in the exact same location.`;

      if (retryCount === 0) {
        console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1}/${batches.length}: Generating ${expectedCount} images...`);
      } else {
        console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} Retry ${retryCount}: Requesting ${expectedCount} missing images...`);
      }

      const response = await fetch("https://api.wavespeed.ai/api/v3/bytedance/seedream-v4/sequential", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          enable_base64_output: false,
          enable_sync_mode: false,
          max_images: expectedCount,
          prompt: batchPrompt,
          size: size,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TEXT-TO-IMAGE] API error:`, errorText);
        throw new Error(`Seedream-v4 sequential API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const requestId = result.data?.id || result.id;

      if (!requestId) {
        throw new Error(`[TEXT-TO-IMAGE] No request ID received`);
      }

      console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} Request ID: ${requestId}`);

      // Poll for results
      let attempts = 0;
      const maxAttempts = 180; // 15 minutes max

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds

        const statusResponse = await fetch(
          `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
          {
            headers: {
              Authorization: `Bearer ${WAVESPEED_API_KEY}`,
            },
          }
        );

        if (!statusResponse.ok) {
          throw new Error(`[TEXT-TO-IMAGE] Status check failed: ${statusResponse.status}`);
        }

        const statusResult = await statusResponse.json();
        const status = statusResult.data?.status;

        if (attempts % 12 === 0) {
          console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} Status: ${status || "unknown"}`);
        }

        if (
          status === "completed" &&
          statusResult.data?.outputs &&
          statusResult.data.outputs.length > 0
        ) {
          const imageUrls = statusResult.data.outputs;
          console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} completed! Got ${imageUrls.length} images (expected ${expectedCount})`);
          
          batchImageUrls.push(...imageUrls);
          
          // Check if we got fewer images than requested
          if (imageUrls.length < expectedCount) {
            const missingCount = expectedCount - imageUrls.length;
            console.warn(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} got ${imageUrls.length} images but expected ${expectedCount}. Missing ${missingCount} images.`);
            
            // Remove the prompts that we got images for (assuming they come in order)
            // Sequential API returns images in the order of prompts, so we remove the first N prompts
            remainingPrompts = remainingPrompts.slice(imageUrls.length);
            retryCount++;
            
            if (retryCount > maxRetries) {
              console.error(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} exceeded max retries (${maxRetries}). Proceeding with ${batchImageUrls.length} images instead of ${batch.length}.`);
              remainingPrompts = []; // Stop retrying
              break;
            }
            
            if (remainingPrompts.length > 0) {
              console.log(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} will retry for ${remainingPrompts.length} missing images...`);
              break; // Exit polling loop to make retry request
            }
          }
          
          // Got all expected images (or no more retries), exit both loops
          remainingPrompts = [];
          break;
        } else if (status === "completed" && (!statusResult.data?.outputs || statusResult.data.outputs.length === 0)) {
          // Completed but no images returned - this is unusual, treat as failure for retry
          console.warn(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} completed but returned 0 images. Retrying...`);
          retryCount++;
          
          if (retryCount > maxRetries) {
            throw new Error(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} completed but returned 0 images after ${maxRetries} retries`);
          }
          
          break; // Exit polling loop to make retry request
        } else if (status === "failed") {
          throw new Error(
            `[TEXT-TO-IMAGE] Batch ${batchIndex + 1} generation failed: ${statusResult.data?.error || "Unknown error"}`
          );
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} generation timed out after 15 minutes`);
      }
    }

    // Add all images from this batch to the main array
    allImageUrls.push(...batchImageUrls);
    
    if (batchImageUrls.length < batch.length) {
      console.warn(`[TEXT-TO-IMAGE] Batch ${batchIndex + 1} final count: ${batchImageUrls.length}/${batch.length} images after retries`);
    }
  }

  console.log(`[TEXT-TO-IMAGE] All batches completed. Total images: ${allImageUrls.length}`);

  // Download and store all images
  const { downloadAndStoreImage } = await import("./imageStorage");
  const storedSceneUrls: string[] = [];

  for (let i = 0; i < allImageUrls.length; i++) {
    console.log(`[TEXT-TO-IMAGE] Storing image ${i + 1}/${allImageUrls.length}...`);
    const storedImage = await downloadAndStoreImage(allImageUrls[i], "scenes");
    storedSceneUrls.push(storedImage.storedUrl);
  }

  const batchDuration = Date.now() - batchStartTime;
  console.log(`\n========================================`);
  console.log(`[TEXT-TO-IMAGE ${new Date().toISOString()}] TEXT-TO-IMAGE BATCH COMPLETED`);
  console.log(`[TEXT-TO-IMAGE] Batch ID: ${batchId}`);
  console.log(`[TEXT-TO-IMAGE] Duration: ${batchDuration}ms`);
  console.log(`[TEXT-TO-IMAGE] Scenes stored: ${storedSceneUrls.length}`);
  console.log(`========================================\n`);

  return storedSceneUrls;
}