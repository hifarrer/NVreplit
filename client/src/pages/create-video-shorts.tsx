import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, Video, Monitor, Smartphone, ArrowLeft, Upload, X, CheckCircle2, Sparkles, Link as LinkIcon, ChevronDown, ArrowUp, AlignVerticalSpaceAround, ArrowDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { useLocation } from "wouter";
import { Project, GenerationLog } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import { AudioTrimInterface } from "@/components/ui/audio-trim-interface";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

const VIDEO_SHORT_IDEAS = [
  {
    title: "Cosmic Dance Floor",
    prompt: "A translucent jellyfish DJ floating in deep outer space, its tentacles spinning glowing vinyl records, surrounded by pulsing purple and pink nebula clouds that ripple and expand to the beat. Style: 3D cartoon, hyper-detailed CGI, cinematic lighting, seamless 12-second loop, Pixar-quality render, volumetric light rays, slow floating motion.",
  },
  {
    title: "Neon Samurai",
    prompt: "A sleek chrome samurai standing in a rain-soaked cyberpunk Tokyo alley at night, slicing through floating golden music notes with an electric blue neon katana, each slash exploding into colorful sound wave ripples across the wet pavement. Style: cinematic live-action CGI hybrid, ultra-realistic, moody neon lighting, rain particle effects, slow-motion slashes, seamless loop.",
  },
  {
    title: "Underwater Rave",
    prompt: "A stunning mermaid with holographic iridescent fins conducting an orchestra of glowing deep-sea creatures — anglerfish with disco ball lights, dancing octopuses with glowing arms — inside a massive bioluminescent coral reef cave, bubbles rising rhythmically. Style: dreamlike 3D animation, cinematic underwater lighting, teal and gold color palette, seamless 12-second loop.",
  },
  {
    title: "Living Painting",
    prompt: "A Van Gogh-style oil painting landscape that dramatically comes to life — thick swirling brushstrokes morphing into dancing silhouetted figures and spiraling musical notes flying through an animated Starry Night sky, colors bleeding and reforming. Style: 2D animated painterly art, textured brushstroke aesthetic, warm and electric blue tones, fluid looping motion, impressionist animation style.",
  },
  {
    title: "Giant Vinyl Planet",
    prompt: "A colossal spinning black vinyl record floating as a planet in a dreamy pastel galaxy, tiny glowing astronauts dancing along its grooves, a giant golden needle dropping and shooting trails of stars across the cosmos each revolution. Style: cute 3D cartoon, soft pastel lighting, Toy Story-level render quality, slow majestic spin, seamless loop, whimsical space atmosphere.",
  },
  {
    title: "Desert Mirage",
    prompt: "A sleek pharaoh fox wearing oversized golden sunglasses and a linen robe, surfing across endless rippling sand dunes on a glowing surfboard, animated ancient Egyptian hieroglyphs and eye-of-Horus symbols swirling around it like a sandstorm. Style: stylized 3D cartoon, warm golden hour lighting, rich amber and turquoise palette, fluid surfing motion, seamless 12-second loop.",
  },
  {
    title: "Microscopic Rave",
    prompt: "An extreme macro close-up inside a booming speaker — sound particles and molecules transformed into hundreds of tiny neon ravers in glow-stick outfits, bouncing chaotically off vibrating speaker membranes, the whole world shaking with every bass hit. Style: hyper-detailed 3D microscopic CGI, neon on black background, electric green and pink accents, fast energetic motion, seamless loop, macro lens depth-of-field blur.",
  },
  {
    title: "Glitching Robot",
    prompt: "A boxy retro 1980s robot standing alone in a stark white infinite void, repeatedly glitching, shattering into pixels, and snapping back together perfectly in sync with the beat, its chest screen displaying colorful VHS-style audio visualizer bars. Style: clean 3D cartoon with glitch art effects, minimal white aesthetic with bold RGB color bursts, sharp geometric design, seamless beat-synced loop, retro-futuristic feel.",
  },
  {
    title: "Enchanted Forest Stage",
    prompt: "A mysterious fox wizard in a starry velvet cloak standing on a moss-covered stone stage deep in a dark enchanted forest, casting spells with a glowing wand that erupt into towering aurora borealis-colored music visualizer waves between ancient twisted glowing trees, fireflies swirling. Style: cinematic dark fantasy 3D animation, rich jewel tones, god rays through forest canopy, magical particle effects, seamless atmospheric loop.",
  },
  {
    title: "Time-Lapse City",
    prompt: "A sprawling miniature city viewed from directly above, every building, road, and vehicle built entirely from cassette tapes, vinyl records, and old CD cases, glowing cars zipping through grooved roads in hypnotic looping patterns, tiny vinyl people dancing in a central plaza. Style: miniature tilt-shift photography aesthetic, warm studio lighting, birds-eye, ultra-detailed 3D render, smooth time-lapse looping motion, nostalgic retro color grade.",
  },
];

export default function CreateVideoShorts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");
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

  const [showSongModal, setShowSongModal] = useState(false);
  const [songUrlInput, setSongUrlInput] = useState("");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  const songInputRef = useRef<HTMLInputElement>(null);
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
      const response = await apiRequest("POST", "/api/video-shorts", {
        prompt,
        aspectRatio,
        audioUrl: uploadedAudioUrl || undefined,
        addSubtitles,
        subtitleStyle,
        textPosition,
        fontFamily,
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[video-shorts] Non-JSON response:", text.substring(0, 200));
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
        title: "Video Short Generation Started!",
        description: data.message || "Your 12-second video is being created.",
      });
      if (data.projectId && !generatedProjectId) {
        setGeneratedProjectId(data.projectId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate video short",
        variant: "destructive",
      });
    },
  });

  const creditCost = 1000;
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

  const totalSteps = uploadedAudioUrl ? 4 : 3;
  const progressPercentage = project?.isCompleted
    ? 100
    : Math.min((completedSteps.length / totalSteps) * 100, 95);

  const getStepLabel = (step: string): string => {
    const stepMap: Record<string, string> = {
      project_creation: "Setting up project",
      image_generation: "Generating image",
      video_generation: "Creating video",
      audio_merge: "Merging audio",
      upload: "Saving video",
    };
    return stepMap[step] || step;
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please enter a prompt describing your video short",
        variant: "destructive",
      });
      return;
    }
    if (!uploadedAudioUrl) {
      toast({
        title: "Upload a song",
        description: "Please upload and attach a song first. Click the music note button to add one.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  const handleGenerateIdea = () => {
    const idea = VIDEO_SHORT_IDEAS[Math.floor(Math.random() * VIDEO_SHORT_IDEAS.length)];
    setPrompt(idea.prompt);
    toast({ title: idea.title, description: "Idea loaded into prompt!" });
  };

  const resetAudioAttachment = () => {
    if (previewAudioUrl && previewAudioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewAudioUrl(null);
    setPendingFile(null);
    setShowTrimInterface(false);
    setUploadedAudioUrl(null);
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

  const handleLoadSongFromUrl = async () => {
    const url = songUrlInput.trim();
    if (!url) {
      toast({ title: "Enter a URL", description: "Please enter an MP3 or WAV song URL.", variant: "destructive" });
      return;
    }
    const lower = url.toLowerCase();
    if (!lower.endsWith(".mp3") && !lower.endsWith(".wav")) {
      toast({
        title: "Invalid URL",
        description: "Song URL must end with .mp3 or .wav",
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

    setIsLoadingUrl(true);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const blob = await res.blob();
      const ext = lower.endsWith(".wav") ? "wav" : "mp3";
      const file = new File([blob], `audio.${ext}`, { type: blob.type || (ext === "wav" ? "audio/wav" : "audio/mpeg") });
      const previewUrl = URL.createObjectURL(blob);
      setPendingFile(file);
      const audio = new Audio(previewUrl);
      audio.addEventListener("loadedmetadata", () => {
        setPreviewAudioDuration(audio.duration);
        setPreviewAudioUrl(previewUrl);
        setShowTrimInterface(true);
        setShowSongModal(false);
        setSongUrlInput("");
        setIsLoadingUrl(false);
        toast({ title: "Song loaded", description: "Select your 12-second section below." });
      });
      audio.addEventListener("error", () => {
        URL.revokeObjectURL(previewUrl);
        setPendingFile(null);
        setIsLoadingUrl(false);
        toast({
          title: "Error",
          description: "Could not load audio from URL. Check the link or try uploading a file.",
          variant: "destructive",
        });
      });
    } catch (e) {
      setIsLoadingUrl(false);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to load song from URL. The server may block external requests.",
        variant: "destructive",
      });
    }
  };

  const handleTrimSong = async (startTime: number, endTime: number) => {
    if (!previewAudioUrl || !pendingFile) return;

    setIsTrimmingSong(true);
    setIsUploadingSong(true);
    setUploadStatus("Uploading audio file...");

    try {
      const projectResponse = await apiRequest("POST", "/api/projects", {
        title: "Video Shorts (Temporary)",
        description: "Temporary project for audio upload",
        aspectRatio,
        currentStep: 1,
        addSubtitles: false,
        isInstrumental: true,
      });
      const projectData = await projectResponse.json();
      const tempProjectId = projectData.id;

      const formData = new FormData();
      formData.append("audio", pendingFile);
      formData.append("addSubtitles", "false");
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
      setUploadStatus("Trimming audio to 12 seconds...");
      const trimResponse = await apiRequest("POST", `/api/projects/${tempProjectId}/trim-audio`, {
        audioUrl: uploadData.audioUrl,
        startTime,
        endTime,
        addSubtitles: false,
        lyrics: null,
        sourceSubtitleFileUrl: null,
      });
      const trimData = await trimResponse.json();

      setUploadProgress(100);
      setUploadStatus("Complete!");
      setUploadedAudioUrl(trimData.audioUrl);

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
        description: "Audio trimmed to 12 seconds successfully.",
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
              Video Shorts
            </h1>
            <p className="text-muted-foreground">
              Create stunning 12-second video shorts from a single prompt
            </p>
          </div>

          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">Describe Your Video Short</CardTitle>
              <CardDescription>
                Write a prompt or generate an idea. Upload a song and select 12 seconds to use.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 px-4 py-3 text-sm text-foreground">
                <p className="font-medium text-pink-500 dark:text-pink-400 mb-1">Upload a song</p>
                <p className="text-muted-foreground">
                  Click the <span className="font-medium text-foreground">music note button</span> below to upload a song (MP3, WAV, or AAC). You will then choose exactly 12 seconds from your track. The Generate button will unlock once a song is attached.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the scene, mood, and style for your 12-second video..."
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSongModal(true)}
                    data-testid="button-attach-song"
                    title="Upload a song"
                    className={
                      !uploadedAudioUrl
                        ? "border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] hover:shadow-[0_0_20px_rgba(236,72,153,0.6),0_0_40px_rgba(236,72,153,0.4)] hover:border-pink-400"
                        : ""
                    }
                  >
                    <Music className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateIdea}
                    title="Generate Idea"
                    data-testid="button-generate-idea"
                  >
                    <Sparkles className="h-4 w-4" />
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
                  fixedDuration={12}
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

              {uploadedAudioUrl && (
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full text-sm">
                    <Upload className="h-3 w-3" />
                    Song attached (12s)
                    <button type="button" onClick={resetAudioAttachment}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Switch
                    id="add-subtitles-shorts"
                    checked={addSubtitles}
                    onCheckedChange={setAddSubtitles}
                    data-testid="subtitles-toggle"
                  />
                  <Label htmlFor="add-subtitles-shorts" className="text-sm font-medium cursor-pointer" onClick={() => setAddSubtitles(!addSubtitles)}>
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

              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !uploadedAudioUrl || !hasEnoughCredits}
                className="w-full mt-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                data-testid="button-generate"
                title={
                  !uploadedAudioUrl
                    ? "Upload a song first"
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
                    Generate Video Short
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
                        <p className="text-green-400 font-semibold">Your video short is ready!</p>
                        <video controls className="w-full rounded-lg" src={project.finalVideoUrl} data-testid="video-player">
                          Your browser does not support the video tag.
                        </video>
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!project.finalVideoUrl) return;
                              try {
                                await downloadFileFromUrl(project.finalVideoUrl, "video-short.mp4");
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
                            data-testid="button-download"
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

      <Dialog open={showSongModal} onOpenChange={setShowSongModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add a song</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Upload a file or paste a direct link to an MP3 or WAV file. You will then choose 12 seconds to use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                setShowSongModal(false);
                setTimeout(() => songInputRef.current?.click(), 100);
              }}
              data-testid="modal-upload-song"
            >
              <Upload className="h-4 w-4" />
              Upload a song
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-2">Or</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="song-url" className="text-foreground">
                Enter song URL (MP3 or WAV only)
              </Label>
              <Input
                id="song-url"
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
                disabled={isLoadingUrl || !songUrlInput.trim()}
                data-testid="modal-use-url"
              >
                {isLoadingUrl ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4" />
                )}
                {isLoadingUrl ? "Loading..." : "Use URL"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
