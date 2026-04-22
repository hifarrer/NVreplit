import { useState } from "react";
import { muxAnimatedWebp, muxPoster } from "@/lib/mux-preview";

interface MuxAnimatedPreviewProps {
  /** The HLS URL (e.g. `https://stream.mux.com/{id}.m3u8?...`) – the playback ID is extracted from it. */
  hlsUrl: string;
  className?: string;
  /** Rendered width hint used for both the poster and animated preview. */
  width?: number;
  /** Frames per second for the animated preview. Defaults to 15. */
  fps?: number;
  /** End offset in seconds for the animated preview (max 10s). Defaults to 8. */
  end?: number;
  /** Accessible alt text. Most tiles are decorative, so defaults to "". */
  alt?: string;
}

/**
 * Lightweight replacement for `<VideoStylePreview>` on grid pages like the
 * `/create` hub. Renders a static Mux thumbnail first and overlays the
 * animated WebP preview once it loads. No hls.js, no `<video>` decode.
 */
export function MuxAnimatedPreview({
  hlsUrl,
  className = "",
  width = 480,
  fps = 15,
  end = 8,
  alt = "",
}: MuxAnimatedPreviewProps) {
  const animated = muxAnimatedWebp(hlsUrl, { width, fps, end });
  const poster = muxPoster(hlsUrl, width);
  const [animatedLoaded, setAnimatedLoaded] = useState(false);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-muted ${className}`}>
      {poster && (
        <img
          src={poster}
          alt={alt}
          aria-hidden={alt === "" ? true : undefined}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
      {animated && (
        <img
          src={animated}
          alt={alt}
          aria-hidden={alt === "" ? true : undefined}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            animatedLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setAnimatedLoaded(true)}
        />
      )}
      {!poster && !animated && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          Preview unavailable
        </div>
      )}
    </div>
  );
}
