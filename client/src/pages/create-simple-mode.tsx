import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, Monitor, Smartphone, ArrowLeft, Clock, CheckCircle2, Edit, Image as ImageIcon, Upload, X, ChevronDown, ArrowUp, AlignVerticalSpaceAround, ArrowDown, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { VideoStyleCapabilityNotes } from "@/components/video-style-capability-notes";
import { Footer } from "@/components/footer";
import { Link, useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import { AudioTrimInterface } from "@/components/ui/audio-trim-interface";
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

const SIMPLE_MODE_IDEAS = [
  "A cyberpunk woman in a lonely Tokyo city: she stands by a rain-streaked window in a tiny apartment, neon signs glowing below; the story of someone waiting for a message that never comes; subtle steam from a cup, her gaze fixed on the street.",
  "A ninja cat warrior fighting for justice: perched on a rooftop at night in a feudal Japanese village, cape swaying gently in the breeze; the calm before a mission; only the slow turn of its head and the flick of an ear.",
  "A cowboy hamster living the farm life: sitting on a wooden porch at sunset, rocking chair moving slowly, vast wheat fields and a red barn in the distance; a quiet retirement after many adventures; dust motes in the golden light.",
  "A mermaid in a sunken cathedral: she floats in the middle of a ruined underwater church, rays of light from above, fish drifting past; a tale of lost faith and new beginnings; gentle sway of hair and tail, no rushing.",
  "A robot in an overgrown garden: it sits on a stone bench surrounded by wildflowers and ivy, once-tidy paths now reclaimed by nature; the last keeper of a forgotten place; its head tilts slightly toward a butterfly.",
  "A witch in a cottage kitchen: stirring a large pot by firelight, herbs hanging from the ceiling, a black cat dozing on the table; a cozy evening after a long day; she lifts the spoon slowly and tastes.",
  "A lone astronaut on a Mars outpost: standing at a large window, red desert and two moons outside; the weight of being the only one left; he barely moves, just watches the horizon.",
  "A samurai in a bamboo forest: kneeling by a still pond at dawn, mist between the trees; a moment of peace before a duel; his hand rests on his knee, breath visible in the cold air.",
  "A fox in a snowy shrine: sitting at the gate of a small Shinto shrine, snow falling softly, red torii and stone lanterns; guarding something precious through the winter; ears twitch at a distant sound.",
  "A detective in a 1940s diner: sitting in a booth with a cold coffee, night outside, neon reflected on the window; a case that won't close; she slowly flips through a small notebook.",
  "A baker in a Parisian bakery at dawn: taking a tray of croissants from the oven, flour dust in the air, copper pans on the wall; the quiet pride of the first batch; she sets the tray down and wipes her hands.",
  "A cosmic whale in the void: drifting through deep space with stars and nebulae around it; the last of its kind, carrying memories of a lost world; a slow, gentle pulse of light along its body.",
  "A geisha by a night pond: kneeling on the wooden walkway, lanterns reflected in the water, cherry blossoms on the surface; a private moment between performances; she dips a finger in the water.",
  "A knight at a crumbling castle window: standing in full armor, looking out over a misty valley at dusk; the war is over but peace is heavy; his hand rests on the stone sill.",
  "A jellyfish in a dark ocean trench: floating in the abyss, bioluminescent glow, other deep-sea creatures passing slowly; a journey through the unknown; soft pulsing, no fast movement.",
  "A librarian owl in an ancient library: perched on a ladder, one wing pulling a large book from a high shelf, candles and dust everywhere; guarding knowledge through the ages; it blinks and turns a page.",
  "A surfer on a calm ocean at sunset: sitting on the board, orange and pink sky, gentle waves; waiting for the next wave or just the moment; they look at the horizon, board bobbing slightly.",
  "A steampunk inventor at a workbench: bent over a delicate device, goggles pushed up, gears and pipes on the walls; solving the last piece of a long project; she adjusts a tiny screw with care.",
  "A phoenix on a volcanic cliff: perched on black rock, lava flowing slowly below, smoke and embers in the air; rebirth and patience; wings shift slightly, feathers glowing.",
  "A lone sailor on a foggy dock: sitting on a crate, rope and nets around, ship barely visible in the mist; the night before a long voyage; he stares at the water, pipe in hand.",
];

export default function CreateSimpleMode() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
  const [duration, setDuration] = useState<number[]>([30]);
  const [addSubtitles, setAddSubtitles] = useState<boolean>(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
  const [textPosition, setTextPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [fontFamily, setFontFamily] = useState<GoogleFont>(defaultGoogleFont);
  const [showCaptionStyles, setShowCaptionStyles] = useState(false);

  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  const [showTrimInterface, setShowTrimInterface] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewAudioDuration, setPreviewAudioDuration] = useState<number>(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploadingSong, setIsUploadingSong] = useState(false);
  const [isTrimmingSong, setIsTrimmingSong] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [trimmedDuration, setTrimmedDuration] = useState<number | null>(null);
  const [trimmedSubtitleFileUrl, setTrimmedSubtitleFileUrl] = useState<string | null>(null);

  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const songInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isPaidUser = !!(user?.plan && user.plan.monthlyPrice > 0);

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
      const response = await apiRequest("POST", "/api/simple-mode", {
        prompt,
        aspectRatio,
        duration: effectiveDuration,
        addSubtitles,
        subtitleStyle,
        textPosition,
        fontFamily,
        audioUrl: uploadedAudioUrl || undefined,
        subtitleFileUrl: trimmedSubtitleFileUrl || undefined,
        referenceImageUrl: referenceImageUrl || undefined,
      });
      const result = await response.json();
      if (result.projectId) {
        setGeneratedProjectId(result.projectId);
      }
      return result;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Video Generation Started!",
        description: data.message || "Your video is being created in the background.",
      });
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate video",
        variant: "destructive",
      });
    },
  });

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getVideoCreditCost = (durationSeconds: number) => {
    const units = Math.ceil(durationSeconds / 15);
    return Math.max(units, 1) * 1000;
  };

  const effectiveDuration = trimmedDuration ?? duration[0];
  const creditCost = getVideoCreditCost(effectiveDuration);
  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const hasEnoughCredits = userCreditsRemaining >= creditCost;

  const hasPrompt = !!prompt.trim();
  const hasSong = !!uploadedAudioUrl;
  const hasImage = !!referenceImageUrl;
  const canGenerate =
    hasPrompt &&
    hasSong &&
    hasImage &&
    !generateMutation.isPending &&
    (isAuthLoading || hasEnoughCredits);

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

  const totalSteps = 7;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      "project_creation": "Setting up project",
      "song_generation": "Creating song",
      "audio_trimming": "Preparing audio",
      "subtitle_generation": "Creating captions",
      "scene_planning": "Planning scenes",
      "scene_generation": "Creating scenes",
      "video_generation": "Assembling video",
    };
    return stepMap[step] || step;
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt describing your music video",
        variant: "destructive",
      });
      return;
    }
    if (!uploadedAudioUrl) {
      toast({
        title: "Song Required",
        description: "Please attach a song before generating.",
        variant: "destructive",
      });
      return;
    }
    if (!referenceImageUrl) {
      toast({
        title: "Image Required",
        description: "Please attach a reference image before generating.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  const resetAudioAttachment = () => {
    if (previewAudioUrl && previewAudioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewAudioUrl(null);
    setPendingFile(null);
    setShowTrimInterface(false);
    setUploadedAudioUrl(null);
    setTrimmedDuration(null);
    setTrimmedSubtitleFileUrl(null);
    setIsUploadingSong(false);
    setIsTrimmingSong(false);
    setUploadProgress(0);
    setUploadStatus("");
  };

  const handleSongSelect = (file: File) => {
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

    const previewUrl = URL.createObjectURL(file);
    setPendingFile(file);
    const audio = new Audio(previewUrl);
    audio.addEventListener("loadedmetadata", () => {
      setPreviewAudioDuration(audio.duration);
      setPreviewAudioUrl(previewUrl);
      setShowTrimInterface(true);
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(previewUrl);
      setPendingFile(null);
      toast({
        title: "Error",
        description: "Failed to load audio file. Please try another file.",
        variant: "destructive",
      });
    });
  };

  const handleTrimSong = async (startTime: number, endTime: number) => {
    if (!previewAudioUrl || !pendingFile) return;

    setIsTrimmingSong(true);
    setIsUploadingSong(true);
    setUploadStatus("Uploading audio file...");

    try {
      const projectResponse = await apiRequest("POST", "/api/projects", {
        title: "Simple Mode (Temporary)",
        description: "Temporary project for audio upload",
        aspectRatio,
        currentStep: 1,
        addSubtitles: false,
        subtitleStyle,
        fontFamily,
        isInstrumental: true,
      });
      const projectData = await projectResponse.json();
      const tempProjectId = projectData.id;

      const formData = new FormData();
      formData.append("audio", pendingFile);
      formData.append("addSubtitles", "false");
      formData.append("subtitleStyle", subtitleStyle);
      formData.append("aspectRatio", aspectRatio);

      const uploadData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete * 0.3);
            setUploadStatus("Uploading audio file...");
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
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed due to network error")));
        xhr.open("POST", `/api/projects/${tempProjectId}/upload-audio`);
        xhr.send(formData);
      });

      setUploadProgress(50);
      setUploadStatus("Trimming audio...");
      const trimResponse = await apiRequest("POST", `/api/projects/${tempProjectId}/trim-audio`, {
        audioUrl: uploadData.audioUrl,
        startTime,
        endTime,
        addSubtitles,
        subtitleStyle,
        lyrics: null,
        sourceSubtitleFileUrl: null,
      });
      const trimData = await trimResponse.json();

      setUploadProgress(100);
      setUploadStatus("Complete!");
      setUploadedAudioUrl(trimData.audioUrl);
      setTrimmedDuration(trimData.duration || null);
      setTrimmedSubtitleFileUrl(trimData.subtitleFileUrl || null);

      if (previewAudioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewAudioUrl);
      }
      setPreviewAudioUrl(null);
      setPendingFile(null);
      setShowTrimInterface(false);
      setIsTrimmingSong(false);
      setIsUploadingSong(false);
      setUploadProgress(0);
      setUploadStatus("");

      toast({
        title: "Song Attached",
        description: `Audio trimmed successfully (${formatDuration(trimData.duration || 0)}).`,
      });
    } catch (error: any) {
      setIsUploadingSong(false);
      setIsTrimmingSong(false);
      toast({
        title: "Upload/Trim Failed",
        description: error?.message || "Failed to upload and trim audio",
        variant: "destructive",
      });
    }
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
      setReferenceImageUrl(data.imageUrl);
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
              Simple Mode
            </h1>
            <p className="text-muted-foreground">
              Prompt-first music video creation with optional song and image attachments
            </p>
          </div>

          <VideoStyleCapabilityNotes variant="simple-mode" className="mb-6" />

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Describe Your Music Video</CardTitle>
              <CardDescription>
                Add a prompt and optionally attach a song and/or reference image.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-foreground font-semibold shrink-0">Describe your music video</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const idea = SIMPLE_MODE_IDEAS[Math.floor(Math.random() * SIMPLE_MODE_IDEAS.length)];
                    setPrompt(idea);
                    toast({
                      title: "Idea loaded",
                      description: "Music video idea filled. Edit if you like and continue.",
                    });
                  }}
                  title="Load a random music video idea"
                  data-testid="button-ideas"
                  className="gap-1.5 shrink-0"
                >
                  <Sparkles className="h-4 w-4" />
                  Ideas
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the character, mood, song vibe, and scene direction..."
                  className="min-h-[80px] bg-background border-border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-prompt"
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
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => songInputRef.current?.click()}
                    data-testid="button-attach-song"
                    title="Attach Song"
                    className={!uploadedAudioUrl ? "shadow-[0_0_10px_rgba(236,72,153,0.6),0_0_20px_rgba(236,72,153,0.4),0_0_30px_rgba(236,72,153,0.25)] border-pink-500/60" : ""}
                  >
                    <Music className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    data-testid="button-attach-image"
                    title="Attach Image"
                    className={!referenceImageUrl ? "shadow-[0_0_10px_rgba(236,72,153,0.6),0_0_20px_rgba(236,72,153,0.4),0_0_30px_rgba(236,72,153,0.25)] border-pink-500/60" : ""}
                  >
                    {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {showTrimInterface && previewAudioUrl && previewAudioDuration > 0 && (
                <AudioTrimInterface
                  audioUrl={previewAudioUrl}
                  audioDuration={previewAudioDuration}
                  onTrim={handleTrimSong}
                  onCancel={() => {
                    setShowTrimInterface(false);
                    if (previewAudioUrl.startsWith("blob:")) URL.revokeObjectURL(previewAudioUrl);
                    setPreviewAudioUrl(null);
                    setPendingFile(null);
                  }}
                  isTrimming={isTrimmingSong}
                  isPaidUser={isPaidUser}
                  fixedDuration={!isPaidUser ? 30 : undefined}
                />
              )}

              {(isUploadingSong || isTrimmingSong) && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{uploadStatus || "Processing..."}</span>
                    <span className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {(uploadedAudioUrl || referenceImageUrl) && (
                <div className="flex flex-wrap gap-2">
                  {uploadedAudioUrl && (
                    <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full text-sm">
                      <Upload className="h-3 w-3" />
                      Song attached ({formatDuration(trimmedDuration || 0)})
                      <button type="button" onClick={resetAudioAttachment}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {referenceImageUrl && (
                    <div className="relative inline-flex items-center gap-2">
                      <img
                        src={referenceImageUrl}
                        alt="Attached reference"
                        className="h-12 w-12 rounded-lg object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => setReferenceImageUrl(null)}
                        className="absolute -top-1 -right-1 rounded-full bg-muted hover:bg-muted/80 p-0.5"
                        aria-label="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                      <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {uploadedAudioUrl ? `Audio Duration: ${formatDuration(effectiveDuration)}` : `Video Duration: ${formatDuration(duration[0])}`}
                  </Label>
                  {uploadedAudioUrl ? (
                    <p className="text-sm text-muted-foreground">Using trimmed song duration for generation.</p>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
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
                          ? "shadow-[0_0_10px_rgba(236,72,153,0.5),0_0_20px_rgba(236,72,153,0.3),0_0_30px_rgba(236,72,153,0.2)] border-pink-500/50"
                          : ""
                      }`}
                      data-testid="caption-styles-button"
                    >
                      Styles
                      <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${showCaptionStyles ? "rotate-180" : ""}`} />
                    </Button>
                  )}
                </div>
                {addSubtitles && showCaptionStyles && (
                  <div className="flex items-center gap-2 flex-wrap">
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
                              return { color: "#ffffff", background: "#facc15" };
                            case "pink-bg":
                              return { color: "#ffffff", background: "#ec4899" };
                            case "blue-bg":
                              return { color: "#ffffff", background: "#3b82f6" };
                            case "red-bg":
                              return { color: "#ffffff", background: "#ef4444" };
                            default:
                              return { color: "#ffffff", background: "transparent" };
                          }
                        };
                        return (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() => setSubtitleStyle(option.value)}
                            className={`text-center p-2 rounded-md border transition-colors ${
                              subtitleStyle === option.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                            }`}
                            data-testid={`caption-style-${option.value}`}
                          >
                            <div className={option.value === "plain-white" ? "bg-gray-800 rounded-md p-1 inline-block" : ""}>
                              <div
                                className="text-xs font-bold text-center py-1 px-2 rounded-md inline-block"
                                style={{ ...getPreviewStyle(), fontFamily }}
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

              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                data-testid="button-generate"
                title={
                  !hasPrompt || !hasSong || !hasImage
                    ? "Add a prompt, song, and image to enable"
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
                    <Music className="mr-2 h-4 w-4" />
                    Generate Music Video
                    <span className="ml-2 text-xs opacity-90">
                      ({creditCost.toLocaleString()} credits)
                    </span>
                  </>
                )}
              </Button>

              {hasPrompt && hasSong && hasImage && !isAuthLoading && !hasEnoughCredits && (
                <p className="text-center text-sm text-muted-foreground mt-3">
                  You don&apos;t have enough credits for this video (need {creditCost.toLocaleString()}, you have {userCreditsRemaining.toLocaleString()}).{" "}
                  <Link href="/plans" className="text-primary font-medium hover:underline">
                    Subscribe to get more credits
                  </Link>
                </p>
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
                        <video controls className="w-full rounded-lg" src={project.finalVideoUrl} data-testid="video-player">
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
