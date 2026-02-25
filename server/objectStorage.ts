import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { isImageKitConfigured, uploadAudioToImageKit, uploadVideoToImageKit } from "./services/imagekit";
import { isBunnyConfigured, uploadToBunnyStorage, uploadSongAudio } from "./services/bunny";
import { storage } from "./storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Determine if we're running in Replit environment
const isReplit = !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN);

// Lazy initialization of Google Cloud Storage client - only create if ImageKit is not configured
// This prevents authentication errors when ImageKit is being used
let _objectStorageClient: Storage | null = null;

function getObjectStorageClient(): Storage {
  // If ImageKit is configured, we don't need Google Cloud Storage
  if (isImageKitConfigured()) {
    throw new Error("Google Cloud Storage client should not be used when ImageKit is configured");
  }
  
  if (!_objectStorageClient) {
    // Configure Google Cloud Storage client based on environment
    // - Replit: Use sidecar endpoint for authentication
    // - Local (Windows/other): Use service account credentials from GOOGLE_APPLICATION_CREDENTIALS
    let storageConfig: any;

    if (isReplit) {
      // Replit production environment - use sidecar endpoint
      storageConfig = {
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: {
              type: "json",
              subject_token_field_name: "access_token",
            },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      };
    } else {
      // Local development environment - use service account credentials
      // Supports GOOGLE_APPLICATION_CREDENTIALS env var or keyFilename
      storageConfig = {
        // If GOOGLE_APPLICATION_CREDENTIALS is set, it will be used automatically
        // Otherwise, you can set keyFilename to point to a service account key file
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "",
      };
      
      // If no credentials are provided, Storage will try to use Application Default Credentials
      // which works if gcloud is configured locally
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT_ID) {
        console.warn("⚠️  Google Cloud Storage: No explicit credentials found. Will attempt to use Application Default Credentials.");
        console.warn("   For local development, set GOOGLE_APPLICATION_CREDENTIALS to your service account key file path.");
      }
    }

    _objectStorageClient = new Storage(storageConfig);
  }
  
  return _objectStorageClient;
}

// Export a getter function for direct access
export function getObjectStorageClientInstance(): Storage {
  return getObjectStorageClient();
}

// For backward compatibility, export as objectStorageClient but make it lazy
// Create a proxy that only initializes the client when actually accessed
export const objectStorageClient = new Proxy({} as Storage, {
  get(target, prop) {
    // If ImageKit is configured, throw error on any access
    if (isImageKitConfigured()) {
      throw new Error(`Google Cloud Storage client accessed (${String(prop)}) but ImageKit is configured. This should not happen.`);
    }
    
    // Otherwise, get the actual client and return the property
    const client = getObjectStorageClient();
    const value = (client as any)[prop];
    
    // If it's a function, bind it to the client
    if (typeof value === 'function') {
      return value.bind(client);
    }
    
    return value;
  }
});

export class ObjectStorageService {
  constructor() {}

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "/replit-objstore-2b41d446-a481-4048-b395-249a1b7496ae/.private";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    return dir;
  }

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
          // Fix the bucket name mismatch
          .map((path) => path.replace("repl-default-bucket-", "replit-objstore-"))
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    // If ImageKit is configured, we should not access Google Cloud Storage
    if (isImageKitConfigured()) {
      console.warn(`[ObjectStorage] searchPublicObject called for ${filePath} but ImageKit is configured. Public objects should be served from ImageKit.`);
      return null;
    }

    const searchPaths = this.getPublicObjectSearchPaths();
    
    for (const searchPath of searchPaths) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = this.parseObjectPath(fullPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    // Also try searching in bucket root (without the /public prefix)
    // This handles the case where files are uploaded directly to bucket/avatars/ instead of bucket/public/avatars/
    try {
      const bucketName = "replit-objstore-2b41d446-a481-4048-b395-249a1b7496ae";
      const directObjectName = filePath; // e.g., "avatars/avatar1.png"
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(directObjectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    } catch (error) {
      console.error("Error in fallback search:", error);
    }

    return null;
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = this.parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    // If ImageKit is configured, we should not access Google Cloud Storage
    if (isImageKitConfigured()) {
      throw new Error("Cannot access Google Cloud Storage when ImageKit is configured. File should be served from ImageKit.");
    }

    if (!objectPath.startsWith("/objects/")) {
      throw new Error("Object not found");
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new Error("Object not found");
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = this.parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new Error("Object not found");
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Check if this is an audio file
      const isAudio = metadata.contentType && metadata.contentType.startsWith('audio/');
      
      // Set appropriate headers
      const headers: any = {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      };
      
      // Add Accept-Ranges header for audio files to enable seeking
      if (isAudio) {
        headers["Accept-Ranges"] = "bytes";
      }
      
      res.set(headers);

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async uploadAudioBuffer(buffer: Buffer, path: string): Promise<string> {
    try {
      const fileName = path.split('/').pop() || path;

      // Prefer Bunny Storage (songs folder) when configured
      if (isBunnyConfigured("songs")) {
        console.log(`[Bunny Storage] Uploading audio: ${fileName}`);
        const result = await uploadSongAudio(fileName, buffer);
        console.log(`[Bunny Storage] Audio uploaded successfully: ${result.url}`);
        return result.url;
      }

      // Fallback to ImageKit if Bunny is not configured
      if (isImageKitConfigured()) {
        console.log(`[ImageKit] Uploading audio to ImageKit: ${fileName}`);
        const imagekitResult = await uploadAudioToImageKit(buffer, fileName, "/audio");
        console.log(`[ImageKit] Audio uploaded successfully: ${imagekitResult.url}`);
        return imagekitResult.url;
      }
      
      // Fallback to Google Cloud Storage
      console.log("[Storage] Bunny and ImageKit not configured, falling back to Google Cloud Storage");
      const objectPath = `${this.getPrivateObjectDir()}/${path}`;
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'audio/mpeg',
        },
      });
      
      console.log("Audio uploaded to object storage:", objectPath);
      const permanentPath = `/objects/${path}`;
      console.log("Generated permanent audio path:", permanentPath);
      return permanentPath;
    } catch (error) {
      console.error("Error uploading audio to storage:", error);
      throw error;
    }
  }

  async uploadVideoBuffer(buffer: Buffer, filename?: string): Promise<{ url: string }> {
    try {
      const videoFilename = filename || `video_${randomUUID()}.mp4`;

      // Bunny Storage as primary storage for videos (direct MP4 URL)
      if (isBunnyConfigured("final")) {
        console.log(`[Bunny Storage] Uploading video buffer: ${videoFilename}`);
        const result = await uploadToBunnyStorage("final", videoFilename, buffer);
        console.log(`[Bunny Storage] Video buffer uploaded successfully: ${result.url}`);
        return { url: result.url };
      }

      // ImageKit as secondary storage if Bunny is not configured
      if (isImageKitConfigured()) {
        console.log(`[ImageKit] Uploading video buffer to ImageKit: ${videoFilename}`);
        const imagekitResult = await uploadVideoToImageKit(buffer, videoFilename, "/videos");
        console.log(`[ImageKit] Video buffer uploaded successfully: ${imagekitResult.url}`);

        const permanentPath = `/objects/videos/${videoFilename}`;
        await storage.recordImagekitBackup({
          originalPath: permanentPath,
          imagekitUrl: imagekitResult.url,
          imagekitFileId: imagekitResult.fileId,
          fileType: "video",
        });

        return { url: imagekitResult.url };
      }

      // Fallback to Google Cloud Storage
      const objectPath = `${this.getPrivateObjectDir()}/videos/${videoFilename}`;
      const { bucketName, objectName } = this.parseObjectPath(objectPath);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(buffer, {
        metadata: {
          contentType: "video/mp4",
        },
      });

      return { url: `/objects/videos/${videoFilename}` };
    } catch (error) {
      console.error("Error uploading video buffer to storage:", error);
      throw error;
    }
  }

  async uploadVideoFromUrl(videoUrl: string, filename?: string): Promise<{ url: string }> {
    try {
      console.log("Downloading video from URL:", videoUrl);
      
      let response: any = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          response = await fetch(videoUrl);
          if (response.ok) {
            break;
          } else {
            console.log(`Download attempt ${attempts + 1} failed with status: ${response.status} - ${response.statusText}`);
            if (attempts === maxAttempts - 1) {
              throw new Error(`Failed to download video after ${maxAttempts} attempts: ${response.statusText}`);
            }
          }
        } catch (error) {
          console.log(`Download attempt ${attempts + 1} failed with error:`, error);
          if (attempts === maxAttempts - 1) {
            throw new Error(`Failed to download video after ${maxAttempts} attempts: ${(error as Error).message}`);
          }
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!response || !response.ok) {
        throw new Error("Failed to download video after all retry attempts");
      }
      
      const buffer = await response.buffer();
      const videoFilename = filename || `video_${randomUUID()}.mp4`;
      
      // Bunny Storage as primary storage for videos (direct MP4 URL)
      if (isBunnyConfigured("final")) {
        console.log(`[Bunny Storage] Uploading video: ${videoFilename}`);
        const result = await uploadToBunnyStorage("final", videoFilename, buffer);
        console.log(`[Bunny Storage] Video uploaded successfully: ${result.url}`);
        return { url: result.url };
      }

      // ImageKit as secondary storage if Bunny is not configured
      if (isImageKitConfigured()) {
        try {
          console.log(`[ImageKit] Uploading video to ImageKit: ${videoFilename}`);
          const imagekitResult = await uploadVideoToImageKit(buffer, videoFilename, "/videos");
          console.log(`[ImageKit] Video uploaded successfully: ${imagekitResult.url}`);
          
          const permanentPath = `/objects/videos/${videoFilename}`;
          await storage.recordImagekitBackup({
            originalPath: permanentPath,
            imagekitUrl: imagekitResult.url,
            imagekitFileId: imagekitResult.fileId,
            fileType: "video"
          });
          
          return { url: imagekitResult.url };
        } catch (imagekitError) {
          console.error(`[ImageKit] Failed to upload video to ImageKit:`, imagekitError);
          throw new Error(`ImageKit upload failed: ${(imagekitError as Error).message}`);
        }
      }
      
      // Fallback to Google Cloud Storage
      console.log("[Storage] ImageKit not configured, falling back to Google Cloud Storage");
      const objectPath = `${this.getPrivateObjectDir()}/videos/${videoFilename}`;
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'video/mp4',
        },
      });
      
      console.log("Video uploaded to object storage:", objectPath);
      const permanentPath = `/objects/videos/${videoFilename}`;
      console.log("Generated permanent video path:", permanentPath);
      return { url: permanentPath };
    } catch (error) {
      console.error("Error uploading video to storage:", error);
      throw error;
    }
  }

  parseObjectPath(path: string): {
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

  async getSignedUrlForPath(objectPath: string, ttlSec: number = 3600): Promise<string> {
    // Bunny CDN/Storage URLs are already public
    if (objectPath.includes('.b-cdn.net/') || objectPath.includes('storage.bunnycdn.com')) {
      return objectPath;
    }

    // If ImageKit is configured and the path is already an ImageKit URL, return it as-is
    if (isImageKitConfigured() && (objectPath.startsWith('https://ik.imagekit.io/') || objectPath.startsWith('http'))) {
      console.log(`[ObjectStorage] Path is already a full URL (likely ImageKit), returning as-is: ${objectPath}`);
      return objectPath;
    }
    
    // Convert internal path like "/objects/videos/pip_segment_1.mp4" to signed URL
    console.log(`[ObjectStorage] getSignedUrlForPath called with: ${objectPath}`);
    
    // If ImageKit is configured, we shouldn't need signed URLs (ImageKit URLs are public)
    if (isImageKitConfigured()) {
      console.warn(`[ObjectStorage] ImageKit is configured but getSignedUrlForPath was called. This might indicate the file wasn't uploaded to ImageKit.`);
      // Try to resolve from ImageKit backup
      const backup = await storage.getImagekitBackupByPath(objectPath);
      if (backup && backup.imagekitUrl) {
        console.log(`[ObjectStorage] Found ImageKit backup, returning: ${backup.imagekitUrl}`);
        return backup.imagekitUrl;
      }
      throw new Error(`Cannot generate signed URL for ${objectPath} - ImageKit is configured but no backup found. File may need to be re-uploaded.`);
    }
    
    if (!objectPath.startsWith("/objects/")) {
      const error = `Invalid object path for signed URL generation: ${objectPath} (must start with /objects/)`;
      console.error(`[ObjectStorage] ${error}`);
      throw new Error(error);
    }
    
    try {
      // Extract the file path after /objects/
      const filePath = objectPath.substring("/objects/".length);
      const privateDir = this.getPrivateObjectDir();
      const fullObjectPath = `${privateDir}/${filePath}`;
      
      console.log(`[ObjectStorage] Private dir: ${privateDir}`);
      console.log(`[ObjectStorage] Full object path: ${fullObjectPath}`);
      
      const { bucketName, objectName } = this.parseObjectPath(fullObjectPath);
      
      console.log(`[ObjectStorage] Bucket: ${bucketName}, Object: ${objectName}`);
      
      const signedUrl = await this.signObjectURL({
        bucketName,
        objectName,
        method: "GET",
        ttlSec
      });
      
      console.log(`[ObjectStorage] Successfully generated signed URL (${signedUrl.substring(0, 100)}...)`);
      return signedUrl;
    } catch (error) {
      console.error(`[ObjectStorage] Failed to generate signed URL for ${objectPath}:`, error);
      throw error;
    }
  }

  async getSignedUrlForPublicObject(publicObjectPath: string, ttlSec: number = 3600): Promise<string> {
    // Convert public object path like "/public-objects/outro.mp4" to signed URL
    if (!publicObjectPath.startsWith("/public-objects/")) {
      throw new Error("Invalid public object path for signed URL generation");
    }
    
    // Extract the file path after /public-objects/
    const filePath = publicObjectPath.substring("/public-objects/".length);
    
    // Find the object using the search method
    const file = await this.searchPublicObject(filePath);
    if (!file) {
      throw new Error(`Public object not found: ${publicObjectPath}`);
    }
    
    // Generate signed URL directly from the file
    return this.signObjectURL({
      bucketName: file.bucket.name,
      objectName: file.name,
      method: "GET",
      ttlSec
    });
  }

  async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    // If ImageKit is configured, we should not generate signed URLs for Google Cloud Storage
    if (isImageKitConfigured()) {
      throw new Error("Cannot generate signed URLs for Google Cloud Storage when ImageKit is configured. Use ImageKit URLs directly.");
    }

    // Use Replit sidecar endpoint if in Replit environment
    if (isReplit) {
      const request = {
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      };
      const response = await fetch(
        `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to sign object URL, errorcode: ${response.status}, ` +
            `make sure you're running on Replit`
        );
      }

      const result = await response.json() as { signed_url: string };
      const signedURL = result.signed_url;
      return signedURL;
    } else {
      // Local development: Use Google Cloud Storage client's built-in signing
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: method.toLowerCase() as 'read' | 'write' | 'delete' | 'resumable',
        expires: Date.now() + (ttlSec * 1000),
      });
      
      return signedUrl;
    }
  }
}