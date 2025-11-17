import { useState, useEffect } from "react";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
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
  
  // Extract edit parameter and session timestamp from URL
  const urlParams = new URLSearchParams(location.split('?')[1]);
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
        title: "My Music Video",
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

  // Initialize project logic: create new project or load existing one in edit mode
  useEffect(() => {
    // Only proceed if user is authenticated
    if (!user) {
      return;
    }
    
    // If edit mode with a project ID, load that project
    if (editProjectId) {
      if (projectId !== editProjectId) {
        setProjectId(editProjectId);
      }
      return;
    }
    
    // Otherwise, create a new project when the Create page loads
    if (!projectId && !editProjectId) {
      createProjectMutation.mutate();
    }
  }, [user, editProjectId]); // Only depend on edit project ID, not timestamp

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
      // Normal mode: always sync with project step
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

  const resetProject = () => {
    // Force create a completely new project and reset all state
    setCurrentStep(1);
    setProjectId(""); // Clear current project ID
    setCurrentEditSession(null); // Clear edit session
    // Clear the edit query param from URL
    setLocation('/');
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
      <main className="container mx-auto px-4 py-8">
        <ProgressIndicator currentStep={currentStep} />

        {currentStep === 1 && (
          <AudioCreationStep
            projectId={projectId}
            audioUrl={project?.audioUrl}
            onNext={() => handleStepChange(2)}
            onReset={resetProject}
          />
        )}

        {currentStep === 2 && (
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
            scenes={project?.scenePrompts?.map((prompt, index) => ({
              prompt,
              imageUrl: project.sceneImages?.[index] || ""
            }))}
            onNext={() => handleStepChange(4)}
            onBack={() => handleStepChange(2)}
            onReset={resetProject}
          />
        )}

        {(currentStep === 4 || currentStep === 5) && (
          <VideoGenerationStep
            projectId={projectId}
            onVideoComplete={(videoUrl) => {
              // Video generation backend already updates project to step 6
              // Just refetch to get the updated project state
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
            onCreateNew={resetProject}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
