import { useState, useRef, useEffect } from "react";
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
import { Loader2, Eraser, Upload, Link as LinkIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VideoBackgroundRemoverToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

const CREDITS_PER_15S = 250;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoBackgroundRemoverToolModal({ isOpen, onClose }: VideoBackgroundRemoverToolModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [durationLoading, setDurationLoading] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const previewUrl = videoFile ? "" : videoUrl.trim();

  useEffect(() => {
    if (!isOpen) {
      setResultUrl(null);
      setDurationError(null);
      setDuration(0);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setObjectUrl(null);
      };
    } else {
      setObjectUrl(null);
    }
  }, [videoFile]);

  const loadSource = previewUrl || objectUrl || "";
  useEffect(() => {
    if (!loadSource) {
      setDuration(0);
      setDurationLoading(false);
      setDurationError(null);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    setDuration(0);
    setDurationLoading(true);
    setDurationError(null);

    const onLoadedMetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        setDurationError(null);
      } else {
        setDuration(0);
        setDurationError("Could not read video duration.");
      }
      setDurationLoading(false);
    };
    const onError = () => {
      setDuration(0);
      setDurationError("Video failed to load. Check the URL or try uploading a file.");
      setDurationLoading(false);
    };

    video.src = loadSource;
    video.load();
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
    };
  }, [loadSource]);

  const durationSeconds = Math.ceil(duration);

  const removerMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("duration_seconds", String(durationSeconds));
      if (videoFile) {
        form.append("video", videoFile);
      } else if (videoUrl.trim()) {
        form.append("videoUrl", videoUrl.trim());
      } else {
        throw new Error("Provide a video URL or upload a video file.");
      }
      const res = await apiRequest("POST", "/api/tools/video-background-remover", form, { timeout: 900000 });
      return res.json();
    },
    onSuccess: (data) => {
      setResultUrl(data.download_url || null);
      if (data.creditsRequired) {
        toast({
          title: "Background removed",
          description: `Video processed using ${data.creditsRequired} credits.`,
        });
      } else {
        toast({
          title: "Background removed",
          description: "Your video is ready.",
        });
      }
    },
    onError: (error: any) => {
      const message =
        error?.status === 402
          ? error.message || "You don't have enough credits for Video Background Remover."
          : error instanceof Error
            ? error.message
            : "Something went wrong";
      toast({
        title: "Video Background Remover failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl("");
      setResultUrl(null);
    }
    e.target.value = "";
  };

  const clearFile = () => {
    setVideoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setResultUrl(null);
    setDuration(0);
    setDurationError(null);
  };

  const handleSubmit = () => {
    if (!videoUrl.trim() && !videoFile) {
      toast({
        title: "Video required",
        description: "Enter a video URL or upload a video file.",
        variant: "destructive",
      });
      return;
    }
    if (duration <= 0 || durationError) {
      toast({
        title: "Video duration required",
        description: durationError || "Could not read video length. Try uploading a file instead.",
        variant: "destructive",
      });
      return;
    }
    removerMutation.mutate();
  };

  const hasSource = !!videoUrl.trim() || !!videoFile;
  const isPending = removerMutation.isPending;
  const canSubmit = hasSource && duration > 0 && !durationError && !durationLoading && !isPending;

  const units = Math.max(1, Math.ceil(durationSeconds / 15));
  const estimatedCredits = units * CREDITS_PER_15S;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="h-5 w-5 shrink-0" />
            Video Background Remover
          </DialogTitle>
          <DialogDescription className="text-balance break-words pr-2">
            Remove the background from a video using AI. Cost: 250 credits per 15 seconds.
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
                if (videoFile) clearFile();
                setResultUrl(null);
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

          {hasSource && (
            <div className="min-w-0">
              <video ref={videoRef} className="hidden" crossOrigin="anonymous" preload="metadata" />
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Video length</Label>
                {durationLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading video…
                  </div>
                )}
                {!durationLoading && durationError && (
                  <p className="text-amber-600 text-xs">{durationError}</p>
                )}
                {!durationLoading && duration > 0 && !durationError && (
                  <p className="text-foreground font-medium">{formatDuration(duration)}</p>
                )}
              </div>
            </div>
          )}

          {hasSource && duration > 0 && !durationError && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1 min-w-0">
              <div className="flex justify-between">
                <span>15-second units</span>
                <span>{units}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated credits</span>
                <span>{estimatedCredits}</span>
              </div>
            </div>
          )}
        </div>

        {resultUrl && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 min-w-0 overflow-hidden">
            <Label className="text-sm font-semibold">Video with background removed</Label>
            <video src={resultUrl} controls className="w-full rounded-md max-h-56 bg-black" />
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline block"
            >
              Open / download
            </a>
          </div>
        )}

        {isPending && (
          <div className="space-y-2 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Removing background… this may take a while.
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full min-w-[30%] w-2/3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {resultUrl ? "Close" : "Cancel"}
          </Button>
          {!resultUrl && (
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove background"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
