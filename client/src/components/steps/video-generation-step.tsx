import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioSegment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

interface VideoGenerationStepProps {
  projectId: string;
  onVideoComplete: (videoUrl: string) => void;
  onBack?: () => void;
}

const generationSteps = [
  { id: "audio", title: "Split Audio Track", description: "Dividing your song into 4 equal segments", icon: "scissors" },
  { id: "images", title: "Generate Scene Images", description: "Creating 4 unique scene images with your character", icon: "images" },
  { id: "videos", title: "Create Video Segments", description: "Generating 4 video segments (this may take 5-10 minutes)", icon: "video" },
  { id: "merge", title: "Merge Final Video", description: "Combining all segments into your final music video", icon: "film" }
];

export function VideoGenerationStep({ projectId, onVideoComplete, onBack }: VideoGenerationStepProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, "pending" | "active" | "completed" | "error">>(
    Object.fromEntries(generationSteps.map(step => [step.id, "pending"]))
  );
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const { toast } = useToast();

  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      const steps = [
        { progress: 16, step: 1, text: 'Splitting audio into segments...' },
        { progress: 33, step: 2, text: 'Generating scene images...' },
        { progress: 50, step: 3, text: 'Creating video segment 1...' },
        { progress: 66, step: 4, text: 'Creating video segment 2...' },
        { progress: 83, step: 5, text: 'Creating video segments 3 & 4...' },
        { progress: 100, step: 6, text: 'Merging final video...' }
      ];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setOverallProgress(step.progress);
        setCurrentStep(step.step);
        
        // Update step status
        const stepIndex = Math.floor(i / 1.5);
        if (stepIndex < generationSteps.length) {
          setStepStatuses(prev => ({
            ...prev,
            [generationSteps[stepIndex].id]: "active"
          }));
        }

        // Simulate step completion
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (stepIndex < generationSteps.length) {
          setStepStatuses(prev => ({
            ...prev,
            [generationSteps[stepIndex].id]: "completed"
          }));
        }
      }

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-video`, {});
      return response.json();
    },
    onSuccess: (data) => {
      onVideoComplete(data.finalVideoUrl);
      toast({
        title: "Success",
        description: "Music video generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate video",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    generateVideoMutation.mutate();
  }, []);

  const cancelGeneration = () => {
    toast({
      title: "Generation Cancelled",
      description: "Video generation has been cancelled.",
    });
    if (onBack) onBack();
  };

  return (
    <div className="max-w-6xl mx-auto mb-12" data-testid="video-generation-step">
      <div className="bg-card border border-border rounded-lg p-8">
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
          <h3 className="text-2xl font-bold gradient-text mb-4">Creating Your Music Video</h3>
          <p className="text-muted-foreground">AI is generating your music video. This process may take a few minutes.</p>
        </div>

        {/* Overall Progress */}
        <div className="bg-muted/30 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold">Generation Progress</h4>
            <span className="text-sm text-muted-foreground" data-testid="overall-progress">
              Step {currentStep} of 6
            </span>
          </div>
          <Progress value={overallProgress} className="mb-2 h-3" />
          <p className="text-sm text-muted-foreground" data-testid="current-step-description">
            {currentStep === 1 ? "Splitting audio into segments..." :
             currentStep === 2 ? "Generating scene images..." :
             currentStep === 3 ? "Creating video segment 1..." :
             currentStep === 4 ? "Creating video segment 2..." :
             currentStep === 5 ? "Creating video segments 3 & 4..." :
             currentStep === 6 ? "Merging final video..." :
             "Preparing generation..."}
          </p>
        </div>

        {/* Detailed Progress Steps */}
        <div className="space-y-4 mb-8">
          {generationSteps.map((step, index) => {
            const status = stepStatuses[step.id];
            return (
              <div 
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border",
                  status === "completed" ? "border-green-600 bg-green-600/10" :
                  status === "active" ? "border-primary bg-primary/10" :
                  status === "error" ? "border-red-600 bg-red-600/10" :
                  "border-border opacity-50"
                )}
                data-testid={`${step.id}-step`}
              >
                <div 
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    status === "completed" ? "bg-green-600" :
                    status === "active" ? "bg-primary" :
                    status === "error" ? "bg-red-600" :
                    "bg-muted"
                  )}
                >
                  {status === "completed" ? (
                    <i className="fas fa-check text-white text-sm" />
                  ) : status === "active" ? (
                    <div className="loading-spinner w-4 h-4" />
                  ) : status === "error" ? (
                    <i className="fas fa-times text-white text-sm" />
                  ) : (
                    <i className={`fas fa-${step.icon} text-muted-foreground text-sm`} />
                  )}
                </div>
                <div className="flex-1">
                  <h5 className="font-semibold">{step.title}</h5>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                {status === "pending" && (
                  <i className="fas fa-clock text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>

        {/* Debug Information */}
        <div className="bg-muted/20 rounded-lg p-6 mb-8" data-testid="debug-section">
          <h4 className="text-lg font-semibold mb-4 flex items-center">
            <i className="fas fa-bug text-accent mr-2"></i>
            Debug Information
          </h4>
          
          {/* Audio Segments */}
          <div className="mb-6">
            <h5 className="font-semibold mb-3">Audio Segments</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((part) => (
                <div key={part} className="bg-card rounded-lg p-3 border border-border" data-testid={`audio-segment-${part}`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <i className="fas fa-music text-primary"></i>
                    <span className="text-sm font-semibold">Part {part}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {part === 1 ? "0:00 - 0:30" :
                     part === 2 ? "0:30 - 1:00" :
                     part === 3 ? "1:00 - 1:30" :
                     "1:30 - 2:00"}
                  </p>
                  {stepStatuses.audio === "completed" && (
                    <a href="#" className="text-xs text-accent hover:underline">Download</a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Generated Images */}
          <div>
            <h5 className="font-semibold mb-3">Generated Scene Images</h5>
            <div className="thumbnail-grid">
              {[1, 2, 3, 4].map((scene) => (
                <div 
                  key={scene}
                  className="bg-muted rounded-lg border border-border object-cover w-full h-32 flex items-center justify-center"
                  data-testid={`scene-image-${scene}`}
                >
                  {stepStatuses.images === "completed" ? (
                    <div className="text-center">
                      <i className="fas fa-image text-2xl text-muted-foreground mb-2"></i>
                      <p className="text-xs text-muted-foreground">Scene {scene}</p>
                    </div>
                  ) : (
                    <div className="loading-spinner" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cancel Generation */}
        <div className="text-center">
          <Button 
            variant="destructive"
            onClick={cancelGeneration}
            data-testid="cancel-generation-button"
          >
            <i className="fas fa-times mr-2"></i>
            Cancel Generation
          </Button>
        </div>
      </div>
    </div>
  );
}
