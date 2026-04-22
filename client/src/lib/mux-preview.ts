/**
 * Helpers for building lightweight Mux image-service URLs from the HLS
 * playback URLs used across the app.
 *
 * Mux's image service (`image.mux.com`) exposes per-asset previews that are
 * far cheaper than streaming the full HLS manifest:
 *   - `/{id}/animated.webp`  – short looping preview, image decode only
 *   - `/{id}/thumbnail.webp` – static poster frame
 *
 * These require the playback ID to use a public policy (no JWT). The HLS
 * URLs in the codebase are already public, so the same IDs work here.
 */

const PLAYBACK_ID_RE = /stream\.mux\.com\/([^.?/]+)\.m3u8/i;

export function muxPlaybackIdFromHls(hlsUrl: string): string | null {
  return hlsUrl.match(PLAYBACK_ID_RE)?.[1] ?? null;
}

export interface MuxAnimatedOptions {
  /** Output width in px. Mux caps at 1920; for thumbnails 320–640 is plenty. */
  width?: number;
  /** Frames per second (1–30). Lower = smaller file. */
  fps?: number;
  /** Start offset in seconds. */
  start?: number;
  /** End offset in seconds. Max 10s total duration (end - start). */
  end?: number;
}

export function muxAnimatedWebp(hlsUrl: string, opts: MuxAnimatedOptions = {}): string | null {
  const id = muxPlaybackIdFromHls(hlsUrl);
  if (!id) return null;
  const { width = 480, fps = 15, start = 0, end = 8 } = opts;
  const params = new URLSearchParams({
    width: String(width),
    fps: String(fps),
    start: String(start),
    end: String(end),
  });
  return `https://image.mux.com/${id}/animated.webp?${params.toString()}`;
}

export function muxPoster(hlsUrl: string, width = 480, time = 1): string | null {
  const id = muxPlaybackIdFromHls(hlsUrl);
  if (!id) return null;
  const params = new URLSearchParams({
    width: String(width),
    time: String(time),
  });
  return `https://image.mux.com/${id}/thumbnail.webp?${params.toString()}`;
}
