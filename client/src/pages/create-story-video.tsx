import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { isFreePlanUser } from "@/lib/plan-utils";
import { FreePlanVideoUpsellParagraph } from "@/components/free-plan-video-upsell";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CharacterLibraryModal } from "@/components/modals/character-library-modal";
import { StoryScriptReviewStep } from "@/components/steps/story-script-review-step";
import {
  Loader2, Play, ChevronLeft, ChevronRight,
  Plus, X, BookOpen, Image as ImageIcon, CheckCircle2,
} from "lucide-react";
import {
  STORY_DEFAULT_NARRATOR_VOICE,
  STORY_DEFAULT_CHARACTER_VOICE_POOL,
  STORY_DURATION_MIN,
  STORY_DURATION_MAX,
  STORY_MAX_CHARACTERS,
  getStoryVideoGenerationCredits,
} from "@shared/storyConstants";
import type { StoryScene, StoryCharacter } from "@shared/storyConstants";

interface StoryVoiceOption {
  id: string;
  previewUrl: string;
}

interface GenerationLog {
  id: string;
  step: string;
  message: string;
  status: string;
  createdAt: string;
}

export default function CreateStoryVideo() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const editProjectId = urlParams.get("edit");
  const isEditMode = !!editProjectId;
  const editSessionLoaded = useRef(false);

  const [currentStep, setCurrentStep] = useState(isEditMode ? 2 : 1);
  const [projectId, setProjectId] = useState<string | null>(editProjectId);

  // Step 1 state
  const [storyPrompt, setStoryPrompt] = useState("");
  const [duration, setDuration] = useState(60);
  const [useNarrator, setUseNarrator] = useState(true);
  const [narratorVoice, setNarratorVoice] = useState<string>(STORY_DEFAULT_NARRATOR_VOICE);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "3:4">("16:9");
  const [characters, setCharacters] = useState<StoryCharacter[]>([]);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);

  // Step 2 state
  const [script, setScript] = useState<StoryScene[]>([]);

  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [audioUrlsRight, setAudioUrlsRight] = useState<string[]>([]);

  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  /** Ensures we only auto-call generate-video once after assets finish */
  const autoVideoStartedRef = useRef(false);
  /** After "Generate video", ignore stale cache until refetch shows server caught up (avoids 409 + step-2 bounce). */
  const assetsPollSawServerRef = useRef(false);

  const stepLabels = ["Story Setup", "Script Review", "Story Video"];

  const { data: storyVoicesData } = useQuery<{ voices: StoryVoiceOption[] }>({
    queryKey: ["/api/story-voices"],
  });
  const voiceOptions = storyVoicesData?.voices ?? [];

  useEffect(() => {
    if (voiceOptions.length === 0) return;
    setNarratorVoice((current) =>
      voiceOptions.some((v) => v.id === current) ? current : voiceOptions[0].id,
    );
  }, [voiceOptions]);

  // Load project data when entering edit mode
  const { data: editProjectData } = useQuery({
    queryKey: [`/api/projects/${editProjectId}`],
    enabled: isEditMode && !!editProjectId,
  });

  useEffect(() => {
    if (!isEditMode || !editProjectData || editSessionLoaded.current) return;
    const p = editProjectData as any;
    editSessionLoaded.current = true;

    if (p.storyPrompt) setStoryPrompt(p.storyPrompt);
    if (p.storyDuration) setDuration(p.storyDuration);
    if (p.storyNarrator !== undefined) setUseNarrator(!!p.storyNarrator);
    if (p.storyNarratorVoice) setNarratorVoice(p.storyNarratorVoice);
    if (p.aspectRatio) setAspectRatio(p.aspectRatio as "16:9" | "3:4");
    if (p.storyCharacters?.length) setCharacters(p.storyCharacters);
    if (p.storyScript?.length) setScript(p.storyScript);
    if (p.storySceneImages?.length) setSceneImages(p.storySceneImages);
    if (p.storyAudioUrls?.length) setAudioUrls(p.storyAudioUrls);
    setAudioUrlsRight(Array.isArray(p.storyAudioUrlsRight) ? p.storyAudioUrlsRight : []);
    if (p.finalVideoUrl) setFinalVideoUrl(p.finalVideoUrl);

    if (p.storyScript?.length) {
      const hasFinal = !!(p.finalVideoUrl && p.isCompleted !== false);
      const isActivelyGenerating = p.generationStatus === "generating";
      if (hasFinal) {
        setCurrentStep(3);
        setIsGeneratingAssets(false);
        setIsGeneratingVideo(false);
        setFinalVideoUrl(p.finalVideoUrl);
      } else if (isActivelyGenerating) {
        setCurrentStep(3);
        setIsGeneratingAssets(true);
      } else {
        setCurrentStep(2);
      }
    }
  }, [isEditMode, editProjectData]);

  const playVoicePreview = useCallback((previewUrl: string) => {
    const audio = new Audio(previewUrl);
    audio.play().catch(() => {
      toast({
        title: "Preview unavailable",
        description: "Check that the voice sample exists on the CDN (neonvideo.b-cdn.net/voices).",
        variant: "destructive",
      });
    });
  }, [toast]);

  // Poll project for updates during asset/video generation
  const { data: projectData } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId && currentStep >= 2,
    refetchInterval:
      (currentStep === 3 && !finalVideoUrl) || (currentStep === 2 && isGeneratingAssets)
        ? 3000
        : false,
  });

  const storyDurationForCredits =
    (projectData as { storyDuration?: number } | undefined)?.storyDuration ?? duration;
  const storyGenerationCredits = useMemo(
    () => getStoryVideoGenerationCredits(storyDurationForCredits),
    [storyDurationForCredits],
  );

  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const step1CreditsRequired = getStoryVideoGenerationCredits(duration);
  const hasEnoughCreditsForStorySetup = userCreditsRemaining >= step1CreditsRequired;

  // Poll logs during step 3 pipeline (assets + video) until the final file is ready
  const { data: logs } = useQuery<GenerationLog[]>({
    queryKey: [`/api/projects/${projectId}/logs`],
    enabled:
      !!projectId &&
      (isGeneratingAssets || isGeneratingVideo || (currentStep === 3 && !finalVideoUrl)),
    refetchInterval:
      isGeneratingAssets || isGeneratingVideo || (currentStep === 3 && !finalVideoUrl)
        ? 2000
        : false,
  });

  useEffect(() => {
    autoVideoStartedRef.current = false;
    assetsPollSawServerRef.current = false;
  }, [projectId]);

  // Step 1: Generate script, then scene preview images (same loading state until thumbnails exist)
  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/story-video/generate-script", {
        storyPrompt,
        duration,
        narrator: useNarrator,
        narratorVoice: useNarrator ? narratorVoice : null,
        characters: characters.map((c) => ({
          name: c.name,
          imageUrl: c.imageUrl,
          voiceId: c.voiceId,
          prompt: c.prompt,
        })),
        aspectRatio,
      });
      const data = (await res.json()) as { projectId: string; script: StoryScene[] };

      try {
        await apiRequest("POST", `/api/story-video/${data.projectId}/generate-scene-images`);
      } catch (e) {
        return {
          ...data,
          sceneImages: [] as string[],
          previewFailed: true as const,
          previewError: (e as Error).message,
        };
      }

      const sceneCount = data.script.length;
      const deadline = Date.now() + 900_000;
      let sceneImages: string[] = [];

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const pr = await apiRequest("GET", `/api/projects/${data.projectId}`);
        const p = (await pr.json()) as { storySceneImages?: string[] };
        const imgs = p.storySceneImages;
        if (
          Array.isArray(imgs) &&
          imgs.length === sceneCount &&
          imgs.every((url) => typeof url === "string" && url.length > 0)
        ) {
          sceneImages = imgs;
          break;
        }
      }

      const previewIncomplete =
        sceneImages.length !== sceneCount || !sceneImages.every((u) => u.length > 0);

      return { ...data, sceneImages, previewIncomplete };
    },
    onSuccess: (data) => {
      setProjectId(data.projectId);
      setScript(data.script);
      setSceneImages(data.sceneImages ?? []);
      setAudioUrls([]);
      setAudioUrlsRight([]);
      setCurrentStep(2);
      window.history.replaceState(null, "", `/create/story-video?edit=${data.projectId}`);
      if ("previewFailed" in data && data.previewFailed) {
        toast({
          title: "Script generated",
          description: `Scene previews could not start (${data.previewError}). You can still edit and run the full video.`,
          variant: "destructive",
        });
      } else if (!("previewFailed" in data) && data.previewIncomplete) {
        toast({
          title: "Script generated",
          description: `${data.script.length} scenes. Previews are still loading or failed — refresh if thumbnails are missing.`,
        });
      } else {
        toast({
          title: "Script generated!",
          description: `${data.script.length} scenes with preview images`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate script", description: error.message, variant: "destructive" });
    },
  });

  // Step 2: Update script on server and generate assets
  const generateAssetsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/story-video/${projectId}/update-script`, { script });
      const res = await apiRequest("POST", `/api/story-video/${projectId}/generate-assets`);
      return res.json();
    },
    onSuccess: async () => {
      autoVideoStartedRef.current = false;
      assetsPollSawServerRef.current = false;
      setIsGeneratingAssets(true);
      setCurrentStep(3);
      if (projectId) {
        await queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
        await queryClient.refetchQueries({ queryKey: [`/api/projects/${projectId}`] });
        const fresh = queryClient.getQueryData([`/api/projects/${projectId}`]) as
          | { generationStatus?: string }
          | undefined;
        const st = fresh?.generationStatus;
        if (st === "generating" || st === "completed" || st === "failed") {
          assetsPollSawServerRef.current = true;
        }
      }
      await refreshUser();
      toast({
        title: "Creating your story",
        description: "Voices, scenes, and video — this can take several minutes.",
      });
    },
    onError: (error: Error & { status?: number }) => {
      setIsGeneratingAssets(false);
      setCurrentStep(2);
      const is402 = error.status === 402;
      toast({
        title: is402 ? "Not enough credits" : "Failed to generate assets",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingVideo(true);
      setCurrentStep(3);
      const res = await apiRequest("POST", `/api/story-video/${projectId}/generate-video`);
      return res.json();
    },
    onError: (error: Error & { status?: number }) => {
      setIsGeneratingVideo(false);
      autoVideoStartedRef.current = false;
      const msg = error.message || "";
      const is409 = error.status === 409 || msg.includes("409") || msg.includes("already being generated");
      if (is409) {
        toast({
          title: "Video will start shortly",
          description: "Still finishing voices and images — this page will continue automatically.",
        });
        return;
      }
      setCurrentStep(2);
      toast({ title: "Failed to start video", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!projectData) return;
    const p = projectData as any;

    if (p.generationStatus === "failed") {
      setIsGeneratingAssets(false);
      setIsGeneratingVideo(false);
      autoVideoStartedRef.current = false;
      if (currentStep === 3 && !p.finalVideoUrl) {
        setCurrentStep(2);
        toast({
          title: "Generation failed",
          description: "You can edit the script and try again.",
          variant: "destructive",
        });
      }
      return;
    }

    if (p.storySceneImages?.length > 0) {
      setSceneImages(p.storySceneImages);
      setAudioUrls(p.storyAudioUrls || []);
      setAudioUrlsRight(Array.isArray(p.storyAudioUrlsRight) ? p.storyAudioUrlsRight : []);
    }

    if (p.finalVideoUrl && p.isCompleted) {
      setFinalVideoUrl(p.finalVideoUrl);
      setIsGeneratingVideo(false);
      setIsGeneratingAssets(false);
      return;
    }

    if (p.generationStatus === "generating" && isGeneratingAssets) {
      assetsPollSawServerRef.current = true;
    }

    const scriptArr = Array.isArray(p.storyScript) ? p.storyScript : [];
    const sceneImagesArr = Array.isArray(p.storySceneImages) ? p.storySceneImages : [];
    const audioArr = Array.isArray(p.storyAudioUrls) ? p.storyAudioUrls : [];
    const audioUrlsRightArr = Array.isArray(p.storyAudioUrlsRight) ? p.storyAudioUrlsRight : [];
    const imagesReady =
      sceneImagesArr.length > 0 &&
      sceneImagesArr.length >= scriptArr.length &&
      sceneImagesArr.every((u: string) => typeof u === "string" && u.length > 0);

    let audioReady = audioArr.length >= scriptArr.length;
    if (audioReady) {
      for (let i = 0; i < scriptArr.length; i++) {
        const u = audioArr[i];
        if (typeof u !== "string" || !u.length) {
          audioReady = false;
          break;
        }
        const s = scriptArr[i] as {
          multi_talk?: boolean;
          audio_left?: string;
          audio_right?: string;
        };
        if (s?.multi_talk && (s.audio_left || "").trim() && (s.audio_right || "").trim()) {
          const r = audioUrlsRightArr[i];
          if (typeof r !== "string" || !r.trim().length) {
            audioReady = false;
            break;
          }
        }
      }
    }

    const assetsPhaseDone =
      p.generationStatus === "completed" && imagesReady && audioReady;

    if (
      currentStep === 3 &&
      assetsPhaseDone &&
      !p.finalVideoUrl &&
      !isGeneratingVideo &&
      !autoVideoStartedRef.current &&
      assetsPollSawServerRef.current
    ) {
      autoVideoStartedRef.current = true;
      setIsGeneratingAssets(false);
      generateVideoMutation.mutate();
    }
  }, [
    projectData,
    currentStep,
    isGeneratingVideo,
    isGeneratingAssets,
    toast,
    generateVideoMutation.mutate,
  ]);

  const handleAddCharacter = useCallback((character: any) => {
    if (characters.length >= STORY_MAX_CHARACTERS) {
      toast({ title: "Maximum characters reached", description: `You can add up to ${STORY_MAX_CHARACTERS} characters`, variant: "destructive" });
      return;
    }
    const usedVoices = new Set(characters.map((c) => c.voiceId).filter(Boolean));
    const autoVoice =
      STORY_DEFAULT_CHARACTER_VOICE_POOL.find((v) => !usedVoices.has(v)) ??
      STORY_DEFAULT_CHARACTER_VOICE_POOL[characters.length % STORY_DEFAULT_CHARACTER_VOICE_POOL.length];
    setCharacters((prev) => [
      ...prev,
      {
        name: character.name || `Character ${prev.length + 1}`,
        imageUrl: character.imageUrl,
        voiceId: autoVoice,
        prompt: character.prompt || "",
      },
    ]);
    setCharacterModalOpen(false);
  }, [characters.length, toast]);

  const removeCharacter = (index: number) => {
    setCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCharacterVoice = (index: number, voiceId: string | null) => {
    setCharacters((prev) => prev.map((c, i) => (i === index ? { ...c, voiceId } : c)));
  };

  const updateCharacterName = (index: number, name: string) => {
    setCharacters((prev) => prev.map((c, i) => (i === index ? { ...c, name } : c)));
  };

  const latestLogMessage = logs && logs.length > 0 ? logs[logs.length - 1]?.message : null;

  const progressSteps = [
    { key: "story_audio", label: "Creating character voices..." },
    { key: "story_images", label: "Painting the scenes..." },
    { key: "story_video_start", label: "Bringing scenes to life..." },
    { key: "story_video_merge", label: "Assembling the final video..." },
    { key: "story_video_upload", label: "Uploading to cloud..." },
    { key: "story_video_captions", label: "Adding captions..." },
    { key: "story_video_complete", label: "Almost there..." },
  ];

  const isProgressStepCompleted = (stepKey: string, logList: GenerationLog[]): boolean => {
    if (stepKey === "story_video_start") {
      return logList.some((l) => l.step === "story_video_segments" && l.status === "completed");
    }
    if (stepKey === "story_video_merge") {
      return logList.some((l) => l.step === "story_video_upload");
    }
    if (stepKey === "story_video_upload") {
      return logList.some((l) => l.step === "story_video_captions");
    }
    if (stepKey === "story_video_captions") {
      return logList.some((l) => l.step === "story_video_complete" && l.status === "completed");
    }
    return logList.some((l) => l.step === stepKey && l.status === "completed");
  };

  const currentProgressIndex = logs
    ? progressSteps.findIndex((ps) => !isProgressStepCompleted(ps.key, logs))
    : 0;
  const progressPercent =
    currentProgressIndex === -1 ? 100 : Math.round((currentProgressIndex / progressSteps.length) * 100);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}min`;
    return `${m}min ${s}s`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <button
            onClick={() => navigate("/create")}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm mb-4"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Create
          </button>
          <h1 className="text-3xl font-bold text-foreground">Create Story Video</h1>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isDone = currentStep > stepNum || (stepNum === 3 && !!finalVideoUrl);
            const isActive = currentStep === stepNum && !(stepNum === 3 && !!finalVideoUrl);
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium border-2 transition-colors ${
                    isActive
                      ? "border-pink-500 bg-pink-500 text-white"
                      : isDone
                        ? "border-pink-500 bg-pink-500/20 text-pink-500"
                        : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
                </div>
                <span
                  className={`text-sm hidden sm:inline ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div className={`w-8 h-0.5 ${isDone ? "bg-pink-500" : "bg-muted-foreground/20"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Story Setup */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <Label htmlFor="story-prompt" className="text-base font-medium">
                    What is the story about?
                  </Label>
                  <Textarea
                    id="story-prompt"
                    placeholder="a little cowboy hamster"
                    value={storyPrompt}
                    onChange={(e) => setStoryPrompt(e.target.value)}
                    className="mt-2 min-h-[80px]"
                  />
                </div>

                <div>
                  <Label className="text-base font-medium">
                    Video Duration: {formatDuration(duration)}
                  </Label>
                  <Slider
                    value={[duration]}
                    onValueChange={(v) => setDuration(v[0])}
                    min={STORY_DURATION_MIN}
                    max={STORY_DURATION_MAX}
                    step={30}
                    className="mt-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>30s</span>
                    <span>5 min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium">Use a Narrator</Label>
                    <p className="text-sm text-muted-foreground">
                      Add a narrator to tell the story
                    </p>
                  </div>
                  <Switch checked={useNarrator} onCheckedChange={setUseNarrator} />
                </div>

                {useNarrator && (
                  <div>
                    <Label className="text-sm">Narrator voice</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Select value={narratorVoice} onValueChange={setNarratorVoice}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={voiceOptions.length ? "Select voice" : "Loading voices…"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {voiceOptions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        disabled={!voiceOptions.some((v) => v.id === narratorVoice)}
                        onClick={() => {
                          const u = voiceOptions.find((v) => v.id === narratorVoice)?.previewUrl;
                          if (u) playVoicePreview(u);
                        }}
                        title="Play voice sample"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Previews load from Bunny (<code className="text-xs">…/voices/{"{id}"}.mp3</code>). Optional: add MP3s under <code className="text-xs">public/voices</code> to limit which voices appear in the list.
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-base font-medium">Aspect Ratio</Label>
                  <div className="flex gap-3 mt-2">
                    <Button
                      type="button"
                      variant={aspectRatio === "16:9" ? "default" : "outline"}
                      onClick={() => setAspectRatio("16:9")}
                      className="flex-1"
                    >
                      Horizontal (16:9)
                    </Button>
                    <Button
                      type="button"
                      variant={aspectRatio === "3:4" ? "default" : "outline"}
                      onClick={() => setAspectRatio("3:4")}
                      className="flex-1"
                    >
                      Vertical (3:4)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Characters */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Label className="text-base font-medium">Story Characters</Label>
                    <p className="text-sm text-muted-foreground">
                      Select up to {STORY_MAX_CHARACTERS} main characters
                    </p>
                  </div>
                  {characters.length < STORY_MAX_CHARACTERS && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCharacterModalOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add Character
                    </Button>
                  )}
                </div>

                {characters.length === 0 ? (
                  <div
                    onClick={() => setCharacterModalOpen(true)}
                    className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center cursor-pointer hover:border-pink-500/50 transition-colors"
                  >
                    <Plus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">Click to add a character</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {characters.map((char, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-4 p-3 rounded-lg border bg-card"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {char.imageUrl ? (
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={char.name}
                            onChange={(e) => updateCharacterName(i, e.target.value)}
                            className="h-8 text-sm font-medium"
                            placeholder="Character name"
                          />
                          <div className="flex items-center gap-2">
                            <Select
                              value={char.voiceId ?? "__none__"}
                              onValueChange={(v) => updateCharacterVoice(i, v === "__none__" ? null : v)}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Voice (optional)" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                <SelectItem value="__none__">No voice</SelectItem>
                                {voiceOptions.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              disabled={!char.voiceId || !voiceOptions.some((v) => v.id === char.voiceId)}
                              onClick={() => {
                                const u = voiceOptions.find((v) => v.id === char.voiceId)?.previewUrl;
                                if (u) playVoicePreview(u);
                              }}
                              title="Play voice sample"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCharacter(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {!hasEnoughCreditsForStorySetup && (
              <div className="mb-4 space-y-2">
                <FreePlanVideoUpsellParagraph user={user} />
                {!isFreePlanUser(user) && (
                  <p className="text-center text-sm text-muted-foreground">
                    Credits Required to Generate Video: {step1CreditsRequired.toLocaleString()} (You have{" "}
                    {userCreditsRemaining.toLocaleString()} remaining)
                  </p>
                )}
              </div>
            )}

            <Button
              type="button"
              onClick={() => generateScriptMutation.mutate()}
              disabled={!storyPrompt.trim() || generateScriptMutation.isPending}
              className="w-full h-12 text-base bg-pink-600 hover:bg-pink-700"
            >
              {generateScriptMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating story and scene art...
                </>
              ) : (
                <>
                  <BookOpen className="h-5 w-5 mr-2" />
                  {`Generate Story (${getStoryVideoGenerationCredits(duration).toLocaleString()} credits)`}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2: Script review — same layout patterns as music-video scene editor (timeline + scene tools) */}
        {currentStep === 2 && projectId && (
          <StoryScriptReviewStep
            projectId={projectId}
            storyDuration={
              (projectData as { storyDuration?: number } | undefined)?.storyDuration ?? duration
            }
            script={script}
            sceneImages={sceneImages}
            audioUrls={audioUrls}
            audioUrlsRight={audioUrlsRight}
            finalVideoUrl={finalVideoUrl}
            storyGenerationCredits={storyGenerationCredits}
            generatePending={generateAssetsMutation.isPending}
            onScriptChange={setScript}
            onSceneImagesChange={setSceneImages}
            onAudioUrlsChange={setAudioUrls}
            onAudioUrlsRightChange={setAudioUrlsRight}
            onBack={() => setCurrentStep(1)}
            onGenerateVideo={() => generateAssetsMutation.mutate()}
          />
        )}

        {/* Step 3: Full pipeline progress + final player (assets → video automatic) */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {!finalVideoUrl ? (
              <Card>
                <CardContent className="p-8 text-center space-y-6">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-pink-500" />
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Creating your story video</h2>
                    <p className="text-muted-foreground text-sm">
                      Voices, scene images, clips, and final render. This may take several minutes — keep this page open.
                    </p>
                  </div>

                  <div className="max-w-md mx-auto space-y-3">
                    <div className="space-y-2">
                      <Progress value={Math.max(0, Math.min(100, progressPercent))} className="h-3" />
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {Math.max(0, Math.min(100, progressPercent))}% complete
                      </p>
                    </div>
                    <div className="space-y-1">
                      {progressSteps.map((ps, i) => {
                        const logEntry = logs?.find(
                          (l: GenerationLog) => l.step === ps.key,
                        );
                        const isDone = logs ? isProgressStepCompleted(ps.key, logs) : false;
                        const isActive =
                          i === currentProgressIndex ||
                          (!isDone &&
                            logEntry &&
                            (logEntry.status === "started" || logEntry.status === "progress"));
                        return (
                          <div
                            key={ps.key}
                            className={`flex items-center gap-2 text-sm ${
                              isDone
                                ? "text-green-500"
                                : isActive
                                  ? "text-pink-500 font-medium"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isActive ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                            )}
                            {ps.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {latestLogMessage && (
                    <p className="text-xs text-muted-foreground">{latestLogMessage}</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {finalVideoUrl && (
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-4 text-center">
                      Your Story Video is Ready!
                    </h2>
                    <div className="rounded-lg overflow-hidden bg-black">
                      <video
                        src={finalVideoUrl}
                        controls
                        className="w-full max-h-[500px]"
                        autoPlay
                      />
                    </div>
                  </CardContent>
                </Card>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/my-videos")}
                  >
                    View My Videos
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      autoVideoStartedRef.current = false;
                      setIsGeneratingAssets(false);
                      setIsGeneratingVideo(false);
                      setCurrentStep(2);
                    }}
                  >
                    Edit Script
                  </Button>
                  <Button
                    className="flex-1 bg-pink-600 hover:bg-pink-700"
                    onClick={() => {
                      autoVideoStartedRef.current = false;
                      editSessionLoaded.current = false;
                      setCurrentStep(1);
                      setProjectId(null);
                      setScript([]);
                      setSceneImages([]);
                      setAudioUrls([]);
                      setAudioUrlsRight([]);
                      setFinalVideoUrl(null);
                      setStoryPrompt("");
                      setCharacters([]);
                      setIsGeneratingAssets(false);
                      setIsGeneratingVideo(false);
                      if (isEditMode) navigate("/create/story-video");
                    }}
                  >
                    Create Another Story
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <CharacterLibraryModal
        isOpen={characterModalOpen}
        onClose={() => setCharacterModalOpen(false)}
        onSelect={handleAddCharacter}
      />

      <Footer />
    </div>
  );
}
