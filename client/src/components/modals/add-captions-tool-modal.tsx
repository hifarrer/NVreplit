import { useState, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Loader2, Subtitles, ArrowUp, AlignVerticalSpaceAround, ArrowDown, Upload, Link as LinkIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { subtitleStyleOptions, type SubtitleStyle } from "@shared/subtitleStyles";

interface AddCaptionsToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const POSITION_OPTIONS: { value: "top" | "center" | "bottom"; label: string; Icon: typeof ArrowUp }[] = [
  { value: "top", label: "Top", Icon: ArrowUp },
  { value: "center", label: "Center", Icon: AlignVerticalSpaceAround },
  { value: "bottom", label: "Bottom", Icon: ArrowDown },
];

const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

export function AddCaptionsToolModal({ isOpen, onClose, onSuccess }: AddCaptionsToolModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("yellow-bg");
  const [position, setPosition] = useState<"top" | "center" | "bottom">("bottom");

  const addCaptionsMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("subtitleStyle", subtitleStyle);
      form.append("position", position);
      if (videoFile) {
        form.append("video", videoFile);
      } else if (videoUrl.trim()) {
        form.append("videoUrl", videoUrl.trim());
      } else {
        throw new Error("Provide a video URL or upload a video file.");
      }
      const res = await apiRequest("POST", "/api/tools/add-captions", form);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-videos"] });
      toast({
        title: "Captions added",
        description: `"${data.title}" has been created and saved to your videos.`,
      });
      onSuccess?.();
      onClose();
      setVideoUrl("");
      setVideoFile(null);
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
    if (!videoUrl.trim() && !videoFile) {
      toast({
        title: "Video required",
        description: "Enter a video URL or upload a video file.",
        variant: "destructive",
      });
      return;
    }
    addCaptionsMutation.mutate();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl("");
    }
    e.target.value = "";
  };

  const clearFile = () => {
    setVideoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isPending = addCaptionsMutation.isPending;
  const canSubmit = (videoUrl.trim() || videoFile) && !isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <Subtitles className="h-5 w-5 shrink-0" />
            Add Captions
          </DialogTitle>
          <DialogDescription className="text-balance break-words pr-2">
            Add TikTok-style captions to any video. Provide a video URL or upload a video file. The result will be saved to your library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0 overflow-hidden">
          <div className="min-w-0">
            <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
              <LinkIcon className="h-4 w-4 shrink-0" />
              Video URL
            </Label>
            <Input
              placeholder="https://..."
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                if (videoFile) setVideoFile(null);
              }}
              disabled={!!videoFile}
              className="font-mono text-sm min-w-0"
            />
          </div>

          <div className="min-w-0">
            <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
              <Upload className="h-4 w-4 shrink-0" />
              Or upload a video
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_VIDEO}
              onChange={handleFileChange}
              className="hidden"
            />
            {videoFile ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm min-w-0">
                <span className="truncate text-foreground min-w-0">{videoFile.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearFile} className="shrink-0">
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!videoUrl.trim()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose file (MP4, MOV, WebM)
              </Button>
            )}
          </div>

          <div className="min-w-0">
            <Label className="text-sm font-semibold mb-2 block">Caption style (colors)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
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

          <div className="min-w-0">
            <Label className="text-sm font-semibold mb-2 block">Caption position</Label>
            <div className="flex gap-2 min-w-0">
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
            <p className="text-xs text-muted-foreground mt-1">Top / Center / Bottom</p>
          </div>
        </div>

        {isPending && (
          <div className="space-y-2 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding captions…
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full min-w-[30%] w-2/3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
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
      </DialogContent>
    </Dialog>
  );
}
