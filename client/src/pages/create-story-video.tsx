import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
import {
  Loader2, Play, ChevronLeft, ChevronRight,
  Plus, X, BookOpen, Mic, Image as ImageIcon, CheckCircle2,
} from "lucide-react";
import {
  STORY_DEFAULT_NARRATOR_VOICE,
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
  const { refreshUser } = useAuth();

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

  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  /** Ensures we only auto-call generate-video once after assets finish */
  const autoVideoStartedRef = useRef(false);

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
    if (p.finalVideoUrl) setFinalVideoUrl(p.finalVideoUrl);

    if (p.storyScript?.length) {
      setCurrentStep(2);
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
  }, [projectId]);

  // Step 1: Generate Script
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
      return res.json();
    },
    onSuccess: (data) => {
      setProjectId(data.projectId);
      setScript(data.script);
      setCurrentStep(2);
      toast({ title: "Script generated!", description: `${data.script.length} scenes created` });
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
      setIsGeneratingAssets(true);
      setCurrentStep(3);
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
    onError: (error: Error) => {
      setIsGeneratingVideo(false);
      autoVideoStartedRef.current = false;
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
    }

    if (p.finalVideoUrl && p.isCompleted) {
      setFinalVideoUrl(p.finalVideoUrl);
      setIsGeneratingVideo(false);
      setIsGeneratingAssets(false);
      return;
    }

    const assetsReady = Array.isArray(p.storySceneImages) && p.storySceneImages.length > 0;
    const assetsPhaseDone = p.generationStatus === "completed" && assetsReady;

    if (
      currentStep === 3 &&
      assetsPhaseDone &&
      !p.finalVideoUrl &&
      !autoVideoStartedRef.current
    ) {
      autoVideoStartedRef.current = true;
      setIsGeneratingAssets(false);
      generateVideoMutation.mutate();
    }
  }, [projectData, currentStep, toast, generateVideoMutation.mutate]);

  const handleAddCharacter = useCallback((character: any) => {
    if (characters.length >= STORY_MAX_CHARACTERS) {
      toast({ title: "Maximum characters reached", description: `You can add up to ${STORY_MAX_CHARACTERS} characters`, variant: "destructive" });
      return;
    }
    setCharacters((prev) => [
      ...prev,
      {
        name: character.name || `Character ${prev.length + 1}`,
        imageUrl: character.imageUrl,
        voiceId: null,
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

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
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
                      variant={aspectRatio === "16:9" ? "default" : "outline"}
                      onClick={() => setAspectRatio("16:9")}
                      className="flex-1"
                    >
                      Horizontal (16:9)
                    </Button>
                    <Button
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

            <Button
              onClick={() => generateScriptMutation.mutate()}
              disabled={!storyPrompt.trim() || generateScriptMutation.isPending}
              className="w-full h-12 text-base bg-pink-600 hover:bg-pink-700"
            >
              {generateScriptMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating Story...
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

        {/* Step 2: Script Review */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {isEditMode ? "Edit Your Story Script" : "Review Your Story Script"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Edit the dialogue and scene descriptions before generating assets.
            </p>

            {isEditMode && finalVideoUrl && (
              <Card className="mb-4">
                <CardContent className="p-4">
                  <Label className="text-xs text-muted-foreground mb-2 block">Current Video</Label>
                  <div className="rounded-lg overflow-hidden bg-black">
                    <video
                      src={finalVideoUrl}
                      controls
                      className="w-full max-h-[300px]"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {script.map((scene, i) => (
              <Card key={scene.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">
                      Scene {scene.id}
                    </span>
                    <span className="text-sm font-medium text-foreground">{scene.character}</span>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                    <div
                      className={
                        aspectRatio === "3:4"
                          ? "relative mx-auto w-28 shrink-0 overflow-hidden rounded-lg bg-muted aspect-[3/4] sm:mx-0 sm:w-32"
                          : "relative mx-auto w-40 shrink-0 overflow-hidden rounded-lg bg-muted aspect-video sm:mx-0 sm:w-36"
                      }
                    >
                      {sceneImages[i] ? (
                        <img
                          src={sceneImages[i]}
                          alt={`Scene ${scene.id}`}
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Dialogue / Narration</Label>
                        <Textarea
                          value={scene.audio}
                          onChange={(e) => {
                            const updated = [...script];
                            updated[i] = { ...updated[i], audio: e.target.value };
                            setScript(updated);
                          }}
                          className="mt-1 min-h-[72px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Scene Description</Label>
                        <Textarea
                          value={scene.scene_description}
                          onChange={(e) => {
                            const updated = [...script];
                            updated[i] = { ...updated[i], scene_description: e.target.value };
                            setScript(updated);
                          }}
                          className="mt-1 min-h-[72px] text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              onClick={() => generateAssetsMutation.mutate()}
              disabled={
                generateAssetsMutation.isPending ||
                script.length === 0 ||
                currentStep === 3
              }
              className="w-full h-12 text-base bg-pink-600 hover:bg-pink-700"
            >
              {generateAssetsMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 mr-2" />
                  {`${isEditMode ? "Regenerate story video" : "Generate story video"} (${storyGenerationCredits.toLocaleString()} credits)`}
                </>
              )}
            </Button>
          </div>
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
