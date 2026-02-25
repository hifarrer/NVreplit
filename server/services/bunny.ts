import fetch from "node-fetch";
import crypto from "crypto";

type BunnyStorageZone = "final" | "scenes";

interface BunnyStorageConfig {
  storageZoneName: string;
  storagePassword: string;
  storageHostname: string;
  cdnHostname: string;
  folderPath: string;
}

function getStorageBaseUrl(): string {
  const hostname = process.env.BUNNY_STORAGE_HOSTNAME || "storage.bunnycdn.com";
  return `https://${hostname}`;
}

function getStorageConfig(zone: BunnyStorageZone): BunnyStorageConfig {
  const zoneName = process.env.BUNNY_STORAGE_ZONE_NAME || "";
  const password = process.env.BUNNY_STORAGE_PASSWORD || "";
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || "storage.bunnycdn.com";
  const cdnHostname = process.env.BUNNY_STORAGE_CDN_HOSTNAME || "";

  if (zone === "final") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_FINAL_PATH || "FinalVideos",
    };
  }
  return {
    storageZoneName: zoneName,
    storagePassword: password,
    storageHostname,
    cdnHostname,
    folderPath: process.env.BUNNY_STORAGE_SCENES_PATH || "VideoScenes",
  };
}

export function isBunnyConfigured(zone: BunnyStorageZone = "final"): boolean {
  const config = getStorageConfig(zone);
  return !!(config.storageZoneName && config.storagePassword);
}

/**
 * Upload a file buffer to Bunny Storage and return the public CDN URL.
 */
export async function uploadToBunnyStorage(
  zone: BunnyStorageZone,
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  const config = getStorageConfig(zone);

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
  const storagePath = `${config.folderPath}/${fileName}`;
  const uploadUrl = `${getStorageBaseUrl()}/${config.storageZoneName}/${storagePath}`;

  console.log(`[Bunny Storage] Uploading ${fileName} to ${zone} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.storagePassword,
      "Content-Type": "application/octet-stream",
      Checksum: checksum,
    },
    body: buffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny Storage upload failed (${response.status}): ${text}`);
  }

  const publicUrl = getBunnyPublicUrl(zone, fileName);
  console.log(`[Bunny Storage] Upload successful: ${publicUrl}`);

  return { url: publicUrl, storagePath };
}

/**
 * Download a file from Bunny Storage.
 */
export async function downloadFromBunnyStorage(
  zone: BunnyStorageZone,
  fileName: string,
): Promise<Buffer> {
  const config = getStorageConfig(zone);
  const storagePath = `${config.folderPath}/${fileName}`;
  const downloadUrl = `${getStorageBaseUrl()}/${config.storageZoneName}/${storagePath}`;

  const response = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      AccessKey: config.storagePassword,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny Storage download failed (${response.status}): ${text}`);
  }

  return await response.buffer();
}

/**
 * Delete a file from Bunny Storage.
 */
export async function deleteFromBunnyStorage(
  zone: BunnyStorageZone,
  fileName: string,
): Promise<void> {
  const config = getStorageConfig(zone);
  const storagePath = `${config.folderPath}/${fileName}`;
  const deleteUrl = `${getStorageBaseUrl()}/${config.storageZoneName}/${storagePath}`;

  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      AccessKey: config.storagePassword,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny Storage delete failed (${response.status}): ${text}`);
  }

  console.log(`[Bunny Storage] Deleted ${storagePath}`);
}

/**
 * Upload a video buffer to Bunny Storage (convenience wrapper for final videos).
 */
export async function uploadFinalVideo(
  title: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  const sanitized = title.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const fileName = `${sanitized}_${Date.now()}.mp4`;
  return uploadToBunnyStorage("final", fileName, buffer);
}

/**
 * Upload a scene video buffer to Bunny Storage.
 */
export async function uploadSceneVideo(
  projectId: string,
  sceneIndex: number,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  const fileName = `scene_${projectId}_${sceneIndex + 1}_${Date.now()}.mp4`;
  return uploadToBunnyStorage("scenes", fileName, buffer);
}

// ─── URL helpers ────────────────────────────────────────────────

/**
 * Get public CDN URL for a file in Bunny Storage.
 * Uses the configured CDN hostname (pull zone) linked to the storage zone.
 */
export function getBunnyPublicUrl(zone: BunnyStorageZone, fileName: string): string {
  const config = getStorageConfig(zone);
  if (config.cdnHostname) {
    return `https://${config.cdnHostname}/${config.folderPath}/${fileName}`;
  }
  return `${getStorageBaseUrl()}/${config.storageZoneName}/${config.folderPath}/${fileName}`;
}

/**
 * Check if a URL is a Bunny Storage/CDN URL.
 */
export function isBunnyUrl(url: string): boolean {
  if (!url) return false;
  const config = getStorageConfig("final");
  if (config.cdnHostname && url.includes(config.cdnHostname)) return true;
  if (url.includes("storage.bunnycdn.com")) return true;
  if (url.includes(".b-cdn.net/")) return true;
  return false;
}

/**
 * Check if a URL is a Bunny Storage MP4 (direct file URL, not HLS).
 */
export function isBunnyStorageMp4(url: string): boolean {
  return isBunnyUrl(url) && url.endsWith(".mp4");
}
