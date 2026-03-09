import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import { Music, Calendar, Tag, Check, Trash2, FileText } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SongLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: GeneratedSong) => void;
}

export function SongLibraryModal({ isOpen, onClose, onSelectSong }: SongLibraryModalProps) {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [expandedLyricsId, setExpandedLyricsId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: songsResponse, isLoading } = useQuery<{ songs: GeneratedSong[]; songLimit?: number; atLimit?: boolean }>({
    queryKey: ["/api/my-songs"],
    enabled: isOpen,
  });
  const songs = songsResponse?.songs ?? [];

  // Debug: log songs data to see what we're getting
  console.log("Songs data in modal:", songs);
  songs.forEach(song => {
    console.log(`Song ${song.id} - has lyrics:`, !!song.audioLyrics, "lyrics content:", song.audioLyrics?.substring(0, 50));
  });

  const handleSelectSong = () => {
    const selectedSong = songs.find(s => s.id === selectedSongId);
    if (selectedSong) {
      onSelectSong(selectedSong);
      onClose();
    }
  };

  const togglePlay = (songId: string) => {
    if (playingSongId === songId) {
      setPlayingSongId(null);
    } else {
      setPlayingSongId(songId);
    }
  };

  const toggleLyrics = (songId: string) => {
    if (expandedLyricsId === songId) {
      setExpandedLyricsId(null);
    } else {
      setExpandedLyricsId(songId);
    }
  };

  // Delete mutation
  const deleteSongMutation = useMutation({
    mutationFn: async (songId: string) => {
      const response = await apiRequest("DELETE", `/api/my-songs/${songId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-songs"] });
      // Reset selected song if it was deleted
      setSelectedSongId(null);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="song-library-modal">
        <DialogHeader>
          <DialogTitle>Select from Song Library</DialogTitle>
          <DialogDescription>
            Choose a previously generated song for your music video
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="loading-spinner w-6 h-6"></div>
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-12">
              <Music className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">
                No songs in your library yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {songs.map((song) => (
                <Card 
                  key={song.id}
                  className={`cursor-pointer transition-all ${
                    selectedSongId === song.id 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedSongId(song.id)}
                  data-testid={`song-option-${song.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                        {song.thumbnailUrl ? (
                          <img
                            src={song.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {selectedSongId === song.id && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                          <h3 className="font-semibold truncate">{song.title}</h3>
                        </div>
                        {song.audioTags && (
                          <div className="flex items-center gap-2 mb-2">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{song.audioTags}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(song.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlay(song.id);
                          }}
                          data-testid={`button-preview-${song.id}`}
                        >
                          {playingSongId === song.id ? 'Stop' : 'Preview'}
                        </Button>
                        {song.audioLyrics && song.audioLyrics.trim() !== '' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLyrics(song.id);
                            }}
                            data-testid={`button-lyrics-${song.id}`}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {expandedLyricsId === song.id ? 'Hide Lyrics' : 'Lyrics'}
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => e.stopPropagation()}
                              disabled={deleteSongMutation.isPending}
                              data-testid={`button-delete-library-${song.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
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
                        className="w-full mt-3"
                        onEnded={() => setPlayingSongId(null)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`audio-preview-${song.id}`}
                      />
                    )}
                    {expandedLyricsId === song.id && song.audioLyrics && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Lyrics:</h4>
                        <Textarea
                          value={song.audioLyrics}
                          readOnly
                          className="min-h-32 max-h-48 resize-none bg-muted/30"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`lyrics-display-${song.id}`}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleSelectSong} 
            disabled={!selectedSongId}
            data-testid="button-select-song"
          >
            Use Selected Song
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}