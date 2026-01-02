import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
import { RotateCcw, RefreshCw, Mic, Upload, Loader2 } from "lucide-react";
import { SceneTimeline } from "@/components/scene-timeline";

interface SceneGenerationStepProps {
  projectId: string;
  audioDuration?: number;
  audioUrl?: string;
  audioLyrics?: string;
  characterImageUrl?: string;
  scenes?: SceneData[];
  sceneOrder?: number[];
  isEditMode?: boolean;
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export function SceneGenerationStep({ projectId, audioDuration, audioUrl, audioLyrics, characterImageUrl, scenes = [], sceneOrder: initialSceneOrder, isEditMode = false, onNext, onBack, onReset }: SceneGenerationStepProps) {
  // Defensively copy scenes array to avoid mutating the original project data
  const [generatedScenes, setGeneratedScenes] = useState<SceneData[]>(() => 
    scenes.map(scene => ({ ...scene }))
  );
  // Scene order tracking - defaults to sequential order if not provided
  const [sceneOrder, setSceneOrder] = useState<number[]>(() => 
    initialSceneOrder && initialSceneOrder.length > 0 
      ? initialSceneOrder 
      : scenes.map((_, index) => index)
  );
  const [progress, setProgress] = useState(0);
  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const [uploadingScenes, setUploadingScenes] = useState<number[]>([]);
  const { toast } = useToast();
  const hasGeneratedRef = useRef(false);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // Determine if a scene uses lipsync based on video duration and scene index
  const isLipsyncScene = (index: number): boolean => {
    if (!audioDuration) return false;
    
    // For 30 second videos: Scene 1 (index 0) is seedance, Scenes 2-3 (indices 1-2) are lipsync
    if (audioDuration <= 30) {
      return index === 1 || index === 2;
    }
    
    // For 60+ second videos: Alternating pattern - Scene 1 seedance, Scene 2 lipsync, etc.
    // Odd indices (1, 3, 5, 7) are lipsync
    return index % 2 === 1;
  };

  const generateScenesMutation = useMutation({
    mutationFn: async () => {
      const progressSteps = [25, 50, 75, 100];
      const messages = [
        "Analyzing song concept...",
        "Generating scene prompts...",
        "Creating scene images...",
        "Scene generation complete!"
      ];

      for (let i = 0; i < progressSteps.length; i++) {
        setProgress(progressSteps[i]);
        await new Promise(resolve => setTimeout(resolve, 2500));
      }

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-scenes`, {});
      return response.json();
    },
    onSuccess: (data) => {
      const sceneData: SceneData[] = data.scenePrompts.map((prompt: string, index: number) => ({
        prompt,
        imageUrl: data.sceneImages[index]
      }));
      setGeneratedScenes(sceneData);
      // Set default scene order when new scenes are generated
      setSceneOrder(sceneData.map((_, index) => index));
      toast({
        title: "Success",
        description: "Scenes generated successfully!",
      });
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Error",
        description: "Failed to generate scenes",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    // Only auto-generate scenes if:
    // 1. No scenes exist in the project (scenes prop)
    // 2. Not in edit mode
    // 3. Haven't already triggered generation (prevents React Strict Mode double-call and duplicate triggers)
    // This prevents re-generating scenes that already exist when component remounts
    
    // Use ref as the single source of truth to prevent duplicate calls
    // Do NOT check generatedScenes.length because state updates are async
    if (hasGeneratedRef.current) {
      return;
    }
    
    const hasExistingScenes = scenes.length > 0;
    if (!hasExistingScenes && !isEditMode) {
      hasGeneratedRef.current = true;
      generateScenesMutation.mutate();
    }
  }, [isEditMode, scenes.length]);
  
  // Sync with scenes prop when it changes (e.g., when project data loads in edit mode)
  useEffect(() => {
    if (scenes.length > 0 && generatedScenes.length === 0) {
      setGeneratedScenes(scenes.map(scene => ({ ...scene })));
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
      // In edit mode, generate scene locally without saving to original project
      if (isEditMode) {
        // Call a standalone scene generation endpoint that doesn't update the project
        const response = await apiRequest("POST", `/api/generate-single-scene`, {
          prompt,
          characterImageUrl
        });
        return response.json();
      }
      
      // Normal mode: use the regular regenerate-scene endpoint that updates the project
      const response = await apiRequest("POST", `/api/projects/${projectId}/regenerate-scene`, {
        sceneIndex,
        prompt
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { sceneIndex } = variables;
      setGeneratedScenes(prev => 
        prev.map((scene, index) => 
          index === sceneIndex 
            ? { ...scene, imageUrl: data.imageUrl }
            : scene
        )
      );
      setRegeneratingScenes(prev => prev.filter(i => i !== sceneIndex));
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
            ? { ...scene, imageUrl: data.imageUrl }
            : scene
        )
      );
      setUploadingScenes(prev => prev.filter(i => i !== sceneIndex));
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
      // Clone the project with updated scenes and scene order (don't modify the original)
      const response = await apiRequest("POST", `/api/projects/${projectId}/clone`, {
        updatedScenes: generatedScenes,
        sceneOrder: sceneOrder
      });
      return response.json();
    },
    onSuccess: (newProject) => {
      toast({
        title: "Starting Regeneration",
        description: "Creating a new video with your updated scenes...",
      });
      
      // Navigate to the new project's video generation step
      window.location.href = `/create?id=${newProject.id}`;
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
    return Math.ceil(audioDuration / 30) * 1000;
  };

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

        {/* Scene Generation Progress */}
        {generateScenesMutation.isPending && (
          <div className="bg-muted/30 rounded-lg p-6 mb-8" data-testid="scene-generation-progress">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Generating Scenes...</h4>
              <div className="loading-spinner"></div>
            </div>
            <Progress value={progress} className="mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="scene-progress-text">
              {progress <= 25 ? "Analyzing song concept..." :
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
            onReorder={handleSceneReorder}
            onSceneClick={scrollToScene}
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
                  <div className="flex flex-col sm:flex-row items-start gap-4 sm:space-x-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0">
                      {regeneratingScenes.includes(index) || uploadingScenes.includes(index) ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl}
                          alt={`Scene ${index + 1} thumbnail`} 
                          className="w-full h-full object-cover rounded-lg" 
                          data-testid={`scene-image-${index + 1}`}
                        />
                      ) : (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h5 className="font-semibold">Scene {index + 1}</h5>
                        {isLipsyncScene(index) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button 
                                  className="focus:outline-none"
                                  data-testid={`lipsync-indicator-${index + 1}`}
                                >
                                  <Mic className="w-4 h-4 text-pink-500" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Lipsync scenes need to be a closeup of the character</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerateScene(index, scene.prompt)}
                          disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index)}
                          className="flex items-center gap-2"
                          data-testid={`regenerate-scene-${index + 1}`}
                        >
                          <RefreshCw className={`w-4 h-4 ${regeneratingScenes.includes(index) ? 'animate-spin' : ''}`} />
                          {regeneratingScenes.includes(index) ? 'Regenerating...' : 'Regenerate'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerFileInput(index)}
                          disabled={regeneratingScenes.includes(index) || uploadingScenes.includes(index)}
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
                  </div>
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
                </div>
              </div>
            ))}
            </div>
          </>
        )}

        {/* Credit Cost Info for Edit Mode */}
        {isEditMode && audioDuration && (
          <div className="bg-muted/30 border border-border rounded-lg p-4 mb-6" data-testid="regeneration-cost-info">
            <div className="flex items-center gap-2 text-sm">
              <i className="fas fa-coins text-primary"></i>
              <span className="font-medium">Regeneration Cost:</span>
              <span className="text-muted-foreground">
                {calculateRegenerationCost().toLocaleString()} credits
              </span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-between">
          <Button 
            variant="secondary"
            onClick={onBack}
            className="order-2 sm:order-1"
            data-testid="back-to-character-button"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Character
          </Button>
          <Button
            onClick={handleProceedToVideo}
            disabled={generatedScenes.length === 0 || saveScenesMutation.isPending || regenerateVideoMutation.isPending}
            className={`floating-button py-3 px-4 sm:px-8 text-sm sm:text-base order-1 sm:order-2 ${generatedScenes.length > 0 && !saveScenesMutation.isPending && !regenerateVideoMutation.isPending ? 'button-glow' : ''}`}
            data-testid="proceed-to-video-generation-button"
          >
            <i className="fas fa-video mr-2"></i>
            {regenerateVideoMutation.isPending ? "Regenerating..." : 
             saveScenesMutation.isPending ? "Saving..." : 
             isEditMode ? "Re-generate Music Video" : "Generate Music Video"}
          </Button>
        </div>
      </div>
    </div>
  );
}