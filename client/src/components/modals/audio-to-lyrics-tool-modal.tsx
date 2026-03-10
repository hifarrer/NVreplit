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
import { Loader2, Music, Upload, Link as LinkIcon, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AudioToLyricsToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCEPT_AUDIO = "audio/mpeg,audio/wav,audio/aac,audio/mp3,audio/m4a,.mp3,.wav,.aac,.m4a";

export function AudioToLyricsToolModal({ isOpen, onClose }: AudioToLyricsToolModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audioUrl, setAudioUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState<string | null>(null);

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (audioFile) {
        form.append("audio", audioFile);
      } else if (audioUrl.trim()) {
        form.append("audioUrl", audioUrl.trim());
      } else {
        throw new Error("Provide an audio URL or upload an audio file.");
      }
      const res = await apiRequest("POST", "/api/music-tools/transcribe-lyrics", form);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.details || "Transcription failed");
      }
      return res.json();
    },
    onSuccess: (data: { lyrics?: string }) => {
      setLyrics(data.lyrics ?? "(No lyrics extracted)");
      toast({
        title: "Lyrics extracted",
        description: "Transcription completed. You can copy the lyrics below.",
      });
    },
    onError: (error) => {
      toast({
        title: "Transcription failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setLyrics(null);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioUrl("");
      setLyrics(null);
    }
    e.target.value = "";
  };

  const clearFile = () => {
    setAudioFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setLyrics(null);
  };

  const handleSubmit = () => {
    if (!audioUrl.trim() && !audioFile) {
      toast({
        title: "Audio required",
        description: "Enter an audio URL or upload an audio file.",
        variant: "destructive",
      });
      return;
    }
    transcribeMutation.mutate();
  };

  const handleCopyLyrics = () => {
    if (!lyrics) return;
    navigator.clipboard.writeText(lyrics);
    toast({ title: "Copied", description: "Lyrics copied to clipboard." });
  };

  const isPending = transcribeMutation.isPending;
  const hasSource = !!audioUrl.trim() || !!audioFile;
  const showInput = lyrics == null && !isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audio to Lyrics
          </DialogTitle>
          <DialogDescription>
            Upload an audio file or paste an audio URL. The AI will extract the song lyrics as text.
          </DialogDescription>
        </DialogHeader>

        {showInput && (
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
                    setLyrics(null);
                  }}
                  disabled={!!audioFile}
                  className="font-mono text-sm flex-1"
                />
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

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!hasSource || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting lyrics…
                </>
              ) : (
                <>
                  <Music className="mr-2 h-4 w-4" />
                  Extract lyrics
                </>
              )}
            </Button>
          </div>
        )}

        {isPending && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Transcribing audio… This may take a minute.
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full min-w-[30%] w-2/3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        )}

        {lyrics != null && !isPending && (
          <div className="space-y-2 py-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Lyrics
            </Label>
            <pre className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap font-sans max-h-[40vh] overflow-y-auto">
              {lyrics}
            </pre>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyLyrics}>
              Copy to clipboard
            </Button>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {lyrics != null ? "Close" : "Cancel"}
          </Button>
          {lyrics != null && (
            <Button
              type="button"
              onClick={() => {
                setLyrics(null);
              }}
            >
              Transcribe another
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
