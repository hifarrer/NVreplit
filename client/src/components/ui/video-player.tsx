import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import Hls from "hls.js";
import { isBunnyUrl, getBunnyHlsUrl, getBunnyMp4Url } from "@/lib/bunny-utils";

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
  className?: string;
  poster?: string;
  aspectRatio?: string;
}

export function VideoPlayer({ videoUrl, title = "Video", className, poster, aspectRatio = "16:9" }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hlsFailed, setHlsFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isBunny = isBunnyUrl(videoUrl);
  const hlsUrl = isBunny ? getBunnyHlsUrl(videoUrl) : null;
  const mp4Fallback = isBunny ? getBunnyMp4Url(videoUrl, "720p") : null;

  useEffect(() => {
    setHlsFailed(false);
  }, [videoUrl]);

  useEffect(() => {
    if (!hlsUrl || !videoRef.current || hlsFailed) return;

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, startLevel: -1 });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('[VideoPlayer] HLS fatal error, falling back to MP4:', data.details);
          hls.destroy();
          hlsRef.current = null;
          setHlsFailed(true);
        }
      });
      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
    }
  }, [hlsUrl, hlsFailed]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const isVertical = aspectRatio === "3:4";
  const aspectClass = isVertical ? "aspect-[3/4]" : "aspect-video";

  return (
    <div className={cn("relative", isVertical && "max-w-md mx-auto", className)} data-testid="video-player">
      <div className={cn(aspectClass, "bg-muted rounded-lg relative overflow-hidden border border-border")}>
        <video
          ref={videoRef}
          src={isBunny && !hlsFailed ? undefined : (hlsFailed && mp4Fallback ? mp4Fallback : videoUrl)}
          poster={poster}
          className="w-full h-full object-cover"
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          data-testid="video-element"
        />
        
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              onClick={togglePlayback}
              className="w-20 h-20 floating-button rounded-full flex items-center justify-center pointer-events-auto"
              data-testid="video-play-button"
            >
              <Play className="w-8 h-8 text-white fill-white" />
            </Button>
          </div>
        )}
      </div>
      
      {title && (
        <div className="mt-4 text-center">
          <h4 className="text-lg font-semibold" data-testid="video-title">{title}</h4>
        </div>
      )}
    </div>
  );
}
