import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { isImageKitConfigured, uploadAudioToImageKit } from "./services/imagekit";
import { storage } from "./storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
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
      const objectPath = `${this.getPrivateObjectDir()}/${path}`;
      
      // Parse the path to get bucket and object name
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      
      // Upload to object storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'audio/mpeg',
        },
      });
      
      console.log("Audio uploaded to object storage:", objectPath);
      
      // Return a permanent path that can be served through our application
      const permanentPath = `/objects/${path}`;
      console.log("Generated permanent audio path:", permanentPath);
      
      // Also upload to ImageKit if configured
      if (isImageKitConfigured()) {
        try {
          const fileName = path.split('/').pop() || path;
          console.log(`[ImageKit] Uploading audio to ImageKit: ${fileName}`);
          const imagekitResult = await uploadAudioToImageKit(buffer, fileName, "/audio");
          
          // Record the backup in the database
          await storage.recordImagekitBackup({
            originalPath: permanentPath,
            imagekitUrl: imagekitResult.url,
            imagekitFileId: imagekitResult.fileId,
            fileType: "song"
          });
          
          console.log(`[ImageKit] Audio uploaded successfully: ${imagekitResult.url}`);
        } catch (error) {
          console.error(`[ImageKit] Failed to upload audio to ImageKit:`, error);
          // Continue without ImageKit - we still have the internal storage URL
        }
      }
      
      return permanentPath;
    } catch (error) {
      console.error("Error uploading audio to storage:", error);
      throw error;
    }
  }

  async uploadVideoFromUrl(videoUrl: string, filename?: string): Promise<string> {
    try {
      console.log("Downloading video from URL:", videoUrl);
      
      // Retry logic for downloading the video
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
        // Wait 2 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!response || !response.ok) {
        throw new Error("Failed to download video after all retry attempts");
      }
      
      const buffer = await response.buffer();
      
      // Generate a unique filename if not provided
      const videoFilename = filename || `video_${randomUUID()}.mp4`;
      const objectPath = `${this.getPrivateObjectDir()}/videos/${videoFilename}`;
      
      // Parse the path to get bucket and object name
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      
      // Upload to object storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(buffer, {
        metadata: {
          contentType: 'video/mp4',
        },
      });
      
      console.log("Video uploaded to object storage:", objectPath);
      
      // Return a permanent path that can be served through our application
      const permanentPath = `/objects/videos/${videoFilename}`;
      console.log("Generated permanent video path:", permanentPath);
      return permanentPath;
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
    // Convert internal path like "/objects/videos/pip_segment_1.mp4" to signed URL
    console.log(`[ObjectStorage] getSignedUrlForPath called with: ${objectPath}`);
    
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
  }
}