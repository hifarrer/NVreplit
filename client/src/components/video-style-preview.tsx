import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";

/** Limits parallel Hls initializations so the create hub doesn't spike CPU/network when many cards are visible at once. */
const MAX_CONCURRENT_LOADS = 2;
const waiting: Array<() => void> = [];
let activeLoads = 0;

function tryStartNext() {
  while (activeLoads < MAX_CONCURRENT_LOADS && waiting.length > 0) {
    const job = waiting.shift()!;
    activeLoads++;
    job();
  }
}

/**
 * Resolves with a `release` function to call once the preview has finished its initial load
 * (manifest ready) or when abandoning the slot (unmount before load).
 */
function acquirePreviewLoadSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    waiting.push(() => {
      resolve(() => {
        activeLoads--;
        tryStartNext();
      });
    });
    tryStartNext();
  });
}

interface VideoStylePreviewProps {
  hlsUrl: string;
  className?: string;
  /** When true (default), only initializes Hls after the preview scrolls near the viewport. */
  lazy?: boolean;
}

function VideoStylePreviewPlayer({
  hlsUrl,
  className = "",
  onInitialLoadComplete,
}: {
  hlsUrl: string;
  className?: string;
  onInitialLoadComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadCompleteRef = useRef(false);
  const onCompleteRef = useRef(onInitialLoadComplete);
  onCompleteRef.current = onInitialLoadComplete;

  const fireLoadCompleteOnce = () => {
    if (loadCompleteRef.current) return;
    loadCompleteRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const loadTimeout = window.setTimeout(() => fireLoadCompleteOnce(), 15_000);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
      });

      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        fireLoadCompleteOnce();
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          fireLoadCompleteOnce();
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener(
        "loadedmetadata",
        () => {
          fireLoadCompleteOnce();
          video.play().catch(() => {});
        },
        { once: true },
      );
    } else {
      fireLoadCompleteOnce();
    }

    return () => {
      clearTimeout(loadTimeout);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsUrl]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-muted ${className}`}>
      <video
        ref={videoRef}
        className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedData={() => setIsLoaded(true)}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
        </div>
      )}
    </div>
  );
}

export function VideoStylePreview({ hlsUrl, className = "", lazy = true }: VideoStylePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(!lazy);
  const [slotGranted, setSlotGranted] = useState(!lazy);
  const releaseRef = useRef<(() => void) | null>(null);
  const releasedRef = useRef(false);

  useEffect(() => {
    if (!lazy) {
      setShouldLoad(true);
      setSlotGranted(true);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px 0px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, hlsUrl]);

  useEffect(() => {
    if (!shouldLoad || !lazy) return;

    let cancelled = false;
    releasedRef.current = false;

    acquirePreviewLoadSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }
      releaseRef.current = release;
      setSlotGranted(true);
    });

    return () => {
      cancelled = true;
      if (releaseRef.current && !releasedRef.current) {
        releasedRef.current = true;
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [shouldLoad, lazy]);

  const handleInitialLoadComplete = () => {
    if (releaseRef.current && !releasedRef.current) {
      releasedRef.current = true;
      releaseRef.current();
      releaseRef.current = null;
    }
  };

  const showPlayer = lazy ? slotGranted : true;

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden bg-muted ${className}`}>
      {showPlayer ? (
        <VideoStylePreviewPlayer hlsUrl={hlsUrl} onInitialLoadComplete={handleInitialLoadComplete} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-pink-500/40 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
