import fetch from "node-fetch";
import { ObjectStorageService } from "../objectStorage";
import { randomUUID } from "crypto";

export interface StoredImageResult {
  storedUrl: string;
  originalUrl: string;
}

/**
 * Downloads an image from an external URL and stores it permanently in object storage
 */
export async function downloadAndStoreImage(
  imageUrl: string,
  category: string = "characters"
): Promise<StoredImageResult> {
  try {
    console.log(`Downloading image from: ${imageUrl}`);
    
    // Download the image from the external URL
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image content as buffer
    const imageBuffer = await response.buffer();
    
    // Get content type and determine file extension
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = getFileExtension(contentType);
    
    // Generate unique filename
    const filename = `${category}/${randomUUID()}${extension}`;
    
    console.log(`Storing image as: ${filename}`);
    
    // Get object storage service
    const objectStorageService = new ObjectStorageService();
    const privateObjectDir = objectStorageService.getPrivateObjectDir();
    
    // Create full path in private directory
    const fullPath = `${privateObjectDir}/${filename}`;
    
    // Parse the path to get bucket and object name
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    // Get the storage client and upload the image
    const { objectStorageClient } = await import("../objectStorage");
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    // Upload the image buffer
    await file.save(imageBuffer, {
      metadata: {
        contentType,
        metadata: {
          originalUrl: imageUrl,
          category,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    
    console.log(`Image stored successfully at: ${fullPath}`);
    
    // Return the stored URL that can be served via our API
    const storedUrl = `/objects/${filename}`;
    
    return {
      storedUrl,
      originalUrl: imageUrl,
    };
  } catch (error) {
    console.error("Error downloading and storing image:", error);
    throw new Error(`Failed to store image: ${(error as Error).message}`);
  }
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