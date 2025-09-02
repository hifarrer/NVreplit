import { useState, useEffect } from "react";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { AudioCreationStep } from "@/components/steps/audio-creation-step";
import { CharacterCreationStep } from "@/components/steps/character-creation-step";
import { SceneGenerationStep } from "@/components/steps/scene-generation-step";
import { VideoGenerationStep } from "@/components/steps/video-generation-step";
import { VideoResultStep } from "@/components/steps/video-result-step";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Project } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, User, Video, Home as HomeIcon, Music } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import logoImage from "@assets/neonlogo_1756693683433.png";

export default function Home() {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string>("");

  // Try to get user's current project first
  const { data: currentProject } = useQuery<Project>({
    queryKey: ["/api/current-project"],
    retry: false, // Don't retry if no project exists
  });

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

  // Initialize project logic: use existing project or create new one
  useEffect(() => {
    // Only proceed if user is authenticated
    if (!user) {
      return;
    }
    
    if (currentProject) {
      // User has an existing project, use it
      setProjectId(currentProject.id);
      setCurrentStep(currentProject.currentStep);
    } else if (currentProject === undefined) {
      // Still loading current project, wait
      return;
    } else {
      // No existing project (currentProject is null), create new one
      createProjectMutation.mutate();
    }
  }, [currentProject, user]);

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
    <div className="min-h-screen" data-testid="home-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16" 
                data-testid="app-logo"
              />
              <nav className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" disabled className="text-foreground">
                  <HomeIcon className="h-4 w-4 mr-2" />
                  Create
                </Button>
                <Link href="/my-songs">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Music className="h-4 w-4 mr-2" />
                    My Songs
                  </Button>
                </Link>
                <Link href="/my-videos">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Video className="h-4 w-4 mr-2" />
                    My Videos
                  </Button>
                </Link>
                <Link href="/characters">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <User className="h-4 w-4 mr-2" />
                    Characters
                  </Button>
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/profile">
                <div className="flex items-center space-x-2 hover:text-foreground cursor-pointer transition-colors">
                  <Avatar className="h-6 w-6">
                    {user?.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.username} />
                    ) : (
                      <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-secondary/20">
                        {user?.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="text-sm text-muted-foreground hover:text-foreground">{user?.username}</span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <ProgressIndicator currentStep={currentStep} />

        {currentStep === 1 && (
          <AudioCreationStep
            projectId={projectId}
            audioUrl={project?.audioUrl}
            onNext={() => handleStepChange(2)}
          />
        )}

        {currentStep === 2 && (
          <CharacterCreationStep
            projectId={projectId}
            characterImageUrl={project?.characterImageUrl}
            onNext={() => handleStepChange(3)}
            onBack={() => handleStepChange(1)}
          />
        )}

        {currentStep === 3 && (
          <SceneGenerationStep
            projectId={projectId}
            scenes={project?.scenePrompts?.map((prompt, index) => ({
              prompt,
              imageUrl: project.sceneImages?.[index] || ""
            }))}
            onNext={() => handleStepChange(4)}
            onBack={() => handleStepChange(2)}
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
    </div>
  );
}
