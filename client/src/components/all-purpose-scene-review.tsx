import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SceneTimeline } from "@/components/scene-timeline";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SceneData } from "@/lib/types";
import {
  Loader2,
  Video,
  ArrowLeft,
  Image as ImageIcon,
  RefreshCw,
  Upload,
} from "lucide-react";

interface AllPurposeSceneReviewProps {
  projectId: string;
  scenes: SceneData[];
  setScenes: Dispatch<SetStateAction<SceneData[]>>;
  sceneOrder: number[];
  onSceneOrderChange: (order: number[]) => void;
  sceneVideoPrompts: string[];
  audioDuration: number;
  characterImageUrl?: string | null;
  onBack: () => void;
  onGenerateClips: () => void;
  generateClipsPending: boolean;
}

export function AllPurposeSceneReview({
  projectId,
  scenes,
  setScenes,
  sceneOrder,
  onSceneOrderChange,
  sceneVideoPrompts,
  audioDuration,
  characterImageUrl,
  onBack,
  onGenerateClips,
  generateClipsPending,
}: AllPurposeSceneReviewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const [uploadingScenes, setUploadingScenes] = useState<number[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSceneIndex, setPreviewSceneIndex] = useState<number | null>(null);

  const canRegenerateWithCharacter = !!characterImageUrl;

  const invalidateProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
  }, [queryClient, projectId]);

  /** `sceneIndex` is the underlying scene slot (matches SceneTimeline click). */
  const scrollToScene = useCallback((sceneIndex: number) => {
    const el = document.querySelector(`[data-scene-index="${sceneIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const regenerateMutation = useMutation({
    mutationFn: async ({ sceneIndex, prompt }: { sceneIndex: number; prompt: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/regenerate-scene`, {
        sceneIndex,
        prompt,
        lipsyncScene: false,
      });
      return (await res.json()) as { imageUrl: string };
    },
    onSuccess: (data, { sceneIndex }) => {
      setScenes((prev) =>
        prev.map((s, i) => (i === sceneIndex ? { ...s, imageUrl: data.imageUrl } : s)),
      );
      setRegeneratingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      invalidateProject();
      toast({ title: "Scene image updated" });
    },
    onError: (e: Error, { sceneIndex }) => {
      setRegeneratingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      toast({
        title: "Regeneration failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ sceneIndex, file }: { sceneIndex: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("sceneIndex", String(sceneIndex));
      const res = await apiRequest("POST", `/api/projects/${projectId}/upload-scene-image`, formData);
      return (await res.json()) as { imageUrl: string };
    },
    onSuccess: (data, { sceneIndex }) => {
      setScenes((prev) =>
        prev.map((s, i) => (i === sceneIndex ? { ...s, imageUrl: data.imageUrl } : s)),
      );
      setUploadingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      invalidateProject();
      toast({ title: "Image uploaded" });
    },
    onError: (e: Error, { sceneIndex }) => {
      setUploadingScenes((prev) => prev.filter((i) => i !== sceneIndex));
      toast({
        title: "Upload failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const updateScenePrompt = (sceneIndex: number, prompt: string) => {
    setScenes((prev) => prev.map((s, i) => (i === sceneIndex ? { ...s, prompt } : s)));
  };

  const triggerFileInput = (sceneIndex: number) => {
    fileInputRefs.current[sceneIndex]?.click();
  };

  const handleFileSelect = (sceneIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingScenes((prev) => [...prev, sceneIndex]);
      uploadMutation.mutate({ sceneIndex, file });
    }
    e.target.value = "";
  };

  return (
    <div
      className="max-w-6xl mx-auto mb-12 bg-card rounded-lg p-2 sm:p-4"
      data-testid="all-purpose-scene-review"
    >
      <div className="bg-background border border-border rounded-lg p-4 sm:p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-2xl font-bold gradient-text mb-1">Review Your Scenes</h3>
            <p className="text-sm text-muted-foreground">
              Scene timeline and prompts. Reorder scenes by dragging thumbnails. Edit image prompts before
              regenerating.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Settings
          </Button>
        </div>

        {scenes.length > 0 && sceneOrder.length > 0 && (
          <SceneTimeline
            scenes={scenes}
            sceneOrder={sceneOrder}
            audioDuration={audioDuration}
            isInstrumental={true}
            timelineLayout="story"
            lipsyncReadOnly={true}
            hideDialogueAndAudioTracks
            onReorder={onSceneOrderChange}
            onSceneClick={scrollToScene}
          />
        )}

        <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-4 mb-6 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">All scenes are ready!</span> You can proceed to
            generate your video, or customize prompts and images below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
          {sceneOrder.map((sceneIndex, displayPosition) => {
            const scene = scenes[sceneIndex];
            if (!scene) return null;
            const imageUrl = scene.imageUrl ?? "";
            const videoPrompt = sceneVideoPrompts[sceneIndex] ?? "";

            return (
              <div
                key={`scene-${sceneIndex}-${displayPosition}`}
                className="bg-muted/20 rounded-lg p-4 border border-border"
                data-scene-index={sceneIndex}
                data-testid={`all-purpose-scene-slot-${sceneIndex + 1}`}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${
                        imageUrl ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow" : ""
                      }`}
                      onClick={() => {
                        if (imageUrl) {
                          setPreviewUrl(imageUrl);
                          setPreviewSceneIndex(sceneIndex);
                          setPreviewModalOpen(true);
                        }
                      }}
                      role={imageUrl ? "button" : undefined}
                    >
                      {regeneratingScenes.includes(sceneIndex) || uploadingScenes.includes(sceneIndex) ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={`Scene ${displayPosition + 1}`}
                          className="w-full h-full object-cover rounded-lg pointer-events-none"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-white/80" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-semibold">Scene {displayPosition + 1}</h5>
                      <p className="text-xs text-muted-foreground">
                        Order {displayPosition + 1} of {sceneOrder.length}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Image options
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!canRegenerateWithCharacter) {
                            toast({
                              title: "Character image required",
                              description:
                                "Add a character reference on the previous step to regenerate scene images from a prompt.",
                              variant: "destructive",
                            });
                            return;
                          }
                          setRegeneratingScenes((prev) => [...prev, sceneIndex]);
                          regenerateMutation.mutate({
                            sceneIndex,
                            prompt: scene.prompt,
                          });
                        }}
                        disabled={
                          regeneratingScenes.includes(sceneIndex) ||
                          uploadingScenes.includes(sceneIndex) ||
                          !scene.prompt.trim()
                        }
                        className="flex items-center gap-2"
                        title={
                          !canRegenerateWithCharacter
                            ? "Requires a character reference image from the previous step"
                            : undefined
                        }
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${regeneratingScenes.includes(sceneIndex) ? "animate-spin" : ""}`}
                        />
                        {regeneratingScenes.includes(sceneIndex) ? "Regenerating..." : "Regenerate Image"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerFileInput(sceneIndex)}
                        disabled={regeneratingScenes.includes(sceneIndex) || uploadingScenes.includes(sceneIndex)}
                        className="flex items-center gap-2"
                      >
                        {uploadingScenes.includes(sceneIndex) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploadingScenes.includes(sceneIndex) ? "Uploading..." : "Upload"}
                      </Button>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        className="hidden"
                        ref={(el) => {
                          fileInputRefs.current[sceneIndex] = el;
                        }}
                        onChange={(e) => handleFileSelect(sceneIndex, e)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Image prompt</Label>
                    <Textarea
                      value={scene.prompt}
                      onChange={(e) => updateScenePrompt(sceneIndex, e.target.value)}
                      className="mt-1 min-h-[100px] text-sm bg-background text-foreground border-border"
                      placeholder="Describe the still image for this scene..."
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Video prompt</Label>
                    <Textarea
                      value={videoPrompt}
                      readOnly
                      className="mt-1 min-h-[72px] text-sm bg-background text-foreground border-border cursor-default read-only:focus-visible:ring-0"
                      placeholder="Video motion prompt (set when scenes were planned)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Used when generating the motion clip for this scene.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button
            type="button"
            onClick={onGenerateClips}
            disabled={generateClipsPending || scenes.length === 0}
            className="floating-button py-3 px-6 sm:px-10 text-sm sm:text-base button-glow w-full sm:w-auto"
          >
            {generateClipsPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin inline" /> Starting...
              </>
            ) : (
              <>
                <Video className="h-5 w-5 mr-2 inline" />
                Generate video
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>
              Scene {previewSceneIndex != null ? previewSceneIndex + 1 : ""} — Image
            </DialogTitle>
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
