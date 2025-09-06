import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Edit, Music, Search, Filter, User, Calendar, ExternalLink, Play, Pause } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import { useRef, useEffect } from "react";

interface AudioWithUser extends Project {
  username?: string;
}

export function AudioManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingAudio, setEditingAudio] = useState<AudioWithUser | null>(null);
  const [deletingAudio, setDeletingAudio] = useState<AudioWithUser | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  // Fetch all audios (projects with audioUrl but no finalVideoUrl)
  const { data: audios = [], isLoading } = useQuery<AudioWithUser[]>({
    queryKey: ["/api/admin/audios"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/audios", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch audios");
      return res.json();
    },
  });

  useEffect(() => {
    // Cleanup audio refs when component unmounts
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    };
  }, []);

  // Update audio mutation
  const updateAudioMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Project> }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/audios/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update audio");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audios"] });
      toast({
        title: "Audio updated",
        description: "The audio has been successfully updated.",
      });
      setEditingAudio(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update audio. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete audio mutation
  const deleteAudioMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/audios/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete audio");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audios"] });
      toast({
        title: "Audio deleted",
        description: "The audio has been successfully deleted.",
      });
      setDeletingAudio(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete audio. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter audios based on search
  const filteredAudios = audios.filter((audio) => {
    const matchesSearch = 
      audio.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audio.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audio.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audio.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const togglePlay = (audioId: string) => {
    const audio = audioRefs.current[audioId];
    if (!audio) return;

    if (playingAudioId === audioId) {
      audio.pause();
      setPlayingAudioId(null);
    } else {
      // Pause any currently playing audio
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId]?.pause();
      }
      audio.play();
      setPlayingAudioId(audioId);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Audio Management</h2>
        <p className="text-gray-300">View and manage all user-generated audio tracks</p>
      </div>

      {/* Search Bar */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by title, description, or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-black/50 border-purple-500/30 text-white placeholder:text-gray-400"
            />
          </div>
        </CardContent>
      </Card>

      {/* Audios List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-8 text-center text-gray-300">
              Loading audio tracks...
            </CardContent>
          </Card>
        ) : filteredAudios.length === 0 ? (
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-8 text-center text-gray-300">
              No audio tracks found
            </CardContent>
          </Card>
        ) : (
          filteredAudios.map((audio) => (
            <Card key={audio.id} className="bg-black/30 border-purple-500/20">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4 flex-1">
                    {/* Audio Player Controls */}
                    <div className="flex items-center">
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-full border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
                        onClick={() => togglePlay(audio.id)}
                        data-testid={`play-audio-${audio.id}`}
                      >
                        {playingAudioId === audio.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      {audio.audioUrl && (
                        <audio
                          ref={(el) => { audioRefs.current[audio.id] = el; }}
                          src={audio.audioUrl}
                          onEnded={() => setPlayingAudioId(null)}
                        />
                      )}
                    </div>
                    
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <Music className="h-5 w-5 text-purple-400" />
                        <h3 className="text-lg font-semibold text-white">{audio.title}</h3>
                        {audio.audioDuration && (
                          <Badge className="bg-blue-500 text-white">
                            {formatDuration(audio.audioDuration)}
                          </Badge>
                        )}
                      </div>
                    
                      {audio.description && (
                        <p className="text-gray-300 text-sm">{audio.description}</p>
                      )}
                    
                      <div className="flex items-center gap-6 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{audio.username || 'Unknown User'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Created: {new Date(audio.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {audio.audioUrl && (
                        <div className="flex items-center gap-2 mt-2">
                          <a
                            href={audio.audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Download Audio
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      onClick={() => setEditingAudio(audio)}
                      variant="outline"
                      size="sm"
                      className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
                      data-testid={`edit-audio-${audio.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => setDeletingAudio(audio)}
                      variant="outline"
                      size="sm"
                      className="border-red-500/30 text-red-300 hover:bg-red-600/20"
                      data-testid={`delete-audio-${audio.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAudio} onOpenChange={() => setEditingAudio(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Edit Audio</DialogTitle>
          </DialogHeader>
          {editingAudio && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editingAudio.title}
                  onChange={(e) => setEditingAudio({ ...editingAudio, title: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editingAudio.description || ""}
                  onChange={(e) => setEditingAudio({ ...editingAudio, description: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="audioUrl">Audio URL</Label>
                <Input
                  id="audioUrl"
                  value={editingAudio.audioUrl || ""}
                  onChange={(e) => setEditingAudio({ ...editingAudio, audioUrl: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setEditingAudio(null)}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingAudio) {
                  updateAudioMutation.mutate({
                    id: editingAudio.id,
                    updates: {
                      title: editingAudio.title,
                      description: editingAudio.description,
                      audioUrl: editingAudio.audioUrl,
                    },
                  });
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={updateAudioMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingAudio} onOpenChange={() => setDeletingAudio(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Delete Audio</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300">
            Are you sure you want to delete "{deletingAudio?.title}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              onClick={() => setDeletingAudio(null)}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingAudio) {
                  deleteAudioMutation.mutate(deletingAudio.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteAudioMutation.isPending}
            >
              Delete Audio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}