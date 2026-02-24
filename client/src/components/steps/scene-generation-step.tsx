import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SceneData } from "@/lib/types";
import { RotateCcw, RefreshCw, Mic, Upload, Loader2, AlertTriangle, Pencil, Zap, Camera, X } from "lucide-react";
import { CameraAngleModal } from "@/components/modals/camera-angle-modal";
import { SceneTimeline } from "@/components/scene-timeline";
import { StepCircles } from "@/components/ui/step-circles";

type VideoQuality = "quick" | "medium" | "premium";

interface SceneGenerationStepProps {
  projectId: string;
  audioDuration?: number;
  audioUrl?: string;
  audioLyrics?: string;
  textOverlay?: string; // Text overlay for instrumental videos
  subtitleFileUrl?: string;
  characterImageUrl?: string;
  scenes?: SceneData[];
  sceneOrder?: number[];
  initialVideoQuality?: VideoQuality;
  isEditMode?: boolean;
  finalVideoUrl?: string;
  aspectRatio?: string;
  isInstrumental?: boolean; // Whether this is an instrumental video (no lipsync)
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

// Helper for logging with timestamps
const logSceneGeneration = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logPrefix = `[SCENE-GEN ${timestamp}]`;
  if (data) {
    console.log(`${logPrefix} ${message}`, data);
  } else {
    console.log(`${logPrefix} ${message}`);
  }
};

// Module-level lock to persist across component remounts (React Strict Mode, navigation, etc.)
// This ensures only ONE scene generation can run per project, regardless of component lifecycle
const projectGenerationLocks = new Map<string, { inProgress: boolean; startTime: number }>();

const getProjectLock = (projectId: string) => {
  if (!projectGenerationLocks.has(projectId)) {
    projectGenerationLocks.set(projectId, { inProgress: false, startTime: 0 });
  }
  return projectGenerationLocks.get(projectId)!;
};

const setProjectLockInProgress = (projectId: string, inProgress: boolean) => {
  const lock = getProjectLock(projectId);
  lock.inProgress = inProgress;
  lock.startTime = inProgress ? Date.now() : 0;
  logSceneGeneration(`Module-level lock updated`, { projectId, inProgress, startTime: lock.startTime });
};

const isProjectLockInProgress = (projectId: string): boolean => {
  const lock = getProjectLock(projectId);
  // Consider lock stale after 10 minutes (in case of abandoned requests)
  const STALE_THRESHOLD_MS = 10 * 60 * 1000;
  if (lock.inProgress && lock.startTime > 0) {
    const elapsed = Date.now() - lock.startTime;
    if (elapsed > STALE_THRESHOLD_MS) {
      logSceneGeneration(`Module-level lock is stale, resetting`, { projectId, elapsed });
      lock.inProgress = false;
      lock.startTime = 0;
      return false;
    }
  }
  return lock.inProgress;
};

export function SceneGenerationStep({ projectId, audioDuration, audioUrl, audioLyrics, textOverlay, subtitleFileUrl, characterImageUrl, scenes = [], sceneOrder: initialSceneOrder, initialVideoQuality = "quick", isEditMode = false, finalVideoUrl, aspectRatio = "16:9", isInstrumental = false, onNext, onBack, onReset }: SceneGenerationStepProps) {
  // Defensively copy scenes array to avoid mutating the original project data
  const [generatedScenes, setGeneratedScenes] = useState<SceneData[]>(() => 
    scenes.map(scene => ({ ...scene }))
  );
  // Store original scene image URLs to track modifications in edit mode
  const originalSceneImagesRef = useRef<string[]>(
    scenes.map(scene => scene.imageUrl)
  );
  // Scene order tracking - defaults to sequential order if not provided
  const [sceneOrder, setSceneOrder] = useState<number[]>(() => 
    initialSceneOrder && initialSceneOrder.length > 0 
      ? initialSceneOrder 
      : scenes.map((_, index) => index)
  );
  // Video quality is always "quick" (seedance-v1.5-pro/image-to-video-fast)
  const videoQuality: VideoQuality = "quick";
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  
  // Sync ref with state
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const [uploadingScenes, setUploadingScenes] = useState<number[]>([]);
  const [regeneratingVideoScenes, setRegeneratingVideoScenes] = useState<number[]>([]);
  const [regeneratedVideoScenes, setRegeneratedVideoScenes] = useState<Set<number>>(new Set());
  const [cameraAngleScenes, setCameraAngleScenes] = useState<number[]>([]);
  const [cameraAngleModalOpen, setCameraAngleModalOpen] = useState(false);
  const [cameraAngleSceneIndex, setCameraAngleSceneIndex] = useState<number | null>(null);
  // Preview modal: show image or video larger when user clicks thumbnail
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"image" | "video">("image");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSceneIndex, setPreviewSceneIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const getDefaultLipsync = useCallback((index: number): boolean => {
    if (!audioDuration) return false;
    if (audioDuration <= 30) {
      return index === 1 || index === 2;
    }
    return index % 2 === 1;
  }, [audioDuration]);
  
  // Compute which scenes have been modified (image or lipsync changed).
  // In edit mode: compare to loaded project (ref + scenes). In create mode: only lipsync toggles count as modified
  // (no image comparison, since ref can be stale when scenes load after mount and would mark all as modified).
  const modifiedSceneIndices = useMemo(() => {
    if (!isEditMode) {
      // Create/first-time: only modified if user explicitly toggled lipsync away from default
      return generatedScenes
        .map((scene, index) => {
          const lipsyncToggled = scene.lipsync !== undefined && scene.lipsync !== getDefaultLipsync(index);
          return lipsyncToggled ? index : -1;
        })
        .filter(index => index !== -1);
    }
    // Edit mode: image or lipsync changed vs original
    return generatedScenes
      .map((scene, index) => {
        const originalImageUrl = originalSceneImagesRef.current[index];
        const imageChanged = scene.imageUrl !== originalImageUrl;
        const originalLipsync = scenes[index]?.lipsync !== undefined ? scenes[index].lipsync! : getDefaultLipsync(index);
        const currentLipsync = scene.lipsync !== undefined ? scene.lipsync : getDefaultLipsync(index);
        const lipsyncChanged = originalLipsync !== currentLipsync;
        return imageChanged || lipsyncChanged ? index : -1;
      })
      .filter(index => index !== -1);
  }, [generatedScenes, scenes, isEditMode, getDefaultLipsync]);
  
  // Check if a scene needs video regeneration (image was modified but video wasn't regenerated)
  const needsVideoRegeneration = useCallback((index: number): boolean => {
    if (!isEditMode) return false;
    // If image was modified (in modifiedSceneIndices) but videoUrl doesn't exist, it needs regeneration
    return modifiedSceneIndices.includes(index) && !generatedScenes[index]?.videoUrl;
  }, [isEditMode, modifiedSceneIndices, generatedScenes]);
  
  // Check if project has existing video segments (meaning partial regeneration is possible)
  const hasExistingVideoSegments = useMemo(() => {
    return isEditMode && scenes.length > 0;
  }, [isEditMode, scenes.length]);
  
  // Refs to prevent duplicate API calls - using multiple guards for safety
  const hasGeneratedRef = useRef(false);
  const apiCallInProgressRef = useRef(false);
  const generationStartTimeRef = useRef<number | null>(null);
  
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  
  // Log component mount/unmount for debugging
  useEffect(() => {
    logSceneGeneration(`Component mounted`, { 
      projectId, 
      existingScenes: scenes.length,
      isEditMode,
      hasGeneratedRef: hasGeneratedRef.current,
      apiCallInProgressRef: apiCallInProgressRef.current
    });
    
    return () => {
      logSceneGeneration(`Component unmounting`, { 
        projectId,
        hasGeneratedRef: hasGeneratedRef.current,
        apiCallInProgressRef: apiCallInProgressRef.current
      });
    };
  }, []);

  const isLipsyncScene = (index: number): boolean => {
    // Instrumental videos never use lipsync
    if (isInstrumental) {
      return false;
    }
    const scene = generatedScenes[index];
    if (scene?.lipsync !== undefined) {
      return scene.lipsync;
    }
    return getDefaultLipsync(index);
  };

  const toggleLipsync = (index: number) => {
    // Don't allow toggling lipsync for instrumental videos
    if (isInstrumental) {
      return;
    }
    setGeneratedScenes(prev => 
      prev.map((scene, i) => {
        if (i === index) {
          const currentLipsync = scene.lipsync !== undefined ? scene.lipsync : getDefaultLipsync(i);
          return { ...scene, lipsync: !currentLipsync };
        }
        return scene;
      })
    );
  };

  const lyricSegments = useMemo(() => {
    if (!audioLyrics || !audioDuration) return null;
    
    const lines = audioLyrics.split('\n');
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
      return parsed.map((item, i) => ({
        start: item.time,
        end: i < parsed.length - 1 ? parsed[i + 1].time : audioDuration,
        text: item.text
      }));
    }
    
    const plainLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !sectionHeaderRegex.test(trimmed);
    });
    
    if (plainLines.length === 0) return null;
    
    const segmentDuration = audioDuration / plainLines.length;
    return plainLines.map((text, index) => ({
      start: index * segmentDuration,
      end: (index + 1) * segmentDuration,
      text: text.trim()
    }));
  }, [audioLyrics, audioDuration]);

  const hasLyricsForScene = useCallback((sceneIndex: number): boolean => {
    if (!lyricSegments || lyricSegments.length === 0 || !audioDuration) return false;
    
    const orderPosition = sceneOrder.indexOf(sceneIndex);
    if (orderPosition === -1) return false;
    
    const sceneCount = generatedScenes.length;
    const sceneDuration = audioDuration / sceneCount;
    const startTime = orderPosition * sceneDuration;
    const endTime = Math.min((orderPosition + 1) * sceneDuration, audioDuration);
    
    return lyricSegments.some(segment => 
      segment.start < endTime && segment.end > startTime
    );
  }, [lyricSegments, audioDuration, sceneOrder, generatedScenes.length]);

  const showLipsyncWarning = (index: number): boolean => {
    if (!lyricSegments || lyricSegments.length === 0) return false;
    return isLipsyncScene(index) && !hasLyricsForScene(index);
  };

  // Dedicated loading state tied to the ref for accurate UI feedback
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Ref to track progress simulation interval
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isGeneratingRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Start progress simulation as soon as the progress UI is shown
  useEffect(() => {
    // Only start if we're showing the progress UI (no scenes and not in edit mode)
    const shouldShowProgress = generatedScenes.length === 0 && !isEditMode;
    
    if (shouldShowProgress && !isGenerating) {
      // Start with a small initial progress to show activity
      setProgress(5);
      progressRef.current = 5;
      
      // Clear any existing interval first
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Start a gradual progress simulation that runs until isGenerating becomes true
      let currentProgress = 5;
      progressIntervalRef.current = setInterval(() => {
        // Check the ref value to get the current state (not the closure value)
        if (!isGeneratingRef.current && currentProgress < 20) {
          currentProgress = Math.min(20, currentProgress + 1);
          setProgress(currentProgress);
          progressRef.current = currentProgress;
        } else {
          // Stop if we've reached the limit or generation has started
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
        }
      }, 500); // Update every 500ms for smooth animation
      
      // Cleanup on unmount or when dependencies change
      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      };
    } else {
      // Clean up interval if we shouldn't show progress
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  }, [generatedScenes.length, isEditMode, isGenerating]);

  const generateScenesMutation = useMutation({
    mutationFn: async () => {
      // Locks are already set by triggerSceneGeneration - just log and proceed
      logSceneGeneration(`Starting scene generation API call`, {
        projectId,
        startTime: generationStartTimeRef.current
      });

      // Clear the initial progress simulation interval if it's still running
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Start fake progress in parallel with API call (don't wait for it)
      const progressSimulation = (async () => {
        // Start from current progress (should be around 20% from the initial simulation)
        // Use ref to get the current value, not the closure value
        const startProgress = progressRef.current;
        const progressSteps = [Math.max(25, startProgress + 5), 50, 75];
        for (let i = 0; i < progressSteps.length; i++) {
          // Only update progress if API call is still in progress
          if (apiCallInProgressRef.current) {
            const newProgress = progressSteps[i];
            setProgress(newProgress);
            progressRef.current = newProgress;
          }
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      })();

      try {
        logSceneGeneration(`Making POST request to /api/projects/${projectId}/generate-scenes`);
        const response = await apiRequest("POST", `/api/projects/${projectId}/generate-scenes`, {});
        const data = await response.json();
        
        // Wait for progress simulation to complete for better UX
        await progressSimulation;
        setProgress(100);
        progressRef.current = 100;
        
        logSceneGeneration(`API call completed successfully`, {
          projectId,
          duration: Date.now() - (generationStartTimeRef.current || 0),
          sceneCount: data.scenePrompts?.length
        });
        
        return data;
      } catch (error) {
        logSceneGeneration(`API call failed`, {
          projectId,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - (generationStartTimeRef.current || 0)
        });
        throw error;
      }
    },
    onSuccess: (data) => {
      // Release all locks (both module-level and component-local)
      setProjectLockInProgress(projectId, false);  // Module-level lock
      apiCallInProgressRef.current = false;
      // Keep hasGeneratedRef.current = true to prevent auto-trigger from useEffect
      // This only blocks the useEffect auto-trigger, not manual regeneration
      setIsGenerating(false);
      logSceneGeneration(`onSuccess handler called`, { 
        projectId,
        sceneCount: data.scenePrompts?.length,
        alreadyGenerated: data.alreadyGenerated
      });
      
      const sceneData: SceneData[] = data.scenePrompts.map((prompt: string, index: number) => ({
        prompt,
        imageUrl: data.sceneImages[index]
      }));
      setGeneratedScenes(sceneData);
      // Set default scene order when new scenes are generated
      setSceneOrder(sceneData.map((_, index) => index));
      
      // Only show toast if this was a new generation (not returning existing)
      if (!data.alreadyGenerated) {
        toast({
          title: "Success",
          description: "Scenes generated successfully!",
        });
      }
    },
    onError: (error) => {
      // Check if this is a 409 Conflict (duplicate request blocked by backend)
      const is409Conflict = error instanceof Error && 
        (error.message.includes('409') || error.message.includes('already in progress'));
      
      logSceneGeneration(`onError handler called`, { 
        projectId,
        error: error instanceof Error ? error.message : String(error),
        is409Conflict
      });
      
      if (is409Conflict) {
        // 409 means another request IS in progress - DO NOT release locks
        // The original request will complete and release locks
        logSceneGeneration(`409 Conflict detected - keeping locks active, original request will complete`);
        return;
      }
      
      // For all other errors, release locks
      setProjectLockInProgress(projectId, false);  // Module-level lock
      apiCallInProgressRef.current = false;
      setIsGenerating(false);
      
      setProgress(0);
      progressRef.current = 0;
      toast({
        title: "Error",
        description: "Failed to generate scenes",
        variant: "destructive",
      });
    }
  });

  // Safe wrapper to trigger scene generation with all guards
  const triggerSceneGeneration = useCallback(() => {
    // CRITICAL: Check module-level lock FIRST (persists across component remounts)
    if (isProjectLockInProgress(projectId)) {
      logSceneGeneration(`BLOCKED by triggerSceneGeneration: Module-level lock is active for project`, { projectId });
      return;
    }
    
    // Multiple component-local guards for additional safety
    if (hasGeneratedRef.current) {
      logSceneGeneration(`BLOCKED by triggerSceneGeneration: hasGeneratedRef is true`);
      return;
    }
    
    if (apiCallInProgressRef.current) {
      logSceneGeneration(`BLOCKED by triggerSceneGeneration: apiCallInProgressRef is true`);
      return;
    }
    
    if (generateScenesMutation.isPending) {
      logSceneGeneration(`BLOCKED by triggerSceneGeneration: mutation is already pending`);
      return;
    }
    
    // Set all locks BEFORE calling mutate (both module-level and component-local)
    logSceneGeneration(`triggerSceneGeneration: Setting all locks and calling mutate`, { projectId });
    setProjectLockInProgress(projectId, true);  // Module-level lock
    hasGeneratedRef.current = true;
    apiCallInProgressRef.current = true;
    generationStartTimeRef.current = Date.now();
    
    // Ensure progress is at least 20% when we start generating (for smooth transition)
    if (progressRef.current < 20) {
      setProgress(20);
      progressRef.current = 20;
    }
    
    setIsGenerating(true);
    
    generateScenesMutation.mutate();
  }, [projectId, generateScenesMutation]);

  useEffect(() => {
    // Only auto-generate scenes if:
    // 1. No scenes exist in the project (scenes prop)
    // 2. Not in edit mode
    // 3. Haven't already triggered generation (prevents React Strict Mode double-call and duplicate triggers)
    // This prevents re-generating scenes that already exist when component remounts
    
    logSceneGeneration(`Auto-generation useEffect triggered`, {
      projectId,
      moduleLevelLock: isProjectLockInProgress(projectId),
      hasGeneratedRef: hasGeneratedRef.current,
      apiCallInProgressRef: apiCallInProgressRef.current,
      isGenerating,
      existingScenes: scenes.length,
      isEditMode
    });
    
    // All guards are inside triggerSceneGeneration - just check basic conditions here
    const hasExistingScenes = scenes.length > 0;
    if (!hasExistingScenes && !isEditMode) {
      logSceneGeneration(`Conditions met, calling triggerSceneGeneration`, { projectId });
      triggerSceneGeneration();
    } else {
      logSceneGeneration(`SKIPPED: conditions not met`, {
        hasExistingScenes,
        isEditMode
      });
    }
  }, [isEditMode, scenes.length, triggerSceneGeneration]);
  
  // Sync with scenes prop when it changes (e.g., when project data loads in edit mode)
  useEffect(() => {
    if (scenes.length > 0 && generatedScenes.length === 0) {
      setGeneratedScenes(scenes.map(scene => ({ ...scene })));
      // Initialize regeneratedVideoScenes with scenes that already have videoUrls
      const existingVideoIndices = new Set<number>();
      scenes.forEach((scene, index) => {
        if (scene.videoUrl) {
          existingVideoIndices.add(index);
        }
      });
      setRegeneratedVideoScenes(existingVideoIndices);
    }
  }, [scenes]);
  
  // Sync scene order when it arrives asynchronously from the project
  useEffect(() => {
    if (initialSceneOrder && initialSceneOrder.length > 0) {
      // Use the saved scene order from the project
      setSceneOrder(initialSceneOrder);
    } else if (scenes.length > 0 && sceneOrder.length === 0) {
      // Default to sequential order if no saved order but scenes exist
      setSceneOrder(scenes.map((_, index) => index));
    }
  }, [initialSceneOrder, scenes.length]);

  const regenerateSceneMutation = useMutation({
    mutationFn: async ({ sceneIndex, prompt }: { sceneIndex: number; prompt: string }) => {
      // For regular videos (not lipsync), only send character image to avoid confusing the AI.
      // For lipsync scenes we still send current scene image for edit-plus behavior.
      const useCurrentSceneImage = isLipsyncScene(sceneIndex);
      const currentScene = generatedScenes[sceneIndex];
      const currentSceneImageUrl = useCurrentSceneImage ? currentScene?.imageUrl : undefined;
      
      // In edit mode, generate scene locally without saving to original project
      if (isEditMode) {
        // Call a standalone scene generation endpoint that doesn't update the project
        // Only include characterImageUrl if it exists (for instrumental videos, it may be undefined)
        const requestBody: any = {
          prompt,
          aspectRatio,
          ...(currentSceneImageUrl && { currentSceneImageUrl })
        };
        
        // Only include characterImageUrl if it's provided (not for instrumental videos)
        if (characterImageUrl) {
          requestBody.characterImageUrl = characterImageUrl;
        }
        
        const response = await apiRequest("POST", `/api/generate-single-scene`, requestBody);
        return response.json();
      }
      
      // Normal mode: use the regular regenerate-scene endpoint that updates the project
      // Tell backend to only use current scene image for lipsync scenes (regular = character image only)
      const response = await apiRequest("POST", `/api/projects/${projectId}/regenerate-scene`, {
        sceneIndex,
        prompt,
        lipsyncScene: useCurrentSceneImage
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { sceneIndex } = variables;
      setGeneratedScenes(prev => 
        prev.map((scene, index) => 
          index === sceneIndex 
            ? { ...scene, imageUrl: data.imageUrl, videoUrl: undefined } // Clear video URL when image is regenerated
            : scene
        )
      );
      setRegeneratingScenes(prev => prev.filter(i => i !== sceneIndex));
      // Clear regenerated video flag when image is regenerated
      setRegeneratedVideoScenes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
      toast({
        title: "Success",
        description: isEditMode 
          ? `Scene ${sceneIndex + 1} regenerated! Changes will be saved when you click 'Re-generate Music Video'.`
          : `Scene ${sceneIndex + 1} regenerated successfully!`,
      });
    },
    onError: (error, variables) => {
      const { sceneIndex } = variables;
      setRegeneratingScenes(prev => prev.filter(i => i !== sceneIndex));
      toast({
        title: "Error",
        description: "Failed to regenerate scene",
        variant: "destructive",
      });
    }
  });

  const regenerateScene = (index: number, prompt: string) => {
    setRegeneratingScenes(prev => [...prev, index]);
    regenerateSceneMutation.mutate({ sceneIndex: index, prompt });
  };

  // Upload scene image mutation
  const uploadSceneImageMutation = useMutation({
    mutationFn: async ({ sceneIndex, file }: { sceneIndex: number; file: File }) => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('sceneIndex', sceneIndex.toString());
      // In edit mode we use standalone endpoint which has no project context — send aspect ratio so crop matches video
      if (isEditMode) {
        formData.append('aspectRatio', aspectRatio);
      }

      // Use different endpoints based on mode
      const endpoint = isEditMode 
        ? '/api/upload-scene-image'
        : `/api/projects/${projectId}/upload-scene-image`;

      // Use apiRequest to include auth headers automatically
      const response = await apiRequest('POST', endpoint, formData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload image');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      const { sceneIndex } = variables;
      setGeneratedScenes(prev => 
        prev.map((scene, index) => 
          index === sceneIndex 
            ? { ...scene, imageUrl: data.imageUrl, videoUrl: undefined } // Clear video URL when image is uploaded
            : scene
        )
      );
      setUploadingScenes(prev => prev.filter(i => i !== sceneIndex));
      // Clear regenerated video flag when image is uploaded
      setRegeneratedVideoScenes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
      toast({
        title: "Success",
        description: isEditMode 
          ? `Scene ${sceneIndex + 1} image uploaded! Changes will be saved when you click 'Re-generate Music Video'.`
          : `Scene ${sceneIndex + 1} image uploaded successfully!`,
      });
    },
    onError: (error, variables) => {
      const { sceneIndex } = variables;
      setUploadingScenes(prev => prev.filter(i => i !== sceneIndex));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload scene image",
        variant: "destructive",
      });
    }
  });

  // Camera angle change mutation
  const cameraAngleMutation = useMutation({
    mutationFn: async ({ sceneIndex, horizontalAngle, verticalAngle, distance }: { 
      sceneIndex: number; 
      horizontalAngle: number; 
      verticalAngle: number; 
      distance: number;
    }) => {
      const scene = generatedScenes[sceneIndex];
      if (!scene?.imageUrl) {
        throw new Error("No image URL available for this scene");
      }
      
      const response = await apiRequest("POST", `/api/change-camera-angle`, {
        imageUrl: scene.imageUrl,
        horizontalAngle,
        verticalAngle,
        distance
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { sceneIndex } = variables;
      setGeneratedScenes(prev => 
        prev.map((scene, index) => 
          index === sceneIndex 
            ? { ...scene, imageUrl: data.imageUrl, videoUrl: undefined } // Clear video URL when camera angle is changed
            : scene
        )
      );
      setCameraAngleScenes(prev => prev.filter(i => i !== sceneIndex));
      setCameraAngleModalOpen(false);
      setCameraAngleSceneIndex(null);
      // Clear regenerated video flag when camera angle is changed
      setRegeneratedVideoScenes(prev => {
        const newSet = new Set(prev);
        newSet.delete(sceneIndex);
        return newSet;
      });
      toast({
        title: "Success",
        description: isEditMode 
          ? `Scene ${sceneIndex + 1} camera angle changed! Changes will be saved when you click 'Re-generate Music Video'.`
          : `Scene ${sceneIndex + 1} camera angle changed successfully!`,
      });
    },
    onError: (error, variables) => {
      const { sceneIndex } = variables;
      setCameraAngleScenes(prev => prev.filter(i => i !== sceneIndex));
      setCameraAngleModalOpen(false);
      setCameraAngleSceneIndex(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to change camera angle",
        variant: "destructive",
      });
    }
  });

  // Regenerate scene video mutation
  const regenerateSceneVideoMutation = useMutation({
    mutationFn: async ({ sceneIndex }: { sceneIndex: number }) => {
      const scene = generatedScenes[sceneIndex];
      if (!scene?.imageUrl) {
        throw new Error("No image URL available for this scene");
      }
      
      // Check if video has already been regenerated
      if (regeneratedVideoScenes.has(sceneIndex)) {
        throw new Error("Video for this scene has already been regenerated");
      }
      
      const response = await apiRequest("POST", `/api/projects/${projectId}/regenerate-scene-video`, {
        sceneIndex,
        imageUrl: scene.imageUrl,
        prompt: scene.prompt,
        lipsync: isLipsyncScene(sceneIndex),
        videoQuality: videoQuality
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { sceneIndex } = variables;
      setGeneratedScenes(prev => 
        prev.map((scene, index) => 
          index === sceneIndex 
            ? { ...scene, videoUrl: data.videoUrl }
            : scene
        )
      );
      setRegeneratingVideoScenes(prev => prev.filter(i => i !== sceneIndex));
      setRegeneratedVideoScenes(prev => new Set([...prev, sceneIndex]));
      toast({
        title: "Success",
        description: `Scene ${sceneIndex + 1} video regenerated!`,
      });
    },
    onError: (error, variables) => {
      const { sceneIndex } = variables;
      setRegeneratingVideoScenes(prev => prev.filter(i => i !== sceneIndex));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to regenerate scene video",
        variant: "destructive",
      });
    }
  });

  const regenerateSceneVideo = (index: number) => {
    // Only regenerate if video hasn't been regenerated yet
    if (regeneratedVideoScenes.has(index)) {
      toast({
        title: "Info",
        description: "Video for this scene has already been regenerated",
      });
      return;
    }
    setRegeneratingVideoScenes(prev => [...prev, index]);
    regenerateSceneVideoMutation.mutate({ sceneIndex: index });
  };

  const openCameraAngleModal = (index: number) => {
    setCameraAngleSceneIndex(index);
    setCameraAngleModalOpen(true);
  };

  const openPreviewModal = (type: "image" | "video", url: string, sceneIndex: number) => {
    setPreviewType(type);
    setPreviewUrl(url);
    setPreviewSceneIndex(sceneIndex);
    setPreviewModalOpen(true);
  };

  const handleCameraAngleApply = (params: { horizontalAngle: number; verticalAngle: number; distance: number }) => {
    if (cameraAngleSceneIndex === null) return;
    setCameraAngleScenes(prev => [...prev, cameraAngleSceneIndex]);
    cameraAngleMutation.mutate({
      sceneIndex: cameraAngleSceneIndex,
      ...params
    });
  };

  const handleFileSelect = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB limit)
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Please select an image under 10MB",
        variant: "destructive",
      });
      // Reset the input
      if (fileInputRefs.current[index]) {
        fileInputRefs.current[index]!.value = '';
      }
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, GIF, or WebP image",
        variant: "destructive",
      });
      // Reset the input
      if (fileInputRefs.current[index]) {
        fileInputRefs.current[index]!.value = '';
      }
      return;
    }

    // Start upload
    setUploadingScenes(prev => [...prev, index]);
    uploadSceneImageMutation.mutate({ sceneIndex: index, file });

    // Reset the input so the same file can be selected again
    if (fileInputRefs.current[index]) {
      fileInputRefs.current[index]!.value = '';
    }
  };

  const triggerFileInput = (index: number) => {
    fileInputRefs.current[index]?.click();
  };

  const updateScenePrompt = (index: number, newPrompt: string) => {
    setGeneratedScenes(prev => 
      prev.map((scene, i) => 
        i === index ? { ...scene, prompt: newPrompt } : scene
      )
    );
  };

  // Mutation to update scene order on the backend
  const updateSceneOrderMutation = useMutation({
    mutationFn: async (newOrder: number[]) => {
      if (isEditMode) {
        // In edit mode, just update local state without saving to backend
        return Promise.resolve({ sceneOrder: newOrder });
      }
      const response = await apiRequest("POST", `/api/projects/${projectId}/update-scene-order`, {
        sceneOrder: newOrder
      });
      return response.json();
    },
    onError: (error) => {
      toast({
        title: "Warning",
        description: "Failed to save scene order",
        variant: "destructive",
      });
    }
  });

  const handleSceneReorder = (newOrder: number[]) => {
    setSceneOrder(newOrder);
    // Save to backend (non-blocking)
    updateSceneOrderMutation.mutate(newOrder);
  };

  const scrollToScene = (sceneIndex: number) => {
    const sceneElement = document.querySelector(`[data-testid="scene-${sceneIndex + 1}"]`);
    if (sceneElement) {
      sceneElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const saveScenesMutation = useMutation({
    mutationFn: async (scenes: SceneData[]) => {
      // In edit mode, never save to the original project
      if (isEditMode) {
        console.log("Edit mode: Skipping scene save to original project");
        return Promise.resolve({ success: true });
      }
      
      const response = await apiRequest("POST", `/api/projects/${projectId}/update-scenes`, {
        scenes
      });
      return response.json();
    },
    onSuccess: () => {
      if (!isEditMode) {
        console.log("Scenes saved successfully before video generation");
      }
    },
    onError: (error) => {
      if (!isEditMode) {
        console.error("Failed to save scenes:", error);
        toast({
          title: "Warning",
          description: "Failed to save scene changes. Proceeding with video generation anyway.",
          variant: "destructive",
        });
      }
    }
  });

  // Mutation to clone/regenerate the project
  const regenerateVideoMutation = useMutation({
    mutationFn: async () => {
      // Clone the project with updated scenes, scene order, and video quality (don't modify the original)
      const response = await apiRequest("POST", `/api/projects/${projectId}/clone`, {
        updatedScenes: generatedScenes,
        sceneOrder: sceneOrder,
        videoQuality: videoQuality
      });
      return response.json();
    },
    onSuccess: (newProject) => {
      toast({
        title: "Starting Regeneration",
        description: "Creating a new video with your updated scenes...",
      });
      
      // Navigate to the new project's video generation step
      window.location.href = `/create/story-mode?id=${newProject.id}`;
    },
    onError: (error) => {
      toast({
        title: "Regeneration Failed",
        description: error instanceof Error ? error.message : "Failed to start regeneration",
        variant: "destructive",
      });
    }
  });

  const handleProceedToVideo = async () => {
    if (isEditMode) {
      // In edit mode, trigger regeneration (clone + redirect)
      regenerateVideoMutation.mutate();
    } else {
      // In normal mode, save scenes and scene order, then proceed to next step
      try {
        // Save scene order first (non-blocking, but important for video generation)
        if (sceneOrder.length > 0) {
          await updateSceneOrderMutation.mutateAsync(sceneOrder);
        }
        await saveScenesMutation.mutateAsync(generatedScenes);
      } catch (error) {
        console.error("Error saving scenes:", error);
      }
      // Proceed to next step regardless of save result
      onNext();
    }
  };

  // Calculate credit cost for video regeneration (video generation only, no song cost)
  const calculateRegenerationCost = () => {
    if (!audioDuration) return 0;
    // Video generation: 1000 credits per 30 seconds
    const baseCost = Math.ceil(audioDuration / 30) * 1000;
    // Add extra credits based on video quality
    const qualityCost = videoQuality === "medium" ? 1000 : videoQuality === "premium" ? 2000 : 0;
    return baseCost + qualityCost;
  };
  
  // Calculate credit cost for partial regeneration (only modified scenes)
  const calculatePartialRegenerationCost = () => {
    // 500 credits per modified scene video
    return modifiedSceneIndices.length * 500;
  };

  // Get video quality extra credits display
  const getVideoQualityExtraCredits = () => {
    switch (videoQuality) {
      case "medium": return "+1000 credits";
      case "premium": return "+2000 credits";
      default: return "";
    }
  };
  
  // Mutation to regenerate only modified scene videos and merge
  const partialRegenerateMutation = useMutation({
    mutationFn: async () => {
      // Call the partial regeneration endpoint
      const response = await apiRequest("POST", `/api/projects/${projectId}/regenerate-modified-scenes`, {
        updatedScenes: generatedScenes,
        sceneOrder: sceneOrder,
        modifiedSceneIndices: modifiedSceneIndices,
        videoQuality: videoQuality
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Starting Partial Regeneration",
        description: `Regenerating ${modifiedSceneIndices.length} modified scene(s)...`,
      });
      
      // Navigate to the new project's video generation step
      window.location.href = `/create/story-mode?id=${data.id}`;
    },
    onError: (error) => {
      toast({
        title: "Partial Regeneration Failed",
        description: error instanceof Error ? error.message : "Failed to start partial regeneration",
        variant: "destructive",
      });
    }
  });

  // Video quality mutation removed - always using "quick" quality

  return (
    <div className="max-w-6xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4" data-testid="scene-generation-step">
      <div className="bg-background border border-border rounded-lg p-4 sm:p-6 md:p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Generate Video Scenes</h3>
          <p className="text-muted-foreground">AI will create 8 unique scenes for your music video based on your song concept</p>
        </div>

        {/* Scene Generation Progress - uses isGenerating state for accurate tracking */}
        {(isGenerating || (generatedScenes.length === 0 && !isEditMode)) && (
          <div className="bg-muted/30 rounded-lg p-6 mb-8" data-testid="scene-generation-progress">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {isGenerating ? "Generating Scenes..." : "Preparing scene generation..."}
              </h4>
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
            <Progress value={progress} className="mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="scene-progress-text">
              {!isGenerating ? "Setting up AI scene generator..." :
               progress <= 25 ? "Analyzing song concept..." :
               progress <= 50 ? "Generating scene prompts..." :
               progress <= 75 ? "Creating scene images..." :
               "Scene generation complete!"}
            </p>
          </div>
        )}

        {/* Timeline for scene reordering */}
        {generatedScenes.length > 0 && sceneOrder.length > 0 && (
          <SceneTimeline
            scenes={generatedScenes}
            sceneOrder={sceneOrder}
            audioDuration={audioDuration}
            audioUrl={audioUrl}
            lyrics={audioLyrics}
            textOverlay={textOverlay}
            subtitleFileUrl={subtitleFileUrl}
            finalVideoUrl={finalVideoUrl}
            isEditMode={isEditMode}
            isInstrumental={isInstrumental}
            onReorder={handleSceneReorder}
            onSceneClick={scrollToScene}
            onToggleLipsync={toggleLipsync}
          />
        )}

        {/* Generated Scenes */}
        {generatedScenes.length > 0 && (
          <>
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-4 mb-6 text-center" data-testid="scenes-ready-message">
              <p className="text-sm text-muted-foreground">
                <span className="text-primary font-medium">All scenes are ready!</span> You can proceed to create your video, or optionally customize the scenes above.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8" data-testid="generated-scenes">
            {generatedScenes.map((scene, index) => (
              <div key={index} className="bg-muted/20 rounded-lg p-4 border border-border" data-testid={`scene-${index + 1}`}>
                <div className="space-y-4">
                  {/* Top row: [Image thumbnail][Video thumbnail] Scene 1 [lipsync icon] */}
                  <div className="flex items-center gap-3">
                    {/* Image Thumbnail - click to preview larger */}
                    <div 
                      className={`w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0 ${scene.imageUrl ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow" : ""}`}
                      onClick={() => scene.imageUrl && openPreviewModal("image", scene.imageUrl, index)}
                      role={scene.imageUrl ? "button" : undefined}
                      aria-label={scene.imageUrl ? `View scene ${index + 1} image larger` : undefined}
                    >
                      {regeneratingScenes.includes(index) || uploadingScenes.includes(index) ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl}
                          alt={`Scene ${index + 1} thumbnail`} 
                          className="w-full h-full object-cover rounded-lg pointer-events-none" 
                          data-testid={`scene-image-${index + 1}`}
                        />
                      ) : (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      )}
                    </div>
                    {/* Video Preview - only show in edit mode; click to preview larger */}
                    {isEditMode && (
                      <div 
                        className={`w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center relative overflow-hidden flex-shrink-0 ${scene.videoUrl ? "cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition-shadow" : ""}`}
                        onClick={() => scene.videoUrl && openPreviewModal("video", scene.videoUrl, index)}
                        role={scene.videoUrl ? "button" : undefined}
                        aria-label={scene.videoUrl ? `View scene ${index + 1} video larger` : undefined}
                      >
                        {regeneratingVideoScenes.includes(index) ? (
                          <Loader2 className="w-6 h-6 animate-spin text-white" />
                        ) : scene.videoUrl ? (
                          <video 
                            src={scene.videoUrl}
                            className="w-full h-full object-cover rounded-lg pointer-events-none"
                            muted
                            loop
                            playsInline
                            autoPlay
                            data-testid={`scene-video-${index + 1}`}
                          />
                        ) : needsVideoRegeneration(index) ? (
                          <div className="w-full h-full flex items-center justify-center bg-red-500/20 border-2 border-red-500/50 rounded-lg relative">
                            <X className="w-8 h-8 text-red-400" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-purple-500/20">
                            <i className="fas fa-video text-purple-400 text-xs"></i>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Scene title and icons */}
                    <div className="flex items-center gap-2 flex-1">
                      <h5 className="font-semibold">Scene {index + 1}</h5>
                      {/* Modified indicator - shows when scene image or lipsync has been changed */}
                      {modifiedSceneIndices.includes(index) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div 
                                className="px-2 py-0.5 rounded bg-orange-500/20 border border-orange-500/50 flex items-center gap-1"
                                data-testid={`scene-modified-${index + 1}`}
                              >
                                <Pencil className="w-3 h-3 text-orange-500" />
                                <span className="text-xs text-orange-500 font-medium">Modified</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[250px]">
                              <p>This scene has been modified (image or lipsync setting changed). Regenerate modified scene videos to apply changes and save credits.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* Lipsync icon */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button 
                              className={`focus:outline-none p-1 rounded transition-colors ${isInstrumental ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/50'}`}
                              onClick={() => toggleLipsync(index)}
                              disabled={isInstrumental}
                              data-testid={`lipsync-toggle-${index + 1}`}
                            >
                              <Mic className={`w-4 h-4 ${isLipsyncScene(index) ? 'text-pink-500' : 'text-gray-400'}`} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{isInstrumental 
                              ? 'Lipsync not available for instrumental videos' 
                              : (isLipsyncScene(index) 
                                ? 'Lipsync enabled - uses AI lipsync model (click to disable)' 
                                : 'Lipsync disabled - uses regular AI video model (click to enable)')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {showLipsyncWarning(index) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div 
                                className="p-1 rounded bg-amber-500/20 border border-amber-500/50 animate-pulse"
                                data-testid={`lipsync-warning-${index + 1}`}
                              >
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[250px] bg-amber-900 border-amber-700">
                              <p>Lipsync is enabled but there are no lyrics during this scene. Consider disabling lipsync or reordering scenes.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>

                  {/* Image Options: [Regenerate Image button][Upload][Camera Angle] */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Image Options:
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateScene(index, scene.prompt)}
                        disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index) || cameraAngleScenes.includes(index) || regeneratingVideoScenes.includes(index)}
                        className="flex items-center gap-2"
                        data-testid={`regenerate-scene-${index + 1}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${regeneratingScenes.includes(index) ? 'animate-spin' : ''}`} />
                        {regeneratingScenes.includes(index) ? 'Regenerating...' : 'Regenerate Image'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerFileInput(index)}
                        disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index) || cameraAngleScenes.includes(index) || regeneratingVideoScenes.includes(index)}
                        className="flex items-center gap-2"
                        data-testid={`upload-scene-${index + 1}`}
                      >
                        {uploadingScenes.includes(index) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploadingScenes.includes(index) ? 'Uploading...' : 'Upload'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCameraAngleModal(index)}
                        disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index) || cameraAngleScenes.includes(index) || regeneratingVideoScenes.includes(index) || !scene.imageUrl}
                        className="flex items-center gap-2"
                        data-testid={`camera-angle-scene-${index + 1}`}
                      >
                        {cameraAngleScenes.includes(index) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                        {cameraAngleScenes.includes(index) ? 'Processing...' : 'Camera angle'}
                      </Button>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current[index] = el; }}
                        onChange={(e) => handleFileSelect(index, e)}
                        data-testid={`file-input-scene-${index + 1}`}
                      />
                    </div>
                  </div>

                  {/* Scene Prompt */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Scene Prompt:
                    </label>
                    <Textarea
                      value={scene.prompt}
                      onChange={(e) => updateScenePrompt(index, e.target.value)}
                      className="min-h-[100px] text-sm"
                      data-testid={`scene-prompt-textarea-${index + 1}`}
                      placeholder="Describe the scene in detail..."
                    />
                  </div>

                  {/* Regenerate Video button - on its own row */}
                  {isEditMode && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateSceneVideo(index)}
                        disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index) || cameraAngleScenes.includes(index) || regeneratingVideoScenes.includes(index) || regeneratedVideoScenes.has(index)}
                        className={`flex items-center gap-2 w-full sm:w-auto ${needsVideoRegeneration(index) ? 'border-pink-500/80 shadow-[0_0_20px_rgba(236,72,153,0.8),0_0_40px_rgba(236,72,153,0.4)] hover:shadow-[0_0_25px_rgba(236,72,153,1),0_0_50px_rgba(236,72,153,0.6)] animate-pulse bg-pink-500/10' : ''}`}
                        data-testid={`regenerate-video-${index + 1}`}
                      >
                        {regeneratingVideoScenes.includes(index) ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Regenerating Video...
                          </>
                        ) : regeneratedVideoScenes.has(index) ? (
                          <>
                            <i className="fas fa-check w-4 h-4 text-green-500"></i>
                            Video Regenerated
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Regenerate Video
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          </>
        )}


        {/* Credit Cost Info for Edit Mode */}
        {isEditMode && audioDuration && (
          <div className="bg-muted/30 border border-border rounded-lg p-4 mb-6" data-testid="regeneration-cost-info">
            <div className="flex flex-col gap-3">
              {/* Modified scenes info - only show if there are modified scenes */}
              {hasExistingVideoSegments && modifiedSceneIndices.length > 0 && (
                <div className="flex items-center gap-2 text-sm bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <div className="flex-1">
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {modifiedSceneIndices.length} scene{modifiedSceneIndices.length > 1 ? 's' : ''} modified
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use Re-generate Music Video below to generate the video with your changes.
                    </p>
                  </div>
                </div>
              )}
              
              {/* No modifications message */}
              {hasExistingVideoSegments && modifiedSceneIndices.length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  No scenes have been modified. Change a scene image or lipsync setting to enable regeneration and save credits.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            {!isEditMode && (
              <Button 
                variant="secondary"
                onClick={onBack}
                className="w-full sm:w-auto"
                data-testid="back-to-character-button"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                {isInstrumental ? "Back to Audio" : "Back to Character"}
              </Button>
            )}
            
            {/* Edit mode with existing video: one button only — Re-generate Music Video (partial "Regenerate Final Video" only works when there are modified scenes and is used elsewhere) */}
            {isEditMode && hasExistingVideoSegments ? (
              <>
                {modifiedSceneIndices.length > 0 && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 w-full text-center sm:text-left" data-testid="generate-scenes-first-message">
                    Generate the video for modified scenes first. Then you can regenerate the final video.
                  </p>
                )}
                <Button
                  onClick={handleProceedToVideo}
                  disabled={generatedScenes.length === 0 || saveScenesMutation.isPending || regenerateVideoMutation.isPending}
                  className={`floating-button py-3 px-4 sm:px-8 text-sm sm:text-base ${generatedScenes.length > 0 && !saveScenesMutation.isPending && !regenerateVideoMutation.isPending ? 'button-glow' : ''} ${modifiedSceneIndices.length > 0 ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-background' : ''}`}
                  data-testid="proceed-to-video-generation-button"
                >
                  <i className="fas fa-video mr-2"></i>
                  {regenerateVideoMutation.isPending ? "Regenerating..." : 
                   saveScenesMutation.isPending ? "Saving..." : "Re-generate Music Video"}
                  {modifiedSceneIndices.length > 0 && (
                    <span className="ml-2 text-xs font-normal opacity-90">({modifiedSceneIndices.length} modified)</span>
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleProceedToVideo}
                disabled={generatedScenes.length === 0 || saveScenesMutation.isPending || regenerateVideoMutation.isPending}
                className={`floating-button py-3 px-4 sm:px-8 text-sm sm:text-base ${generatedScenes.length > 0 && !saveScenesMutation.isPending && !regenerateVideoMutation.isPending ? 'button-glow' : ''} ${modifiedSceneIndices.length > 0 ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-background' : ''}`}
                data-testid="proceed-to-video-generation-button"
              >
                <i className="fas fa-video mr-2"></i>
                {regenerateVideoMutation.isPending ? "Regenerating..." : 
                 saveScenesMutation.isPending ? "Saving..." : 
                 isEditMode ? "Re-generate Music Video" : "Generate Music Video"}
                {modifiedSceneIndices.length > 0 && (
                  <span className="ml-2 text-xs font-normal opacity-90">({modifiedSceneIndices.length} modified)</span>
                )}
              </Button>
            )}
          </div>
          {!isInstrumental && (
            <div className="flex justify-center">
              <StepCircles currentStep={3} totalSteps={3} />
            </div>
          )}
        </div>
      </div>

      {/* Camera Angle Modal */}
      <CameraAngleModal
        isOpen={cameraAngleModalOpen}
        onClose={() => {
          setCameraAngleModalOpen(false);
          setCameraAngleSceneIndex(null);
        }}
        onApply={handleCameraAngleApply}
        isLoading={cameraAngleMutation.isPending}
        sceneIndex={cameraAngleSceneIndex ?? 0}
      />

      {/* Preview Modal - show image or video larger when user clicks thumbnail */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>
              Scene {previewSceneIndex != null ? previewSceneIndex + 1 : ""} — {previewType === "image" ? "Image" : "Video"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 pt-0 bg-muted/30 rounded-b-lg overflow-auto">
            {previewUrl && previewType === "image" && (
              <img
                src={previewUrl}
                alt={`Scene ${previewSceneIndex != null ? previewSceneIndex + 1 : ""} preview`}
                className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-lg"
              />
            )}
            {previewUrl && previewType === "video" && (
              <video
                src={previewUrl}
                className="max-w-full max-h-[70vh] w-auto h-auto rounded-lg shadow-lg"
                controls
                autoPlay
                muted
                loop
                playsInline
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}