import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Pause, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DownloadRestrictionModal } from "@/components/modals/download-restriction-modal";

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  className?: string;
}

export function AudioPlayer({ audioUrl, title = "Audio Track", className }: AudioPlayerProps) {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showDownloadRestriction, setShowDownloadRestriction] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Check if user is on free plan
  const isFreeUser = !user?.plan || user.plan.name.toLowerCase() === 'free';

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
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleSeek(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !progressBarRef.current || !duration) return;
    
    const audio = audioRef.current;
    if (!audio) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, duration]);

  return (
    <div className={cn("p-4 sm:p-6 media-player rounded-lg", className)} data-testid="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h4 className="text-base sm:text-lg font-semibold flex items-center">
          <Play className="w-4 h-4 sm:w-5 sm:h-5 text-primary mr-2 flex-shrink-0" />
          <span className="truncate">{title}</span>
        </h4>
        <Button
          onClick={() => {
            // Check if user is on free plan
            if (isFreeUser) {
              setShowDownloadRestriction(true);
              return;
            }

            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `${title}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          variant="outline"
          size="sm"
          className="flex items-center space-x-2 w-full sm:w-auto justify-center"
          data-testid="audio-download-button"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </Button>
      </div>
      
      <div className="flex items-center space-x-3 sm:space-x-4">
        <Button
          onClick={togglePlayback}
          className="w-10 h-10 sm:w-12 sm:h-12 floating-button rounded-full flex items-center justify-center p-0 flex-shrink-0"
          data-testid="audio-play-button"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
          ) : (
            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
          )}
        </Button>
        
        <div className="flex-1 min-w-0">
          <div 
            ref={progressBarRef}
            className="bg-muted rounded-full h-2 mb-2 cursor-pointer relative select-none"
            onClick={handleSeek}
            onMouseDown={handleMouseDown}
            data-testid="audio-progress-bar"
          >
            <div 
              className="progress-bar h-full rounded-full pointer-events-none"
              style={{ width: `${progressPercentage}%` }}
            />
            <div 
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md pointer-events-none transition-transform ${
                isDragging ? 'scale-125' : 'hover:scale-110'
              }`}
              style={{ left: `calc(${progressPercentage}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
            <span data-testid="audio-current-time">{formatTime(currentTime)}</span>
            <span data-testid="audio-duration">{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <DownloadRestrictionModal
        isOpen={showDownloadRestriction}
        onClose={() => setShowDownloadRestriction(false)}
      />
    </div>
  );
}
