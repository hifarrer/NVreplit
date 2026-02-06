import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Calendar, Download, Play, Tag, Clock, Trash2, Users, ArrowLeft } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DownloadRestrictionModal } from "@/components/modals/download-restriction-modal";

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function MySongsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [showDownloadRestriction, setShowDownloadRestriction] = useState(false);

  // Check if user is on free plan
  const isFreeUser = !user?.plan || user.plan.name.toLowerCase() === 'free';

  const { data: rawSongs = [], isLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
  });

  // Ensure songs are sorted by creation date (newest first)
  const songs = rawSongs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleDownload = (audioUrl: string, title: string) => {
    // Check if user is on free plan
    if (isFreeUser) {
      setShowDownloadRestriction(true);
      return;
    }

    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${title.replace(/\s+/g, '_')}.mp3`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const togglePlay = (songId: string) => {
    if (playingSongId === songId) {
      setPlayingSongId(null);
    } else {
      setPlayingSongId(songId);
    }
  };

  // Delete mutation
  const deleteSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      // Get the auth token
      const token = localStorage.getItem('auth_token');
      
      // Make the request directly to handle 404 properly
      // Note: Using the correct endpoint /api/my-songs instead of /api/projects
      const response = await fetch(`/api/my-songs/${songId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
      });
      
      // Both 200 and 404 are success cases for deletion
      if (response.ok || response.status === 404) {
        return { success: true };
      }
      
      // Only throw for real errors (500, 403, 401, etc)
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to delete song');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      toast({
        title: "Success",
        description: "Song deleted successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds) return "Unknown";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="my-songs-page">
      <NavigationHeader currentPage="my-songs" />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              My Songs
              {songs.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({songs.length})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Your AI-generated songs library
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="loading-spinner w-6 h-6"></div>
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-12">
                <Music className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No songs generated yet
                </p>
                <Link href="/">
                  <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Generate Your First Song
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {songs.map((song) => (
                  <Card 
                    key={song.id} 
                    className="overflow-hidden hover:border-primary/50 transition-colors"
                    data-testid={`song-card-${song.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold mb-2">{song.title}</h3>
                          {song.audioTags && (
                            <div className="flex items-center gap-2 mb-2">
                              <Tag className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{song.audioTags}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(song.createdAt), "MMM d, yyyy")}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              {formatDuration(song.duration)}
                            </div>
                          </div>
                          {song.audioLyrics && (
                            <details className="mt-3">
                              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                                View Lyrics
                              </summary>
                              <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded">
                                {song.audioLyrics}
                              </pre>
                            </details>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePlay(song.id)}
                            data-testid={`button-play-${song.id}`}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {playingSongId === song.id ? 'Stop' : 'Play'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(song.audioUrl, song.title)}
                            data-testid={`button-download-${song.id}`}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={deleteSongMutation.isPending}
                                data-testid={`button-delete-${song.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Song</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{song.title}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteSongMutation.mutate(song.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {playingSongId === song.id && (
                        <audio
                          src={song.audioUrl}
                          controls
                          autoPlay
                          className="w-full mt-4"
                          onEnded={() => setPlayingSongId(null)}
                          data-testid={`audio-player-${song.id}`}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
      <DownloadRestrictionModal
        isOpen={showDownloadRestriction}
        onClose={() => setShowDownloadRestriction(false)}
      />
    </div>
  );
}