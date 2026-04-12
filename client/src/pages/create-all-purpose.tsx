import { useRef, useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Video,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  X,
  Sparkles,
  User,
  Ratio,
  Library,
  AlertTriangle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog, SceneData } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { isFreePlanUser } from "@/lib/plan-utils";
import { FreePlanVideoUpsellParagraph } from "@/components/free-plan-video-upsell";
import { Progress } from "@/components/ui/progress";
import { StandaloneCharacterCreator } from "@/components/standalone-character-creator";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { AllPurposeSceneReview } from "@/components/all-purpose-scene-review";
import { ResponsiveFinalVideo } from "@/components/responsive-final-video";
import {
  ALL_PURPOSE_ASPECT_RATIOS,
  ALL_PURPOSE_IMAGE_SIZE_BY_ASPECT,
  type AllPurposeAspectRatio,
} from "@shared/allPurposeAspect";
import { checkProfanity, getCategoryMessage } from "@/lib/profanity-filter";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ALL_PURPOSE_IDEAS = [
  "A promotional video for a luxury perfume brand: a blonde model in a sunlit fashion studio, holding an elegant bottle; slow-motion close-ups of the fragrance details; golden light and soft focus.",
  "A travel montage through Tokyo at night: neon-lit streets, bustling crosswalks, ramen shops, and temple gardens; cinematic drone shots transitioning from city to serene nature.",
  "An educational explainer about deep ocean life: bioluminescent creatures in the dark abyss, a submarine descending, scientists observing; narrated with calm authority.",
  "A product launch video for a new smartphone: sleek close-ups of the device, holographic UI animations, a person using it in various stylish urban settings.",
  "A fitness motivation video: an athlete training at sunrise on a mountain trail, pushing through challenges, crossing the finish line; epic cinematic angles.",
  "A cooking tutorial for homemade pasta: close-ups of flour and eggs, kneading dough, rolling and cutting, a beautiful final plated dish with steam rising.",
  "A real estate showcase of a modern penthouse: sweeping drone shots of the exterior, elegant interior walkthroughs, sunset views from the terrace.",
  "A wedding highlight reel: getting ready moments, ceremony under string lights, first dance, confetti toss; warm golden tones and emotional close-ups.",
  "A sci-fi short film teaser: a lone astronaut discovers alien ruins on a distant planet; dramatic lighting, slow reveals, and mysterious atmosphere.",
  "A children's animated story: a brave little fox embarks on a journey through enchanted forests and friendly villages to find a lost star.",
];

type VideoModel = "seedance-v1.5-pro" | "wan-2.6" | "kling-v2.6-pro";
type Resolution = "720p" | "1080p";

const ASPECT_SELECT_ITEMS: { value: AllPurposeAspectRatio; label: string }[] = ALL_PURPOSE_ASPECT_RATIOS.map(
  (value) => ({
    value,
    label: `${value} (${ALL_PURPOSE_IMAGE_SIZE_BY_ASPECT[value].replace(/\*/g, "×")})`,
  }),
);

const VIDEO_MODELS: { value: VideoModel; label: string; quality: string; costPer10s: number }[] = [
  { value: "seedance-v1.5-pro", label: "Seedance v1.5 Pro", quality: "Good", costPer10s: 1000 },
  { value: "wan-2.6", label: "Wan 2.6", quality: "Very Good", costPer10s: 4000 },
  { value: "kling-v2.6-pro", label: "Kling v2.6 Pro", quality: "Very Good", costPer10s: 4000 },
];

export default function CreateAllPurpose() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();

  // Form state
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AllPurposeAspectRatio>("9:16");
  const [duration, setDuration] = useState<number[]>([20]);
  const [videoModel, setVideoModel] = useState<VideoModel>("seedance-v1.5-pro");
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [useAudio, setUseAudio] = useState(false);

  // Character image
  const [useCharacterImage, setUseCharacterImage] = useState(false);
  const [characterImageUrl, setCharacterImageUrl] = useState<string | null>(null);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [characterLibraryOpen, setCharacterLibraryOpen] = useState(false);

  // Reference images (up to 3)
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [pageStep, setPageStep] = useState<"form" | "scenes" | "generating" | "complete">("form");

  // Scene review state
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [sceneVideoPrompts, setSceneVideoPrompts] = useState<string[]>([]);
  const [sceneOrder, setSceneOrder] = useState<number[]>([]);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", generatedProjectId],
    enabled: !!generatedProjectId,
    refetchInterval: (query) => {
      const proj = query.state.data;
      if (proj?.isCompleted) return false;
      return 5000;
    },
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

  // Credit calculation
  const selectedModel = VIDEO_MODELS.find(m => m.value === videoModel)!;
  const segments = Math.max(1, Math.ceil(duration[0] / 10));
  const resolutionMultiplier = resolution === "1080p" ? 2 : 1;
  const creditCost = segments * selectedModel.costPer10s * resolutionMultiplier;
  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;

  const hasPrompt = !!prompt.trim();
  const promptProfanity = useMemo(() => checkProfanity(prompt), [prompt]);
  const promptContentAllowed = promptProfanity.isClean;

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/all-purpose", {
        prompt,
        aspectRatio,
        duration: duration[0],
        videoModel,
        resolution,
        useAudio,
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        characterImageUrl: useCharacterImage && characterImageUrl ? characterImageUrl : undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.projectId) {
        setGeneratedProjectId(data.projectId);
        setPageStep("generating");
      }
      toast({
        title: "Video Generation Started!",
        description: data.message || "Your video is being created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive",
      });
    },
  });

  const generateClipsMutation = useMutation({
    mutationFn: async () => {
      if (!generatedProjectId) throw new Error("No project");
      const response = await apiRequest("POST", `/api/all-purpose/${generatedProjectId}/generate-clips`, {
        sceneOrder,
        scenePrompts: scenes.map((s) => s.prompt),
      });
      return response.json();
    },
    onSuccess: () => {
      setPageStep("generating");
      toast({ title: "Video generation started!" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive",
      });
    },
  });

  const canGenerate =
    hasPrompt &&
    promptContentAllowed &&
    !generateMutation.isPending &&
    (isAuthLoading || hasEnoughCredits);

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt describing your video",
        variant: "destructive",
      });
      return;
    }
    const profanityCheck = checkProfanity(prompt);
    if (!profanityCheck.isClean) {
      toast({
        title: "Content not allowed",
        description: getCategoryMessage(profanityCheck.category || ""),
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  const handleImageSelect = async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid File Type", description: "Please upload JPEG, PNG, or GIF images.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Please upload images under 5MB.", variant: "destructive" });
      return;
    }
    if (referenceImageUrls.length >= 3) {
      toast({ title: "Maximum Images", description: "You can attach up to 3 reference images.", variant: "destructive" });
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiRequest("POST", "/api/characters/upload", formData);
      const data = await response.json();
      setReferenceImageUrls(prev => [...prev, data.imageUrl]);
      toast({ title: "Image Attached", description: "Reference image uploaded successfully." });
    } catch (error: any) {
      toast({ title: "Image Upload Failed", description: error?.message || "Failed to upload image", variant: "destructive" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const isLongVideo = duration[0] > 10;

  // Detect when scenes are ready from project polling (long video path)
  useEffect(() => {
    if (
      pageStep === "generating" &&
      isLongVideo &&
      project &&
      (project as any).scenePrompts?.length > 0 &&
      (project as any).sceneImages?.length > 0 &&
      scenes.length === 0
    ) {
      const projScenePrompts: string[] = (project as any).scenePrompts || [];
      const projSceneImages: string[] = (project as any).sceneImages || [];
      const newScenes: SceneData[] = projScenePrompts.map((p, i) => ({
        prompt: p,
        imageUrl: projSceneImages[i] || "",
      }));
      setScenes(newScenes);
      setSceneOrder(newScenes.map((_, i) => i));

      // Extract video prompts from generation logs metadata
      const sceneGenLog = generationLogs?.find(
        (l) => l.step === "scene_generation" && l.status === "completed" && l.metadata?.sceneVideoPrompts,
      );
      if (sceneGenLog?.metadata?.sceneVideoPrompts) {
        setSceneVideoPrompts(sceneGenLog.metadata.sceneVideoPrompts);
      }

      setPageStep("scenes");
    }
  }, [pageStep, isLongVideo, project, scenes.length, generationLogs]);

  // Detect completion
  useEffect(() => {
    if (pageStep === "generating" && project?.isCompleted && project?.finalVideoUrl) {
      setPageStep("complete");
    }
  }, [pageStep, project?.isCompleted, project?.finalVideoUrl]);

  // If the character modal closes without a saved image, turn off "use character" mode
  useEffect(() => {
    if (!characterCreatorOpen && useCharacterImage && !characterImageUrl) {
      setUseCharacterImage(false);
    }
  }, [characterCreatorOpen, useCharacterImage, characterImageUrl]);

  // Generation progress helpers
  const sortedLogs = generationLogs?.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ) || [];

  const completedStepsMap = new Map<string, GenerationLog>();
  sortedLogs
    .filter(log => log.status === "completed")
    .forEach(log => {
      if (!completedStepsMap.has(log.step) ||
          new Date(log.createdAt) > new Date(completedStepsMap.get(log.step)!.createdAt)) {
        completedStepsMap.set(log.step, log);
      }
    });

  const completedSteps = Array.from(completedStepsMap.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(log => log.step);

  const currentStep = sortedLogs
    .filter(log => log.status === "progress")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const totalSteps = isLongVideo ? 5 : 4;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      "project_creation": "Setting up project",
      "scene_planning": "Planning scenes",
      "scene_generation": "Creating scene images",
      "video_generation": "Generating video",
      "video_merge": "Assembling final video",
    };
    return stepMap[step] || step;
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
              All Purpose / Long Format Video
            </h1>
            <p className="text-muted-foreground text-lg">
              Don't get limited by 10 second videos
            </p>
          </div>

          {pageStep === "form" && (
            <Card className="bg-card border-border mb-8">
              <CardHeader>
                <CardTitle className="text-foreground">Describe Your Video</CardTitle>
                <CardDescription>
                  Add a prompt, optionally set a character reference, then add reference images for products, scenes, or style if you need them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Prompt */}
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-foreground font-semibold shrink-0">Describe your video</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const idea = ALL_PURPOSE_IDEAS[Math.floor(Math.random() * ALL_PURPOSE_IDEAS.length)];
                      setPrompt(idea);
                      toast({ title: "Idea loaded", description: "Video idea filled. Edit if you like and continue." });
                    }}
                    title="Load a random video idea"
                    className="gap-1.5 shrink-0"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ideas
                  </Button>
                </div>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video concept, story, and visual style..."
                  className="min-h-[80px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
                {!promptProfanity.isClean && prompt.trim().length > 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {promptProfanity.category
                        ? getCategoryMessage(promptProfanity.category)
                        : "Please remove inappropriate content from your prompt before generating."}{" "}
                      Sexual, violent, hateful, or explicit requests are not allowed.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Character reference: one click on "Use Character…" opens the creator modal */}
                <div className="space-y-3">
                  <Label className="text-foreground font-semibold">Character reference</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={!useCharacterImage ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseCharacterImage(false);
                        setCharacterImageUrl(null);
                        setCharacterCreatorOpen(false);
                        setCharacterLibraryOpen(false);
                      }}
                      aria-pressed={!useCharacterImage}
                    >
                      No Character reference
                    </Button>
                    <Button
                      type="button"
                      variant={useCharacterImage ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseCharacterImage(true);
                        setCharacterLibraryOpen(false);
                        setCharacterCreatorOpen(true);
                      }}
                      aria-pressed={useCharacterImage}
                    >
                      <User className="h-4 w-4 mr-1.5" />
                      Use Character image for reference
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCharacterLibraryOpen(true);
                        setCharacterCreatorOpen(false);
                      }}
                      title="Choose a character from your library or public characters"
                    >
                      <Library className="h-4 w-4 mr-1.5" />
                      Library
                    </Button>
                  </div>
                  {useCharacterImage && characterImageUrl && (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={characterImageUrl}
                          alt="Character"
                          className="h-16 w-16 rounded-lg object-cover border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCharacterImageUrl(null);
                            setUseCharacterImage(false);
                          }}
                          className="absolute -top-1 -right-1 rounded-full bg-muted hover:bg-muted/80 p-0.5"
                          aria-label="Remove character reference"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCharacterCreatorOpen(true)}
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Change character
                      </Button>
                    </div>
                  )}
                </div>

                {/* Reference images — optional visual guidance (not the main character) */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-foreground font-semibold">Reference images</Label>
                    <p className="text-sm text-muted-foreground">
                      Optional — add up to 3 images to guide how{" "}
                      <span className="text-foreground/90">products</span>,{" "}
                      <span className="text-foreground/90">scenes</span>, or{" "}
                      <span className="text-foreground/90">visual styles</span> should look in your video. These are separate from the character reference above.
                    </p>
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file);
                      if (imageInputRef.current) imageInputRef.current.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploadingImage || referenceImageUrls.length >= 3}
                      title={referenceImageUrls.length >= 3 ? "Maximum 3 images" : "Add a reference image"}
                      className="gap-1.5"
                    >
                      {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                      Add reference image
                    </Button>
                    {referenceImageUrls.length > 0 && referenceImageUrls.length < 3 && (
                      <span className="text-xs text-muted-foreground">
                        {3 - referenceImageUrls.length} more allowed
                      </span>
                    )}
                  </div>
                  {referenceImageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {referenceImageUrls.map((url, index) => (
                        <div key={index} className="relative inline-flex items-center gap-2">
                          <img
                            src={url}
                            alt={`Reference ${index + 1}`}
                            className="h-12 w-12 rounded-lg object-cover border border-border"
                          />
                          <button
                            type="button"
                            onClick={() => removeReferenceImage(index)}
                            className="absolute -top-1 -right-1 rounded-full bg-muted hover:bg-muted/80 p-0.5"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Settings grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Aspect Ratio (drives Wan 2.7 text-to-image size and video framing) */}
                  <div className="space-y-2">
                    <Label className="text-foreground flex items-center gap-2">
                      <Ratio className="h-4 w-4" />
                      Aspect Ratio
                    </Label>
                    <Select
                      value={aspectRatio}
                      onValueChange={(value: AllPurposeAspectRatio) => setAspectRatio(value)}
                    >
                      <SelectTrigger className="bg-background border-border text-foreground">
                        <SelectValue placeholder="Select aspect ratio" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border max-h-[280px]">
                        {ASPECT_SELECT_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Text-to-image stills use Wan 2.7 at this resolution; edit-sequential uses the same pixel sizes when you attach reference images.
                    </p>
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <Label className="text-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Video Duration: {formatDuration(duration[0])}
                    </Label>
                    <Slider
                      value={duration}
                      onValueChange={setDuration}
                      min={5}
                      max={180}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>5s</span>
                      <span>3m</span>
                    </div>
                  </div>

                  {/* AI Video Model */}
                  <div className="space-y-2">
                    <Label className="text-foreground">AI Video Model</Label>
                    <Select value={videoModel} onValueChange={(value: VideoModel) => setVideoModel(value)}>
                      <SelectTrigger className="bg-background border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {VIDEO_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            ({model.quality}) {model.label} — {model.costPer10s.toLocaleString()} credits/10s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Resolution */}
                  <div className="space-y-2">
                    <Label className="text-foreground">Resolution</Label>
                    <Select value={resolution} onValueChange={(value: Resolution) => setResolution(value)}>
                      <SelectTrigger className="bg-background border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p (2x credits)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Use Audio toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    id="use-audio"
                    checked={useAudio}
                    onCheckedChange={setUseAudio}
                  />
                  <Label htmlFor="use-audio" className="text-sm font-medium cursor-pointer">
                    Use Audio (dialogue and sound effects)
                  </Label>
                </div>

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                  title={
                    !hasPrompt
                      ? "Add a prompt to enable"
                      : !promptContentAllowed
                        ? "Remove disallowed content from your prompt to generate"
                        : isAuthLoading
                          ? "Loading..."
                          : !hasEnoughCredits
                            ? `Not enough credits. Required: ${creditCost.toLocaleString()}, You have: ${userCreditsRemaining.toLocaleString()}`
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
                      Generate Video
                      <span className="ml-2 text-xs opacity-90">
                        ({creditCost.toLocaleString()} credits)
                      </span>
                    </>
                  )}
                </Button>

                {hasPrompt && !isAuthLoading && !hasEnoughCredits && (
                  <>
                    <FreePlanVideoUpsellParagraph user={user} />
                    {!isFreePlanUser(user) && (
                      <p className="text-center text-sm text-muted-foreground mt-3">
                        Credits Required: {creditCost.toLocaleString()} (You have{" "}
                        {userCreditsRemaining.toLocaleString()} remaining)
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Scene Review Step — same pattern as story-mode: timeline + scene cards with prompts */}
          {pageStep === "scenes" && generatedProjectId && (
            <AllPurposeSceneReview
              projectId={generatedProjectId}
              scenes={scenes}
              setScenes={setScenes}
              sceneOrder={sceneOrder}
              onSceneOrderChange={setSceneOrder}
              sceneVideoPrompts={sceneVideoPrompts}
              audioDuration={duration[0]}
              characterImageUrl={(project as { characterImageUrl?: string } | undefined)?.characterImageUrl}
              onBack={() => setPageStep("form")}
              onGenerateClips={() => generateClipsMutation.mutate()}
              generateClipsPending={generateClipsMutation.isPending}
            />
          )}

          {/* Generation Progress */}
          {(pageStep === "generating" || pageStep === "complete") && (
            <Card className="bg-card border-border mb-8">
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
                            <span>Starting video generation...</span>
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
                        <ResponsiveFinalVideo src={project.finalVideoUrl} />
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!project.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(project.finalVideoUrl, "video.mp4");
                                toast({ title: "Download started", description: "Your video is downloading." });
                              } catch {
                                toast({ title: "Download failed", description: "Could not download. Try opening the link.", variant: "destructive" });
                              }
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            Download Video
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

      {/* Character Creator Modal */}
      <StandaloneCharacterCreator
        isOpen={characterCreatorOpen}
        onClose={() => setCharacterCreatorOpen(false)}
        showAspectRatioPicker
        initialAspectRatio={aspectRatio}
        onCharacterGenerated={(result) => {
          setCharacterImageUrl(result.imageUrl);
          setUseCharacterImage(true);
          setCharacterCreatorOpen(false);
          toast({ title: "Character Selected", description: "Character image set as reference." });
        }}
      />

      <CharacterLibraryModal
        isOpen={characterLibraryOpen}
        onClose={() => setCharacterLibraryOpen(false)}
        onSelect={(character) => {
          setCharacterImageUrl(character.imageUrl);
          setUseCharacterImage(true);
          setCharacterLibraryOpen(false);
          toast({
            title: "Character selected",
            description: `${character.name} is set as your character reference.`,
          });
        }}
      />

      <Footer />
    </div>
  );
}
