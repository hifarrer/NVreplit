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
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Loader2, Scissors, Upload, Link as LinkIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrimVideoToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrimVideoToolModal({ isOpen, onClose }: TrimVideoToolModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const previewUrl = videoFile ? "" : videoUrl.trim();

  useEffect(() => {
    if (!isOpen) {
      setResultUrl(null);
      setDurationError(null);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
    }
  }, [isOpen, objectUrl]);

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
      setDurationError(null);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        setStartTime(0);
        setEndTime(Math.min(60, d));
        setDurationError(null);
      } else {
        setDuration(0);
        setDurationError("Could not get video duration.");
      }
    };
    const onError = () => {
      setDuration(0);
      setDurationError("Video failed to load. Use manual start/end times.");
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

  useEffect(() => {
    if (duration > 0 && endTime > duration) setEndTime(duration);
    if (startTime >= endTime && endTime > 0) setStartTime(Math.max(0, endTime - 1));
  }, [duration, startTime, endTime]);

  useEffect(() => {
    const hasSource = !!videoUrl.trim() || !!videoFile;
    if (hasSource && duration === 0 && endTime <= startTime) setEndTime(startTime + 60);
  }, [videoUrl, videoFile, duration, startTime, endTime]);

  const trimMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("start_time", String(startTime));
      form.append("end_time", String(endTime));
      if (videoFile) {
        form.append("video", videoFile);
      } else if (videoUrl.trim()) {
        form.append("videoUrl", videoUrl.trim());
      } else {
        throw new Error("Provide a video URL or upload a video file.");
      }
      const res = await apiRequest("POST", "/api/tools/trim-video", form);
      return res.json();
    },
    onSuccess: (data) => {
      setResultUrl(data.download_url || null);
      toast({
        title: "Video trimmed",
        description: "Your trimmed video is ready.",
      });
    },
    onError: (error) => {
      toast({
        title: "Trim failed",
        description: error instanceof Error ? error.message : "Something went wrong",
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
    if (endTime <= startTime) {
      toast({
        title: "Invalid range",
        description: "End time must be greater than start time.",
        variant: "destructive",
      });
      return;
    }
    trimMutation.mutate();
  };

  const hasSource = !!videoUrl.trim() || !!videoFile;
  const isPending = trimMutation.isPending;
  const canSubmit = hasSource && endTime > startTime && !isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 shrink-0" />
            Trim Video
          </DialogTitle>
          <DialogDescription className="text-balance break-words pr-2">
            Provide a video URL or upload a video, then set the start and end time. The trimmed video will be available to watch or download (not saved to your library).
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
              {durationError && (
                <p className="text-sm text-amber-600">{durationError}</p>
              )}
              <div className="min-w-0">
                <Label className="text-sm font-semibold mb-2 block">Timeline (start – end)</Label>
                {duration > 0 ? (
                  <>
                    <SliderPrimitive.Root
                      className="relative flex w-full touch-none select-none items-center"
                      value={[startTime, endTime]}
                      max={duration}
                      step={0.5}
                      onValueChange={([s, e]) => {
                        setStartTime(s);
                        setEndTime(e);
                      }}
                    >
                      <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-secondary">
                        <SliderPrimitive.Range className="absolute h-full bg-primary" />
                      </SliderPrimitive.Track>
                      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing" />
                      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing" />
                    </SliderPrimitive.Root>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatTime(startTime)}</span>
                      <span>{formatTime(endTime)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duration: {formatTime(Math.max(0, endTime - startTime))} (of {formatTime(duration)})
                    </p>
                  </>
                ) : (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Label className="text-xs">Start (seconds)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={endTime - 0.5}
                        step={0.5}
                        value={startTime}
                        onChange={(e) => setStartTime(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">End (seconds)</Label>
                      <Input
                        type="number"
                        min={startTime + 0.5}
                        step={0.5}
                        value={endTime}
                        onChange={(e) => setEndTime(Number(e.target.value) || startTime + 1)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {resultUrl && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 min-w-0 overflow-hidden">
            <Label className="text-sm font-semibold">Trimmed video</Label>
            <video
              src={resultUrl}
              controls
              className="w-full rounded-md max-h-48 bg-black"
            />
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
              Trimming video…
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
                  Trimming…
                </>
              ) : (
                "Trim video"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
