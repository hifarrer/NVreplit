import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Music, Sparkles, ArrowLeft, AlertCircle } from "lucide-react";
import { AudioPlayer } from "@/components/ui/audio-player";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { checkProfanity, getCategoryMessage, type ProfanityCheckResult } from "@/lib/profanity-filter";

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

export default function CreateSongPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [profanityCheck, setProfanityCheck] = useState<ProfanityCheckResult | null>(null);
  const [generatedSongs, setGeneratedSongs] = useState<GeneratedSongOption[]>([]);

  const generateLyricsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/music-tools/generate-lyrics", {
        description: description.trim() || "a song",
        duration: 120,
      });
      return res.json();
    },
    onSuccess: (data: { lyrics: string; title?: string }) => {
      setLyrics(data.lyrics);
      if (data.title) setSongTitle(data.title);
      const result = checkProfanity(data.lyrics);
      setProfanityCheck(result);
      if (result.isClean) {
        toast({
          title: "Lyrics generated",
          description: "Lyrics and song title generated with OpenAI. Edit if needed, then generate songs.",
        });
      } else {
        toast({
          title: "Lyrics generated with issues",
          description: "Please edit inappropriate content before generating songs.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Generate lyrics failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/music-tools/generate-song", {
        description: description.trim() || undefined,
        tags: tags.trim() || undefined,
        lyrics: lyrics.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: async (data: { songs: GeneratedSongOption[] }) => {
      const newSongs = (data.songs || []).map((s, i) => ({
        ...s,
        id: `gen-${Date.now()}-${i}`,
      }));
      setGeneratedSongs((prev) => [...prev, ...newSongs]);
      // Auto-save each generated song to the library
      const results = await Promise.allSettled(
        newSongs.map((song) =>
          apiRequest("POST", "/api/music-tools/save-song", {
            audioUrl: song.audioUrl,
            thumbnailUrl: song.thumbnailUrl ?? undefined,
            title: song.title,
            tags: song.audioTags ?? undefined,
            lyrics: song.audioLyrics ?? undefined,
            duration: song.duration,
            description: description.trim() || undefined,
          }).then((res) => res.json())
        )
      );
      const saved = results.filter((r) => r.status === "fulfilled").length;
      queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      toast({
        title: "Songs generated",
        description: saved === newSongs.length
          ? `${newSongs.length} song(s) saved to your library.`
          : `${saved} of ${newSongs.length} song(s) saved to your library.`,
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

  const handleGenerateSongs = () => {
    if (!tags.trim() && !description.trim() && !lyrics.trim()) {
      toast({
        title: "Enter something",
        description: "Add a description, tags, or lyrics to generate a song.",
        variant: "destructive",
      });
      return;
    }
    if (profanityCheck?.isClean === false) {
      toast({
        title: "Edit lyrics first",
        description: getCategoryMessage(profanityCheck.category || "unknown"),
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => navigate("/create")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Create
        </Button>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Create Song
            </CardTitle>
            <CardDescription>
              Generate AI songs with album covers and save them to your library. Use description and tags, then generate lyrics with OpenAI or enter your own.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="create-song-description">What is your song about?</Label>
              <Textarea
                id="create-song-description"
                placeholder="e.g. upbeat summer anthem, a love song about long distance"
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <Label className="flex items-center text-sm font-semibold">Lyrics</Label>
                <Button
                  onClick={() => generateLyricsMutation.mutate()}
                  disabled={!description.trim() || generateLyricsMutation.isPending}
                  variant="default"
                  size="sm"
                  className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white w-full sm:w-auto"
                >
                  {generateLyricsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Lyrics
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder="Paste or write lyrics, or use Generate Lyrics to create them with OpenAI based on your description."
                value={lyrics}
                onChange={(e) => {
                  const newLyrics = e.target.value;
                  setLyrics(newLyrics);
                  setProfanityCheck(checkProfanity(newLyrics));
                }}
                className={`mt-1 resize-none min-h-[120px] ${
                  profanityCheck?.isClean === false ? "border-destructive" : ""
                }`}
                rows={6}
              />
              {songTitle && (
                <p className="text-sm text-muted-foreground mt-2">
                  Suggested title: <span className="font-medium text-foreground">{songTitle}</span>
                </p>
              )}
              {profanityCheck?.isClean === false && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{profanityCheck.category ? getCategoryMessage(profanityCheck.category) : "Please remove inappropriate content."}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleGenerateSongs}
              disabled={generateMutation.isPending || profanityCheck?.isClean === false}
              className="w-full"
              size="lg"
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

            {generatedSongs.length > 0 && (
              <div className="space-y-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Generated songs ({generatedSongs.length}). Click &quot;Generate songs&quot; again to add more. New songs are saved automatically to your library.
                </p>
                <div className="space-y-3">
                  {generatedSongs.map((song) => (
                    <Card key={song.id} className="overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-4">
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
                        </div>
                        <AudioPlayer
                          audioUrl={song.audioUrl}
                          title={song.title}
                          className="rounded-lg border bg-muted/30"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
