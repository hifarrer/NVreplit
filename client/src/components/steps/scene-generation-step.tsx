import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SceneData } from "@/lib/types";
import { RotateCcw, RefreshCw } from "lucide-react";

interface SceneGenerationStepProps {
  projectId: string;
  scenes?: SceneData[];
  onNext: () => void;
  onBack: () => void;
}

export function SceneGenerationStep({ projectId, scenes = [], onNext, onBack }: SceneGenerationStepProps) {
  const [generatedScenes, setGeneratedScenes] = useState<SceneData[]>(scenes);
  const [progress, setProgress] = useState(0);
  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const { toast } = useToast();

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
    if (generatedScenes.length === 0) {
      generateScenesMutation.mutate();
    }
  }, []);

  const regenerateSceneMutation = useMutation({
    mutationFn: async ({ sceneIndex, prompt }: { sceneIndex: number; prompt: string }) => {
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
        description: `Scene ${sceneIndex + 1} regenerated successfully!`,
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

  const updateScenePrompt = (index: number, newPrompt: string) => {
    setGeneratedScenes(prev => 
      prev.map((scene, i) => 
        i === index ? { ...scene, prompt: newPrompt } : scene
      )
    );
  };

  return (
    <div className="max-w-6xl mx-auto mb-12 bg-card rounded-lg p-4" data-testid="scene-generation-step">
      <div className="bg-background border border-border rounded-lg p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
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

        {/* Generated Scenes */}
        {generatedScenes.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-8" data-testid="generated-scenes">
            {generatedScenes.map((scene, index) => (
              <div key={index} className="bg-muted/20 rounded-lg p-4 border border-border" data-testid={`scene-${index + 1}`}>
                <div className="space-y-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0">
                      {regeneratingScenes.includes(index) ? (
                        <div className="loading-spinner" />
                      ) : scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl}
                          alt={`Scene ${index + 1} thumbnail`} 
                          className="w-full h-full object-cover rounded-lg" 
                          data-testid={`scene-image-${index + 1}`}
                        />
                      ) : (
                        <div className="loading-spinner" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold mb-2">Scene {index + 1}</h5>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateScene(index, scene.prompt)}
                        disabled={regeneratingScenes.includes(index)}
                        className="flex items-center gap-2"
                        data-testid={`regenerate-scene-${index + 1}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${regeneratingScenes.includes(index) ? 'animate-spin' : ''}`} />
                        {regeneratingScenes.includes(index) ? 'Regenerating...' : 'Regenerate'}
                      </Button>
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
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button 
            variant="secondary"
            onClick={onBack}
            data-testid="back-to-character-button"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Character
          </Button>
          <Button
            onClick={onNext}
            disabled={generatedScenes.length === 0}
            className="floating-button py-3 px-8"
            data-testid="proceed-to-video-generation-button"
          >
            <i className="fas fa-video mr-2"></i>
            Generate Music Video
          </Button>
        </div>
      </div>
    </div>
  );
}