import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  videoUrl: string;
  title?: string;
  className?: string;
  poster?: string;
}

export function VideoPlayer({ videoUrl, title = "Video", className, poster }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  return (
    <div className={cn("relative", className)} data-testid="video-player">
      <div className="aspect-video bg-muted rounded-lg relative overflow-hidden border border-border">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={poster}
          className="w-full h-full object-cover"
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          data-testid="video-element"
        />
        
        {/* Play button overlay - only show when paused */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              onClick={togglePlayback}
              className="w-20 h-20 floating-button rounded-full flex items-center justify-center pointer-events-auto"
              data-testid="video-play-button"
            >
              <i className="fas fa-play text-2xl text-primary-foreground ml-1" />
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
