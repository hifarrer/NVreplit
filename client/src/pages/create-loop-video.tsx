import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, ArrowLeft, Upload, X, CheckCircle2, Link as LinkIcon, Sparkles, Library } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { VideoStyleCapabilityNotes } from "@/components/video-style-capability-notes";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { isFreePlanUser } from "@/lib/plan-utils";
import { FreePlanVideoUpsellParagraph } from "@/components/free-plan-video-upsell";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SongLibraryModal } from "@/components/song-library-modal";

const LOOP_VIDEO_IDEAS = [
  "A cyberpunk woman with short silver hair and a high-collared black coat walking slowly forward through a neon-lit Tokyo street at night. Rain-slicked pavement reflecting pink and blue signs, subtle steam rising. Cinematic, anamorphic look, minimal movement.",
  "A DJ goat wearing oversized headphones and a vintage bomber jacket, standing behind turntables at a dark nightclub. Purple and blue stage lights, smoke drifting slowly. Slight head nod to the beat, hands on the decks. Moody, intimate.",
  "A 3D animated astronaut cat in a white space suit floating gently in deep space. Earth visible in the background, stars everywhere. Very slow drift, helmet visor reflecting a soft glow. Cute, dreamy, minimal motion.",
  "A lone samurai in traditional dark blue hakama standing still in a misty bamboo forest. Morning light filtering through leaves, slight breeze moving his sleeves. Serene, contemplative, almost static.",
  "A mermaid with long auburn hair and iridescent scales resting on a rock in a calm turquoise lagoon. Sun rays from above, small fish swimming slowly. She turns her head slightly, hair drifting in water. Peaceful, underwater.",
  "A steampunk inventor in a brown leather apron and brass goggles tinkering at a cluttered desk. Warm lamp light, gears and pipes on the wall. He slowly picks up a small device and examines it. Cozy workshop.",
  "A fox in a velvet cloak standing in a snowy enchanted forest. Snow falling gently, glowing mushrooms and bare trees. The fox takes one slow step forward. Fairytale, soft lighting.",
  "A robot with a rounded chrome body and a single glowing eye sitting on a bench in an empty park at dusk. Autumn leaves on the ground, one leaf drifting past. It tilts its head slightly. Melancholic, quiet.",
  "A witch with wild curly hair and a long purple dress stirring a large cauldron in a candlelit stone cellar. Bubbles rising slowly, dried herbs hanging. She leans in to look. Cozy, magical.",
  "A phoenix made of ember and gold feathers perched on a cliff overlooking a volcanic landscape. Lava flowing slowly below, smoke in the air. Wings shift slightly, embers floating. Epic, warm tones.",
  "A young detective in a trench coat and fedora standing under a streetlamp in 1940s noir New York. Rain falling, neon diner sign across the street. He slowly turns to look off-screen. Film noir, high contrast.",
  "A giant friendly sloth wearing a tiny crown, hanging from a branch in a lush jungle. Parrots in the background, dappled sunlight. One arm moves slowly. Cute, tropical, relaxed.",
  "A geisha in an elaborate kimono with cherry blossom patterns kneeling by a still pond in a Japanese garden. Cherry petals floating on water, a single koi swimming. She barely moves, serene.",
  "A cosmic whale with galaxies and stars on its body swimming slowly through a deep blue void. Nebulae in the distance, small planets drifting. Gentle, majestic, minimal motion.",
  "A baker in a flour-dusted apron pulling a tray of golden croissants from an oven in a small Parisian bakery. Morning light through the window, copper pans on the wall. Satisfied smile, warm atmosphere.",
  "A lone cowboy in a duster coat standing at the edge of a vast desert canyon at golden hour. Wind barely moving his coat, vultures circling far away. He stares into the distance. Western, wide shot.",
  "A jellyfish with bioluminescent tendrils drifting in a dark deep-sea abyss. Other small creatures floating past, particles in the water. Hypnotic, slow pulse of light. Dreamy, blue and purple.",
  "A librarian owl in a tiny vest and spectacles perched on a ladder in an endless candlelit library. Ancient books, dust in the air. It slowly pulls one book out. Cozy, magical realism.",
  "A surfer in a wetsuit sitting on their board in calm ocean at sunset. Orange and pink sky, gentle waves. They look toward the horizon, board bobbing slightly. Peaceful, golden hour.",
  "A clockwork ballerina in a tattered pink tutu standing in an abandoned theater. Dusty red velvet seats, one spotlight. She slowly raises one arm. Melancholic, steampunk.",
];

export default function CreateLoopVideo() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"3:4" | "9:16" | "16:9">("3:4");
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploadingSong, setIsUploadingSong] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);

  const [showSongModal, setShowSongModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [songUrlInput, setSongUrlInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const songInputRef = useRef<HTMLInputElement>(null);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: generationLogs } = useQuery<GenerationLog[]>({
    queryKey: ["/api/projects", generatedProjectId, "logs"],
    enabled: !!generatedProjectId,
    refetchInterval: (query) => {
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
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/loop-video", {
        prompt,
        aspectRatio,
        audioUrl: uploadedAudioUrl || undefined,
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error("Server returned an unexpected response. Please try again.");
      }
      const result = await response.json();
      if (result.projectId) {
        setGeneratedProjectId(result.projectId);
      }
      return result;
    },
    onSuccess: (data: { message?: string; projectId?: string }) => {
      toast({
        title: "Loop Video Generation Started!",
        description: data.message || "Your seamless loop video is being created.",
      });
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate loop video",
        variant: "destructive",
      });
    },
  });

  const creditCost = 2000;
  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;

  const sortedLogs =
    generationLogs?.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ) || [];

  const completedStepsMap = new Map<string, GenerationLog>();
  sortedLogs
    .filter((log) => log.status === "completed")
    .forEach((log) => {
      if (
        !completedStepsMap.has(log.step) ||
        new Date(log.createdAt) > new Date(completedStepsMap.get(log.step)!.createdAt)
      ) {
        completedStepsMap.set(log.step, log);
      }
    });

  const completedSteps = Array.from(completedStepsMap.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((log) => log.step);

  const currentStep = sortedLogs
    .filter((log) => log.status === "progress")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const totalSteps = 8;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      project_creation: "Setting up project",
      image_generation: "Generating image",
      original_video: "Creating original video",
      frame_extraction: "Extracting frames",
      transition_video: "Creating transition video",
      merge: "Merging clip",
      video_loop: "Looping to audio length",
      upload: "Saving video",
    };
    return stepMap[step] || step;
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please describe your video or click Ideas for inspiration.",
        variant: "destructive",
      });
      return;
    }
    if (!uploadedAudioUrl) {
      toast({
        title: "Audio required",
        description: "Please provide an audio URL or upload audio first.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  const handleIdeasClick = () => {
    const idea = LOOP_VIDEO_IDEAS[Math.floor(Math.random() * LOOP_VIDEO_IDEAS.length)];
    setPrompt(idea);
    toast({ title: "Idea loaded", description: "Prompt filled. Add audio and click Generate when ready." });
  };

  const resetAudioAttachment = () => {
    setPendingFile(null);
    setUploadedAudioUrl(null);
    setIsUploadingSong(false);
    setUploadProgress(0);
    setUploadStatus("");
  };

  const validateAndHandleAudioFile = (file: File) => {
    const allowedTypes = ["audio/mpeg", "audio/wav", "audio/aac", "audio/mp3"];
    const isValidType = allowedTypes.includes(file.type) || file.name.match(/\.(mp3|wav|aac)$/i);
    if (!isValidType) {
      toast({
        title: "Invalid File Type",
        description: "Please select an MP3, WAV, or AAC audio file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    setPendingFile(file);
    handleUploadAudio(file);
  };

  const handleSongSelect = (file: File) => {
    validateAndHandleAudioFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    validateAndHandleAudioFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleUploadAudio = async (file: File) => {
    setIsUploadingSong(true);
    setUploadStatus("Uploading audio...");
    try {
      const projectResponse = await apiRequest("POST", "/api/projects", {
        title: "Loop Video (Temporary)",
        description: "Temporary project for audio upload",
        aspectRatio,
        currentStep: 1,
        addSubtitles: false,
        isInstrumental: true,
      });
      const projectData = await projectResponse.json();
      const tempProjectId = projectData.id;
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("addSubtitles", "false");
      formData.append("aspectRatio", aspectRatio);

      const uploadData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
            setUploadStatus("Uploading audio...");
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Failed to parse upload response"));
            }
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("POST", `/api/projects/${tempProjectId}/upload-audio`);
        xhr.send(formData);
      });

      setUploadedAudioUrl(uploadData.audioUrl);
      setUploadProgress(100);
      setUploadStatus("Complete!");
      setShowSongModal(false);
      setPendingFile(null);
      setIsUploadingSong(false);
      setUploadProgress(0);
      setUploadStatus("");
      toast({ title: "Audio attached", description: "Your full audio is ready. Click Generate when ready." });
    } catch (error: unknown) {
      setIsUploadingSong(false);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload audio",
        variant: "destructive",
      });
    }
  };

  const handleLoadSongFromUrl = () => {
    const url = songUrlInput.trim();
    if (!url) {
      toast({ title: "Enter a URL", description: "Please enter an MP3 or WAV URL.", variant: "destructive" });
      return;
    }
    const lower = url.toLowerCase();
    if (!lower.endsWith(".mp3") && !lower.endsWith(".wav")) {
      toast({
        title: "Invalid URL",
        description: "URL must end with .mp3 or .wav",
        variant: "destructive",
      });
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast({
        title: "Invalid URL",
        description: "URL must start with http:// or https://",
        variant: "destructive",
      });
      return;
    }
    setUploadedAudioUrl(url);
    setShowSongModal(false);
    setSongUrlInput("");
    toast({ title: "Audio URL set", description: "Your audio URL is ready. Click Generate when ready." });
  };

  const handleSelectSongFromLibrary = (song: { audioUrl: string; title?: string }) => {
    setUploadedAudioUrl(song.audioUrl);
    setShowLibraryModal(false);
    setShowSongModal(false);
    toast({ title: "Song selected", description: song.title ? `"${song.title}" from your library. Click Generate when ready.` : "Song from library selected. Click Generate when ready." });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />

      <main className="flex-1 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => navigate("/create")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Create
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Seamless Loop Video
            </h1>
            <p className="text-muted-foreground">
              Create a loopable video from a prompt and your song. We generate an image, turn it into a video, then create a smooth transition back to the start.
            </p>
          </div>

          <VideoStyleCapabilityNotes variant="loop-video" className="mb-6" />

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">What is your song about?</CardTitle>
              <CardDescription>
                Describe the video. Then add audio via URL or upload. Click Generate Loop Video to create your seamless loop.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 px-4 py-3 text-sm text-foreground">
                <p className="font-medium text-pink-500 dark:text-pink-400 mb-1">Audio</p>
                <p className="text-muted-foreground">
                  Use the <span className="font-medium text-foreground">music note button</span> to upload a song or paste an audio URL. The video will loop to match your full audio length. Generate unlocks once audio is attached.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the mood, scene, and style for your loop video (required)..."
                  className="min-h-[80px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
                <div className="flex flex-col gap-2 sm:justify-start">
                  <input
                    ref={songInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/aac,audio/mp3"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSongSelect(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSongModal(true)}
                    title="Add audio (URL or upload) — required"
                    className={
                      !uploadedAudioUrl
                        ? "border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] hover:border-pink-400"
                        : ""
                    }
                  >
                    <Music className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleIdeasClick}
                    title="Load a random prompt idea"
                    data-testid="button-ideas"
                    className="gap-1.5 shrink-0 w-full sm:w-auto"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ideas
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Prompt and audio are required. Use Ideas for a random prompt, or write your own. Subtle movement works best for seamless loops.
              </p>

              {isUploadingSong && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{uploadStatus || "Processing..."}</span>
                    <span className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {uploadedAudioUrl && (
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full text-sm">
                    <Upload className="h-3 w-3" />
                    Audio attached
                    <button type="button" onClick={resetAudioAttachment}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground">Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={(value: "3:4" | "9:16" | "16:9") => setAspectRatio(value)}>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select aspect ratio" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="3:4">Portrait (3:4)</SelectItem>
                    <SelectItem value="9:16">Vertical (9:16)</SelectItem>
                    <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !prompt.trim() || !uploadedAudioUrl || !hasEnoughCredits}
                className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                title={
                  !prompt.trim()
                    ? "Add a prompt (or click Ideas)"
                    : !uploadedAudioUrl
                      ? "Add audio first"
                      : !hasEnoughCredits
                        ? `Not enough credits (need ${creditCost.toLocaleString()}, you have ${userCreditsRemaining.toLocaleString()})`
                        : undefined
                }
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Video className="mr-2 h-4 w-4" />
                    Generate Loop Video
                    <span className="ml-2 text-xs opacity-90">({creditCost.toLocaleString()} credits)</span>
                  </>
                )}
              </Button>

              {uploadedAudioUrl && !hasEnoughCredits && (
                <>
                  <FreePlanVideoUpsellParagraph user={user} />
                  {!isFreePlanUser(user) && (
                    <p className="text-center text-sm text-muted-foreground mt-3">
                      Credits Required to Generate Video: {creditCost.toLocaleString()} (You have{" "}
                      {userCreditsRemaining.toLocaleString()} remaining)
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {(generatedProjectId || generateMutation.isPending) && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center">
                  <Video className="mr-2 h-5 w-5" />
                  Loop Video Progress
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
                      <span>Starting...</span>
                    </div>
                  </div>
                ) : project ? (
                  <div className="space-y-4">
                    {!project.isCompleted && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground font-medium">{Math.round(progressPercentage)}%</span>
                        </div>
                        <Progress value={Math.max(progressPercentage, 5)} className="h-2" />
                        {currentStep ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{currentStep.message}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Starting...</span>
                          </div>
                        )}
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
                    )}

                    <div className="space-y-2">
                      <p className="text-foreground">
                        <span className="font-semibold">Status:</span>{" "}
                        {project.isCompleted ? (
                          <span className="text-green-400">Completed</span>
                        ) : (
                          <span className="text-yellow-400">Processing</span>
                        )}
                      </p>
                    </div>

                    {project.isCompleted && project.finalVideoUrl && (
                      <div className="space-y-2">
                        <p className="text-green-400 font-semibold">Your loop video is ready!</p>
                        <video controls className="w-full rounded-lg" src={project.finalVideoUrl}>
                          Your browser does not support the video tag.
                        </video>
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!project.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(project.finalVideoUrl, "loop-video.mp4");
                                toast({ title: "Download started", description: "Your video is downloading." });
                              } catch {
                                toast({
                                  title: "Download failed",
                                  description: "Try opening the link and saving from your browser.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            Download Video
                          </Button>
                          <Button onClick={() => navigate("/my-videos")} variant="outline" className="flex-1">
                            My Videos
                          </Button>
                          <Button onClick={() => navigate("/create")} variant="outline" className="flex-1">
                            Create New
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading project...
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

          <Dialog open={showSongModal} onOpenChange={setShowSongModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add audio</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Upload a file or paste a direct link to an MP3 or WAV file. The video will loop to match your full audio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <p className="text-sm text-muted-foreground mb-3">
                {isDragOver ? "Drop your audio file here" : "Drag and drop an audio file here"}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2"
                onClick={() => songInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Or click to browse
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-2">Or paste a URL</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="song-url-loop" className="text-foreground">
                Audio URL (MP3 or WAV)
              </Label>
              <Input
                id="song-url-loop"
                type="url"
                placeholder="https://example.com/song.mp3"
                value={songUrlInput}
                onChange={(e) => setSongUrlInput(e.target.value)}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && handleLoadSongFromUrl()}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={handleLoadSongFromUrl}
                disabled={!songUrlInput.trim()}
              >
                <LinkIcon className="h-4 w-4" />
                Use URL
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-2">Or select from library</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => setShowLibraryModal(true)}
            >
              <Library className="h-4 w-4" />
              Select from library
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SongLibraryModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        onSelectSong={handleSelectSongFromLibrary}
      />

      <Footer />
    </div>
  );
}
