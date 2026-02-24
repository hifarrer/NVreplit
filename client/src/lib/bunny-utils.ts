const BUNNY_CDN_PATTERN = /\.b-cdn\.net\//;

export function isBunnyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return BUNNY_CDN_PATTERN.test(url);
}

export function getBunnyVideoId(url: string): string | null {
  if (!isBunnyUrl(url)) return null;
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

export function getBunnyHlsUrl(url: string): string {
  const videoId = getBunnyVideoId(url);
  if (!videoId) return url;
  const urlObj = new URL(url);
  return `${urlObj.origin}/${videoId}/playlist.m3u8`;
}

export function getBunnyThumbnailUrl(url: string): string {
  const videoId = getBunnyVideoId(url);
  if (!videoId) return "";
  const urlObj = new URL(url);
  return `${urlObj.origin}/${videoId}/thumbnail.jpg`;
}

export function getBunnyMp4Url(
  url: string,
  resolution: "360p" | "480p" | "720p" | "1080p" = "720p"
): string {
  const videoId = getBunnyVideoId(url);
  if (!videoId) return url;
  const urlObj = new URL(url);
  return `${urlObj.origin}/${videoId}/play_${resolution}.mp4`;
}
