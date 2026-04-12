import fetch from "node-fetch";
import crypto from "crypto";

type BunnyStorageZone = "final" | "scenes" | "characters" | "imageScenes" | "songs" | "audios" | "songCovers";

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
  if (zone === "characters") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_CHARACTERS_PATH || "characters",
    };
  }
  if (zone === "imageScenes") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_IMAGESCENES_PATH || "ImageScenes",
    };
  }
  if (zone === "songs") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_SONGS_PATH || "songs",
    };
  }
  if (zone === "audios") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_AUDIOS_PATH || "audios",
    };
  }
  if (zone === "songCovers") {
    return {
      storageZoneName: zoneName,
      storagePassword: password,
      storageHostname,
      cdnHostname,
      folderPath: process.env.BUNNY_STORAGE_SONG_COVERS_PATH || "SongCovers",
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

  return Buffer.from(await response.arrayBuffer());
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

/**
 * Upload a character image buffer to Bunny Storage (characters folder).
 */
export async function uploadCharacterImage(
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  return uploadToBunnyStorage("characters", fileName, buffer);
}

/**
 * Upload a scene image buffer to Bunny Storage (imageScenes folder).
 */
export async function uploadSceneImage(
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  return uploadToBunnyStorage("imageScenes", fileName, buffer);
}

/**
 * Upload a song/audio buffer to Bunny Storage (songs folder).
 */
export async function uploadSongAudio(
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  return uploadToBunnyStorage("songs", fileName, buffer);
}

/**
 * Upload a user-facing audio file to Bunny Storage (audios folder).
 * Public CDN URL: https://neonvideo.b-cdn.net/audios/<fileName>
 */
export async function uploadAudio(
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  return uploadToBunnyStorage("audios", fileName, buffer);
}

/**
 * Upload a song album cover image to Bunny Storage (songCovers folder).
 */
export async function uploadSongCover(
  fileName: string,
  buffer: Buffer,
): Promise<{ url: string; storagePath: string }> {
  return uploadToBunnyStorage("songCovers", fileName, buffer);
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
const ALL_STORAGE_ZONES: BunnyStorageZone[] = [
  "final",
  "scenes",
  "characters",
  "imageScenes",
  "songs",
  "audios",
  "songCovers",
];

/**
 * Resolve a public Bunny Storage / CDN URL to a zone and file name for deletion.
 * Returns null if the URL does not match a known storage folder layout.
 */
export function getBunnyZoneAndFileNameFromUrl(url: string): { zone: BunnyStorageZone; fileName: string } | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\//, "");
    for (const zone of ALL_STORAGE_ZONES) {
      const config = getStorageConfig(zone);
      const prefix = `${config.folderPath}/`;
      if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length);
        if (rest && !rest.includes("/")) {
          return { zone, fileName: decodeURIComponent(rest) };
        }
      }
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

/**
 * Delete a file from Bunny Storage when the URL matches our zones and the zone is configured.
 */
export async function deleteBunnyFileByPublicUrlIfConfigured(url: string): Promise<void> {
  const parsed = getBunnyZoneAndFileNameFromUrl(url);
  if (!parsed) return;
  if (!isBunnyConfigured(parsed.zone)) {
    console.warn(`[Bunny Storage] Skip delete (zone not configured): ${parsed.zone}`);
    return;
  }
  await deleteFromBunnyStorage(parsed.zone, parsed.fileName);
}

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

// ─── Bunny Stream (video library / HLS) helpers ─────────────────

function getStreamConfig() {
  return {
    libraryId: process.env.BUNNY_STREAM_FINAL_LIBRARY_ID || "",
    apiKey: process.env.BUNNY_STREAM_FINAL_API_KEY || "",
    cdnHostname: process.env.BUNNY_STREAM_FINAL_CDN_HOSTNAME || "",
  };
}

export function isBunnyStreamConfigured(): boolean {
  const cfg = getStreamConfig();
  return !!(cfg.libraryId && cfg.apiKey && cfg.cdnHostname);
}

/**
 * Push an existing video URL into a Bunny Stream library via the Fetch API.
 * Bunny will download the file and transcode it to HLS in the background.
 * Returns the Stream video GUID on success.
 */
export async function fetchVideoToBunnyStream(
  sourceUrl: string,
  title: string,
): Promise<{ videoId: string; libraryId: string }> {
  const cfg = getStreamConfig();
  if (!cfg.libraryId || !cfg.apiKey) {
    throw new Error("Bunny Stream is not configured (missing BUNNY_STREAM_FINAL_LIBRARY_ID or API key)");
  }

  const url = `https://video.bunnycdn.com/library/${cfg.libraryId}/videos/fetch`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        AccessKey: cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: sourceUrl, title }),
    });

    if (response.status === 429) {
      const waitMs = Math.min(5000 * (attempt + 1), 15000);
      console.warn(`[Bunny Stream] Rate limited (429), retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      lastError = new Error("Rate limited by Bunny Stream API");
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bunny Stream fetch failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { success?: boolean; message?: string; statusCode?: number; id?: string };

    const videoId = data.id;
    if (!videoId) {
      throw new Error(`Bunny Stream fetch returned no video ID: ${JSON.stringify(data)}`);
    }

    console.log(`[Bunny Stream] Video fetch initiated: ${videoId} for "${title}"`);
    return { videoId, libraryId: cfg.libraryId };
  }

  throw lastError || new Error("Bunny Stream fetch failed after retries");
}

export function getBunnyStreamThumbnailUrl(videoId: string): string {
  const cfg = getStreamConfig();
  return `https://${cfg.cdnHostname}/${videoId}/thumbnail.jpg`;
}

export function getBunnyStreamPreviewUrl(videoId: string): string {
  const cfg = getStreamConfig();
  return `https://${cfg.cdnHostname}/${videoId}/preview.webp`;
}

export function getBunnyStreamEmbedUrl(videoId: string): string {
  const cfg = getStreamConfig();
  return `https://player.mediadelivery.net/embed/${cfg.libraryId}/${videoId}`;
}
