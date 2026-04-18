import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Video,
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Upload,
  X,
  Library,
  User,
  Sparkles,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MotionControlTrimModal } from "@/components/modals/motion-control-trim-modal";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { StandaloneCharacterCreator } from "@/components/standalone-character-creator";

type MotionControlKlingModel = "standard" | "pro";

export default function CreateMotionControl() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isConvertingYoutube, setIsConvertingYoutube] = useState(false);
  const [convertedYoutubeUrl, setConvertedYoutubeUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  // Character creator state
  const [useCharacterImage, setUseCharacterImage] = useState(false);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);

  // Trim modal state
  const [showTrimModal, setShowTrimModal] = useState(false);
  const [trimVideoUrl, setTrimVideoUrl] = useState("");
  const [trimRange, setTrimRange] = useState<{ start: number; end: number } | null>(null);

  // Generation state
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [motionControlModel, setMotionControlModel] = useState<MotionControlKlingModel>("standard");

  const isPremiumUser = user?.plan?.name === "Premium";

  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!characterCreatorOpen && useCharacterImage && !imageUrl) {
      setUseCharacterImage(false);
    }
  }, [characterCreatorOpen, useCharacterImage, imageUrl]);

  const MAX_VIDEO_SIZE_MB = 250;
  const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

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
      if (!trimRange) throw new Error("Please select a video range first");
      const response = await apiRequest("POST", "/api/motion-control", {
        videoUrl: trimVideoUrl,
        imageUrl,
        prompt: prompt.trim() || undefined,
        startTime: trimRange.start,
        endTime: trimRange.end,
        includeWatermark: isPremiumUser ? includeWatermark : true,
        motionControlModel,
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[motion-control] Non-JSON response:", text.substring(0, 200));
        throw new Error("Server returned an unexpected response. Please try again.");
      }
      const result = await response.json();
      if (result.projectId) {
        setGeneratedProjectId(result.projectId);
      }
      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Motion Control Generation Started!",
        description: data.message || "Your video is being created.",
      });
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate motion control video",
        variant: "destructive",
      });
    },
  });

  const CREDITS_PER_7S = 2000;
  const trimDuration = trimRange ? trimRange.end - trimRange.start : 0;
  const baseCreditCost = trimRange ? Math.ceil(trimDuration / 7) * CREDITS_PER_7S : CREDITS_PER_7S;
  const creditCost =
    motionControlModel === "pro" ? baseCreditCost * 2 : baseCreditCost;
  const userCreditsRemaining = user?.creditsRemaining || 0;
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

  const totalSteps = 5;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      project_creation: "Setting up project",
      youtube_conversion: "Converting YouTube video",
      video_trim: "Trimming video",
      video_generation: "Generating motion control video",
      video_postprocess: "Applying watermark and outro",
      upload: "Saving video",
    };
    return stepMap[step] || step;
  };

  const isYouTubeUrl = (url: string) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch|shorts|embed)|youtu\.be\/)/i.test(url.trim());

  const effectiveVideoUrl = uploadedVideoUrl || convertedYoutubeUrl || videoUrl.trim();
  const hasVideoSource = !!effectiveVideoUrl || isYouTubeUrl(videoUrl);

  const handleVideoFileSelect = async (file: File) => {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      toast({
        title: "File Too Large",
        description: `Video exceeds ${MAX_VIDEO_SIZE_MB}MB. Please use a direct video URL instead.`,
        variant: "destructive",
      });
      return;
    }
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    const hasAllowedExt = /\.(mp4|mov|webm)$/i.test(file.name);
    if (!allowedTypes.includes(file.type) && !hasAllowedExt) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an MP4, MOV, or WebM video.",
        variant: "destructive",
      });
      return;
    }

    setVideoFile(file);
    setVideoUrl("");
    setTrimRange(null);
    setIsUploadingVideo(true);

    try {
      const formData = new FormData();
      formData.append("video", file);
      const response = await apiRequest("POST", "/api/motion-control/upload-video", formData);
      const data = await response.json();
      if (!data.success || !data.videoUrl) {
        throw new Error(data.error || "Upload failed");
      }
      setUploadedVideoUrl(data.videoUrl);
      setTrimVideoUrl(data.videoUrl);
      setShowTrimModal(true);
    } catch (error: any) {
      toast({
        title: "Video Upload Failed",
        description: error?.message || "Failed to upload video",
        variant: "destructive",
      });
      setVideoFile(null);
      setUploadedVideoUrl(null);
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const clearVideoFile = () => {
    setVideoFile(null);
    setUploadedVideoUrl(null);
    setTrimRange(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleOpenTrimModal = async () => {
    if (isYouTubeUrl(videoUrl) && !convertedYoutubeUrl) {
      setIsConvertingYoutube(true);
      try {
        const response = await apiRequest("POST", "/api/tools/youtube-to-mp4", {
          youtubeUrl: videoUrl.trim(),
        });
        const data = await response.json();
        if (!data.success || !data.download_url) {
          throw new Error(data.error || "YouTube conversion failed");
        }
        setConvertedYoutubeUrl(data.download_url);
        setTrimVideoUrl(data.download_url);
        setShowTrimModal(true);
        toast({ title: "YouTube Converted", description: "Video ready — select your range." });
      } catch (error: any) {
        toast({
          title: "YouTube Conversion Failed",
          description: error?.message || "Could not convert YouTube video to MP4",
          variant: "destructive",
        });
      } finally {
        setIsConvertingYoutube(false);
      }
      return;
    }

    const url = convertedYoutubeUrl || effectiveVideoUrl;
    if (!url) {
      toast({
        title: "Video required",
        description: "Please enter a video URL or upload a video file first.",
        variant: "destructive",
      });
      return;
    }
    setTrimVideoUrl(url);
    setShowTrimModal(true);
  };

  const handleTrimConfirm = (startTime: number, endTime: number) => {
    setTrimRange({ start: startTime, end: endTime });
    setShowTrimModal(false);
    toast({
      title: "Video range selected",
      description: `${formatTimeShort(startTime)} - ${formatTimeShort(endTime)} (${formatTimeShort(endTime - startTime)})`,
    });
  };

  const handleImageSelect = async (file: File) => {
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

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiRequest("POST", "/api/characters/upload", formData);
      const data = await response.json();
      setImageUrl(data.imageUrl);
      setUseCharacterImage(true);
      toast({
        title: "Image Attached",
        description: "Reference image uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Image Upload Failed",
        description: error?.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGenerate = () => {
    if (!hasVideoSource) {
      toast({ title: "Video required", description: "Enter a video URL or upload a video file.", variant: "destructive" });
      return;
    }
    if (!imageUrl) {
      toast({ title: "Image required", description: "Please attach a reference image.", variant: "destructive" });
      return;
    }
    if (!trimRange) {
      toast({ title: "Trim required", description: "Please select a video range first.", variant: "destructive" });
      return;
    }
    generateMutation.mutate();
  };

  const canGenerate =
    hasVideoSource &&
    !!imageUrl &&
    !!trimRange &&
    hasEnoughCredits &&
    !generateMutation.isPending &&
    !isUploadingVideo &&
    !isConvertingYoutube;

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
              Motion Control
            </h1>
            <p className="text-muted-foreground">
              Transfer motion from any video onto a reference image using AI
            </p>
          </div>

          <div className="mb-6 flex justify-center px-2">
            <img
              src="https://neonvideo.b-cdn.net/logos/motioncontrol.jpg"
              alt="How motion control works: combine a character image with motion from a reference video to create the final output"
              className="w-full max-w-3xl rounded-lg border border-border shadow-sm"
              loading="lazy"
            />
          </div>

          <VideoStyleCapabilityNotes variant="motion-control" className="mb-6" />

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Create Motion Control Video</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Video Input: Upload or URL */}
              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video
                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload a video file (max {MAX_VIDEO_SIZE_MB}MB), paste a direct .mp4 URL, or a YouTube link
                </p>

                {/* Upload button + file display */}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleVideoFileSelect(file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                {videoFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUploadingVideo ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : uploadedVideoUrl ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : null}
                      <span className="truncate text-foreground min-w-0">{videoFile.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        ({(videoFile.size / (1024 * 1024)).toFixed(1)}MB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearVideoFile}
                      disabled={isUploadingVideo}
                      className="shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={!!videoUrl.trim()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Video (MP4, MOV, WebM — max {MAX_VIDEO_SIZE_MB}MB)
                  </Button>
                )}

                {/* Or separator */}
                {!videoFile && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="flex-1 border-t border-border" />
                    </div>

                    {/* URL input */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://example.com/video.mp4 or YouTube link"
                        value={videoUrl}
                        onChange={(e) => {
                          setVideoUrl(e.target.value);
                          setTrimRange(null);
                          setConvertedYoutubeUrl(null);
                        }}
                        className="font-mono text-sm flex-1"
                      />
                    </div>
                  </>
                )}

                {/* Select Range button */}
                {hasVideoSource && !isUploadingVideo && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleOpenTrimModal}
                    disabled={isConvertingYoutube}
                  >
                    {isConvertingYoutube ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Converting YouTube video...
                      </>
                    ) : trimRange ? (
                      "Re-select Range"
                    ) : isYouTubeUrl(videoUrl) && !convertedYoutubeUrl ? (
                      "Convert & Select Range (up to 30s)"
                    ) : (
                      "Select Range (up to 30s)"
                    )}
                  </Button>
                )}

                {/* Trim badge */}
                {trimRange && (
                  <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full text-sm">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span>
                      {formatTimeShort(trimRange.start)} - {formatTimeShort(trimRange.end)} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setTrimRange(null)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      aria-label="Clear range"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Character reference */}
              <div className="space-y-3">
                <Label className="text-foreground font-semibold">Character reference</Label>
                <p className="text-xs text-muted-foreground">
                  Generate a full body character with AI, upload an image, or select from your library — the AI will apply video motion to this image
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={!useCharacterImage ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setUseCharacterImage(false);
                      setImageUrl(null);
                      setCharacterCreatorOpen(false);
                      setShowLibraryModal(false);
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
                      setShowLibraryModal(false);
                      setCharacterCreatorOpen(true);
                    }}
                    aria-pressed={useCharacterImage}
                  >
                    <User className="h-4 w-4 mr-1.5" />
                    Generate with AI
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1.5" />
                    )}
                    Upload Image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCharacterCreatorOpen(false);
                      setShowLibraryModal(true);
                    }}
                    title="Choose a character from your library or public characters"
                  >
                    <Library className="h-4 w-4 mr-1.5" />
                    Library
                  </Button>
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageSelect(file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                {imageUrl && (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt="Character"
                        className="h-16 w-16 rounded-lg object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl(null);
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

              {/* Prompt (optional) */}
              <div className="space-y-2">
                <Label className="text-foreground">Prompt (optional)</Label>
                <Textarea
                  placeholder="Describe how the motion should be applied..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="bg-background border-border text-foreground resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground" htmlFor="motion-control-model">
                  AI model
                </Label>
                <Select
                  value={motionControlModel}
                  onValueChange={(v) => setMotionControlModel(v as MotionControlKlingModel)}
                >
                  <SelectTrigger id="motion-control-model" className="w-full max-w-md bg-background">
                    <SelectValue placeholder="Choose model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (Kling v2.6)</SelectItem>
                    <SelectItem value="pro">Pro (Kling v2.6) — 2× credits</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pro uses the Kling motion-control Pro endpoint for higher quality; credit cost is double the Standard rate for the same clip length.
                </p>
              </div>

              {/* Watermark + outro (server uses ffmpegapi neonvideo merge after AI output) */}
              <div className="flex flex-wrap items-center gap-6 py-3 px-4 bg-muted/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={includeWatermark}
                    onCheckedChange={setIncludeWatermark}
                    disabled={!isPremiumUser}
                    data-testid="motion-control-watermark-toggle"
                  />
                  <Label
                    className="text-sm font-medium cursor-pointer"
                    onClick={() => isPremiumUser && setIncludeWatermark(!includeWatermark)}
                  >
                    Watermark
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  When on, your video is branded with a watermark and NeonVideo outro after generation. Outro is always added; Premium can turn the watermark off.
                </p>
              </div>
              {!isPremiumUser && (
                <p className="text-sm text-muted-foreground -mt-2">
                  Watermark removal is available on paid plans.
                </p>
              )}

              {/* Generation time note */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-amber-500">Note:</span> Motion control generation often takes <span className="font-semibold text-foreground">30–60 minutes</span> and can run longer when queues are busy.
                You can leave this page and come back — your video will be ready in your projects.
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                title={
                  !hasVideoSource
                    ? "Upload a video or enter a URL first"
                    : !imageUrl
                      ? "Attach a reference image"
                      : !trimRange
                        ? "Select a video range"
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
                    Generate Motion Control Video
                    <span className="ml-2 text-xs opacity-90">
                      ({creditCost.toLocaleString()} credits)
                    </span>
                  </>
                )}
              </Button>

              {!hasEnoughCredits && (
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

          {/* Generation Progress */}
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
                      <span>Initializing motion control generation...</span>
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
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Motion control can take an hour or more on busy days. You can leave and come back — your video will appear in your projects when ready.
                        </p>
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
                        <p className="text-green-400 font-semibold">Your motion control video is ready!</p>
                        <div className="mx-auto w-full max-w-sm md:max-w-md lg:max-w-lg">
                          <video controls className="w-full rounded-lg" src={project.finalVideoUrl}>
                            Your browser does not support the video tag.
                          </video>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!project.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(project.finalVideoUrl, "motion-control.mp4");
                                toast({ title: "Download started", description: "Your video is downloading." });
                              } catch {
                                toast({
                                  title: "Download failed",
                                  description: "Could not download. Try opening the link and saving from your browser.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            Download Video
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
                    Loading project details...
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />

      {/* Trim Modal */}
      <MotionControlTrimModal
        isOpen={showTrimModal}
        videoUrl={trimVideoUrl}
        onClose={() => setShowTrimModal(false)}
        onConfirm={handleTrimConfirm}
        maxWindow={30}
      />

      {/* Character Creator Modal */}
      <StandaloneCharacterCreator
        isOpen={characterCreatorOpen}
        onClose={() => setCharacterCreatorOpen(false)}
        showAspectRatioPicker
        initialAspectRatio="9:16"
        shotType="full body shot"
        promptHint="For motion control, full body shots work best. Be detailed about appearance, clothing, and pose."
        onCharacterGenerated={(result) => {
          setImageUrl(result.imageUrl);
          setUseCharacterImage(true);
          setCharacterCreatorOpen(false);
          toast({ title: "Character Selected", description: "Character image set as reference." });
        }}
      />

      {/* Character Library Modal */}
      <CharacterLibraryModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        onSelect={(character) => {
          setImageUrl(character.imageUrl);
          setUseCharacterImage(true);
          setShowLibraryModal(false);
          toast({
            title: "Character Selected",
            description: `Using "${character.name}" as reference image.`,
          });
        }}
      />
    </div>
  );
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
