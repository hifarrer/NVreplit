import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioSegment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import loadingAnimation from "@assets/loading_1756677254636.mp4";

interface VideoGenerationStepProps {
  projectId: string;
  onVideoComplete: (videoUrl: string) => void;
  onBack?: () => void;
}

export function VideoGenerationStep({ projectId, onVideoComplete, onBack }: VideoGenerationStepProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
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
        
        // Simulate step completion
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const response = await apiRequest("POST", `/api/projects/${projectId}/generate-video`, {});
      return response.json();
    },
    onSuccess: (data) => {
      onVideoComplete(data.finalVideoUrl);
      toast({
        title: "Success",
        description: "Your music video has been generated successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate video",
        variant: "destructive",
      });
      setOverallProgress(0);
      setCurrentStep(0);
    },
  });

  useEffect(() => {
    generateVideoMutation.mutate();
  }, []);

  const cancelGeneration = () => {
    generateVideoMutation.reset();
    setOverallProgress(0);
    setCurrentStep(0);
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

        {/* Loading Animation */}
        <div className="flex flex-col items-center justify-center mb-8">
          <video 
            autoPlay 
            loop 
            muted 
            playsInline
            className="mb-6"
            src={loadingAnimation}
          />
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
          <p className="text-sm text-muted-foreground text-center" data-testid="current-step-description">
            {currentStep === 1 ? "Splitting audio into segments..." :
             currentStep === 2 ? "Generating scene images..." :
             currentStep === 3 ? "Creating video segment 1..." :
             currentStep === 4 ? "Creating video segment 2..." :
             currentStep === 5 ? "Creating video segments 3 & 4..." :
             currentStep === 6 ? "Merging final video..." :
             "Preparing generation..."}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center">
          <Button
            variant="destructive"
            onClick={cancelGeneration}
            disabled={!generateVideoMutation.isPending}
            data-testid="cancel-generation-button"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Cancel Generation
          </Button>
        </div>
      </div>
    </div>
  );
}