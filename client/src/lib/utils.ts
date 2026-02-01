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