import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, Monitor, Smartphone, Palette, ArrowLeft, Clock, Subtitles, ChevronDown, CheckCircle2, Edit, ArrowUp, AlignVerticalSpaceAround, ArrowDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import {
  defaultSubtitleStyle,
  isSubtitleStyle,
  subtitleStyleOptions,
  type SubtitleStyle,
} from "@shared/subtitleStyles";
import {
  popularGoogleFonts,
  defaultGoogleFont,
  isGoogleFont,
  type GoogleFont,
} from "@shared/googleFonts";
import { Progress } from "@/components/ui/progress";

export default function CreateSinglePrompt() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [style, setStyle] = useState<string>("3d");
  const [duration, setDuration] = useState<number[]>([30]); // Duration in seconds (15-180)
  const [addSubtitles, setAddSubtitles] = useState<boolean>(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
  const [textPosition, setTextPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [fontFamily, setFontFamily] = useState<GoogleFont>(defaultGoogleFont);
  const [showCaptionStyles, setShowCaptionStyles] = useState(false);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  // Fetch project details if we have a generated project
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch generation logs for progress tracking
  const { data: generationLogs } = useQuery<GenerationLog[]>({
    queryKey: ["/api/projects", generatedProjectId, "logs"],
    enabled: !!generatedProjectId,
    refetchInterval: (query) => {
      // Poll every 1 second if we have logs, 2 seconds if we don't have any yet
      const logs = query.state.data || [];
      return logs.length > 0 ? 1000 : 2000;
    },
    queryFn: async () => {
      if (!generatedProjectId) return [];
      const response = await apiRequest("GET", `/api/projects/${generatedProjectId}/logs`);
      return response.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { prompt: string; aspectRatio: string; style: string; duration: number; addSubtitles: boolean; subtitleStyle: string; textPosition: string; fontFamily: string }) => {
      const response = await apiRequest("POST", "/api/neon-single-prompt-custom", {
        prompt: data.prompt,
        aspectRatio: data.aspectRatio,
        style: data.style,
        duration: data.duration,
        addSubtitles: data.addSubtitles,
        subtitleStyle: data.subtitleStyle,
        textPosition: data.textPosition || "bottom",
        fontFamily: data.fontFamily
      });
      const result = await response.json();
      // Set project ID immediately so logs can start fetching
      if (result.projectId) {
        setGeneratedProjectId(result.projectId);
      }
      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Video Generation Started!",
        description: data.message,
      });
      // Project ID is already set in mutationFn, but ensure it's set here too
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: any) => {
      if (error.missing) {
        toast({
          title: "Incomplete Prompt",
          description: error.suggestion,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to generate video",
          variant: "destructive",
        });
      }
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt describing your music video",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({ prompt, aspectRatio, style, duration: duration[0], addSubtitles, subtitleStyle, textPosition, fontFamily });
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calculate credit cost based on duration
  // Pricing: 1000 credits for every 30 seconds of video (rounded down, minimum 1000)
  const getVideoCreditCost = (durationSeconds: number) => {
    const units = Math.floor(durationSeconds / 30);
    return Math.max(units, 1) * 1000; // Minimum 1000 credits
  };

  const creditCost = getVideoCreditCost(duration[0]);
  const userCreditsRemaining = user?.creditsRemaining || 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;

  // Map step names to user-friendly labels
  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      "project_creation": "Setting up project",
      "lyrics_generation": "Writing lyrics",
      "song_generation": "Creating song",
      "audio_trimming": "Preparing audio",
      "subtitle_generation": "Creating captions",
      "character_generation": "Creating character",
      "scene_planning": "Planning scenes",
      "scene_generation": "Creating scenes",
      "video_generation": "Assembling video",
    };
    return stepMap[step] || step;
  };

  // Get all logs sorted by creation time
  const sortedLogs = generationLogs?.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ) || [];

  // Get unique completed steps (only the latest completed log for each step)
  const completedStepsMap = new Map<string, GenerationLog>();
  sortedLogs
    .filter(log => log.status === "completed")
    .forEach(log => {
      // Keep the latest completed log for each step
      if (!completedStepsMap.has(log.step) || 
          new Date(log.createdAt) > new Date(completedStepsMap.get(log.step)!.createdAt)) {
        completedStepsMap.set(log.step, log);
      }
    });
  const completedSteps = Array.from(completedStepsMap.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(log => log.step);

  // Get current in-progress step (most recent progress log)
  const currentStep = sortedLogs
    .filter(log => log.status === "progress")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  // Calculate progress percentage based on completed steps
  const totalSteps = 9; // Total number of steps
  const progressPercentage = project?.isCompleted 
    ? 100 
    : Math.min((completedSteps.length / totalSteps) * 100, 95); // Cap at 95% until video is complete

  const examplePrompts = [
    {
      text: "A hyper realistic cyberpunk woman with neon blue hair singing 'Midnight City' in the rainy streets of Tokyo at night",
      style: "hyperrealistic",
      aspectRatio: "9:16" as const,
    },
    {
      text: "Create a cartoon music video about a cute little cowboy hamster singing 'Cowboy's Life' about adventures in the wild west desert",
      style: "cartoon",
      aspectRatio: "16:9" as const,
    },
    {
      text: "An anime magical girl with pink hair performing 'Starlight Dreams' while flying through a neon-lit futuristic city",
      style: "anime",
      aspectRatio: "9:16" as const,
    },
    {
      text: "A realistic jazz musician in a smoky 1920s speakeasy playing 'Midnight Blues' on saxophone",
      style: "realistic",
      aspectRatio: "16:9" as const,
    },
    {
      text: "A 3D animated astronaut panda floating in zero gravity performing 'Space Disco' inside a colorful space station",
      style: "3d",
      aspectRatio: "16:9" as const,
    },
    {
      text: "A hyper realistic rock singer with long hair performing 'Thunder Road' on stage with dramatic lighting and pyrotechnics",
      style: "hyperrealistic",
      aspectRatio: "16:9" as const,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      
      <main className="flex-1 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            className="mb-6"
            onClick={() => navigate("/create")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Create
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Single Prompt
            </h1>
            <p className="text-muted-foreground">
              Create a complete AI music video from a single prompt
            </p>
          </div>

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Describe Your Music Video</CardTitle>
              <CardDescription>
                Include a character description, song title, and video description. You can also choose the video orientation and character style below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Create a music video about a cute little cowboy hamster singing a song called 'Cowboy's Life' about adventures in the wild west."
                className="min-h-[120px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                data-testid="input-prompt"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    {aspectRatio === "16:9" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    Aspect Ratio
                  </Label>
                  <Select value={aspectRatio} onValueChange={(value: "16:9" | "9:16") => setAspectRatio(value)}>
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue placeholder="Select aspect ratio" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="16:9" className="text-foreground">
                        <span className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          Landscape (16:9)
                        </span>
                      </SelectItem>
                      <SelectItem value="9:16" className="text-foreground">
                        <span className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4" />
                          Portrait (9:16)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Character Style
                  </Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="3d" className="text-foreground">3D Animation</SelectItem>
                      <SelectItem value="cartoon" className="text-foreground">Cartoon</SelectItem>
                      <SelectItem value="anime" className="text-foreground">Anime</SelectItem>
                      <SelectItem value="realistic" className="text-foreground">Realistic</SelectItem>
                      <SelectItem value="hyperrealistic" className="text-foreground">Hyper Realistic</SelectItem>
                      <SelectItem value="artistic" className="text-foreground">Artistic</SelectItem>
                      <SelectItem value="radiant" className="text-foreground">Radiant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Video Duration: {formatDuration(duration[0])}
                </Label>
                <Slider
                  value={duration}
                  onValueChange={setDuration}
                  min={15}
                  max={180}
                  step={15}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>15s</span>
                  <span>3m</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="add-subtitles"
                      checked={addSubtitles}
                      onCheckedChange={setAddSubtitles}
                      data-testid="subtitles-toggle"
                    />
                    <Label htmlFor="add-subtitles" className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
                      Captions
                    </Label>
                    {addSubtitles && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCaptionStyles(!showCaptionStyles)}
                        className={`h-8 px-2 text-xs ml-2 transition-all ${
                          addSubtitles && !showCaptionStyles
                            ? 'shadow-[0_0_10px_rgba(236,72,153,0.5),0_0_20px_rgba(236,72,153,0.3),0_0_30px_rgba(236,72,153,0.2)] border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.7),0_0_25px_rgba(236,72,153,0.5),0_0_35px_rgba(236,72,153,0.3)]' 
                            : ''
                        }`}
                        data-testid="caption-styles-button"
                      >
                        Styles
                        <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showCaptionStyles ? 'rotate-180' : ''}`} />
                      </Button>
                    )}
                  </div>
                  {addSubtitles && showCaptionStyles && (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={textPosition === "top" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTextPosition("top")}
                          className={`h-8 w-8 p-0 ${textPosition === "top" ? "bg-primary" : ""}`}
                          title="Top"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant={textPosition === "center" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTextPosition("center")}
                          className={`h-8 w-8 p-0 ${textPosition === "center" ? "bg-primary" : ""}`}
                          title="Center"
                        >
                          <AlignVerticalSpaceAround className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant={textPosition === "bottom" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTextPosition("bottom")}
                          className={`h-8 w-8 p-0 ${textPosition === "bottom" ? "bg-primary" : ""}`}
                          title="Bottom"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <Select value={fontFamily} onValueChange={(value) => isGoogleFont(value) && setFontFamily(value)}>
                        <SelectTrigger className="bg-background border-border text-foreground h-8 w-[180px] text-xs">
                          <SelectValue placeholder="Select font" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border max-h-[300px]">
                          {popularGoogleFonts.map((font) => (
                            <SelectItem 
                              key={font.value} 
                              value={font.value} 
                              className="text-foreground"
                              style={{ fontFamily: font.value }}
                            >
                              {font.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                {addSubtitles && showCaptionStyles && (
                  <div className="bg-muted/30 border border-border rounded-lg p-4">
                    <Label className="text-sm font-semibold mb-3 block">Caption Style</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {subtitleStyleOptions.map((option) => {
                        const getPreviewStyle = () => {
                          switch (option.value) {
                            case "plain-white":
                              return {
                                color: "#ffffff",
                                background: "transparent",
                                textShadow: "0 2px 8px rgba(0, 0, 0, 0.9)",
                              };
                            case "yellow-bg":
                              return {
                                color: "#ffffff",
                                background: "#facc15",
                              };
                            case "pink-bg":
                              return {
                                color: "#ffffff",
                                background: "#ec4899",
                              };
                            case "blue-bg":
                              return {
                                color: "#ffffff",
                                background: "#3b82f6",
                              };
                            case "red-bg":
                              return {
                                color: "#ffffff",
                                background: "#ef4444",
                              };
                            default:
                              return {
                                color: "#ffffff",
                                background: "transparent",
                              };
                          }
                        };

                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => setSubtitleStyle(option.value)}
                            className={`text-center p-2 rounded-md border transition-colors ${
                              subtitleStyle === option.value
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                            data-testid={`caption-style-${option.value}`}
                          >
                            <div className={option.value === "plain-white" ? "bg-gray-800 rounded-md p-1 inline-block" : ""}>
                              <div 
                                className="text-xs font-bold text-center py-1 px-2 rounded-md inline-block"
                                style={{
                                  ...getPreviewStyle(),
                                  fontFamily: fontFamily,
                                }}
                              >
                                Hello
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-4 space-y-2">
                <p className="text-sm text-muted-foreground">Example prompts (click to use):</p>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {examplePrompts.map((example, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPrompt(example.text);
                        setStyle(example.style);
                        setAspectRatio(example.aspectRatio);
                      }}
                      className="w-full text-left justify-start border-border text-foreground hover:bg-muted h-auto py-2"
                      data-testid={`example-prompt-${index}`}
                    >
                      <div className="flex flex-col items-start gap-1 w-full">
                        <span className="text-xs text-primary">
                          {example.aspectRatio === "9:16" ? "Portrait" : "Landscape"} | {example.style.charAt(0).toUpperCase() + example.style.slice(1)}
                        </span>
                        <span className="text-foreground text-left whitespace-normal">{example.text}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !hasEnoughCredits}
                className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                data-testid="button-generate"
                title={!hasEnoughCredits ? `Not enough credits. Required: ${creditCost.toLocaleString()}, You have: ${userCreditsRemaining.toLocaleString()}` : undefined}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Generate Music Video
                    <span className="ml-2 text-xs opacity-90">
                      ({creditCost.toLocaleString()} credits)
                    </span>
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {(generatedProjectId || generateMutation.isPending) && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center">
                  <Video className="mr-2 h-5 w-5" />
                  Video Generation Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generateMutation.isPending && !generatedProjectId ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="text-foreground font-medium">0%</span>
                    </div>
                    <Progress value={5} className="h-2" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Initializing video generation...</span>
                    </div>
                  </div>
                ) : project ? (
                  <div className="space-y-4">
                    {/* Progress Bar - Always show when project exists and not completed */}
                    {!project.isCompleted ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground font-medium">{Math.round(progressPercentage)}%</span>
                        </div>
                        <Progress value={Math.max(progressPercentage, 5)} className="h-2" />
                        
                        {/* Current Step */}
                        {currentStep ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{currentStep.message}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Starting video generation...</span>
                          </div>
                        )}

                        {/* Completed Steps */}
                        {completedSteps.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground font-medium mb-1">Completed:</p>
                            {completedSteps.map((step) => {
                              const latestLog = completedStepsMap.get(step);
                              return (
                                <div key={step} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                  <span>{latestLog?.message || getStepLabel(step)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-foreground">
                        <span className="font-semibold">Title:</span> {project.title}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold">Status:</span>{" "}
                        {project.isCompleted ? (
                          <span className="text-green-400">✓ Completed</span>
                        ) : (
                          <span className="text-yellow-400">⏳ Processing</span>
                        )}
                      </p>
                    </div>

                    {project.isCompleted && project.finalVideoUrl && (
                      <div className="space-y-2">
                        <p className="text-green-400 font-semibold">Your video is ready!</p>
                        <video
                          controls
                          className="w-full rounded-lg"
                          src={project.finalVideoUrl}
                          data-testid="video-player"
                        >
                          Your browser does not support the video tag.
                        </video>
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                            if (!project.finalVideoUrl) return;
                            try {
                              await downloadFileFromUrl(project.finalVideoUrl, "music-video.mp4");
                              toast({ title: "Download started", description: "Your video is downloading." });
                            } catch {
                              toast({ title: "Download failed", description: "Could not download. Try opening the link and saving from your browser.", variant: "destructive" });
                            }
                          }}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            data-testid="button-download"
                          >
                            Download Video
                          </Button>
                          <Button
                            onClick={() => navigate(`/create/story-mode?edit=${project.id}&t=${Date.now()}`)}
                            variant="outline"
                            className="flex-1"
                            data-testid="button-edit"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => navigate("/create")}
                            variant="outline"
                            className="flex-1"
                          >
                            Create New
                          </Button>
                        </div>
                      </div>
                    )}

                    {!project.isCompleted && (
                      <div className="flex items-center text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating your music video... This may take a few minutes.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading project details...
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
