import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isFreePlanUser } from "@/lib/plan-utils";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { FreePlanVideoUpsellParagraph } from "@/components/free-plan-video-upsell";
import { ResponsiveFinalVideo } from "@/components/responsive-final-video";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Play,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import {
  IMAGE_STORY_DURATION_MAX,
  IMAGE_STORY_DURATION_MIN,
  IMAGE_STORY_TRANSITIONS,
  STORY_DEFAULT_NARRATOR_VOICE,
  getImageStoryGenerationCredits,
  type ImageStoryTransition,
} from "@shared/storyConstants";

interface StoryVoiceOption {
  id: string;
  previewUrl: string;
}

interface ImageStoryScene {
  id: number;
  character?: string;
  audio: string;
  scene_description?: string;
}

interface GenerationLog {
  id: string;
  step: string;
  message: string;
  status: string;
  createdAt: string;
  metadata?: {
    finalVideoUrl?: string;
    [key: string]: unknown;
  } | null;
}

const videoProgressSteps = [
  { key: "image_story_merge", label: "Assembling image story..." },
  { key: "image_story_captions", label: "Adding captions..." },
  { key: "image_story_complete", label: "Finalizing..." },
];

const terminalErrorSteps = new Set(["image_story_assets_error", "image_story_error"]);

export default function CreateImageStory() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editLoadedRef = useRef(false);

  const urlParams = new URLSearchParams(window.location.search);
  const editProjectId = urlParams.get("edit");
  const isEditMode = !!editProjectId;

  const [currentStep, setCurrentStep] = useState(isEditMode ? 2 : 1);
  const [projectId, setProjectId] = useState<string | null>(editProjectId);
  const [storyPrompt, setStoryPrompt] = useState("");
  const [duration, setDuration] = useState(60);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "3:4">("16:9");
  const [voiceId, setVoiceId] = useState(STORY_DEFAULT_NARRATOR_VOICE);
  const [transition, setTransition] = useState<ImageStoryTransition>("fade");
  const [addSubtitles, setAddSubtitles] = useState(false);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [script, setScript] = useState<ImageStoryScene[]>([]);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generationFailed, setGenerationFailed] = useState<string | null>(null);
  const [regeneratingImages, setRegeneratingImages] = useState<number[]>([]);
  const [regeneratingAudio, setRegeneratingAudio] = useState<number[]>([]);

  const creditsRequired = useMemo(() => getImageStoryGenerationCredits(duration), [duration]);
  const userCreditsRemaining = user?.creditsRemaining ?? 0;
  const hasEnoughCredits = userCreditsRemaining >= creditsRequired;

  const { data: storyVoicesData } = useQuery<{ voices: StoryVoiceOption[] }>({
    queryKey: ["/api/story-voices"],
  });
  const voiceOptions = storyVoicesData?.voices ?? [];

  useEffect(() => {
    if (voiceOptions.length === 0) return;
    setVoiceId((current) => (voiceOptions.some((v) => v.id === current) ? current : voiceOptions[0].id));
  }, [voiceOptions]);

  const assetsComplete = script.length > 0 &&
    sceneImages.length >= script.length &&
    audioUrls.length >= script.length &&
    script.every((_, index) => !!sceneImages[index] && !!audioUrls[index]);

  const shouldPollProject = !!projectId && (
    isGeneratingAssets ||
    isGeneratingVideo ||
    (currentStep === 2 && !assetsComplete && !generationFailed) ||
    (currentStep === 3 && !finalVideoUrl && !generationFailed)
  );

  const { data: projectData } = useQuery<any>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
    refetchInterval: shouldPollProject ? 2000 : false,
  });

  const { data: logs } = useQuery<GenerationLog[]>({
    queryKey: [`/api/projects/${projectId}/logs`],
    enabled: !!projectId && shouldPollProject,
    refetchInterval: shouldPollProject ? 2000 : false,
  });

  const syncProjectData = useCallback((p: any, initial = false) => {
    if (!p) return;
    if (p.storyPrompt) setStoryPrompt(p.storyPrompt);
    if (p.storyDuration) setDuration(p.storyDuration);
    if (p.aspectRatio === "3:4" || p.aspectRatio === "16:9") setAspectRatio(p.aspectRatio);
    if (p.storyNarratorVoice) setVoiceId(p.storyNarratorVoice);
    if (IMAGE_STORY_TRANSITIONS.includes(p.imageStoryTransition)) setTransition(p.imageStoryTransition);
    setAddSubtitles(!!p.addSubtitles);
    if (Array.isArray(p.imageStoryReferenceImages)) setReferenceImages(p.imageStoryReferenceImages);
    if (Array.isArray(p.storySceneImages)) setSceneImages(p.storySceneImages);
    if (Array.isArray(p.storyAudioUrls)) setAudioUrls(p.storyAudioUrls);
    if ((initial || script.length === 0) && Array.isArray(p.storyScript)) {
      const prompts = Array.isArray(p.storyScenePrompts) ? p.storyScenePrompts : [];
      setScript(
        p.storyScript.map((scene: ImageStoryScene, index: number) => ({
          ...scene,
          scene_description: prompts[index] || scene.scene_description || "",
        })),
      );
    }
    if (p.finalVideoUrl) {
      setFinalVideoUrl(p.finalVideoUrl);
      setIsGeneratingAssets(false);
      setIsGeneratingVideo(false);
      setGenerationFailed(null);
      setCurrentStep(3);
      refreshUser();
    }
    if (!p.finalVideoUrl && p.generationStatus === "generating") {
      setGenerationFailed(null);
      if (Number(p.currentStep) >= 3) {
        setCurrentStep(3);
        setIsGeneratingVideo(true);
        setIsGeneratingAssets(false);
      } else if (Number(p.currentStep) === 2) {
        setCurrentStep(2);
        setIsGeneratingAssets(true);
      }
    }
    if (p.generationStatus === "assets_completed") {
      setIsGeneratingAssets(false);
    }
    if (p.generationStatus === "failed") {
      setIsGeneratingAssets(false);
      setIsGeneratingVideo(false);
      const latestError = [...(logs ?? [])].reverse().find((log) => log.status === "error" && terminalErrorSteps.has(log.step));
      setGenerationFailed(latestError?.message || "Image Story generation failed.");
    }
  }, [logs, refreshUser, script.length]);

  useEffect(() => {
    if (!projectData || !projectId) return;
    const initial = isEditMode && !editLoadedRef.current;
    if (initial) editLoadedRef.current = true;
    syncProjectData(projectData, initial);
  }, [isEditMode, projectData, projectId, syncProjectData]);

  useEffect(() => {
    if (!logs?.length) return;
    const completionLog = [...logs].reverse().find((log) => log.step === "image_story_complete");
    const completedUrl = completionLog?.metadata?.finalVideoUrl;
    if (completedUrl && !finalVideoUrl) {
      setFinalVideoUrl(completedUrl);
      setIsGeneratingVideo(false);
      setGenerationFailed(null);
      setCurrentStep(3);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      refreshUser();
      return;
    }

    const assetsDone = logs.some((log) => log.step === "image_story_assets_complete" && log.status === "completed");
    if (assetsDone) setIsGeneratingAssets(false);

    const currentGenerationStartedAt = projectData?.generationStartedAt
      ? new Date(projectData.generationStartedAt).getTime()
      : 0;
    const latestError = [...logs].reverse().find((log) => {
      if (log.status !== "error" || !terminalErrorSteps.has(log.step)) return false;
      if (currentStep === 2 && log.step !== "image_story_assets_error") return false;
      if (currentStep === 3 && log.step !== "image_story_error") return false;
      if (!currentGenerationStartedAt) return true;

      const logTime = new Date(log.createdAt).getTime();
      return Number.isFinite(logTime) && logTime >= currentGenerationStartedAt - 1000;
    });
    if (latestError && !finalVideoUrl) {
      setIsGeneratingAssets(false);
      setIsGeneratingVideo(false);
      setGenerationFailed(latestError.message);
    }
  }, [currentStep, finalVideoUrl, logs, projectData?.generationStartedAt, projectId, queryClient, refreshUser]);

  const playVoicePreview = useCallback((previewUrl: string) => {
    const audio = new Audio(previewUrl);
    audio.play().catch(() => {
      toast({ title: "Preview unavailable", description: "The voice sample could not be played.", variant: "destructive" });
    });
  }, [toast]);

  const uploadReferenceMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await apiRequest("POST", "/api/image-story/upload-reference", formData);
      return (await res.json()) as { imageUrl: string };
    },
    onSuccess: (data) => {
      setReferenceImages((prev) => [...prev, data.imageUrl]);
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const generateAssetsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/image-story/${id}/generate-assets`);
      return res.json();
    },
    onSuccess: () => {
      setIsGeneratingAssets(true);
      setGenerationFailed(null);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Creating assets", description: "Reference, scene images, and audio are generating." });
    },
    onError: (error: Error) => {
      setIsGeneratingAssets(false);
      toast({ title: "Failed to start assets", description: error.message, variant: "destructive" });
    },
  });

  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/image-story/generate-script", {
        storyPrompt,
        duration,
        voiceId,
        referenceImages,
        transition,
        aspectRatio,
        addSubtitles,
      });
      return (await res.json()) as { projectId: string; script: ImageStoryScene[]; imagePrompts: string[] };
    },
    onSuccess: (data) => {
      setProjectId(data.projectId);
      setScript(data.script.map((scene, index) => ({ ...scene, scene_description: data.imagePrompts[index] || scene.scene_description || "" })));
      setSceneImages(new Array(data.script.length).fill(""));
      setAudioUrls(new Array(data.script.length).fill(""));
      setFinalVideoUrl(null);
      setGenerationFailed(null);
      setCurrentStep(2);
      window.history.replaceState(null, "", `/create/image-story?edit=${data.projectId}`);
      generateAssetsMutation.mutate(data.projectId);
      toast({ title: "Script generated", description: `${data.script.length} scenes are ready for asset generation.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate script", description: error.message, variant: "destructive" });
    },
  });

  const updateScriptMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Missing project");
      await apiRequest("POST", `/api/image-story/${projectId}/update-script`, {
        script,
        imagePrompts: script.map((scene) => scene.scene_description || ""),
        transition,
        addSubtitles,
      });
    },
  });

  const regenerateImageMutation = useMutation({
    mutationFn: async ({ index, prompt }: { index: number; prompt: string }) => {
      if (!projectId) throw new Error("Missing project");
      const res = await apiRequest("POST", `/api/image-story/${projectId}/regenerate-scene-image/${index}`, { prompt });
      return (await res.json()) as { imageUrl: string; sceneIndex: number };
    },
    onSuccess: (data) => {
      setSceneImages((prev) => {
        const next = [...prev];
        next[data.sceneIndex] = data.imageUrl;
        return next;
      });
      setRegeneratingImages((prev) => prev.filter((i) => i !== data.sceneIndex));
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Scene image updated" });
    },
    onError: (error: Error, variables) => {
      setRegeneratingImages((prev) => prev.filter((i) => i !== variables.index));
      toast({ title: "Image regeneration failed", description: error.message, variant: "destructive" });
    },
  });

  const regenerateAudioMutation = useMutation({
    mutationFn: async ({ index, audio }: { index: number; audio: string }) => {
      if (!projectId) throw new Error("Missing project");
      const res = await apiRequest("POST", `/api/image-story/${projectId}/regenerate-scene-audio/${index}`, { audio });
      return (await res.json()) as { audioUrl: string; sceneIndex: number };
    },
    onSuccess: (data) => {
      setAudioUrls((prev) => {
        const next = [...prev];
        next[data.sceneIndex] = data.audioUrl;
        return next;
      });
      setRegeneratingAudio((prev) => prev.filter((i) => i !== data.sceneIndex));
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Scene audio updated" });
    },
    onError: (error: Error, variables) => {
      setRegeneratingAudio((prev) => prev.filter((i) => i !== variables.index));
      toast({ title: "Audio regeneration failed", description: error.message, variant: "destructive" });
    },
  });

  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Missing project");
      await updateScriptMutation.mutateAsync();
      const res = await apiRequest("POST", `/api/image-story/${projectId}/generate-video`, {
        transition,
        addSubtitles,
      });
      return res.json();
    },
    onSuccess: async () => {
      setIsGeneratingVideo(true);
      setFinalVideoUrl(null);
      setGenerationFailed(null);
      setCurrentStep(3);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Generating video", description: "Your Image Story is being assembled." });
    },
    onError: (error: Error & { status?: number }) => {
      setIsGeneratingVideo(false);
      toast({
        title: error.status === 402 ? "Not enough credits" : "Failed to generate video",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReferenceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach((file) => uploadReferenceMutation.mutate(file));
  };

  const updateScene = (index: number, patch: Partial<ImageStoryScene>) => {
    setScript((prev) => prev.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}min`;
    return `${m}min ${s}s`;
  };

  const latestLogMessage = logs && logs.length > 0 ? logs[logs.length - 1]?.message : null;
  const visibleVideoProgressSteps = addSubtitles
    ? videoProgressSteps
    : videoProgressSteps.filter((step) => step.key !== "image_story_captions");
  const completedKeys = new Set((logs ?? []).filter((l) => l.status === "completed" || l.step === "image_story_complete").map((l) => l.step));
  const activeVideoIndex = visibleVideoProgressSteps.findIndex((step) => !completedKeys.has(step.key));
  const videoProgressPercent = finalVideoUrl ? 100 : activeVideoIndex === -1 ? 95 : Math.max(5, Math.round((activeVideoIndex / visibleVideoProgressSteps.length) * 100));
  const generatedImageCount = script.filter((_, index) => !!sceneImages[index]).length;
  const generatedAudioCount = script.filter((_, index) => !!audioUrls[index]).length;
  const assetProgressPercent = script.length
    ? Math.round(((generatedImageCount + generatedAudioCount) / (script.length * 2)) * 100)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold gradient-text">Image Story</h1>
              <p className="text-muted-foreground text-sm mt-1">Create narrated stories from still images.</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/create")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Create
            </Button>
          </div>

          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <Label htmlFor="image-story-prompt" className="text-base font-medium">Story prompt</Label>
                    <Textarea
                      id="image-story-prompt"
                      value={storyPrompt}
                      onChange={(e) => setStoryPrompt(e.target.value)}
                      placeholder="A cozy bedtime adventure about a tiny astronaut discovering a glowing moon garden"
                      className="mt-2 min-h-[96px]"
                    />
                  </div>

                  <div>
                    <Label className="text-base font-medium">Video Duration: {formatDuration(duration)}</Label>
                    <Slider value={[duration]} onValueChange={(v) => setDuration(v[0])} min={IMAGE_STORY_DURATION_MIN} max={IMAGE_STORY_DURATION_MAX} step={10} className="mt-3" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>10s</span>
                      <span>4min</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Label className="text-sm">Voice</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Select value={voiceId} onValueChange={setVoiceId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={voiceOptions.length ? "Select voice" : "Loading voices..."} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {voiceOptions.map((voice) => (
                              <SelectItem key={voice.id} value={voice.id}>{voice.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={!voiceOptions.some((v) => v.id === voiceId)}
                          onClick={() => {
                            const url = voiceOptions.find((v) => v.id === voiceId)?.previewUrl;
                            if (url) playVoicePreview(url);
                          }}
                          title="Play voice sample"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm">Transition</Label>
                      <Select value={transition} onValueChange={(v) => setTransition(v as ImageStoryTransition)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {IMAGE_STORY_TRANSITIONS.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-base font-medium">Aspect Ratio</Label>
                    <div className="flex gap-3 mt-2">
                      <Button type="button" variant={aspectRatio === "16:9" ? "default" : "outline"} onClick={() => setAspectRatio("16:9")} className="flex-1">Horizontal (16:9)</Button>
                      <Button type="button" variant={aspectRatio === "3:4" ? "default" : "outline"} onClick={() => setAspectRatio("3:4")} className="flex-1">Vertical (3:4)</Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Captions</Label>
                      <p className="text-sm text-muted-foreground">Add automatic captions to the final video.</p>
                    </div>
                    <Switch checked={addSubtitles} onCheckedChange={setAddSubtitles} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <Label className="text-base font-medium">Image References</Label>
                        <p className="text-sm text-muted-foreground">Optional images to guide the visual style.</p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadReferenceMutation.isPending}>
                        {uploadReferenceMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
                        Attach
                      </Button>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleReferenceSelect} />
                    </div>
                    {referenceImages.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {referenceImages.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative aspect-square rounded-md overflow-hidden border bg-muted">
                            <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                            <Button type="button" variant="destructive" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setReferenceImages((prev) => prev.filter((_, i) => i !== index))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
                        <ImageIcon className="h-7 w-7 mx-auto mb-2" />
                        <p className="text-sm">No reference images attached</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button type="button" onClick={() => generateScriptMutation.mutate()} disabled={!storyPrompt.trim() || generateScriptMutation.isPending} className="w-full h-12 bg-pink-600 hover:bg-pink-700">
                {generateScriptMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Generating script...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" /> Generate Script
                  </>
                )}
              </Button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Review Image Story Assets</h2>
                  <p className="text-sm text-muted-foreground">Scene images and narration generate automatically. Edit prompts or audio, then regenerate any scene.</p>
                </div>
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </div>

              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Image References</h3>
                      <p className="text-sm text-muted-foreground">Every scene is generated from these reference images.</p>
                    </div>
                    {isGeneratingAssets && referenceImages.length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Creating reference
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {referenceImages.length > 0 ? referenceImages.map((url, index) => (
                      <div key={`${url}-${index}`} className="h-24 w-24 shrink-0 rounded-md overflow-hidden border bg-muted">
                        <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                    )) : (
                      <div className="h-24 w-24 shrink-0 rounded-md border border-dashed bg-muted/40 flex items-center justify-center">
                        <Loader2 className={`h-5 w-5 text-muted-foreground ${isGeneratingAssets ? "animate-spin" : ""}`} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {(isGeneratingAssets || !assetsComplete) && script.length > 0 && (
                <Card>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Asset generation</span>
                      <span className="text-muted-foreground">{generatedImageCount}/{script.length} images, {generatedAudioCount}/{script.length} audio</span>
                    </div>
                    <Progress value={assetProgressPercent} className="h-2" />
                    {latestLogMessage && <p className="text-xs text-muted-foreground">{latestLogMessage}</p>}
                  </CardContent>
                </Card>
              )}

              {generationFailed && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {generationFailed}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {script.map((scene, index) => {
                  const imageUrl = sceneImages[index] || "";
                  const audioUrl = audioUrls[index] || "";
                  const isImageLoading = isGeneratingAssets && !imageUrl;
                  const isAudioLoading = isGeneratingAssets && !audioUrl;
                  const isRegeneratingImage = regeneratingImages.includes(index);
                  const isRegeneratingAudio = regeneratingAudio.includes(index);
                  return (
                    <div key={`${scene.id}-${index}`} className="rounded-lg border bg-card p-4 space-y-4" data-testid={`image-story-scene-${index + 1}`}>
                      <div className="flex items-start gap-4">
                        <div className="h-24 w-24 shrink-0 rounded-md overflow-hidden border bg-muted flex items-center justify-center">
                          {isImageLoading || isRegeneratingImage ? (
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          ) : imageUrl ? (
                            <img src={imageUrl} alt={`Scene ${index + 1}`} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold">Scene {index + 1}</h3>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                title="Regenerate scene image"
                                disabled={isRegeneratingImage || !projectId || !scene.scene_description?.trim()}
                                onClick={() => {
                                  setRegeneratingImages((prev) => [...prev, index]);
                                  regenerateImageMutation.mutate({ index, prompt: scene.scene_description || "" });
                                }}
                              >
                                {isRegeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                title="Regenerate scene audio"
                                disabled={isRegeneratingAudio || !projectId || !scene.audio.trim()}
                                onClick={() => {
                                  setRegeneratingAudio((prev) => [...prev, index]);
                                  regenerateAudioMutation.mutate({ index, audio: scene.audio });
                                }}
                              >
                                {isRegeneratingAudio || isAudioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {audioUrl ? "Audio ready" : isAudioLoading ? "Generating audio" : "Audio missing"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm text-muted-foreground">Image prompt</Label>
                        <Textarea
                          value={scene.scene_description || ""}
                          onChange={(e) => updateScene(index, { scene_description: e.target.value })}
                          className="mt-1 min-h-[92px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Audio script</Label>
                        <Textarea
                          value={scene.audio}
                          onChange={(e) => updateScene(index, { audio: e.target.value })}
                          className="mt-1 min-h-[76px] text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {!hasEnoughCredits && (
                <div className="space-y-2">
                  <FreePlanVideoUpsellParagraph user={user} />
                  {!isFreePlanUser(user) && (
                    <p className="text-center text-sm text-muted-foreground">
                      Credits Required: {creditsRequired.toLocaleString()} (You have {userCreditsRemaining.toLocaleString()} remaining)
                    </p>
                  )}
                </div>
              )}

              <Button
                type="button"
                onClick={() => generateVideoMutation.mutate()}
                disabled={generateVideoMutation.isPending || updateScriptMutation.isPending || !assetsComplete}
                className="w-full h-12 bg-pink-600 hover:bg-pink-700"
              >
                {generateVideoMutation.isPending || updateScriptMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Starting...
                  </>
                ) : (
                  <>
                    <Video className="h-5 w-5 mr-2" /> Generate video ({creditsRequired.toLocaleString()} credits)
                  </>
                )}
              </Button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              {!finalVideoUrl && (
                <Card>
                  <CardContent className="p-8 text-center space-y-6">
                    {generationFailed ? (
                      <div className="mx-auto h-12 w-12 rounded-full border border-destructive/30 bg-destructive/10 flex items-center justify-center text-destructive">!</div>
                    ) : (
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-pink-500" />
                    )}
                    <div>
                      <h2 className="text-xl font-semibold mb-2">{generationFailed ? "Image Story generation failed" : "Creating your Image Story"}</h2>
                      <p className="text-muted-foreground text-sm">
                        {generationFailed || "Transitions, captions, and final render are in progress. Keep this page open."}
                      </p>
                    </div>
                    <div className="max-w-md mx-auto space-y-3">
                      <Progress value={Math.max(0, Math.min(100, videoProgressPercent))} className="h-3" />
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {Math.max(0, Math.min(100, videoProgressPercent))}% complete
                      </p>
                      <div className="space-y-1">
                        {visibleVideoProgressSteps.map((step, index) => {
                          const done = completedKeys.has(step.key);
                          const active = !generationFailed && index === activeVideoIndex;
                          return (
                            <div key={step.key} className={`flex items-center gap-2 text-sm ${done ? "text-green-500" : active ? "text-pink-500 font-medium" : "text-muted-foreground"}`}>
                              {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />}
                              {step.label}
                            </div>
                          );
                        })}
                      </div>
                      {latestLogMessage && <p className="text-xs text-muted-foreground">{latestLogMessage}</p>}
                      {generationFailed && (
                        <Button type="button" variant="outline" onClick={() => setCurrentStep(2)}>
                          Back to Assets
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {finalVideoUrl && (
                <>
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold mb-4 text-center">Your Image Story is Ready</h2>
                      <ResponsiveFinalVideo src={finalVideoUrl} />
                    </CardContent>
                  </Card>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => navigate("/my-videos")}>View My Videos</Button>
                    <Button variant="outline" className="flex-1" onClick={() => setCurrentStep(2)}>Edit Assets</Button>
                    <Button
                      className="flex-1 bg-pink-600 hover:bg-pink-700"
                      onClick={() => {
                        editLoadedRef.current = false;
                        setCurrentStep(1);
                        setProjectId(null);
                        setScript([]);
                        setSceneImages([]);
                        setAudioUrls([]);
                        setReferenceImages([]);
                        setFinalVideoUrl(null);
                        setStoryPrompt("");
                        setIsGeneratingAssets(false);
                        setIsGeneratingVideo(false);
                        setGenerationFailed(null);
                        navigate("/create/image-story");
                      }}
                    >
                      Create Another
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
