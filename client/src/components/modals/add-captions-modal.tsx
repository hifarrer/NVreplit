import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Subtitles, ArrowUp, AlignVerticalSpaceAround, ArrowDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { subtitleStyleOptions, type SubtitleStyle } from "@shared/subtitleStyles";

export interface VideoForCaptions {
  id: string;
  title: string;
  videoUrl: string;
  aspectRatio?: string;
}

interface AddCaptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: VideoForCaptions | null;
  onSuccess?: () => void;
}

const POSITION_OPTIONS: { value: "top" | "center" | "bottom"; label: string; Icon: typeof ArrowUp }[] = [
  { value: "top", label: "Top", Icon: ArrowUp },
  { value: "center", label: "Center", Icon: AlignVerticalSpaceAround },
  { value: "bottom", label: "Bottom", Icon: ArrowDown },
];

export function AddCaptionsModal({ isOpen, onClose, video, onSuccess }: AddCaptionsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("yellow-bg");
  const [position, setPosition] = useState<"top" | "center" | "bottom">("bottom");

  const addCaptionsMutation = useMutation({
    mutationFn: async (payload: { videoId: string; subtitleStyle: SubtitleStyle; position: string }) => {
      const res = await apiRequest("POST", `/api/videos/${payload.videoId}/add-captions`, {
        subtitleStyle: payload.subtitleStyle,
        position: payload.position,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-videos"] });
      toast({
        title: "Captions added",
        description: `"${data.title}" has been created and is in your videos.`,
      });
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to add captions",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!video) return;
    addCaptionsMutation.mutate({
      videoId: video.id,
      subtitleStyle,
      position,
    });
  };

  const isPending = addCaptionsMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Subtitles className="h-5 w-5" />
            Add captions
          </DialogTitle>
          <DialogDescription>
            {video
              ? `Add TikTok-style captions to "${video.title}". A new video will be created and saved to your library.`
              : "Select a video to add captions."}
          </DialogDescription>
        </DialogHeader>

        {video && (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-semibold mb-2 block">Caption style (colors)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {subtitleStyleOptions.map((option) => {
                    const previewStyle =
                      option.value === "plain-white"
                        ? { color: "#fff", background: "transparent", textShadow: "0 2px 8px rgba(0,0,0,0.9)" }
                        : option.value === "yellow-bg"
                          ? { color: "#fff", background: "#facc15" }
                          : option.value === "pink-bg"
                            ? { color: "#fff", background: "#ec4899" }
                            : option.value === "blue-bg"
                              ? { color: "#fff", background: "#3b82f6" }
                              : { color: "#fff", background: "#ef4444" };
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={subtitleStyle === option.value ? "default" : "outline"}
                        size="sm"
                        className="justify-start text-xs h-9"
                        onClick={() => setSubtitleStyle(option.value)}
                      >
                        <span
                          className="inline-block w-4 h-4 rounded mr-2 border border-border flex-shrink-0"
                          style={previewStyle}
                        />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Caption position</Label>
                <div className="flex gap-2">
                  {POSITION_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={position === opt.value ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setPosition(opt.value)}
                      title={opt.label}
                    >
                      <opt.Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Top / Center / Bottom
                </p>
              </div>
            </div>

            {isPending && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding captions and uploading…
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full min-w-[30%] w-2/3 rounded-full bg-primary animate-pulse" />
                </div>
              </div>
            )}

            <DialogFooter className="flex-row gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  "Add captions"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
