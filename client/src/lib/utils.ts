import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts old avatar URLs to ImageKit URLs
 * Handles conversion from internal storage paths to ImageKit URLs
 * @param avatarUrl - The avatar URL (may be old format or already ImageKit)
 * @returns ImageKit URL or original URL if not an avatar path
 */
export function convertAvatarUrlToImageKit(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  
  // If already an ImageKit URL, return as-is
  if (avatarUrl.startsWith('https://ik.imagekit.io/')) {
    return avatarUrl;
  }
  
  // If already a full HTTP/HTTPS URL (but not ImageKit), return as-is (custom uploaded avatar)
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  
  // Convert old internal storage paths to ImageKit URLs
  // Pattern: /public-objects/public/avatars/anonymous.png -> https://ik.imagekit.io/neonvideo/avatars/anonymous.png
  // Pattern: /public-objects/public/avatars/avatar1.png -> https://ik.imagekit.io/neonvideo/avatars/1.png
  if (avatarUrl.includes('/avatars/')) {
    // Extract the filename
    const filenameMatch = avatarUrl.match(/avatars\/(.+)$/);
    if (filenameMatch) {
      const filename = filenameMatch[1];
      
      // Handle anonymous.png
      if (filename === 'anonymous.png') {
        return 'https://ik.imagekit.io/neonvideo/avatars/anonymous.png';
      }
      
      // Handle avatar1.png, avatar2.png, etc. -> 1.png, 2.png, etc.
      const avatarNumberMatch = filename.match(/^avatar(\d+)\.png$/);
      if (avatarNumberMatch) {
        const number = avatarNumberMatch[1];
        return `https://ik.imagekit.io/neonvideo/avatars/${number}.png`;
      }
      
      // For other avatar filenames, use as-is
      return `https://ik.imagekit.io/neonvideo/avatars/${filename}`;
    }
  }
  
  // If not an avatar path, return as-is (might be a custom uploaded avatar)
  return avatarUrl;
}

/**
 * Triggers a real file download for a URL (e.g. ImageKit CDN).
 * Fetches the resource as a blob so cross-origin URLs download instead of opening in the browser.
 * @param url - The video or file URL to download
 * @param filename - Suggested filename for the download (e.g. "music-video.mp4")
 * @returns Promise that resolves when download has started, or rejects on fetch error
 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}