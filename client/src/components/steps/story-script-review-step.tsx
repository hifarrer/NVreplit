import { useRef, useState, useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SceneData } from "@/lib/types";
import type { StoryScene } from "@shared/storyConstants";
import { SceneTimeline } from "@/components/scene-timeline";
import { CameraAngleModal } from "@/components/modals/camera-angle-modal";
import { RefreshCw, Upload, Loader2, Mic, Image as ImageIcon, Camera, ChevronLeft } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface StoryScriptReviewStepProps {
  projectId: string;
  storyDuration: number;
  script: StoryScene[];
  sceneImages: string[];
  audioUrls: string[];
  finalVideoUrl?: string | null;
  isEditMode?: boolean;
  storyGenerationCredits: number;
  generatePending: boolean;
  onScriptChange: (next: StoryScene[]) => void;
  onSceneImagesChange: (next: string[]) => void;
  onAudioUrlsChange: (next: string[]) => void;
  onBack: () => void;
  onGenerateVideo: () => void;
}

export function StoryScriptReviewStep({
  projectId,
  storyDuration,
  script,
  sceneImages,
  audioUrls,
  finalVideoUrl,
  isEditMode,
  storyGenerationCredits,
  generatePending,
  onScriptChange,
  onSceneImagesChange,
  onAudioUrlsChange,
  onBack,
  onGenerateVideo,
}: StoryScriptReviewStepProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const [uploadingScenes, setUploadingScenes] = useState<number[]>([]);
  const [cameraAngleScenes, setCameraAngleScenes] = useState<number[]>([]);
  const [cameraAngleModalOpen, setCameraAngleModalOpen] = useState(false);
  const [cameraAngleSceneIndex, setCameraAngleSceneIndex] = useState<number | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSceneIndex, setPreviewSceneIndex] = useState<number | null>(null);

  const sceneOrder = useMemo(() => Array.from({ length: script.length }, (_, i) => i), [script.length]);

  const timelineScenes: SceneData[] = useMemo(
    () =>
      script.map((s, i) => ({
        prompt: s.scene_description,
        imageUrl: sceneImages[i] ?? "",
        lipsync: s.character !== "Narrator",
      })),
    [script, sceneImages],
  );

  const dialogueLyrics = useMemo(() => script.map((s) => s.audio).join("\n"), [script]);

  const previewAudioUrl = useMemo(() => audioUrls.find((u) => u && u.length > 0), [audioUrls]);

  const invalidateProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
  }, [queryClient, projectId]);

  const handleReorder = useCallback(
    (newOrder: number[]) => {
      onScriptChange(newOrder.map((i) => script[i]));
      onSceneImagesChange(newOrder.map((i) => sceneImages[i] ?? ""));
      onAudioUrlsChange(newOrder.map((i) => audioUrls[i] ?? ""));
    },
    [script, sceneImages, audioUrls, onScriptChange, onSceneImagesChange, onAudioUrlsChange],
  );

  const scrollToScene = useCallback((sceneIndex: number) => {
    const el = document.querySelector(`[data-testid="story-scene-${sceneIndex + 1}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const regenerateMutation = useMutation({
    mutationFn: async ({ sceneIndex, prompt }: { sceneIndex: number; prompt: string }) => {
      const res = await apiRequest("POST", `/api/story-video/${projectId}/regenerate-scene/${sceneIndex}`, {
        prompt,
      });
      return (await res.json()) as { imageUrl: string };
    },
    onSuccess: (data, { sceneIndex }) => {
      const next = [...sceneImages];
      next[sceneIndex] = data.imageUrl;
      onSceneImagesChange(next);
      setRegeneratingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      invalidateProject();
      toast({ title: "Scene image updated" });
    },
    onError: (e: Error, { sceneIndex }) => {
      setRegeneratingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      toast({ title: "Regeneration failed", description: e.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ sceneIndex, file }: { sceneIndex: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("sceneIndex", String(sceneIndex));
      const res = await apiRequest("POST", `/api/story-video/${projectId}/upload-scene-image`, formData);
      return (await res.json()) as { imageUrl: string };
    },
    onSuccess: (data, { sceneIndex }) => {
      const next = [...sceneImages];
      next[sceneIndex] = data.imageUrl;
      onSceneImagesChange(next);
      setUploadingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      invalidateProject();
      toast({ title: "Image uploaded" });
    },
    onError: (e: Error, { sceneIndex }) => {
      setUploadingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  const cameraAngleMutation = useMutation({
    mutationFn: async ({
      sceneIndex,
      horizontalAngle,
      verticalAngle,
      distance,
    }: {
      sceneIndex: number;
      horizontalAngle: number;
      verticalAngle: number;
      distance: number;
    }) => {
      const imageUrl = sceneImages[sceneIndex];
      if (!imageUrl) throw new Error("No image for this scene");
      const res = await apiRequest("POST", "/api/change-camera-angle", {
        imageUrl,
        horizontalAngle,
        verticalAngle,
        distance,
      });
      const data = (await res.json()) as { imageUrl: string };
      await apiRequest("PATCH", `/api/story-video/${projectId}/scene-image`, {
        sceneIndex,
        imageUrl: data.imageUrl,
      });
      return data;
    },
    onSuccess: (data, { sceneIndex }) => {
      const next = [...sceneImages];
      next[sceneIndex] = data.imageUrl;
      onSceneImagesChange(next);
      setCameraAngleScenes((prev) => prev.filter((i) => i !== sceneIndex));
      setCameraAngleModalOpen(false);
      setCameraAngleSceneIndex(null);
      invalidateProject();
      toast({ title: "Camera angle updated" });
    },
    onError: (e: Error, { sceneIndex }) => {
      setCameraAngleScenes((prev) => prev.filter((i) => i !== sceneIndex));
      setCameraAngleModalOpen(false);
      setCameraAngleSceneIndex(null);
      toast({ title: "Camera angle failed", description: e.message, variant: "destructive" });
    },
  });

  const triggerFileInput = (index: number) => {
    fileInputRefs.current[index]?.click();
  };

  const handleFileSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }
    setUploadingScenes((prev) => [...prev, index]);
    uploadMutation.mutate({ sceneIndex: index, file });
  };

  const updateSceneField = (index: number, patch: Partial<StoryScene>) => {
    const next = script.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onScriptChange(next);
  };

  return (
    <div className="max-w-6xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4" data-testid="story-script-review-step">
      <div className="bg-background border border-border rounded-lg p-4 sm:p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-2xl font-bold gradient-text mb-1">
              {isEditMode ? "Edit Your Story Video" : "Review Your Story Script"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Timeline, scene art, and dialogue — same layout as music-video editing. Reorder scenes by dragging thumbnails.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onBack} className="shrink-0">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        {script.length > 0 && sceneOrder.length > 0 && (
          <SceneTimeline
            scenes={timelineScenes}
            sceneOrder={sceneOrder}
            audioDuration={storyDuration}
            audioUrl={previewAudioUrl}
            lyrics={dialogueLyrics}
            finalVideoUrl={finalVideoUrl ?? undefined}
            isEditMode={!!finalVideoUrl}
            isInstrumental={false}
            timelineLayout="story"
            lipsyncReadOnly
            onReorder={handleReorder}
            onSceneClick={scrollToScene}
          />
        )}

        {script.length > 0 && (
          <>
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-muted-foreground">
                <span className="text-primary font-medium">All scenes are ready!</span> You can proceed to create your
                video, or optionally customize the scenes above.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
              {script.map((scene, index) => {
                const imageUrl = sceneImages[index] ?? "";
                const speaking = scene.character !== "Narrator";
                return (
                  <div
                    key={`${scene.id}-${index}`}
                    className="bg-muted/20 rounded-lg p-4 border border-border"
                    data-testid={`story-scene-${index + 1}`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0 ${
                            imageUrl ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow" : ""
                          }`}
                          onClick={() => {
                            if (imageUrl) {
                              setPreviewUrl(imageUrl);
                              setPreviewSceneIndex(index);
                              setPreviewModalOpen(true);
                            }
                          }}
                          role={imageUrl ? "button" : undefined}
                        >
                          {regeneratingScenes.includes(index) || uploadingScenes.includes(index) ? (
                            <Loader2 className="w-6 h-6 animate-spin text-white" />
                          ) : imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={`Scene ${index + 1}`}
                              className="w-full h-full object-cover rounded-lg pointer-events-none"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-white/80" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-semibold">Scene {scene.id}</h5>
                            <span className="text-xs text-muted-foreground truncate">{scene.character}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Mic
                                      className={`w-4 h-4 ${speaking ? "text-pink-500" : "text-muted-foreground"}`}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {speaking
                                      ? "Character speaks on camera in this scene"
                                      : "Narrator / voiceover style"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Image Options:</label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRegeneratingScenes((prev) => [...prev, index]);
                              regenerateMutation.mutate({
                                sceneIndex: index,
                                prompt: scene.scene_description,
                              });
                            }}
                            disabled={
                              regeneratingScenes.includes(index) ||
                              uploadingScenes.includes(index) ||
                              cameraAngleScenes.includes(index)
                            }
                            className="flex items-center gap-2"
                          >
                            <RefreshCw
                              className={`w-4 h-4 ${regeneratingScenes.includes(index) ? "animate-spin" : ""}`}
                            />
                            {regeneratingScenes.includes(index) ? "Regenerating..." : "Regenerate Image"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerFileInput(index)}
                            disabled={
                              regeneratingScenes.includes(index) ||
                              uploadingScenes.includes(index) ||
                              cameraAngleScenes.includes(index)
                            }
                            className="flex items-center gap-2"
                          >
                            {uploadingScenes.includes(index) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                            {uploadingScenes.includes(index) ? "Uploading..." : "Upload"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCameraAngleSceneIndex(index);
                              setCameraAngleModalOpen(true);
                            }}
                            disabled={
                              regeneratingScenes.includes(index) ||
                              uploadingScenes.includes(index) ||
                              cameraAngleScenes.includes(index) ||
                              !imageUrl
                            }
                            className="flex items-center gap-2"
                          >
                            {cameraAngleScenes.includes(index) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4" />
                            )}
                            {cameraAngleScenes.includes(index) ? "Processing..." : "Camera angle"}
                          </Button>
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            className="hidden"
                            ref={(el) => {
                              fileInputRefs.current[index] = el;
                            }}
                            onChange={(e) => handleFileSelect(index, e)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Dialogue / Narration</Label>
                        <Textarea
                          value={scene.audio}
                          onChange={(e) => updateSceneField(index, { audio: e.target.value })}
                          className="mt-1 min-h-[72px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Scene Prompt</Label>
                        <Textarea
                          value={scene.scene_description}
                          onChange={(e) => updateSceneField(index, { scene_description: e.target.value })}
                          className="mt-1 min-h-[100px] text-sm"
                          placeholder="Describe the scene in detail..."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex justify-center">
          <Button
            onClick={onGenerateVideo}
            disabled={generatePending || script.length === 0}
            className="floating-button py-3 px-6 sm:px-10 text-sm sm:text-base button-glow"
          >
            {generatePending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin inline" /> Starting...
              </>
            ) : (
              <>
                <Mic className="h-5 w-5 mr-2 inline" />
                {`${isEditMode ? "Regenerate story video" : "Generate story video"} (${storyGenerationCredits.toLocaleString()} credits)`}
              </>
            )}
          </Button>
        </div>
      </div>

      <CameraAngleModal
        isOpen={cameraAngleModalOpen}
        onClose={() => {
          setCameraAngleModalOpen(false);
          setCameraAngleSceneIndex(null);
        }}
        onApply={({ horizontalAngle, verticalAngle, distance }) => {
          if (cameraAngleSceneIndex === null) return;
          setCameraAngleScenes((prev) => [...prev, cameraAngleSceneIndex]);
          cameraAngleMutation.mutate({
            sceneIndex: cameraAngleSceneIndex,
            horizontalAngle,
            verticalAngle,
            distance,
          });
        }}
        isLoading={cameraAngleMutation.isPending}
        sceneIndex={cameraAngleSceneIndex ?? 0}
      />

      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Scene {previewSceneIndex != null ? previewSceneIndex + 1 : ""} — Image</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 pt-0 bg-muted/30 rounded-b-lg overflow-auto">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Scene preview"
                className="max-w-full max-h-[70vh] w-auto h-auto object-contain rounded-lg shadow-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
