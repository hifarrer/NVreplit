import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Pause, Download } from "lucide-react";

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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div className={cn("p-6 media-player rounded-lg", className)} data-testid="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold flex items-center">
          <Play className="w-5 h-5 text-primary mr-2" />
          {title}
        </h4>
        <Button
          onClick={() => {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `${title}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
          data-testid="audio-download-button"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </Button>
      </div>
      
      <div className="flex items-center space-x-4">
        <Button
          onClick={togglePlayback}
          className="w-12 h-12 floating-button rounded-full flex items-center justify-center p-0"
          data-testid="audio-play-button"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-primary-foreground" />
          ) : (
            <Play className="w-5 h-5 text-primary-foreground" />
          )}
        </Button>
        
        <div className="flex-1">
          <div 
            className="bg-muted rounded-full h-2 mb-2 cursor-pointer relative"
            onClick={handleSeek}
            data-testid="audio-progress-bar"
          >
            <div 
              className="progress-bar h-full rounded-full pointer-events-none"
              style={{ width: `${progressPercentage}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md pointer-events-none"
              style={{ left: `calc(${progressPercentage}% - 6px)` }}
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
