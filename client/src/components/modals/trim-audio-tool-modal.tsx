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
import { Loader2, Music, Upload, Link as LinkIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AudioTrimInterface } from "@/components/ui/audio-trim-interface";

interface TrimAudioToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCEPT_AUDIO = "audio/mpeg,audio/wav,audio/aac,audio/mp3,audio/m4a,.mp3,.wav,.aac,.m4a";

export function TrimAudioToolModal({ isOpen, onClose }: TrimAudioToolModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audioUrl, setAudioUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number>(0);
  const [showTrimInterface, setShowTrimInterface] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const trimMutation = useMutation({
    mutationFn: async ({ startTimeMs, endTimeMs }: { startTimeMs: number; endTimeMs: number }) => {
      const form = new FormData();
      form.append("startTime", String(startTimeMs));
      form.append("endTime", String(endTimeMs));
      if (audioFile) {
        form.append("audio", audioFile);
      } else if (audioUrl.trim()) {
        form.append("audioUrl", audioUrl.trim());
      } else {
        throw new Error("Provide an audio URL or upload an audio file.");
      }
      const res = await apiRequest("POST", "/api/tools/trim-audio", form);
      return res.json();
    },
    onSuccess: (data) => {
      setResultUrl(data.download_url || null);
      toast({
        title: "Audio trimmed",
        description: "Your trimmed audio is ready. You can play or download it below.",
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

  // When modal closes, revoke blob URLs
  useEffect(() => {
    if (!isOpen) {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPreviewDuration(0);
      setShowTrimInterface(false);
      setResultUrl(null);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioUrl("");
      setResultUrl(null);
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPreviewDuration(0);
      setShowTrimInterface(false);

      const blobUrl = URL.createObjectURL(file);
      const audio = new Audio(blobUrl);
      audio.addEventListener("loadedmetadata", () => {
        setPreviewDuration(audio.duration);
        setPreviewUrl(blobUrl);
        setShowTrimInterface(true);
      });
      audio.addEventListener("error", () => {
        URL.revokeObjectURL(blobUrl);
        toast({
          title: "Invalid audio",
          description: "Could not load the audio file.",
          variant: "destructive",
        });
      });
    }
    e.target.value = "";
  };

  const handleUrlSubmit = () => {
    const url = audioUrl.trim();
    if (!url) {
      toast({
        title: "Audio required",
        description: "Enter an audio URL.",
        variant: "destructive",
      });
      return;
    }
    setResultUrl(null);
    setPreviewUrl(url);
    setPreviewDuration(0);
    setShowTrimInterface(false);

    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      setPreviewDuration(audio.duration);
      setShowTrimInterface(true);
    });
    audio.addEventListener("error", () => {
      toast({
        title: "Invalid audio URL",
        description: "Could not load the audio from the URL.",
        variant: "destructive",
      });
    });
  };

  const clearFile = () => {
    setAudioFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewDuration(0);
    setShowTrimInterface(false);
    setResultUrl(null);
  };

  const handleCancelTrim = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewDuration(0);
    setShowTrimInterface(false);
    setResultUrl(null);
  };

  const handleTrim = (startTimeMs: number, endTimeMs: number) => {
    trimMutation.mutate({ startTimeMs, endTimeMs });
  };

  const isPending = trimMutation.isPending;
  const hasSource = !!audioUrl.trim() || !!audioFile;
  const showUploadForm = !showTrimInterface || resultUrl != null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Trim Audio
          </DialogTitle>
          <DialogDescription>
            {showTrimInterface && previewUrl && previewDuration > 0
              ? "Select the start and end of the section you want to keep by dragging the handles on the waveform. Preview with play, then trim."
              : "Provide an audio URL or upload an audio file. You’ll then see the waveform and can drag to set the trim range."}
          </DialogDescription>
        </DialogHeader>

        {showUploadForm && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Audio URL
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={audioUrl}
                  onChange={(e) => {
                    setAudioUrl(e.target.value);
                    if (audioFile) clearFile();
                    setResultUrl(null);
                  }}
                  disabled={!!audioFile}
                  className="font-mono text-sm flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUrlSubmit}
                  disabled={!audioUrl.trim() || !!audioFile}
                >
                  Load
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Or upload an audio file
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_AUDIO}
                onChange={handleFileChange}
                className="hidden"
              />
              {audioFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                  <span className="truncate text-foreground">{audioFile.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!!audioUrl.trim()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Choose file (MP3, WAV, AAC, M4A)
                </Button>
              )}
            </div>
          </div>
        )}

        {showTrimInterface && previewUrl && previewDuration > 0 && !resultUrl && (
          <div className="py-2">
            <AudioTrimInterface
              audioUrl={previewUrl}
              audioDuration={previewDuration}
              onTrim={handleTrim}
              onCancel={handleCancelTrim}
              isTrimming={isPending}
              isPaidUser={true}
            />
          </div>
        )}

        {isPending && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Trimming audio…
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full min-w-[30%] w-2/3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        )}

        {resultUrl && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <Label className="text-sm font-semibold">Trimmed audio</Label>
            <audio src={resultUrl} controls className="w-full" />
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

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {resultUrl ? "Close" : "Cancel"}
          </Button>
          {resultUrl && (
            <Button
              type="button"
              onClick={() => {
                setResultUrl(null);
                setShowTrimInterface(true);
              }}
            >
              Trim again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
