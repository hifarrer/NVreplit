import fetch from "node-fetch";
import { ObjectStorageService } from "../objectStorage";
import { randomUUID } from "crypto";
import { isImageKitConfigured, uploadImageToImageKit } from "./imagekit";
import { isBunnyConfigured, uploadCharacterImage } from "./bunny";
import { storage } from "../storage";

export interface StoredImageResult {
  storedUrl: string;
  originalUrl: string;
  imagekitUrl?: string;
}

/**
 * Retry helper with exponential backoff for transient network errors
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    operationName = "operation"
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || String(error);
      
      // Check if error is retryable (network errors, timeouts, etc.)
      const isRetryable = 
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        (error as any).code === 'ECONNRESET' ||
        (error as any).code === 'ETIMEDOUT' ||
        (error as any).errno === 'ECONNRESET';

      if (!isRetryable || attempt === maxRetries) {
        console.error(`[Retry] ${operationName} failed after ${attempt} attempts:`, errorMessage);
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
      const delay = Math.floor(baseDelay + jitter);
      
      console.warn(
        `[Retry] ${operationName} attempt ${attempt}/${maxRetries} failed with ${errorMessage}. ` +
        `Retrying in ${delay}ms...`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Downloads an image from an external URL and stores it permanently in object storage
 */
export async function downloadAndStoreImage(
  imageUrl: string,
  category: string = "characters"
): Promise<StoredImageResult> {
  console.log(`Downloading image from: ${imageUrl}`);
  
  // Download the image with retry logic
  const { imageBuffer, contentType } = await withRetry(
    async () => {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(imageUrl, {
          signal: controller.signal as any,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        const type = response.headers.get("content-type") || "image/jpeg";
        
        return { imageBuffer: buffer, contentType: type };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    { operationName: `download image from ${imageUrl.substring(0, 50)}...`, maxRetries: 3 }
  );
  
  // Get content type and determine file extension
  const extension = getFileExtension(contentType);
  
  // Generate unique filename (for Bunny/ImageKit we use just the filename in the folder)
  const uniqueFileName = `${randomUUID()}${extension}`;
  const filename = `${category}/${uniqueFileName}`;
  
  console.log(`Storing image as: ${filename}`);
  
  // Character images: use Bunny Storage when configured (same zone for "characters" and "saved-characters")
  const isCharacterCategory = category === "characters" || category === "saved-characters";
  if (isCharacterCategory && isBunnyConfigured("characters")) {
    try {
      const bunnyFileName = `${randomUUID()}${extension}`;
      console.log(`[Bunny Storage] Uploading character image: ${bunnyFileName}`);
      const result = await uploadCharacterImage(bunnyFileName, imageBuffer);
      console.log(`[Bunny Storage] Character image uploaded: ${result.url}`);
      return {
        storedUrl: result.url,
        originalUrl: imageUrl,
        imagekitUrl: undefined,
      };
    } catch (error) {
      console.error(`[Bunny Storage] Failed to upload character image:`, error);
      // Fall through to ImageKit or GCS fallback
    }
  }
  
  // Always use ImageKit as primary storage if configured (for non-character or Bunny failed)
  if (isImageKitConfigured()) {
    try {
      console.log(`[ImageKit] Uploading image to ImageKit: ${filename}`);
      const imagekitResult = await uploadImageToImageKit(imageBuffer, filename.split('/').pop() || filename, `/${category}`);
      
      console.log(`[ImageKit] Image uploaded successfully: ${imagekitResult.url}`);
      
      // Return ImageKit URL as primary, with storedUrl as fallback path format
      const storedUrl = `/objects/${filename}`;
      
      // Record the backup in the database (for compatibility)
      await storage.recordImagekitBackup({
        originalPath: storedUrl,
        imagekitUrl: imagekitResult.url,
        imagekitFileId: imagekitResult.fileId,
        fileType: "character"
      });
      
      return {
        storedUrl: imagekitResult.url, // Return ImageKit URL as primary
        originalUrl: imageUrl,
        imagekitUrl: imagekitResult.url,
      };
    } catch (error) {
      console.error(`[ImageKit] Failed to upload image to ImageKit:`, error);
      // Fall through to Google Cloud Storage fallback
    }
  }
  
  // Fallback to Google Cloud Storage only if ImageKit is not configured or failed
  console.log("[Storage] ImageKit not configured or failed, falling back to Google Cloud Storage");
  const objectStorageService = new ObjectStorageService();
  const privateObjectDir = objectStorageService.getPrivateObjectDir();
  
  // Create full path in private directory
  const fullPath = `${privateObjectDir}/${filename}`;
  
  // Parse the path to get bucket and object name
  const { bucketName, objectName } = parseObjectPath(fullPath);
  
  // Get the storage client
  const { objectStorageClient } = await import("../objectStorage");
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  
  // Upload the image buffer with retry logic
  await withRetry(
    async () => {
      await file.save(imageBuffer, {
        resumable: false, // Disable resumable uploads to avoid complexity with retries
        metadata: {
          contentType,
          metadata: {
            originalUrl: imageUrl,
            category,
            uploadedAt: new Date().toISOString(),
          },
        },
      });
    },
    { operationName: `upload to GCS (${filename})`, maxRetries: 4, initialDelayMs: 2000 }
  );
  
  console.log(`Image stored successfully at: ${fullPath}`);
  
  // Return the stored URL that can be served via our API
  const storedUrl = `/objects/${filename}`;
  
  return {
    storedUrl,
    originalUrl: imageUrl,
    imagekitUrl: undefined,
  };
}

/**
 * Gets file extension from content type
 */
function getFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg", 
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
  };
  
  return extensions[contentType.toLowerCase()] || ".jpg";
}

/**
 * Parses object path into bucket name and object name
 */
function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
