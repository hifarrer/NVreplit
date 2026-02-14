import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "wouter";

interface AudioTrimInterfaceProps {
  audioUrl: string;
  audioDuration: number; // in seconds
  onTrim: (startTime: number, endTime: number) => void;
  onCancel: () => void;
  isTrimming?: boolean;
  isPaidUser?: boolean; // Whether user has a paid plan
}

export function AudioTrimInterface({ 
  audioUrl, 
  audioDuration, 
  onTrim, 
  onCancel,
  isTrimming = false,
  isPaidUser = true
}: AudioTrimInterfaceProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0); // in seconds
  const [endTime, setEndTime] = useState(Math.min(30, audioDuration)); // Default to first 30 seconds or audio duration
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'playhead' | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Free users are limited to 30 seconds, paid users to 4 minutes (240 seconds)
  const maxAllowedDuration = isPaidUser ? Math.min(240, audioDuration) : 30;

  // Initialize default to first 30 seconds when audio duration is first available
  useEffect(() => {
    if (audioDuration > 0 && !hasInitialized.current) {
      // Set default to first 30 seconds (or full duration if less than 30 seconds)
      const defaultEnd = Math.min(30, audioDuration);
      setStartTime(0);
      setEndTime(defaultEnd);
      hasInitialized.current = true;
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    }
  }, [audioDuration]);

  // Ensure endTime doesn't exceed audio duration or user plan limits
  useEffect(() => {
    if (endTime > maxAllowedDuration) {
      if (!isPaidUser && endTime > 30) {
        setShowUpgradeModal(true);
      }
      setEndTime(maxAllowedDuration);
    }
    if (startTime >= endTime) {
      setStartTime(Math.max(0, endTime - 1));
    }
  }, [audioDuration, endTime, startTime, maxAllowedDuration, isPaidUser]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      
      // Stop playback if we reach the end of the selected range
      if (time >= endTime) {
        audio.pause();
        setIsPlaying(false);
        audio.currentTime = startTime; // Reset to start
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = startTime;
    });

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
    };
  }, [startTime, endTime]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      // If we're past the end, reset to start
      if (audio.currentTime >= endTime || audio.currentTime < startTime) {
        audio.currentTime = startTime;
      }
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };


  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * audioDuration;
    
    // Check if free user is trying to seek beyond 30 seconds
    if (!isPaidUser && newTime > 30) {
      setShowUpgradeModal(true);
      return;
    }
    
    // Constrain to selected range and max allowed duration
    const constrainedTime = Math.max(startTime, Math.min(Math.min(endTime, maxAllowedDuration), newTime));
    audio.currentTime = constrainedTime;
    setCurrentTime(constrainedTime);
  };

  const handleMouseDown = (handle: 'start' | 'end' | 'playhead', e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if free user is trying to drag end handle beyond 30 seconds
    if (handle === 'end' && !isPaidUser && endTime >= 30) {
      setShowUpgradeModal(true);
      return;
    }
    
    // Check if paid user is trying to drag end handle beyond 4 minutes
    if (handle === 'end' && isPaidUser && endTime >= 240) {
      return; // Don't allow dragging beyond 4 minutes
    }
    
    setDraggingHandle(handle);
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !draggingHandle || !waveformRef.current || !audioDuration) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * audioDuration;

    if (draggingHandle === 'start') {
      const constrainedTime = Math.max(0, Math.min(endTime - 1, newTime));
      setStartTime(constrainedTime);
      if (audioRef.current && audioRef.current.currentTime < constrainedTime) {
        audioRef.current.currentTime = constrainedTime;
      }
    } else if (draggingHandle === 'end') {
      // Check if free user is trying to expand beyond 30 seconds
      if (!isPaidUser && newTime > 30) {
        setShowUpgradeModal(true);
        setIsDragging(false);
        setDraggingHandle(null);
        return;
      }
      // Check if paid user is trying to expand beyond 4 minutes (240 seconds)
      if (isPaidUser && newTime > 240) {
        setIsDragging(false);
        setDraggingHandle(null);
        return;
      }
      const constrainedTime = Math.max(startTime + 1, Math.min(maxAllowedDuration, newTime));
      setEndTime(constrainedTime);
      if (audioRef.current && audioRef.current.currentTime > constrainedTime) {
        audioRef.current.currentTime = constrainedTime;
      }
    } else if (draggingHandle === 'playhead') {
      const constrainedTime = Math.max(startTime, Math.min(endTime, newTime));
      setCurrentTime(constrainedTime);
      if (audioRef.current) {
        audioRef.current.currentTime = constrainedTime;
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingHandle(null);
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
  }, [isDragging, draggingHandle, startTime, endTime, audioDuration]);

  const adjustPlayhead = (direction: 'left' | 'right', amount: number = 1) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = direction === 'left' 
      ? Math.max(startTime, currentTime - amount)
      : Math.min(endTime, currentTime + amount);
    
    setCurrentTime(newTime);
    audio.currentTime = newTime;
  };

  const progressPercentage = audioDuration > 0 ? ((currentTime - startTime) / (endTime - startTime)) * 100 : 0;
  const startPercentage = audioDuration > 0 ? (startTime / audioDuration) * 100 : 0;
  const endPercentage = audioDuration > 0 ? (endTime / audioDuration) * 100 : 0;

  const handleTrim = () => {
    // Convert to milliseconds for the API
    onTrim(startTime * 1000, endTime * 1000);
  };

  // Calculate credit cost: 1000 credits for every 15 seconds
  const selectedDuration = Math.round(endTime - startTime);
  const creditCost = Math.ceil(selectedDuration / 15) * 1000;

  // Format duration for display (xxs format)
  const formatDurationForButton = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="bg-muted/30 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Select duration</h3>
        <p className="text-sm text-muted-foreground">
          Select a portion of your audio
        </p>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Waveform-like Display with Integrated Controls */}
      <div className="space-y-3">
        {/* Time display above waveform */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Button
              onClick={togglePlayback}
              size="sm"
              variant="outline"
              className="w-10 h-10 p-0 rounded-lg"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <span className="font-mono bg-muted px-2 py-1 rounded">{formatTime(currentTime)}</span>
          </div>
          <span className="font-mono bg-muted px-2 py-1 rounded text-muted-foreground">{formatTime(audioDuration)}</span>
        </div>

        {/* Waveform with integrated controls */}
        <div 
          ref={waveformRef}
          className="relative h-24 bg-gray-800 dark:bg-gray-900 rounded-lg overflow-hidden cursor-pointer"
          onClick={handleSeek}
        >
          {/* Background waveform bars (simulated) */}
          <div className="absolute inset-0 flex items-end justify-around px-2">
            {Array.from({ length: 100 }).map((_, i) => {
              const timeAtBar = (i / 100) * audioDuration;
              // Use a more consistent pattern for waveform
              const baseHeight = 20 + (Math.sin(i * 0.3) * 30) + (Math.cos(i * 0.5) * 20);
              const height = Math.max(15, Math.min(85, baseHeight + Math.random() * 10));
              const isInRange = timeAtBar >= startTime && timeAtBar <= endTime;
              
              return (
                <div
                  key={i}
                  className={cn(
                    "w-0.5 rounded-t transition-colors",
                    isInRange ? "bg-purple-500 dark:bg-purple-400" : "bg-gray-600 dark:bg-gray-700"
                  )}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          {/* Yellow overlay for selected range (more prominent) */}
          <div
            className="absolute top-0 bottom-0 bg-yellow-400/25 border-l-2 border-r-2 border-yellow-400/50"
            style={{
              left: `${startPercentage}%`,
              width: `${endPercentage - startPercentage}%`,
            }}
          />

          {/* Start handle (draggable) */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-yellow-400 cursor-ew-resize z-20 hover:w-1.5 transition-all group"
            style={{ left: `${startPercentage}%` }}
            onMouseDown={(e) => handleMouseDown('start', e)}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-400 rounded-full border-2 border-gray-800 dark:border-gray-900 group-hover:scale-125 transition-transform"></div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-400 rounded-full border-2 border-gray-800 dark:border-gray-900 group-hover:scale-125 transition-transform"></div>
          </div>

          {/* End handle (draggable) */}
          <div
            className={cn(
              "absolute top-0 bottom-0 w-1 bg-yellow-400 cursor-ew-resize z-20 hover:w-1.5 transition-all group",
              !isPaidUser && endTime >= 30 && "opacity-75"
            )}
            style={{ left: `${endPercentage}%` }}
            onMouseDown={(e) => handleMouseDown('end', e)}
            title={!isPaidUser && endTime >= 30 ? "Upgrade to select longer duration" : undefined}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-400 rounded-full border-2 border-gray-800 dark:border-gray-900 group-hover:scale-125 transition-transform"></div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-400 rounded-full border-2 border-gray-800 dark:border-gray-900 group-hover:scale-125 transition-transform"></div>
          </div>

          {/* Yellow playhead with arrow controls */}
          {currentTime >= startTime && currentTime <= endTime && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-30 cursor-ew-resize shadow-lg"
              style={{ left: `${(currentTime / audioDuration) * 100}%` }}
              onMouseDown={(e) => handleMouseDown('playhead', e)}
            >
              {/* Arrow controls overlay - positioned on the playhead line */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-yellow-400 rounded px-1 py-0.5 border border-yellow-300 shadow-md">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustPlayhead('left');
                  }}
                  className="hover:bg-yellow-300 rounded p-0.5 transition-colors"
                  title="Move left 1 second"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ChevronLeft className="w-3 h-3 text-gray-900" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    adjustPlayhead('right');
                  }}
                  className="hover:bg-yellow-300 rounded p-0.5 transition-colors"
                  title="Move right 1 second"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ChevronRight className="w-3 h-3 text-gray-900" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Time labels below waveform */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{formatTime(startTime)}</span>
          <span className="text-primary font-medium">
            Selected: {formatTime(startTime)} - {formatTime(endTime)} ({Math.round(endTime - startTime)}s)
          </span>
          <span>{formatTime(endTime)}</span>
        </div>
      </div>


      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onCancel}
          variant="outline"
          disabled={isTrimming}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleTrim}
          disabled={isTrimming || endTime <= startTime}
          className="flex-1 floating-button"
        >
          {isTrimming 
            ? "Trimming..." 
            : `Trim to ${formatDurationForButton(selectedDuration)} (${creditCost.toLocaleString()} credits)`
          }
        </Button>
      </div>

      {/* Upgrade Modal for Free Users */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Crown className="w-8 h-8 text-primary" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold">Upgrade Your Plan</DialogTitle>
            <DialogDescription className="text-base pt-2">
              Free plans are limited to 30 seconds for music videos. Upgrade to select a longer section.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Link href="/plans">
              <Button 
                className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white"
                onClick={() => setShowUpgradeModal(false)}
              >
                View Plans
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
