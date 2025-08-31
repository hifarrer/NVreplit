import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Music, Calendar, Tag, Check } from "lucide-react";
import { format } from "date-fns";

interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  audioTags: string | null;
  audioLyrics: string | null;
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

  const { data: songs = [], isLoading } = useQuery<GeneratedSong[]>({
    queryKey: ["/api/my-songs"],
    enabled: isOpen,
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {selectedSongId === song.id && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                          <h3 className="font-semibold">{song.title}</h3>
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