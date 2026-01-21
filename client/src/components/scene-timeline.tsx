import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { SceneData } from "@/lib/types";
import { Film, GripVertical, Clock, Mic, Music, Type, Play, Pause, AlertTriangle, Video, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

interface SceneTimelineProps {
  scenes: SceneData[];
  sceneOrder: number[];
  audioDuration?: number;
  audioUrl?: string;
  lyrics?: string;
  subtitleFileUrl?: string;
  finalVideoUrl?: string;
  isEditMode?: boolean;
  onReorder: (newOrder: number[]) => void;
  onSceneClick?: (sceneIndex: number) => void;
  onToggleLipsync?: (sceneIndex: number) => void;
}

export function SceneTimeline({ 
  scenes, 
  sceneOrder, 
  audioDuration = 0,
  audioUrl,
  lyrics,
  subtitleFileUrl,
  finalVideoUrl,
  isEditMode = false,
  onReorder,
  onSceneClick,
  onToggleLipsync
}: SceneTimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [assSubtitles, setAssSubtitles] = useState<{ start: number; end: number; text: string }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const hasVideoPreview = isEditMode && !!finalVideoUrl;
  
  useEffect(() => {
    if (!subtitleFileUrl) return;
    
    const fetchSubtitles = async () => {
      try {
        const response = await fetch(subtitleFileUrl);
        const content = await response.text();
        
        // Match format: Dialogue: Marked=0,0:00:11.63,0:00:11.81,Default,,0000,0000,0000,,Text
        const dialogueRegex = /Dialogue:\s*(?:Marked=\d+,)?(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,,(.+)/g;
        const subtitles: { start: number; end: number; text: string }[] = [];
        
        let match;
        while ((match = dialogueRegex.exec(content)) !== null) {
          const startH = parseInt(match[1], 10);
          const startM = parseInt(match[2], 10);
          const startS = parseInt(match[3], 10);
          const startCs = parseInt(match[4], 10);
          const endH = parseInt(match[5], 10);
          const endM = parseInt(match[6], 10);
          const endS = parseInt(match[7], 10);
          const endCs = parseInt(match[8], 10);
          const text = match[9].replace(/\\N/g, ' ').replace(/\{[^}]*\}/g, '').trim();
          
          const start = startH * 3600 + startM * 60 + startS + startCs / 100;
          const end = endH * 3600 + endM * 60 + endS + endCs / 100;
          
          if (text) {
            subtitles.push({ start, end, text });
          }
        }
        
        subtitles.sort((a, b) => a.start - b.start);
        console.log('Parsed ASS subtitles:', subtitles.slice(0, 5));
        setAssSubtitles(subtitles);
      } catch (error) {
        console.error('Error fetching subtitle file:', error);
      }
    };
    
    fetchSubtitles();
  }, [subtitleFileUrl]);
  
  const sceneCount = scenes.length;
  const sceneDurationCalc = sceneCount > 0 ? audioDuration / sceneCount : 10;
  
  interface LyricSegment {
    start: number;
    end: number;
    text: string;
  }
  
  const lyricSegments = useMemo((): LyricSegment[] | null => {
    if (assSubtitles.length > 0) {
      return assSubtitles.map(sub => ({
        start: sub.start,
        end: sub.end,
        text: sub.text
      }));
    }
    
    if (!lyrics || audioDuration === 0) {
      return null;
    }
    
    const lines = lyrics.split('\n');
    const timestampRegex = /^\[(\d{1,2}):(\d{2})(?:[.:]\d{1,3})?\]\s*/;
    const sectionHeaderRegex = /^\[(?:Verse|Chorus|Bridge|Intro|Outro|Hook|Pre-Chorus|Post-Chorus).*\]$/i;
    const parsed: { time: number; text: string }[] = [];
    let hasRealTimestamps = false;
    
    for (const line of lines) {
      const match = line.match(timestampRegex);
      if (match) {
        hasRealTimestamps = true;
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const timeInSeconds = minutes * 60 + seconds;
        const lyricText = line.replace(timestampRegex, '').trim();
        if (lyricText) {
          parsed.push({ time: timeInSeconds, text: lyricText });
        }
      }
    }
    
    if (hasRealTimestamps && parsed.length > 0) {
      parsed.sort((a, b) => a.time - b.time);
      const segments: LyricSegment[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const start = parsed[i].time;
        const end = i < parsed.length - 1 ? parsed[i + 1].time : audioDuration;
        segments.push({ start, end, text: parsed[i].text });
      }
      return segments;
    }
    
    const plainLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !sectionHeaderRegex.test(trimmed);
    });
    
    if (plainLines.length === 0) {
      return null;
    }
    
    const segmentDuration = audioDuration / plainLines.length;
    const segments: LyricSegment[] = plainLines.map((text, index) => ({
      start: index * segmentDuration,
      end: (index + 1) * segmentDuration,
      text: text.trim()
    }));
    
    return segments;
  }, [lyrics, audioDuration, assSubtitles]);
  
  const hasTimestampedLyrics = lyricSegments !== null && lyricSegments.length > 0;

  const hasLyricsInTimeWindow = useCallback((startTime: number, endTime: number): boolean => {
    if (!lyricSegments || lyricSegments.length === 0) return false;
    return lyricSegments.some(segment => 
      segment.start < endTime && segment.end > startTime
    );
  }, [lyricSegments]);

  useEffect(() => {
    if (!audioUrl) return;
    
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    
    const fetchWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        if (cancelled) return;
        
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;
        
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (cancelled) {
          if (audioContext.state !== 'closed') {
            audioContext.close();
          }
          return;
        }
        
        const rawData = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(rawData.length / samples) || 1;
        const filteredData: number[] = [];
        
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            const idx = i * blockSize + j;
            if (idx < rawData.length) {
              sum += Math.abs(rawData[idx]);
            }
          }
          filteredData.push(sum / blockSize);
        }
        
        const maxAmplitude = Math.max(...filteredData);
        const normalizedData = filteredData.map(n => maxAmplitude > 0 ? n / maxAmplitude : 0.3);
        
        if (!cancelled) {
          setWaveformData(normalizedData);
        }
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error generating waveform:', error);
          const fallbackData = Array.from({ length: 200 }, () => Math.random() * 0.5 + 0.2);
          setWaveformData(fallbackData);
        }
      }
    };
    
    fetchWaveform();
    
    return () => {
      cancelled = true;
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [audioUrl]);
  
  const sceneDuration = sceneCount > 0 ? Math.ceil(audioDuration / sceneCount) : 10;
  
  const isLipsyncScene = (originalIndex: number): boolean => {
    const scene = scenes[originalIndex];
    if (scene?.lipsync !== undefined) {
      return scene.lipsync;
    }
    if (!audioDuration) return false;
    if (audioDuration <= 30) {
      return originalIndex === 1 || originalIndex === 2;
    }
    return originalIndex % 2 === 1;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDragStart = useCallback((e: React.DragEvent, orderPosition: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', orderPosition.toString());
    setDraggedIndex(orderPosition);
    
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, orderPosition: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedIndex !== null && draggedIndex !== orderPosition) {
      setDragOverIndex(orderPosition);
    }
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropPosition: number) => {
    e.preventDefault();
    
    const fromPosition = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromPosition === dropPosition || isNaN(fromPosition)) {
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...sceneOrder];
    const [movedScene] = newOrder.splice(fromPosition, 1);
    newOrder.splice(dropPosition, 0, movedScene);
    
    onReorder(newOrder);
    setDragOverIndex(null);
    setDraggedIndex(null);
  }, [sceneOrder, onReorder]);

  const togglePlayback = useCallback(() => {
    // If video preview is available, use video for playback
    if (hasVideoPreview && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
      return;
    }
    
    // Fall back to audio playback
    if (!audioRef.current && audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      });
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
    }
    
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [audioUrl, isPlaying, hasVideoPreview]);

  const handleSeek = useCallback((newTime: number) => {
    setCurrentTime(newTime);
    if (hasVideoPreview && videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, [hasVideoPreview]);
  
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const targetDuration = hasVideoPreview && videoDuration > 0 ? videoDuration : audioDuration;
    const newTime = clickPosition * targetDuration;
    handleSeek(newTime);
  }, [audioDuration, videoDuration, hasVideoPreview, handleSeek]);
  
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  const skipBackward = useCallback(() => {
    const newTime = Math.max(0, currentTime - 5);
    handleSeek(newTime);
  }, [currentTime, handleSeek]);
  
  const skipForward = useCallback(() => {
    const duration = hasVideoPreview && videoDuration > 0 ? videoDuration : audioDuration;
    const newTime = Math.min(duration, currentTime + 5);
    handleSeek(newTime);
  }, [currentTime, audioDuration, videoDuration, hasVideoPreview, handleSeek]);

  // Stop audio playback when video preview becomes available
  useEffect(() => {
    if (hasVideoPreview && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, [hasVideoPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, []);

  const playheadPosition = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  if (scenes.length === 0) {
    return null;
  }

  return (
    <div className="mb-8" data-testid="scene-timeline">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" />
          <h4 className="text-lg font-semibold">Timeline</h4>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>{formatDuration(audioDuration)}</span>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        Drag and drop scenes to reorder them in your video
      </p>

      {/* Video Preview Section - Only shown in edit mode when finalVideoUrl exists */}
      {hasVideoPreview && finalVideoUrl && (
        <div className="mb-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700 shadow-lg" data-testid="video-preview-section">
          <div className="flex items-center gap-2 mb-3">
            <Video className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-slate-300">Video Preview</span>
            <span className="text-xs text-slate-500">(Original video)</span>
          </div>
          
          {/* Video Player */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-3">
            <video
              ref={videoRef}
              src={finalVideoUrl}
              className="w-full h-full object-contain"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlayback}
              muted={isMuted}
              playsInline
              data-testid="video-preview-player"
            />
            
            {/* Play overlay when paused */}
            {!isPlaying && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity hover:bg-black/40"
                onClick={togglePlayback}
              >
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-8 h-8 text-white ml-1" />
                </div>
              </div>
            )}
          </div>
          
          {/* Video Controls */}
          <div className="flex flex-col gap-2">
            {/* Progress Bar */}
            <div 
              className="relative h-2 bg-slate-700 rounded-full cursor-pointer group"
              onClick={handleProgressClick}
              data-testid="video-progress-bar"
            >
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                style={{ width: `${(videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0)}%` }}
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${(videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0)}% - 6px)` }}
              />
            </div>
            
            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipBackward}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                  data-testid="skip-backward-button"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePlayback}
                  className="h-10 w-10 p-0 bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 hover:text-white rounded-full"
                  data-testid="video-play-pause-button"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipForward}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                  data-testid="skip-forward-button"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                  data-testid="mute-button"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              <div className="text-xs text-slate-400 font-mono">
                {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(videoDuration || audioDuration))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div 
        ref={timelineRef}
        className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700 shadow-lg"
        data-testid="timeline-track"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-t-xl opacity-60"></div>
        
        {/* Track labels on the left */}
        <div className="flex gap-2">
          {/* Labels column */}
          <div className="flex flex-col flex-shrink-0" style={{ width: '80px' }}>
            <div className="h-16 flex items-center">
              <div className="flex items-center gap-1">
                <Film className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">Scenes</span>
              </div>
            </div>
            <div className="h-8 mt-2 flex items-center">
              <div className="flex items-center gap-1">
                <Type className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] text-slate-400 font-medium">Lyrics</span>
              </div>
            </div>
            <div className="h-10 mt-2 flex items-center">
              <div className="flex items-center gap-1">
                {/* Hide audio play button when video preview is available - playback is controlled via video */}
                {!hasVideoPreview ? (
                  <button
                    onClick={togglePlayback}
                    disabled={!audioUrl}
                    className="p-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid="audio-play-button"
                  >
                    {isPlaying ? (
                      <Pause className="w-3 h-3 text-cyan-400" />
                    ) : (
                      <Play className="w-3 h-3 text-cyan-400" />
                    )}
                  </button>
                ) : (
                  <div className="p-1 rounded-full bg-slate-700/50">
                    <Music className="w-3 h-3 text-slate-500" />
                  </div>
                )}
                <span className="text-[10px] text-slate-400 font-medium">Audio</span>
              </div>
            </div>
          </div>
          
          {/* Scrollable tracks container */}
          <div 
            ref={waveformContainerRef}
            className="flex-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
            data-testid="timeline-tracks-scroll"
          >
            <div className="flex flex-col gap-2" style={{ width: 'max-content' }}>
              {/* Scene track */}
              <div className="flex items-center gap-0.5">
                <div className="w-1 h-16 bg-primary rounded-full flex-shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                
                {sceneOrder.map((originalIndex, orderPosition) => {
                  const scene = scenes[originalIndex];
                  if (!scene) return null;
                  
                  const isDragging = draggedIndex === orderPosition;
                  const isDragOver = dragOverIndex === orderPosition;
                  const isLipsync = isLipsyncScene(originalIndex);
                  const startTime = orderPosition * sceneDuration;
                  const endTime = Math.min((orderPosition + 1) * sceneDuration, audioDuration);
                  const hasLyrics = hasLyricsInTimeWindow(startTime, endTime);
                  const showLipsyncWarning = isLipsync && !hasLyrics && hasTimestampedLyrics;
                  
                  return (
                    <div
                      key={`scene-${originalIndex}-${orderPosition}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, orderPosition)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, orderPosition)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, orderPosition)}
                      onClick={() => onSceneClick?.(originalIndex)}
                      className={`
                        relative flex-shrink-0 cursor-grab active:cursor-grabbing
                        transition-all duration-200 ease-out
                        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
                        ${isDragOver ? 'scale-105' : ''}
                      `}
                      style={{ width: '100px' }}
                      data-testid={`timeline-scene-${orderPosition + 1}`}
                    >
                      {isDragOver && (
                        <div className="absolute -left-1 top-0 bottom-0 w-1 bg-primary rounded-full z-10 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]"></div>
                      )}
                      
                      <div className={`
                        relative group rounded-lg overflow-hidden border-2 transition-all duration-200
                        ${isDragOver 
                          ? 'border-primary shadow-[0_0_20px_rgba(168,85,247,0.4)]' 
                          : 'border-slate-600 hover:border-slate-500'}
                        ${isLipsync ? 'ring-2 ring-pink-500/30' : ''}
                      `}>
                        <div className="absolute top-1 left-1 z-20 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-white/70 drop-shadow-lg hover:text-white transition-colors" />
                        </div>
                        
                        <div className="absolute top-1 right-1 z-20 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {orderPosition + 1}
                        </div>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="absolute top-1 left-6 z-20 p-0.5 rounded hover:bg-black/30 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleLipsync?.(originalIndex);
                                }}
                                data-testid={`timeline-lipsync-toggle-${orderPosition + 1}`}
                              >
                                <Mic className={`w-3 h-3 drop-shadow-lg ${isLipsync ? 'text-pink-400' : 'text-gray-400'}`} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p>{isLipsync ? 'Lipsync enabled - click to disable' : 'Lipsync disabled - click to enable'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        {showLipsyncWarning && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div 
                                  className="absolute bottom-6 left-1 z-20 p-0.5 rounded bg-amber-500/80 animate-pulse"
                                  data-testid={`timeline-lipsync-warning-${orderPosition + 1}`}
                                >
                                  <AlertTriangle className="w-3 h-3 text-white drop-shadow-lg" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs max-w-[200px] bg-amber-900 border-amber-700">
                                <p>Lipsync enabled but no lyrics in this section. Consider disabling lipsync for this scene.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        <div className="w-full h-16 bg-gradient-to-br from-slate-700 to-slate-800">
                          {scene.imageUrl ? (
                            <img 
                              src={scene.imageUrl}
                              alt={`Scene ${originalIndex + 1}`}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-6 h-6 text-slate-500" />
                            </div>
                          )}
                        </div>
                        
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                          <div className="text-[9px] text-white/80 font-mono tracking-wide">
                            {formatDuration(startTime)} - {formatDuration(endTime)}
                          </div>
                        </div>
                        
                        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors pointer-events-none"></div>
                      </div>
                    </div>
                  );
                })}
                
                <div className="w-1 h-16 bg-primary rounded-full flex-shrink-0 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
              </div>
              
              {/* Lyrics track - positioned by timestamp */}
              <TooltipProvider delayDuration={100}>
                <div 
                  className="relative h-8 bg-slate-800/30 rounded-lg"
                  style={{ width: `${sceneCount * 100 + 4}px` }}
                  data-testid="lyrics-track"
                >
                  {hasTimestampedLyrics && lyricSegments ? (
                    lyricSegments.map((segment, index) => {
                      const leftPercent = (segment.start / audioDuration) * 100;
                      const duration = segment.end - segment.start;
                      const widthPercent = Math.max((duration / audioDuration) * 100, 3);
                      
                      return (
                        <Tooltip key={`lyrics-${index}`}>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-0 bottom-0 rounded cursor-pointer transition-all duration-200 hover:scale-y-110 bg-gradient-to-r from-amber-500/40 to-amber-600/40 border border-amber-500/50 hover:border-amber-400/70"
                              style={{ 
                                left: `${leftPercent}%`, 
                                width: `${widthPercent}%`,
                                minWidth: '20px'
                              }}
                              data-testid={`lyrics-block-${index + 1}`}
                            >
                              <div className="flex items-center justify-center h-full overflow-hidden px-0.5">
                                <Type className="w-3 h-3 text-amber-400/80 flex-shrink-0" />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent 
                            side="top" 
                            className="max-w-[250px] bg-slate-900 border-slate-700 text-slate-200"
                          >
                            <div className="text-xs leading-relaxed">
                              <span className="text-amber-400 font-mono text-[10px]">{formatDuration(Math.floor(segment.start))}</span>
                              <span className="mx-1.5 text-slate-500">|</span>
                              {segment.text}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                      No timestamped lyrics
                    </div>
                  )}
                </div>
              </TooltipProvider>
              
              {/* Waveform track - same container, scrolls together */}
              <div 
                className="relative h-10 bg-slate-800/50 rounded-lg flex items-center overflow-hidden"
                style={{ width: `${sceneCount * 100 + 4}px` }}
                data-testid="audio-waveform"
              >
                {waveformData.length > 0 ? (
                  <div className="w-full h-full flex items-center gap-[1px] px-1 py-1">
                    {waveformData.map((amplitude, index) => (
                      <div
                        key={index}
                        className="flex-1 bg-gradient-to-t from-cyan-500/60 to-cyan-400/80 rounded-sm"
                        style={{
                          height: `${Math.max(amplitude * 100, 10)}%`,
                          minWidth: '2px',
                        }}
                      />
                    ))}
                  </div>
                ) : audioUrl ? (
                  <div className="flex items-center justify-center w-full gap-2 text-slate-500">
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Loading waveform...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full">
                    <span className="text-xs text-slate-500">No audio available</span>
                  </div>
                )}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-gradient-to-r from-slate-900/20 via-transparent to-slate-900/20 rounded-lg" />
                
                {/* Playhead indicator */}
                {isPlaying && (
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10 transition-none"
                    style={{ left: `${playheadPosition}%` }}
                    data-testid="audio-playhead"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex mt-3">
          <div className="w-20 flex-shrink-0"></div>
          <div 
            className="flex justify-between text-[10px] text-slate-400 font-mono"
            style={{ width: `${sceneCount * 100 + 4}px` }}
          >
            <span>0:00</span>
            <span>{formatDuration(Math.floor(audioDuration / 2))}</span>
            <span>{formatDuration(audioDuration)}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_6px_rgba(168,85,247,0.5)]"></div>
          <span>Playhead</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Mic className="w-3 h-3 text-pink-400" />
          <span>Lipsync scene</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GripVertical className="w-3 h-3 text-slate-400" />
          <span>Drag to reorder</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Music className="w-3 h-3 text-cyan-400" />
          <span>Audio waveform</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Type className="w-3 h-3 text-amber-400" />
          <span>Lyrics (hover to view)</span>
        </div>
      </div>
    </div>
  );
}
