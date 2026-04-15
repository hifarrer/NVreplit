import { useRef, useState } from "react";
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
  Upload,
  X,
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
import { MotionControlTrimModal } from "@/components/modals/motion-control-trim-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_TRIM_SECONDS = 30;
type OutputAspectRatio = "9:16" | "16:9" | "1:1";
type InputVideoAspect = "landscape" | "portrait" | "square" | "unknown";

const STYLE_IDEAS = [
  { name: "Realistic Cinematic", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/realistic1.jpg", prompt: "ultra-realistic portrait, photorealistic skin texture, natural facial proportions, cinematic film style, cinematic dslr photography style, stylized as a full video look" },
  { name: "3D Animated", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/3danimted_film.jpg", prompt: "high-quality 3D animated character, soft studio lighting, smooth materials, subsurface scattering skin, expressive facial features, cinematic render, stylized video treatment" },
  { name: "3D Toon", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/3dtoon.jpg", prompt: "stylized 3D toon character, simplified shapes, smooth shading, vibrant colors, soft lighting, playful proportions, high quality render, full-scene video style" },
  { name: "Anime Clean Cel", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/anime_cleancel.jpg", prompt: "anime character style, clean cel shading, sharp lineart, expressive eyes, smooth gradients, vibrant colors, modern anime style, studio quality illustration, animated video look" },
  { name: "Anime Realistic", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/anime_realistic.jpg", prompt: "detailed anime style, semi-realistic anime, soft lighting, highly detailed eyes, smooth skin, painterly shading, high quality illustration, cinematic anime video mood" },
  { name: "Black and White", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/bnw.jpg", prompt: "film noir style, black and white, dramatic shadows, high contrast lighting, cinematic mood, monochrome video treatment" },
  { name: "Cartoon", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/cartoon.jpg", prompt: "2D cartoon style, hand-drawn animation style, clean bold outlines, flat colors, simple shading, expressive features, vibrant palette, classic animation look, music video aesthetic" },
  { name: "Clay", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/clay.jpg", prompt: "clay character style, stop-motion aesthetic, handcrafted look, soft lighting, subtle texture, playful proportions, stylized claymation video look" },
  { name: "Comic", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/comic.jpg", prompt: "comic book style, bold ink lines, dynamic poses, dramatic lighting, halftone texture, vibrant colors, graphic novel style, stylized video sequence" },
  { name: "Cyberpunk", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/cyberpunk.jpg", prompt: "cyberpunk character, neon lights, dark futuristic city vibe, high contrast lighting, glowing accents, dystopian atmosphere, cinematic cyberpunk video style" },
  { name: "Digital Painting", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/digitalpainting.jpg", prompt: "digital painting style, painterly brush strokes, soft blending, artistic lighting, high detail, concept art quality, professional illustration look across the full video" },
  { name: "Fantasy", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/fantasy.jpg", prompt: "fantasy illustration style, magical atmosphere, dramatic lighting, detailed costume and environment design, epic high fantasy artwork, cinematic fantasy video style" },
  { name: "Futuristic", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/futuristic.jpg", prompt: "futuristic sci-fi style, cyberpunk elements, neon accents, advanced technology aesthetic, cinematic lighting, high detail, futuristic video vibe" },
  { name: "Manga", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/manga.jpg", prompt: "manga style illustration, black and white, clean ink lines, screentone shading, high contrast, expressive linework, comic panel aesthetic, animated manga video look" },
  { name: "Oil Painting", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/oil_painting.jpg", prompt: "oil painting style, rich colors, visible brush strokes, classical fine art aesthetic, dramatic lighting, painterly video treatment" },
  { name: "Pixelated", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/pixelated.jpg", prompt: "pixel art style, retro 16-bit aesthetic, limited color palette, crisp pixels, video game sprite feel, stylized retro video look" },
  { name: "Punk", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/punk.jpg", prompt: "punk rock style, edgy fashion, bold attitude, dramatic lighting, gritty textures, high contrast, rebellious aesthetic, gritty music video treatment" },
  { name: "Retro", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/retro.jpg", prompt: "1970s retro style, warm golden tones, analog film grain, soft focus, stylish fashion, cinematic lighting, retro photography look, vintage music video atmosphere" },
  { name: "Steampunk", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/steampunk.jpg", prompt: "steampunk style, victorian-era aesthetic, brass and copper mechanical elements, intricate gears, leather and metal accessories, warm sepia tones, cinematic steampunk video look" },
  { name: "Watercolor", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/watercolor.jpg", prompt: "watercolor illustration style, soft washes, light paper texture, gentle colors, loose brush strokes, artistic hand-painted look across the video" },
  { name: "Ultra Surreal", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/Ultra_Surreal.jpg", prompt: "flowing reflective surfaces, organic motion, cinematic lighting, surreal aesthetic, dreamlike atmosphere, abstract video art style" },
  { name: "1980", thumbnail: "https://neonvideo.b-cdn.net/characterpublic/1980.jpg", prompt: "retro 1980s aesthetic, glowing highlights, soft film grain, dramatic backlighting, futuristic retro fashion, high contrast, synthwave-inspired video style" },
];

export default function CreateReimagine() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isConvertingYoutube, setIsConvertingYoutube] = useState(false);
  const [convertedYoutubeUrl, setConvertedYoutubeUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedStyleName, setSelectedStyleName] = useState<string | null>(null);
  const [outputAspectRatio, setOutputAspectRatio] = useState<OutputAspectRatio>("9:16");
  const [inputVideoAspect, setInputVideoAspect] = useState<InputVideoAspect>("unknown");

  const [showTrimModal, setShowTrimModal] = useState(false);
  const [trimVideoUrl, setTrimVideoUrl] = useState("");
  const [trimRange, setTrimRange] = useState<{ start: number; end: number } | null>(null);

  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [includeWatermark, setIncludeWatermark] = useState(true);

  const isPremiumUser = user?.plan?.name === "Premium";

  const videoInputRef = useRef<HTMLInputElement>(null);

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
      if (!prompt.trim()) throw new Error("Please enter a style prompt");
      const response = await apiRequest("POST", "/api/reimagine", {
        videoUrl: trimVideoUrl,
        prompt: prompt.trim(),
        startTime: trimRange.start,
        endTime: trimRange.end,
        aspectRatio: outputAspectRatio,
        inputVideoAspect,
        includeWatermark: isPremiumUser ? includeWatermark : true,
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[reimagine] Non-JSON response:", text.substring(0, 200));
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
        title: "Reimagine Generation Started!",
        description: data.message || "Your video is being created.",
      });
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate reimagine video",
        variant: "destructive",
      });
    },
  });

  const CREDITS_PER_15S = 1000;
  const trimDuration = trimRange ? trimRange.end - trimRange.start : 0;
  const creditCost = trimRange ? Math.ceil(trimDuration / 15) * CREDITS_PER_15S : CREDITS_PER_15S;
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

  const totalSteps = 6;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      project_creation: "Setting up project",
      youtube_conversion: "Converting YouTube video",
      video_trim: "Trimming video",
      audio_extraction: "Extracting audio",
      video_generation: "Generating restyled video",
      video_postprocess: "Merging audio, watermark and outro",
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
      const response = await apiRequest("POST", "/api/swap/upload-video", formData);
      const data = await response.json();
      if (!data.success || !data.videoUrl) {
        throw new Error(data.error || "Upload failed");
      }
      setUploadedVideoUrl(data.videoUrl);
      setTrimVideoUrl(data.videoUrl);
      const detectedAspect = await detectInputVideoAspect(data.videoUrl);
      setInputVideoAspect(detectedAspect);
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
    setInputVideoAspect("unknown");
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
        const detectedAspect = await detectInputVideoAspect(data.download_url);
        setInputVideoAspect(detectedAspect);
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
    const detectedAspect = await detectInputVideoAspect(url);
    setInputVideoAspect(detectedAspect);
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

  const handleGenerate = () => {
    if (!hasVideoSource) {
      toast({ title: "Video required", description: "Enter a video URL or upload a video file.", variant: "destructive" });
      return;
    }
    if (!prompt.trim()) {
      toast({ title: "Prompt required", description: "Please describe the style you want.", variant: "destructive" });
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
    !!prompt.trim() &&
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
              Reimagine
            </h1>
            <p className="text-muted-foreground">
              Transform the style of any video using an AI prompt — the original audio is preserved
            </p>
          </div>

          <VideoStyleCapabilityNotes variant="reimagine" className="mb-6" />

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Create Reimagine Video</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video
                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload a video file (max {MAX_VIDEO_SIZE_MB}MB), paste a direct .mp4 URL, or a YouTube link
                </p>

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

                {!videoFile && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="flex-1 border-t border-border" />
                    </div>

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
                      `Convert & Select Range (up to ${MAX_TRIM_SECONDS}s)`
                    ) : (
                      `Select Range (up to ${MAX_TRIM_SECONDS}s)`
                    )}
                  </Button>
                )}

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

              <div className="space-y-2">
                <Label className="text-foreground">Style Prompt</Label>
                <p className="text-xs text-muted-foreground">
                  Describe the visual style you want to apply to the video
                </p>
                <div className="max-h-[168px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {STYLE_IDEAS.map((idea) => {
                      const isSelected = selectedStyleName === idea.name;
                      return (
                        <button
                          key={idea.name}
                          type="button"
                          onClick={() => {
                            setPrompt(idea.prompt);
                            setSelectedStyleName(idea.name);
                          }}
                          className={`group relative rounded-md overflow-hidden border transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-border hover:border-primary/60"
                          }`}
                          title={idea.name}
                          aria-label={`Use ${idea.name} style idea`}
                        >
                          <img
                            src={idea.thumbnail}
                            alt={idea.name}
                            className="w-full aspect-square object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-[10px] leading-tight text-white truncate">
                            {idea.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Textarea
                  placeholder="e.g. cyberpunk character, neon lights, dark futuristic city vibe, high contrast lighting, glowing accents, dystopian atmosphere"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (selectedStyleName) {
                      setSelectedStyleName(null);
                    }
                  }}
                  rows={3}
                  className="bg-background border-border text-foreground resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Output Aspect Ratio</Label>
                <p className="text-xs text-muted-foreground">
                  Controls final export framing during post-processing merge.
                </p>
                <Select
                  value={outputAspectRatio}
                  onValueChange={(value) => setOutputAspectRatio(value as OutputAspectRatio)}
                >
                  <SelectTrigger className="w-full max-w-xs bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-6 py-3 px-4 bg-muted/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={includeWatermark}
                    onCheckedChange={setIncludeWatermark}
                    disabled={!isPremiumUser}
                    data-testid="reimagine-watermark-toggle"
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

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-amber-500">Note:</span> Reimagine generation typically takes{" "}
                <span className="font-semibold text-foreground">5–15 minutes</span>.
                You can leave this page and come back — your video will be ready in your projects.
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                title={
                  !hasVideoSource
                    ? "Upload a video or enter a URL first"
                    : !prompt.trim()
                      ? "Enter a style prompt"
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
                    Generate Reimagine Video
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
                      <span>Initializing reimagine generation...</span>
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
                          Reimagine can take 5–15 minutes. You can leave and come back — your video will appear in your projects when ready.
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
                        <p className="text-green-400 font-semibold">Your reimagined video is ready!</p>
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
                                await downloadFileFromUrl(project.finalVideoUrl, "reimagine.mp4");
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

      <MotionControlTrimModal
        isOpen={showTrimModal}
        videoUrl={trimVideoUrl}
        onClose={() => setShowTrimModal(false)}
        onConfirm={handleTrimConfirm}
        maxWindow={MAX_TRIM_SECONDS}
      />
    </div>
  );
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function detectInputVideoAspect(videoUrl: string): Promise<InputVideoAspect> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (aspect: InputVideoAspect) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      resolve(aspect);
    };

    const timeout = window.setTimeout(() => finish("unknown"), 6000);
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return finish("unknown");
      if (Math.abs(width - height) <= 2) return finish("square");
      return finish(width > height ? "landscape" : "portrait");
    };
    video.onerror = () => finish("unknown");
    video.src = videoUrl;
  });
}
