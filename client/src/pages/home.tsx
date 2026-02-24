import { useState, useEffect } from "react";
import { AudioCreationStep } from "@/components/steps/audio-creation-step";
import { CharacterCreationStep } from "@/components/steps/character-creation-step";
import { SceneGenerationStep } from "@/components/steps/scene-generation-step";
import { VideoGenerationStep } from "@/components/steps/video-generation-step";
import { VideoResultStep } from "@/components/steps/video-result-step";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Project } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string>("");
  const [currentEditSession, setCurrentEditSession] = useState<string | null>(null);
  
  // Extract project ID and edit parameters from URL using window.location.search
  // This is needed because wouter's location doesn't include query params
  const urlParams = new URLSearchParams(window.location.search);
  const urlProjectId = urlParams.get('id'); // Used when loading a cloned project
  const editProjectId = urlParams.get('edit');
  const editSessionId = urlParams.get('t'); // Timestamp from edit button
  const isEditMode = !!editProjectId;

  // Don't load current project on Create page - always start fresh
  // const { data: currentProject } = useQuery<Project>({
  //   queryKey: ["/api/current-project"],
  //   retry: false, // Don't retry if no project exists
  // });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/projects", {
        title: "NeonVideo Song",
        description: "AI-generated music video project",
        currentStep: 1,
      });
      return response.json();
    },
    onSuccess: (data: Project) => {
      setProjectId(data.id);
    },
  });

  const { data: project, refetch: refetchProject } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const handleStepChange = async (step: number) => {
    setCurrentStep(step);
    // Update the project in the database to persist the step change
    if (projectId) {
      try {
        await apiRequest("PATCH", `/api/projects/${projectId}`, {
          currentStep: step
        });
        refetchProject();
      } catch (error) {
        console.error("Failed to update project step:", error);
      }
    }
  };

  // Initialize project logic: create new project or load existing one from URL
  useEffect(() => {
    // Only proceed if user is authenticated
    if (!user) {
      return;
    }
    
    // If we have a project ID in the URL (either 'id' or 'edit' param), load that project
    const targetProjectId = urlProjectId || editProjectId;
    if (targetProjectId) {
      if (projectId !== targetProjectId) {
        setProjectId(targetProjectId);
      }
      return;
    }
    
    // Otherwise, create a new project when the Create page loads
    // Only create if we don't have a projectId already
    if (!projectId && !targetProjectId && !createProjectMutation.isPending) {
      createProjectMutation.mutate();
    }
  }, [user, urlProjectId, editProjectId, projectId, createProjectMutation]); // Include projectId to prevent duplicate creation

  // Handle edit session changes - jump to step 3 when a new edit session starts
  useEffect(() => {
    if (project && isEditMode && editSessionId && editSessionId !== currentEditSession) {
      // New edit session detected - jump to Scene Generation
      if (project.scenePrompts && project.scenePrompts.length > 0) {
        setCurrentStep(3);
        setCurrentEditSession(editSessionId);
        // Update backend to step 3 so sync effect doesn't overwrite
        handleStepChange(3);
      }
    } else if (!isEditMode) {
      // Clear edit session when leaving edit mode
      setCurrentEditSession(null);
    }
  }, [project, isEditMode, editSessionId, currentEditSession]);

  // Sync current step with project's step (except during edit session initialization)
  useEffect(() => {
    if (project && !isEditMode) {
      // Don't sync backwards when we've just advanced (PATCH in flight, project not updated yet).
      // Step 4+: prevents unmounting VideoGenerationStep while video is generating.
      // Step 3: prevents reverting to step 2 when user clicked Next from character step.
      if (currentStep >= 3 && project.currentStep < currentStep) {
        return;
      }
      setCurrentStep(project.currentStep);
    } else if (project && isEditMode && editSessionId && currentEditSession && editSessionId === currentEditSession) {
      // Edit mode: only sync AFTER edit session is fully initialized
      // Don't override if we just set it to 3 and backend hasn't caught up yet
      if (currentStep === 3 && project.currentStep !== 3) {
        // We just jumped to step 3, backend hasn't updated yet - don't sync
        return;
      }
      setCurrentStep(project.currentStep);
    }
  }, [project?.currentStep, isEditMode, editSessionId, currentEditSession, currentStep]);

  const resetProject = () => {
    // Force create a completely new project and reset all state
    setCurrentStep(1);
    setProjectId(""); // Clear current project ID
    setCurrentEditSession(null); // Clear edit session
    // Clear the edit query param from URL and navigate to /create
    setLocation('/create');
    createProjectMutation.mutate(); // Create a new project
  };

  // If user is not authenticated, show loading or redirect to auth
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing project...</p>
          {createProjectMutation.error && (
            <p className="text-red-500 mt-2">
              Error creating project: {createProjectMutation.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" data-testid="home-page">
      <NavigationHeader currentPage="home" />

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">

        {currentStep === 1 && (
          <AudioCreationStep
            projectId={projectId}
            audioUrl={project?.audioUrl}
            aspectRatio={project?.aspectRatio}
            projectAddSubtitles={(project as any)?.addSubtitles}
            projectSubtitleStyle={(project as any)?.subtitleStyle}
            projectIncludeWatermark={(project as any)?.includeWatermark}
            projectIsPublic={(project as any)?.isPublic}
            onNext={() => {
              // Skip step 2 (character) for instrumental/lyric videos
              const isInstrumental = (project as any)?.isInstrumental || false;
              handleStepChange(isInstrumental ? 3 : 2);
            }}
            onReset={resetProject}
          />
        )}

        {currentStep === 2 && !((project as any)?.isInstrumental) && (
          <CharacterCreationStep
            projectId={projectId}
            characterImageUrl={project?.characterImageUrl}
            makeCharacterSing={project?.makeCharacterSing}
            onNext={() => handleStepChange(3)}
            onBack={() => handleStepChange(1)}
            onReset={resetProject}
          />
        )}

        {currentStep === 3 && (
          <SceneGenerationStep
            projectId={projectId}
            audioDuration={project?.audioDuration}
            audioUrl={project?.audioUrl}
            audioLyrics={(project as any)?.audioLyrics}
            textOverlay={(project as any)?.textOverlay}
            subtitleFileUrl={(project as any)?.subtitleFileUrl}
            characterImageUrl={project?.characterImageUrl}
            scenes={project?.scenePrompts?.map((prompt, index) => ({
              prompt,
              imageUrl: project.sceneImages?.[index] || "",
              videoUrl: project.videoSegments?.[index] || undefined
            }))}
            sceneOrder={(project as any)?.sceneOrder}
            initialVideoQuality={(project as any)?.videoQuality || "quick"}
            isEditMode={isEditMode}
            finalVideoUrl={isEditMode ? project?.finalVideoUrl : undefined}
            aspectRatio={project?.aspectRatio}
            isInstrumental={(project as any)?.isInstrumental || false}
            onNext={() => handleStepChange(4)}
            onBack={() => {
              // Go back to step 1 for instrumental/lyric videos, step 2 for character videos
              const isInstrumental = (project as any)?.isInstrumental || false;
              handleStepChange(isInstrumental ? 1 : 2);
            }}
            onReset={resetProject}
          />
        )}

        {(currentStep === 4 || currentStep === 5) && (
          <VideoGenerationStep
            projectId={projectId}
            onVideoComplete={(videoUrl) => {
              // Video generation backend already updates project to step 6
              // Update local state immediately to prevent SceneGenerationStep from mounting
              setCurrentStep(6);
              // Then refetch to get the updated project state
              refetchProject();
            }}
            onBack={() => handleStepChange(3)}
            onReset={resetProject}
          />
        )}

        {currentStep === 6 && project?.finalVideoUrl && (
          <VideoResultStep
            projectId={projectId}
            videoUrl={project.finalVideoUrl}
            muxPlaybackId={(project as any)?.muxPlaybackId ?? null}
            muxAssetStatus={(project as any)?.muxAssetStatus ?? null}
            bunnyEmbedUrl={(project as any)?.bunnyEmbedUrl ?? null}
            onCreateNew={resetProject}
            aspectRatio={project?.aspectRatio}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
