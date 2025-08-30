import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  className?: string;
}

export function AudioPlayer({ audioUrl, title = "Audio Track", className }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', () => setIsPlaying(false));
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("p-6 media-player rounded-lg", className)} data-testid="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <h4 className="text-lg font-semibold mb-4 flex items-center">
        <i className="fas fa-play text-primary mr-2"></i>
        {title}
      </h4>
      
      <div className="flex items-center space-x-4">
        <Button
          onClick={togglePlayback}
          className="w-12 h-12 floating-button rounded-full flex items-center justify-center p-0"
          data-testid="audio-play-button"
        >
          <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-primary-foreground`} />
        </Button>
        
        <div className="flex-1">
          <div className="bg-muted rounded-full h-2 mb-2">
            <div 
              className="progress-bar h-full rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span data-testid="audio-current-time">{formatTime(currentTime)}</span>
            <span className="font-medium" data-testid="audio-title">{title}</span>
            <span data-testid="audio-duration">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
