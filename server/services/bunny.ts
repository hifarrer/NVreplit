import fetch from "node-fetch";

type BunnyLibrary = "final" | "scenes";

interface BunnyLibraryConfig {
  libraryId: string;
  apiKey: string;
  cdnHostname: string;
}

interface BunnyCreateVideoResponse {
  videoLibraryId: number;
  guid: string;
  title: string;
  dateUploaded: string;
  status: number;
}

interface BunnyUploadResponse {
  success: boolean;
  message: string | null;
  statusCode: number;
}

export interface BunnyVideoStatus {
  videoId: string;
  status: "queued" | "processing" | "encoding" | "finished" | "failed";
  encodeProgress: number;
  length: number;
  width: number;
  height: number;
  availableResolutions: string | null;
  thumbnailCount: number;
}

const BUNNY_API_BASE = "https://video.bunnycdn.com";

const BUNNY_STATUS_MAP: Record<number, BunnyVideoStatus["status"]> = {
  0: "queued",
  1: "processing",
  2: "encoding",
  3: "encoding",    // Transcoding
  4: "finished",
  5: "failed",
  6: "failed",      // UploadFailed
};

function getLibraryConfig(library: BunnyLibrary): BunnyLibraryConfig {
  if (library === "final") {
    return {
      libraryId: process.env.BUNNY_STREAM_FINAL_LIBRARY_ID || "",
      apiKey: process.env.BUNNY_STREAM_FINAL_API_KEY || "",
      cdnHostname: process.env.BUNNY_STREAM_FINAL_CDN_HOSTNAME || "",
    };
  }
  return {
    libraryId: process.env.BUNNY_STREAM_SCENES_LIBRARY_ID || "",
    apiKey: process.env.BUNNY_STREAM_SCENES_API_KEY || "",
    cdnHostname: process.env.BUNNY_STREAM_SCENES_CDN_HOSTNAME || "",
  };
}

export function isBunnyConfigured(library: BunnyLibrary = "final"): boolean {
  const config = getLibraryConfig(library);
  return !!(config.libraryId && config.apiKey && config.cdnHostname);
}

export async function createBunnyVideo(
  library: BunnyLibrary,
  title: string
): Promise<{ videoId: string; libraryId: string }> {
  const config = getLibraryConfig(library);

  const response = await fetch(
    `${BUNNY_API_BASE}/library/${config.libraryId}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Bunny createVideo failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as BunnyCreateVideoResponse;
  console.log(
    `[Bunny] Created video in ${library} library: ${data.guid} (${title})`
  );

  return { videoId: data.guid, libraryId: config.libraryId };
}

export async function uploadBunnyVideo(
  library: BunnyLibrary,
  videoId: string,
  buffer: Buffer
): Promise<void> {
  const config = getLibraryConfig(library);

  const response = await fetch(
    `${BUNNY_API_BASE}/library/${config.libraryId}/videos/${videoId}`,
    {
      method: "PUT",
      headers: {
        AccessKey: config.apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Bunny uploadVideo failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as BunnyUploadResponse;
  if (!data.success) {
    throw new Error(`Bunny upload unsuccessful: ${data.message}`);
  }

  console.log(
    `[Bunny] Uploaded video ${videoId} to ${library} library (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`
  );
}

export async function createAndUploadBunnyVideo(
  library: BunnyLibrary,
  title: string,
  buffer: Buffer
): Promise<{ videoId: string; libraryId: string; cdnUrl: string; hlsUrl: string }> {
  const { videoId, libraryId } = await createBunnyVideo(library, title);
  await uploadBunnyVideo(library, videoId, buffer);

  return {
    videoId,
    libraryId,
    cdnUrl: getBunnyCdnBaseUrl(library, videoId),
    hlsUrl: getBunnyHlsUrl(library, videoId),
  };
}

export async function getBunnyVideoStatusFromApi(
  library: BunnyLibrary,
  videoId: string
): Promise<BunnyVideoStatus> {
  const config = getLibraryConfig(library);

  const response = await fetch(
    `${BUNNY_API_BASE}/library/${config.libraryId}/videos/${videoId}`,
    {
      method: "GET",
      headers: { AccessKey: config.apiKey },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Bunny getVideoStatus failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as any;
  return {
    videoId: data.guid,
    status: BUNNY_STATUS_MAP[data.status] || "processing",
    encodeProgress: data.encodeProgress || 0,
    length: data.length || 0,
    width: data.width || 0,
    height: data.height || 0,
    availableResolutions: data.availableResolutions || null,
    thumbnailCount: data.thumbnailCount || 0,
  };
}

export async function deleteBunnyVideo(
  library: BunnyLibrary,
  videoId: string
): Promise<void> {
  const config = getLibraryConfig(library);

  const response = await fetch(
    `${BUNNY_API_BASE}/library/${config.libraryId}/videos/${videoId}`,
    {
      method: "DELETE",
      headers: { AccessKey: config.apiKey },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Bunny deleteVideo failed (${response.status}): ${text}`
    );
  }

  console.log(`[Bunny] Deleted video ${videoId} from ${library} library`);
}

// ─── URL helpers ────────────────────────────────────────────────

export function getBunnyCdnBaseUrl(
  library: BunnyLibrary,
  videoId: string
): string {
  const config = getLibraryConfig(library);
  return `https://${config.cdnHostname}/${videoId}`;
}

export function getBunnyHlsUrl(
  library: BunnyLibrary,
  videoId: string
): string {
  return `${getBunnyCdnBaseUrl(library, videoId)}/playlist.m3u8`;
}

export function getBunnyThumbnailUrl(
  library: BunnyLibrary,
  videoId: string
): string {
  return `${getBunnyCdnBaseUrl(library, videoId)}/thumbnail.jpg`;
}

export function getBunnyMp4Url(
  library: BunnyLibrary,
  videoId: string,
  resolution: "360p" | "480p" | "720p" | "1080p" = "720p"
): string {
  return `${getBunnyCdnBaseUrl(library, videoId)}/play_${resolution}.mp4`;
}

/** Official Bunny embed URL (iframe) - use for playback; avoids 403 on direct CDN MP4/HLS in some setups */
export function getBunnyEmbedUrl(libraryId: string, videoId: string): string {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
}

export function isBunnyUrl(url: string): boolean {
  if (!url) return false;
  return url.includes(".b-cdn.net/");
}

export function getBunnyVideoIdFromUrl(url: string): string | null {
  if (!isBunnyUrl(url)) return null;
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    // The first path segment after the hostname is the video GUID
    return parts[0] || null;
  } catch {
    return null;
  }
}

export function getBunnyLibraryFromUrl(url: string): BunnyLibrary | null {
  if (!url) return null;
  const finalCdn = process.env.BUNNY_STREAM_FINAL_CDN_HOSTNAME || "";
  const scenesCdn = process.env.BUNNY_STREAM_SCENES_CDN_HOSTNAME || "";
  if (finalCdn && url.includes(finalCdn)) return "final";
  if (scenesCdn && url.includes(scenesCdn)) return "scenes";
  return null;
}

// ─── Webhook status mapping ─────────────────────────────────────

export type BunnyWebhookStatus =
  | "uploading"
  | "processing"
  | "finished"
  | "failed";

/**
 * Maps Bunny webhook status codes to our internal status values.
 * Webhook status codes differ from the video API status codes.
 */
export function mapBunnyWebhookStatus(
  statusCode: number
): BunnyWebhookStatus {
  switch (statusCode) {
    case 0: // Queued
    case 1: // Processing
    case 2: // Encoding
      return "processing";
    case 3: // Finished
    case 4: // Resolution finished (playable)
    case 9: // CaptionsGenerated
    case 10: // TitleOrDescriptionGenerated
      return "finished";
    case 5: // Failed
    case 8: // PresignedUploadFailed
      return "failed";
    case 6: // PresignedUploadStarted
    case 7: // PresignedUploadFinished
      return "uploading";
    default:
      return "processing";
  }
}
