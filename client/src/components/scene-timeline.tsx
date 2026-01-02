import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { SceneData } from "@/lib/types";
import { Film, GripVertical, Clock, Mic, Music, Type, Play, Pause } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SceneTimelineProps {
  scenes: SceneData[];
  sceneOrder: number[];
  audioDuration?: number;
  audioUrl?: string;
  lyrics?: string;
  onReorder: (newOrder: number[]) => void;
  onSceneClick?: (sceneIndex: number) => void;
}

export function SceneTimeline({ 
  scenes, 
  sceneOrder, 
  audioDuration = 0,
  audioUrl,
  lyrics,
  onReorder,
  onSceneClick 
}: SceneTimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const sceneCount = scenes.length;
  const sceneDurationCalc = sceneCount > 0 ? audioDuration / sceneCount : 10;
  
  const sceneLyrics = useMemo(() => {
    if (!lyrics || sceneCount === 0) {
      return Array(sceneCount).fill(null);
    }
    
    const lines = lyrics.split('\n').filter(line => line.trim() && !line.trim().startsWith('['));
    if (lines.length === 0) {
      return Array(sceneCount).fill(null);
    }
    
    const linesPerScene = Math.max(1, Math.ceil(lines.length / sceneCount));
    const result: (string | null)[] = [];
    
    for (let i = 0; i < sceneCount; i++) {
      const start = i * linesPerScene;
      const end = Math.min(start + linesPerScene, lines.length);
      const sceneLines = lines.slice(start, end);
      result.push(sceneLines.length > 0 ? sceneLines.join('\n') : null);
    }
    
    return result;
  }, [lyrics, sceneCount]);

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
          audioContext.close();
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
        audioContext.close();
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
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioUrl]);
  
  const sceneDuration = sceneCount > 0 ? Math.ceil(audioDuration / sceneCount) : 10;
  
  const isLipsyncScene = (originalIndex: number): boolean => {
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
  }, [audioUrl, isPlaying]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
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
                        
                        {isLipsync && (
                          <div className="absolute top-1 left-6 z-20">
                            <Mic className="w-3 h-3 text-pink-400 drop-shadow-lg" />
                          </div>
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
              
              {/* Lyrics track - same container, scrolls together */}
              <TooltipProvider delayDuration={100}>
                <div 
                  className="flex items-center gap-0.5"
                  style={{ width: `${sceneCount * 100 + 4}px` }}
                  data-testid="lyrics-track"
                >
                  <div className="w-1 h-8 bg-amber-500/50 rounded-full flex-shrink-0"></div>
                  
                  {sceneOrder.map((originalIndex, orderPosition) => {
                    const lyricsForScene = sceneLyrics[orderPosition];
                    const hasLyrics = lyricsForScene !== null && lyricsForScene.trim() !== '';
                    
                    return (
                      <Tooltip key={`lyrics-${orderPosition}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={`
                              h-8 flex-shrink-0 rounded cursor-pointer
                              transition-all duration-200 hover:scale-[1.02]
                              ${hasLyrics 
                                ? 'bg-gradient-to-r from-amber-500/30 to-amber-600/30 border border-amber-500/40 hover:border-amber-400/60' 
                                : 'bg-slate-700/30 border border-slate-600/30 hover:border-slate-500/50'}
                            `}
                            style={{ width: '100px' }}
                            data-testid={`lyrics-block-${orderPosition + 1}`}
                          >
                            <div className="flex items-center justify-center h-full px-1">
                              {hasLyrics ? (
                                <Type className="w-3 h-3 text-amber-400/70" />
                              ) : (
                                <span className="text-[8px] text-slate-500">—</span>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="top" 
                          className="max-w-[250px] bg-slate-900 border-slate-700 text-slate-200"
                        >
                          {hasLyrics ? (
                            <div className="text-xs whitespace-pre-line leading-relaxed">
                              {lyricsForScene}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic">
                              no lyrics
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  
                  <div className="w-1 h-8 bg-amber-500/50 rounded-full flex-shrink-0"></div>
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
