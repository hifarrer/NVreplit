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

export default function Home() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string>("");

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

  // Initialize project logic: always create a new project when page loads
  useEffect(() => {
    // Only proceed if user is authenticated
    if (!user) {
      return;
    }
    
    // Always create a new project when the Create page loads
    if (!projectId) {
      createProjectMutation.mutate();
    }
  }, [user]); // Only depend on user, not currentProject

  useEffect(() => {
    if (project) {
      setCurrentStep(project.currentStep);
    }
  }, [project]);

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
