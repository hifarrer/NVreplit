import ImageKit from "imagekit";
import fetch from "node-fetch";
import { randomUUID } from "crypto";

let imagekitInstance: ImageKit | null = null;

function getImageKit(): ImageKit {
  if (!imagekitInstance) {
    const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    
    if (!publicKey || !privateKey || !urlEndpoint) {
      throw new Error("ImageKit credentials not configured. Please set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT environment variables.");
    }
    
    imagekitInstance = new ImageKit({
      publicKey,
      privateKey,
      urlEndpoint
    });
  }
  return imagekitInstance;
}

export function isImageKitConfigured(): boolean {
  return !!(
    process.env.IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.IMAGEKIT_URL_ENDPOINT
  );
}

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  name: string;
  filePath: string;
}

export async function uploadImageToImageKit(
  imageBuffer: Buffer,
  fileName: string,
  folder: string = "/characters"
): Promise<ImageKitUploadResult> {
  const imagekit = getImageKit();
  
  const response = await imagekit.upload({
    file: imageBuffer.toString("base64"),
    fileName: fileName,
    folder: folder
  });
  
  console.log(`[ImageKit] Uploaded image: ${response.url}`);
  
  return {
    url: response.url,
    fileId: response.fileId,
    name: response.name,
    filePath: response.filePath
  };
}

export async function uploadAudioToImageKit(
  audioBuffer: Buffer,
  fileName: string,
  folder: string = "/audio"
): Promise<ImageKitUploadResult> {
  const imagekit = getImageKit();
  
  const response = await imagekit.upload({
    file: audioBuffer.toString("base64"),
    fileName: fileName,
    folder: folder
  });
  
  console.log(`[ImageKit] Uploaded audio: ${response.url}`);
  
  return {
    url: response.url,
    fileId: response.fileId,
    name: response.name,
    filePath: response.filePath
  };
}

export async function downloadAndUploadImageToImageKit(
  imageUrl: string,
  category: string = "characters"
): Promise<ImageKitUploadResult> {
  console.log(`[ImageKit] Downloading image from: ${imageUrl}`);
  
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
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = getFileExtension(contentType);
    const fileName = `${randomUUID()}${extension}`;
    
    return await uploadImageToImageKit(buffer, fileName, `/${category}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchImageKitFile(
  originalPath: string,
  folder: string
): Promise<ImageKitUploadResult | null> {
  const imagekit = getImageKit();
  
  const fileName = originalPath.split('/').pop() || '';
  const baseName = fileName.replace(/\.[^.]+$/, '');
  
  try {
    const files = await imagekit.listFiles({
      path: folder,
      searchQuery: `name HAS "${baseName}"`
    });
    
    if (files && files.length > 0) {
      const file = files[0] as any;
      if (file.type === 'file') {
        return {
          url: file.url,
          fileId: file.fileId,
          name: file.name,
          filePath: file.filePath
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[ImageKit] Error searching for file ${baseName}:`, error);
    return null;
  }
}

function getFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg", 
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  };
  
  return extensions[contentType.toLowerCase()] || ".jpg";
}

export async function resolveImageKitUrl(
  originalPath: string,
  storageInstance: { getImagekitBackupByPath: (path: string) => Promise<{ imagekitUrl: string } | null> }
): Promise<string | null> {
  if (!originalPath) return null;
  
  try {
    const backup = await storageInstance.getImagekitBackupByPath(originalPath);
    if (backup && backup.imagekitUrl) {
      return backup.imagekitUrl;
    }
  } catch (error) {
    console.error(`[ImageKit] Error resolving URL for ${originalPath}:`, error);
  }
  
  return null;
}

export async function resolveUrlWithImageKitFallback(
  originalPath: string | null | undefined,
  storageInstance: { getImagekitBackupByPath: (path: string) => Promise<{ imagekitUrl: string } | null> }
): Promise<string | null> {
  if (!originalPath) return null;
  
  // If it's already an ImageKit URL, return as-is
  if (originalPath.startsWith('https://ik.imagekit.io/')) {
    return originalPath;
  }
  
  // If it's not an internal /objects path, return as-is
  if (!originalPath.startsWith('/objects/')) {
    return originalPath;
  }
  
  // Try to resolve to ImageKit URL
  const imagekitUrl = await resolveImageKitUrl(originalPath, storageInstance);
  return imagekitUrl || originalPath;
}
