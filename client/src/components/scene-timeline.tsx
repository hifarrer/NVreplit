import { useState, useRef, useCallback } from "react";
import { SceneData } from "@/lib/types";
import { Film, GripVertical, Clock, Mic } from "lucide-react";

interface SceneTimelineProps {
  scenes: SceneData[];
  sceneOrder: number[];
  audioDuration?: number;
  onReorder: (newOrder: number[]) => void;
  onSceneClick?: (sceneIndex: number) => void;
}

export function SceneTimeline({ 
  scenes, 
  sceneOrder, 
  audioDuration = 0,
  onReorder,
  onSceneClick 
}: SceneTimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const sceneCount = scenes.length;
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
        
        <div className="flex items-center gap-0.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
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
                style={{ minWidth: '100px', maxWidth: '140px' }}
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
        
        <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-mono px-1">
          <span>0:00</span>
          <span>{formatDuration(Math.floor(audioDuration / 2))}</span>
          <span>{formatDuration(audioDuration)}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
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
      </div>
    </div>
  );
}
