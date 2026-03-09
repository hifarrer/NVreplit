import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Music, Play, Square, Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreateSongToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GeneratedSongOption {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  duration: number;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const suggestedTags = ["pop", "electronic", "rock", "upbeat", "hip-hop", "synthwave", "female singer", "male singer"];

export function CreateSongToolModal({ isOpen, onClose }: CreateSongToolModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [generatedSongs, setGeneratedSongs] = useState<GeneratedSongOption[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/music-tools/generate-song", {
        description: description.trim() || undefined,
        tags: tags.trim() || undefined,
        lyrics: lyrics.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: { songs: GeneratedSongOption[] }) => {
      setGeneratedSongs(data.songs || []);
      toast({
        title: "Songs generated",
        description: `Generated ${data.songs?.length ?? 0} song(s). Pick one to save to your library.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (song: GeneratedSongOption) => {
      const res = await apiRequest("POST", "/api/music-tools/save-song", {
        audioUrl: song.audioUrl,
        thumbnailUrl: song.thumbnailUrl ?? undefined,
        title: song.title,
        tags: song.audioTags ?? undefined,
        lyrics: song.audioLyrics ?? undefined,
        duration: song.duration,
        description: description.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      toast({
        title: "Saved to library",
        description: "Song saved to your library.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!tags.trim() && !description.trim() && !lyrics.trim()) {
      toast({
        title: "Enter something",
        description: "Add a description, tags, or lyrics to generate a song.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  const togglePlay = (id: string) => {
    setPlayingId((prev) => (prev === id ? null : id));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Create Song
          </DialogTitle>
          <DialogDescription>
            Generate AI songs and save your favorite to your library with an album cover.
          </DialogDescription>
        </DialogHeader>

        {generatedSongs.length === 0 ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-song-description">Description</Label>
              <Textarea
                id="create-song-description"
                placeholder="e.g. upbeat summer anthem"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="create-song-tags">Tags / style</Label>
              <Input
                id="create-song-tags"
                placeholder="e.g. pop, electronic"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestedTags.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTags((prev) => (prev ? `${prev}, ${t}` : t))}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="create-song-lyrics">Lyrics (optional)</Label>
              <Textarea
                id="create-song-lyrics"
                placeholder="Paste or write lyrics..."
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating songs...
                </>
              ) : (
                "Generate songs"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a song to save to your library. You can generate again to get new options.
            </p>
            <div className="space-y-3">
              {generatedSongs.map((song) => (
                <Card key={song.id} className="overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                      {song.thumbnailUrl ? (
                        <img
                          src={song.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{song.title}</h3>
                      {song.audioTags && (
                        <p className="text-xs text-muted-foreground truncate">{song.audioTags}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {song.duration ? `${Math.floor(song.duration / 60)}m ${song.duration % 60}s` : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => togglePlay(song.id)}
                      >
                        {playingId === song.id ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate(song)}
                        disabled={saveMutation.isPending}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Save to library
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                  {playingId === song.id && (
                    <audio
                      src={song.audioUrl}
                      autoPlay
                      controls
                      className="w-full px-4 pb-4"
                      onEnded={() => setPlayingId(null)}
                    />
                  )}
                </Card>
              ))}
            </div>
            <Button variant="outline" onClick={() => setGeneratedSongs([])} className="w-full">
              Generate again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
