import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Video,
  Plus,
  CheckCircle2,
  X,
  AlertTriangle,
  Clock,
  Ratio,
  Sparkles,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn, downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { Project, GenerationLog } from "@/lib/types";
import { ResponsiveFinalVideo } from "@/components/responsive-final-video";
import { FreePlanVideoUpsellParagraph } from "@/components/free-plan-video-upsell";
import { isFreePlanUser } from "@/lib/plan-utils";
import { checkProfanity, getCategoryMessage } from "@/lib/profanity-filter";

type AspectRatio = "9:16" | "16:9";
type SceneDuration = 5 | 10;

interface SceneState {
  id: string;
  startImageUrl: string | null; // Scene 1 = null; Scene N (>1) = previous scene's lastFrameUrl
  endImageUrl: string | null; // Generated/uploaded frame for this scene
  imagePrompt: string;
  imageAttachmentUrl: string | null;
  videoPrompt: string;
  videoUrl: string | null;
  lastFrameUrl: string | null;
  imageStatus: "idle" | "loading" | "error";
  videoStatus: "idle" | "loading" | "error";
  imageError: string | null;
  videoError: string | null;
}

const MAX_SCENES = 20;

const CREDITS_PER_VIDEO: Record<SceneDuration, number> = {
  5: 2000,
  10: 4000,
};

const newScene = (startImageUrl: string | null): SceneState => ({
  id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  startImageUrl,
  endImageUrl: null,
  imagePrompt: "",
  imageAttachmentUrl: null,
  videoPrompt: "",
  videoUrl: null,
  lastFrameUrl: null,
  imageStatus: "idle",
  videoStatus: "idle",
  imageError: null,
  videoError: null,
});

export default function CreateSceneGuided() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();

  const [sceneDuration, setSceneDuration] = useState<SceneDuration>(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [includeWatermark, setIncludeWatermark] = useState<boolean>(true);

  const [scenes, setScenes] = useState<SceneState[]>(() => [newScene(null)]);

  const [pageStep, setPageStep] = useState<"builder" | "generating" | "complete">("builder");
  const [finalProjectId, setFinalProjectId] = useState<string | null>(null);

  const { data: finalProject } = useQuery<Project>({
    queryKey: ["/api/projects", finalProjectId],
    enabled: !!finalProjectId,
    refetchInterval: (query) => {
      const proj = query.state.data;
      if (proj?.isCompleted) return false;
      return 5000;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: generationLogs } = useQuery<GenerationLog[]>({
    queryKey: ["/api/projects", finalProjectId, "logs"],
    enabled: !!finalProjectId,
    refetchInterval: (query) => {
      const proj = query.state.data;
      if ((proj as any)?.isCompleted) return false;
      return 2500;
    },
    queryFn: async () => {
      if (!finalProjectId) return [];
      const response = await apiRequest("GET", `/api/projects/${finalProjectId}/logs`);
      return response.json();
    },
  });

  // Transition to "complete" when final project finishes
  useEffect(() => {
    if (
      pageStep === "generating" &&
      finalProject?.isCompleted &&
      finalProject?.finalVideoUrl
    ) {
      setPageStep("complete");
    }
  }, [pageStep, finalProject?.isCompleted, finalProject?.finalVideoUrl]);

  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const creditsPerVideo = CREDITS_PER_VIDEO[sceneDuration];

  const updateScene = (index: number, patch: Partial<SceneState>) => {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const lastScene = scenes[scenes.length - 1];
  const canAddScene =
    !!lastScene &&
    !!lastScene.videoUrl &&
    !!lastScene.lastFrameUrl &&
    scenes.length < MAX_SCENES;

  const allScenesHaveVideos =
    scenes.length > 0 &&
    scenes.every(
      (s) => typeof s.videoUrl === "string" && s.videoUrl.trim().length > 0,
    );
  const noSceneGenerationInFlight = scenes.every(
    (s) => s.imageStatus !== "loading" && s.videoStatus !== "loading",
  );
  const canFinalize =
    pageStep === "builder" &&
    allScenesHaveVideos &&
    noSceneGenerationInFlight;

  const handleAddScene = () => {
    if (!canAddScene) return;
    const start = lastScene.lastFrameUrl ?? lastScene.videoUrl ?? null;
    setScenes((prev) => [...prev, newScene(start)]);
  };

  const handleRemoveScene = (index: number) => {
    if (index === 0) return; // Can't remove Scene 1
    setScenes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAttachImage = async (index: number, file: File) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload JPEG, PNG, or GIF images.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload images under 5MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiRequest("POST", "/api/characters/upload", formData);
      const data = await response.json();
      updateScene(index, { imageAttachmentUrl: data.imageUrl });
      toast({ title: "Image Attached" });
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload image",
        variant: "destructive",
      });
    }
  };

  const handleGenerateImage = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    const prompt = scene.imagePrompt.trim();
    if (!prompt) {
      toast({
        title: "Missing prompt",
        description: "Please describe the scene image.",
        variant: "destructive",
      });
      return;
    }
    const profanity = checkProfanity(prompt);
    if (!profanity.isClean) {
      toast({
        title: "Content not allowed",
        description: getCategoryMessage(profanity.category || ""),
        variant: "destructive",
      });
      return;
    }

    updateScene(index, { imageStatus: "loading", imageError: null });
    try {
      const response = await apiRequest("POST", "/api/scene-guided/generate-image", {
        prompt,
        aspectRatio,
        attachedImageUrl: scene.imageAttachmentUrl ?? undefined,
        // For Scene N (>1), pass the previous scene's last frame as reference so
        // the edit model preserves style/subject continuity.
        referenceImageUrl: scene.startImageUrl ?? undefined,
      });
      const data = await response.json();
      if (!data.imageUrl) {
        throw new Error("No image returned from server");
      }
      updateScene(index, {
        endImageUrl: data.imageUrl,
        imageStatus: "idle",
        // Invalidate any existing video for this scene since its frame just changed.
        videoUrl: null,
        lastFrameUrl: null,
      });
      toast({ title: "Scene image generated" });
    } catch (error: any) {
      updateScene(index, {
        imageStatus: "error",
        imageError: error?.message || "Failed to generate image",
      });
      toast({
        title: "Image generation failed",
        description: error?.message || "Failed to generate image",
        variant: "destructive",
      });
    }
  };

  const handleGenerateVideo = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    const isFirst = index === 0;

    // Scene 1: uses its generated endImageUrl as the start image (no end_image).
    // Scene N (>1): uses its startImageUrl (previous last frame) as the start
    //               and its endImageUrl as the end_image.
    const startImageUrl = isFirst ? scene.endImageUrl : scene.startImageUrl;
    const endImageUrl = isFirst ? undefined : scene.endImageUrl ?? undefined;

    if (!startImageUrl) {
      toast({
        title: "Missing image",
        description: isFirst
          ? "Generate the scene image first."
          : "Previous scene's last frame is missing.",
        variant: "destructive",
      });
      return;
    }
    if (!isFirst && !endImageUrl) {
      toast({
        title: "Missing end image",
        description: "Generate the last frame image for this scene first.",
        variant: "destructive",
      });
      return;
    }

    const prompt = scene.videoPrompt.trim();
    if (!prompt) {
      toast({
        title: "Missing video prompt",
        description: "Describe the motion for this scene.",
        variant: "destructive",
      });
      return;
    }
    const profanity = checkProfanity(prompt);
    if (!profanity.isClean) {
      toast({
        title: "Content not allowed",
        description: getCategoryMessage(profanity.category || ""),
        variant: "destructive",
      });
      return;
    }
    if (userCreditsRemaining < creditsPerVideo) {
      toast({
        title: "Not enough credits",
        description: `This scene video requires ${creditsPerVideo.toLocaleString()} credits.`,
        variant: "destructive",
      });
      return;
    }

    updateScene(index, { videoStatus: "loading", videoError: null });
    try {
      const response = await apiRequest("POST", "/api/scene-guided/generate-video", {
        startImageUrl,
        endImageUrl,
        prompt,
        duration: sceneDuration,
      });
      const data = await response.json();
      if (!data.videoUrl) {
        throw new Error("No video URL returned from server");
      }
      updateScene(index, {
        videoUrl: data.videoUrl,
        lastFrameUrl: data.lastFrameUrl ?? null,
        videoStatus: "idle",
      });
      toast({ title: "Scene video generated" });
    } catch (error: any) {
      updateScene(index, {
        videoStatus: "error",
        videoError: error?.message || "Failed to generate video",
      });
      toast({
        title: "Video generation failed",
        description: error?.message || "Failed to generate video",
        variant: "destructive",
      });
    }
  };

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const videoUrls = scenes
        .map((s) => (typeof s.videoUrl === "string" ? s.videoUrl.trim() : ""))
        .filter((u) => u.length > 0);
      if (videoUrls.length !== scenes.length || scenes.length === 0) {
        throw new Error("Generate a video for every scene before merging the final video.");
      }
      const response = await apiRequest("POST", "/api/scene-guided/finalize", {
        videoUrls,
        aspectRatio,
        includeWatermark,
        sceneDuration,
        scenePrompts: scenes.map((s) => s.videoPrompt),
        title: scenes[0]?.videoPrompt?.slice(0, 80) || "Scene Guided Video",
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.projectId) {
        setFinalProjectId(data.projectId);
        setPageStep("generating");
      }
      toast({
        title: "Final video generation started",
        description: data.message || "Merging your scenes...",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start final generation",
        variant: "destructive",
      });
    },
  });

  // Progress UI
  const sortedLogs = useMemo(
    () =>
      (generationLogs || []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [generationLogs],
  );
  const currentLog = sortedLogs.filter((l) => l.status === "progress").slice(-1)[0];
  const completedLogs = sortedLogs.filter((l) => l.status === "completed");
  const progressPercentage = finalProject?.isCompleted
    ? 100
    : Math.min(10 + completedLogs.length * 25, 95);

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
              Scene Guided Video
            </h1>
            <p className="text-muted-foreground text-lg">
              Build your video scene-by-scene with full control over each frame and motion.
            </p>
          </div>

          {pageStep === "builder" && (
            <>
              {/* Settings card */}
              <Card className="bg-card border-border mb-6">
                <CardHeader>
                  <CardTitle className="text-foreground">Video Settings</CardTitle>
                  <CardDescription>
                    These apply to every scene. Duration and aspect ratio are locked once you start
                    generating scenes below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Scene Duration
                      </Label>
                      <Select
                        value={String(sceneDuration)}
                        onValueChange={(v) => setSceneDuration(Number(v) as SceneDuration)}
                      >
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="5">
                            5 seconds — {CREDITS_PER_VIDEO[5].toLocaleString()} credits/scene
                          </SelectItem>
                          <SelectItem value="10">
                            10 seconds — {CREDITS_PER_VIDEO[10].toLocaleString()} credits/scene
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground flex items-center gap-2">
                        <Ratio className="h-4 w-4" />
                        Aspect Ratio
                      </Label>
                      <Select
                        value={aspectRatio}
                        onValueChange={(v) => setAspectRatio(v as AspectRatio)}
                      >
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                          <SelectItem value="16:9">16:9 (Horizontal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      id="watermark-toggle"
                      checked={includeWatermark}
                      onCheckedChange={setIncludeWatermark}
                    />
                    <Label htmlFor="watermark-toggle" className="text-sm font-medium cursor-pointer">
                      Add NeonVideo watermark to the final video
                    </Label>
                  </div>
                  {isFreePlanUser(user) && !includeWatermark && (
                    <Alert variant="default" className="py-2">
                      <AlertDescription className="text-xs">
                        Free accounts always include the watermark. Upgrade to Premium to remove it.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Scene cards — same grid density as edit-video scene step */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {scenes.map((scene, index) => (
                  <SceneEditorCard
                    key={scene.id}
                    scene={scene}
                    index={index}
                    creditsPerVideo={creditsPerVideo}
                    isFirst={index === 0}
                    onPromptChange={(v) => updateScene(index, { imagePrompt: v })}
                    onVideoPromptChange={(v) => updateScene(index, { videoPrompt: v })}
                    onAttachImage={(file) => handleAttachImage(index, file)}
                    onClearAttachment={() => updateScene(index, { imageAttachmentUrl: null })}
                    onGenerateImage={() => handleGenerateImage(index)}
                    onGenerateVideo={() => handleGenerateVideo(index)}
                    onRemoveScene={() => handleRemoveScene(index)}
                  />
                ))}
              </div>

              {/* Add scene + finalize */}
              <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddScene}
                  disabled={!canAddScene}
                  className="flex-1"
                  title={
                    !canAddScene
                      ? scenes.length >= MAX_SCENES
                        ? `Maximum ${MAX_SCENES} scenes`
                        : "Generate a video for the current scene first"
                      : "Add the next scene"
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Scene ({scenes.length}/{MAX_SCENES})
                </Button>
                <Button
                  type="button"
                  onClick={() => finalizeMutation.mutate()}
                  disabled={!canFinalize || finalizeMutation.isPending || isAuthLoading}
                  className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                  title={
                    !allScenesHaveVideos
                      ? "Generate a video for every scene first"
                      : !noSceneGenerationInFlight
                        ? "Wait for scene image or video generation to finish"
                        : undefined
                  }
                >
                  {finalizeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting final merge...
                    </>
                  ) : (
                    <>
                      <Video className="mr-2 h-4 w-4" />
                      Generate Final Video ({scenes.length} scene{scenes.length === 1 ? "" : "s"})
                    </>
                  )}
                </Button>
              </div>

              {!allScenesHaveVideos && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Each scene needs a generated video before you can merge the final video.
                </p>
              )}
              {userCreditsRemaining < creditsPerVideo && (
                <div className="mt-4">
                  <FreePlanVideoUpsellParagraph user={user} />
                </div>
              )}
            </>
          )}

          {(pageStep === "generating" || pageStep === "complete") && (
            <Card className="bg-card border-border mb-8">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center">
                  <Video className="mr-2 h-5 w-5" />
                  Final Video Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                {finalProject ? (
                  <div className="space-y-4">
                    {!finalProject.isCompleted && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground font-medium">
                            {Math.round(progressPercentage)}%
                          </span>
                        </div>
                        <Progress value={Math.max(progressPercentage, 5)} className="h-2" />
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{currentLog?.message || "Merging your scenes..."}</span>
                        </div>
                        {completedLogs.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/50">
                            {completedLogs.map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center gap-2 text-sm text-muted-foreground"
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                <span>{log.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {finalProject.isCompleted && finalProject.finalVideoUrl && (
                      <div className="space-y-2">
                        <p className="text-green-400 font-semibold">Your video is ready!</p>
                        <ResponsiveFinalVideo src={finalProject.finalVideoUrl} />
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!finalProject.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(finalProject.finalVideoUrl, "video.mp4");
                                toast({
                                  title: "Download started",
                                  description: "Your video is downloading.",
                                });
                              } catch {
                                toast({
                                  title: "Download failed",
                                  description: "Could not download. Try opening the link.",
                                  variant: "destructive",
                                });
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

      <Footer />
    </div>
  );
}

// ─── Scene editor card ──────────────────────────────────────────────────────

interface SceneEditorCardProps {
  scene: SceneState;
  index: number;
  creditsPerVideo: number;
  isFirst: boolean;
  onPromptChange: (v: string) => void;
  onVideoPromptChange: (v: string) => void;
  onAttachImage: (file: File) => void;
  onClearAttachment: () => void;
  onGenerateImage: () => void;
  onGenerateVideo: () => void;
  onRemoveScene: () => void;
}

const THUMB =
  "w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden border border-border";

function SceneEditorCard({
  scene,
  index,
  creditsPerVideo,
  isFirst,
  onPromptChange,
  onVideoPromptChange,
  onAttachImage,
  onClearAttachment,
  onGenerateImage,
  onGenerateVideo,
  onRemoveScene,
}: SceneEditorCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"image" | "video">("image");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const openPreview = (type: "image" | "video", url: string, title: string) => {
    setPreviewType(type);
    setPreviewUrl(url);
    setPreviewTitle(title);
    setPreviewOpen(true);
  };

  // First frame: scene 1 = generated start image; scene N = previous scene's last frame.
  const firstThumbUrl = isFirst ? scene.endImageUrl : scene.startImageUrl;
  // Last frame: scene 1 = extracted last frame after video (no separate end keyframe before video);
  // scene N = generated end_image for the clip.
  const lastThumbUrl = isFirst ? scene.lastFrameUrl : scene.endImageUrl;

  const firstThumbLoading = isFirst && scene.imageStatus === "loading";
  const lastThumbLoading = !isFirst && scene.imageStatus === "loading";

  const imagePromptLabel = isFirst ? "First frame image prompt" : "Last frame image prompt";
  const imagePromptPlaceholder = isFirst
    ? "Describe the opening frame of your video..."
    : "Describe the last frame that ends this scene...";

  const canGenerateImage = scene.imagePrompt.trim().length > 0 && scene.imageStatus !== "loading";
  const hasEndImage = !!scene.endImageUrl;
  const canGenerateVideo =
    scene.videoPrompt.trim().length > 0 &&
    scene.videoStatus !== "loading" &&
    (isFirst ? hasEndImage : hasEndImage && !!scene.startImageUrl);

  const busyImage = scene.imageStatus === "loading";
  const busyVideo = scene.videoStatus === "loading";

  return (
    <div
      className="bg-muted/20 rounded-lg p-4 border border-border relative"
      data-testid={`scene-guided-scene-${index + 1}`}
    >
      <div className="space-y-4">
        {/* Thumbnails + title (matches edit-video scene generation layout) */}
        <div className="flex items-center gap-3">
          {/* First frame */}
          <div
            className={cn(
              THUMB,
              "bg-gradient-to-br from-primary to-accent",
              firstThumbUrl && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow",
            )}
            onClick={() =>
              firstThumbUrl &&
              openPreview("image", firstThumbUrl, `Scene ${index + 1} — first frame`)
            }
            role={firstThumbUrl ? "button" : undefined}
            aria-label={
              firstThumbUrl ? `View scene ${index + 1} first frame larger` : undefined
            }
          >
            {firstThumbLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : firstThumbUrl ? (
              <img
                src={firstThumbUrl}
                alt={`Scene ${index + 1} first frame thumbnail`}
                className="w-full h-full object-cover rounded-lg pointer-events-none"
              />
            ) : (
              <ImageIcon className="w-6 h-6 text-white/40" />
            )}
          </div>

          {/* Last frame */}
          <div
            className={cn(
              THUMB,
              "bg-gradient-to-br from-primary/80 to-accent/80",
              lastThumbUrl && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow",
            )}
            onClick={() =>
              lastThumbUrl &&
              openPreview("image", lastThumbUrl, `Scene ${index + 1} — last frame`)
            }
            role={lastThumbUrl ? "button" : undefined}
            aria-label={
              lastThumbUrl ? `View scene ${index + 1} last frame larger` : undefined
            }
          >
            {lastThumbLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : lastThumbUrl ? (
              <img
                src={lastThumbUrl}
                alt={`Scene ${index + 1} last frame thumbnail`}
                className="w-full h-full object-cover rounded-lg pointer-events-none"
              />
            ) : (
              <ImageIcon className="w-6 h-6 text-white/30" />
            )}
          </div>

          {/* Video thumbnail */}
          <div
            className={cn(
              THUMB,
              "bg-gradient-to-br from-purple-500 to-pink-500",
              scene.videoUrl && "cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition-shadow",
            )}
            onClick={() =>
              scene.videoUrl &&
              openPreview("video", scene.videoUrl, `Scene ${index + 1} — video`)
            }
            role={scene.videoUrl ? "button" : undefined}
            aria-label={
              scene.videoUrl ? `View scene ${index + 1} video larger` : undefined
            }
          >
            {busyVideo ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : scene.videoUrl ? (
              <video
                src={scene.videoUrl}
                className="w-full h-full object-cover rounded-lg pointer-events-none"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              <Video className="w-6 h-6 text-white/40" />
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h5 className="font-semibold text-foreground truncate">Scene {index + 1}</h5>
            <Video className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          </div>

          {!isFirst && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemoveScene}
              title="Remove this scene"
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Frame image prompt — textarea + icon upload (matches simple-mode style) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground block">
            {imagePromptLabel}
          </label>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAttachImage(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <div className="flex gap-2 items-stretch">
            <Textarea
              value={scene.imagePrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={imagePromptPlaceholder}
              className="min-h-[100px] flex-1 min-w-0 resize-y text-sm bg-background border-border"
            />
            <div className="flex flex-col justify-center shrink-0 py-0.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={busyImage || busyVideo}
                title="Attach reference image (optional)"
                aria-label="Attach reference image"
                className={cn(
                  "h-11 w-11 rounded-lg border-pink-500/40 bg-background/90",
                  "shadow-[0_0_14px_rgba(236,72,153,0.35)] hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]",
                  "hover:border-pink-500/70 hover:bg-background",
                  scene.imageAttachmentUrl && "border-pink-500/80 ring-1 ring-pink-500/40",
                )}
              >
                <ImageIcon className="h-5 w-5 text-foreground" />
              </Button>
            </div>
          </div>
        </div>

        {/* Image options — same pattern as scene-generation-step (edit mode) */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Image Options:
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGenerateImage}
              disabled={!canGenerateImage || busyVideo}
              className="flex items-center gap-2"
            >
              {scene.imageStatus === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {scene.imageStatus === "loading"
                ? "Generating..."
                : hasEndImage
                  ? "Regenerate Image"
                  : "Generate Image"}
            </Button>
            {scene.imageAttachmentUrl && (
              <div className="relative inline-flex items-center">
                <img
                  src={scene.imageAttachmentUrl}
                  alt="Attachment"
                  className="h-9 w-9 rounded object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={onClearAttachment}
                  className="absolute -top-1 -right-1 rounded-full bg-muted hover:bg-muted/80 p-0.5"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          {scene.imageError && (
            <Alert variant="destructive" className="py-2 mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{scene.imageError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Scene prompt (video motion) */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Video Scene Prompt:
          </label>
          <Textarea
            value={scene.videoPrompt}
            onChange={(e) => onVideoPromptChange(e.target.value)}
            placeholder="Camera slowly zooms in, subject turns toward the light..."
            className="min-h-[100px] text-sm bg-background border-border"
          />
        </div>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateVideo}
            disabled={!canGenerateVideo || busyImage}
            className="flex items-center gap-2 w-full sm:w-auto bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30"
          >
            {scene.videoStatus === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Video...
              </>
            ) : scene.videoUrl ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Regenerate Video ({creditsPerVideo.toLocaleString()} credits)
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                Generate Video ({creditsPerVideo.toLocaleString()} credits)
              </>
            )}
          </Button>
          {scene.videoError && (
            <Alert variant="destructive" className="py-2 mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{scene.videoError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 pt-0 bg-muted/30 rounded-b-lg overflow-auto">
            {previewUrl && previewType === "image" && (
              <img
                src={previewUrl}
                alt={previewTitle}
                className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-lg"
              />
            )}
            {previewUrl && previewType === "video" && (
              <video
                src={previewUrl}
                className="max-w-full max-h-[70vh] w-auto h-auto rounded-lg shadow-lg"
                controls
                autoPlay
                muted
                loop
                playsInline
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
