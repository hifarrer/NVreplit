import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioSegment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RotateCcw, Clock, Users } from "lucide-react";
import loadingAnimation from "@assets/loading_1756677254636.mp4";
import { TrendingVideosCarousel } from "@/components/trending-videos-carousel";

interface VideoGenerationStepProps {
  projectId: string;
  onVideoComplete: (videoUrl: string) => void;
  onBack?: () => void;
  onReset?: () => void;
}

interface QueueStats {
  activeCount: number;
  maxConcurrent: number;
}

interface QueuePositionData {
  queuePosition: number | null;
}

export function VideoGenerationStep({ projectId, onVideoComplete, onBack, onReset }: VideoGenerationStepProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [progressInterval, setProgressInterval] = useState<NodeJS.Timeout | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [shouldPollCompletion, setShouldPollCompletion] = useState(false);
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(false);
  const { toast } = useToast();
  const hasInitiatedGeneration = useRef(false);

  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      return new Promise<any>((resolve, reject) => {
        // Start realistic progress simulation
        setOverallProgress(5);
        setCurrentStep(1);
        
        const steps = [
          { progress: 15, step: 1, delay: 30000 }, // 30s - Splitting audio
          { progress: 25, step: 2, delay: 45000 }, // 45s - Generating scene images  
          { progress: 45, step: 3, delay: 120000 }, // 2min - Creating video segment 1
          { progress: 65, step: 4, delay: 120000 }, // 2min - Creating video segment 2
          { progress: 85, step: 5, delay: 180000 }, // 3min - Creating segments 3 & 4
          { progress: 95, step: 6, delay: 60000 }, // 1min - Merging final video
        ];
        
        let currentStepIndex = 0;
        let startTime = Date.now();
        
        const updateProgress = () => {
          const elapsed = Date.now() - startTime;
          
          // Find current step based on elapsed time
          let totalTime = 0;
          let activeStep = steps[0];
          
          for (let i = 0; i < steps.length; i++) {
            totalTime += steps[i].delay;
            if (elapsed < totalTime) {
              activeStep = steps[i];
              currentStepIndex = i;
              break;
            }
          }
          
          // Interpolate progress within current step
          const stepStartTime = currentStepIndex === 0 ? 0 : 
            steps.slice(0, currentStepIndex).reduce((sum, step) => sum + step.delay, 0);
          const stepProgress = Math.min(1, (elapsed - stepStartTime) / activeStep.delay);
          const prevProgress = currentStepIndex === 0 ? 5 : steps[currentStepIndex - 1].progress;
          const interpolatedProgress = prevProgress + (activeStep.progress - prevProgress) * stepProgress;
          
          setOverallProgress(Math.round(interpolatedProgress));
          setCurrentStep(activeStep.step);
        };
        
        // Update progress every 2 seconds
        const interval = setInterval(updateProgress, 2000);
        setProgressInterval(interval);
        
        // Start the actual API call
        apiRequest("POST", `/api/projects/${projectId}/generate-video`, {})
          .then(async response => {
            if (response.status === 408) {
              // Queue timeout
              clearInterval(interval);
              setProgressInterval(null);
              throw new Error("Video generation queue timeout. Please try again.");
            }
            
            const data = await response.json();
            
            // Check if this was a queue timeout response  
            if (data.error && data.error.includes("queue timeout")) {
              clearInterval(interval);
              setProgressInterval(null);
              setIsQueued(false);
              setQueuePosition(null);
              throw new Error(data.error);
            }
            
            return data;
          })
          .then(data => {
            clearInterval(interval);
            setProgressInterval(null);
            setOverallProgress(100);
            setCurrentStep(6);
            setIsQueued(false);
            resolve(data);
          })
          .catch(error => {
            clearInterval(interval);
            setProgressInterval(null);
            setIsQueued(false);
            
            // Handle queue-related errors specifically
            if (error.message.includes("queue") || error.message.includes("timeout")) {
              setQueuePosition(null);
            }
            reject(error);
          });
      });
    },
    onSuccess: (data) => {
      // Check if this is an async response (generation started but not complete)
      if (data.status === "generating" && !data.finalVideoUrl) {
        // Video generation started in background - start polling for completion
        setShouldPollCompletion(true);
        setIsGeneratingInBackground(true);
        // Don't clear progress - keep showing the progress animation
        return;
      }
      
      // Video is already complete (either from sync response or "already generated" response)
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
      if (data.finalVideoUrl) {
        onVideoComplete(data.finalVideoUrl);
        toast({
          title: "Success",
          description: "Your music video has been generated successfully!",
        });
      }
    },
    onError: (error) => {
      // Don't show error popup for 409 "already generating" errors
      // The video is actually generating, so this is a false alarm
      const errorMessage = error instanceof Error ? error.message : "";
      const is409Error = errorMessage.includes("already in progress") || 
                         errorMessage.includes("409");
      
      if (is409Error) {
        // 409 error means video is already generating (duplicate call)
        // Start polling the project to check for completion
        setShouldPollCompletion(true);
        // Reset the mutation error state but keep the progress going
        setTimeout(() => generateVideoMutation.reset(), 100);
        return;
      }
      
      // For real errors, stop progress and show error
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
      toast({
        title: "Generation Failed",
        description: errorMessage || "Failed to generate video",
        variant: "destructive",
      });
      setOverallProgress(0);
      setCurrentStep(0);
    },
  });

  // Poll project status when we got a 409 to detect completion
  const { data: projectStatus } = useQuery<{ finalVideoUrl?: string }>({
    queryKey: ["/api/projects", projectId],
    refetchInterval: shouldPollCompletion ? 3000 : false, // Poll every 3 seconds if needed
    enabled: shouldPollCompletion,
  });

  // Check if video generation completed while polling
  useEffect(() => {
    if (shouldPollCompletion && projectStatus?.finalVideoUrl) {
      // Video generation completed!
      setShouldPollCompletion(false);
      setIsGeneratingInBackground(false);
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
      onVideoComplete(projectStatus.finalVideoUrl);
      toast({
        title: "Success",
        description: "Your music video has been generated successfully!",
      });
    }
  }, [projectStatus, shouldPollCompletion, progressInterval, onVideoComplete, toast]);

  // Query for queue status
  const { data: queueStats } = useQuery<QueueStats>({
    queryKey: ["/api/video-queue/status"],
    refetchInterval: 5000, // Poll every 5 seconds
    enabled: isQueued || generateVideoMutation.isPending || isGeneratingInBackground
  });

  // Query for project's queue position  
  const { data: queuePositionData } = useQuery<QueuePositionData>({
    queryKey: ["/api/projects", projectId, "queue-position"],
    refetchInterval: 3000, // Check position every 3 seconds
    enabled: isQueued && queuePosition !== null
  });

  // Update queue position from query
  useEffect(() => {
    if (queuePositionData?.queuePosition !== undefined) {
      setQueuePosition(queuePositionData.queuePosition);
      if (queuePositionData.queuePosition === 0) {
        setIsQueued(false);
      }
    }
  }, [queuePositionData]);

  useEffect(() => {
    // Only start generation once when component mounts
    // Use ref to prevent duplicate calls even in React StrictMode (development)
    // Also check if mutation is already pending to avoid duplicate calls
    if (!hasInitiatedGeneration.current && !generateVideoMutation.isPending) {
      hasInitiatedGeneration.current = true;
      generateVideoMutation.mutate();
    }
    
    // Cleanup interval on unmount
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  const cancelGeneration = () => {
    generateVideoMutation.reset();
    setOverallProgress(0);
    setCurrentStep(0);
    setShouldPollCompletion(false);
    setIsGeneratingInBackground(false);
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
    toast({
      title: "Generation Cancelled",
      description: "Video generation has been cancelled.",
    });
    if (onBack) onBack();
  };

  return (
    <div className="max-w-6xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4" data-testid="video-generation-step">
      <div className="bg-background border border-border rounded-lg p-4 sm:p-6 md:p-8">
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              generateVideoMutation.reset();
              if (onReset) onReset();
            }}
            className="flex items-center gap-2"
            data-testid="start-over-button"
          >
            <RotateCcw className="w-4 h-4" />
            Start over
          </Button>
        </div>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold gradient-text mb-4">Creating Your Music Video</h3>
          <p className="text-muted-foreground">Creating your video, this could take up to 15 minutes.</p>
        </div>


        {/* Loading Animation or Trending Videos */}
        {(generateVideoMutation.isPending || isGeneratingInBackground) ? (
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-center mb-6">
              While you wait for your video, watch other fun videos!
            </h3>
            <TrendingVideosCarousel />
          </div>
        ) : (
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
        )}

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
            disabled={!generateVideoMutation.isPending && !isGeneratingInBackground}
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