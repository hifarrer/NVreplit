import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, Video, Search, Filter, User, Calendar, ExternalLink } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

export function VideoManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingVideo, setEditingVideo] = useState<Project | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<Project | null>(null);

  // Fetch all videos
  const { data: videos = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/videos"],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/admin/videos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return res.json();
    },
  });

  // Update video mutation
  const updateVideoMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Project> }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/videos/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      toast({
        title: "Video updated",
        description: "The video has been successfully updated.",
      });
      setEditingVideo(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update video. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete video mutation
  const deleteVideoMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/videos/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      toast({
        title: "Video deleted",
        description: "The video has been successfully deleted.",
      });
      setDeletingVideo(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete video. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter videos based on search and status
  const filteredVideos = videos.filter((video) => {
    const matchesSearch = 
      video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "completed" && video.currentStep === 7) ||
      (statusFilter === "in-progress" && video.currentStep < 7);
    
    return matchesSearch && matchesStatus;
  });

  const getStepName = (step: number) => {
    const steps = [
      "Not started",
      "Audio Upload/Generation",
      "Character Creation",
      "Scene Generation",
      "Audio Splitting",
      "Video Segment Creation",
      "Video Merging",
      "Completed"
    ];
    return steps[step] || "Unknown";
  };

  const getStepColor = (step: number) => {
    if (step === 7) return "bg-green-500";
    if (step >= 5) return "bg-blue-500";
    if (step >= 3) return "bg-yellow-500";
    return "bg-gray-500";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Video Management</h2>
        <p className="text-gray-300">View and manage all user-created videos</p>
      </div>

      {/* Search and Filter Bar */}
      <Card className="bg-black/30 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by title, description, or user ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-black/50 border-purple-500/30 text-white placeholder:text-gray-400"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-black/50 border-purple-500/30 text-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Videos</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Videos List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-8 text-center text-gray-300">
              Loading videos...
            </CardContent>
          </Card>
        ) : filteredVideos.length === 0 ? (
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-8 text-center text-gray-300">
              No videos found
            </CardContent>
          </Card>
        ) : (
          filteredVideos.map((video) => (
            <Card key={video.id} className="bg-black/30 border-purple-500/20">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <Video className="h-5 w-5 text-purple-400" />
                      <h3 className="text-lg font-semibold text-white">{video.title}</h3>
                      <Badge className={`${getStepColor(video.currentStep)} text-white`}>
                        {getStepName(video.currentStep)}
                      </Badge>
                    </div>
                    
                    {video.description && (
                      <p className="text-gray-300 text-sm">{video.description}</p>
                    )}
                    
                    <div className="flex items-center gap-6 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>User ID: {video.userId}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Created: {new Date(video.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {video.finalVideoUrl && (
                      <div className="flex items-center gap-2 mt-2">
                        <a
                          href={video.finalVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Video
                        </a>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      onClick={() => setEditingVideo(video)}
                      variant="outline"
                      size="sm"
                      className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
                      data-testid={`edit-video-${video.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => setDeletingVideo(video)}
                      variant="outline"
                      size="sm"
                      className="border-red-500/30 text-red-300 hover:bg-red-600/20"
                      data-testid={`delete-video-${video.id}`}
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
      <Dialog open={!!editingVideo} onOpenChange={() => setEditingVideo(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Edit Video</DialogTitle>
          </DialogHeader>
          {editingVideo && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editingVideo.title}
                  onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editingVideo.description || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="step">Current Step</Label>
                <Select
                  value={editingVideo.currentStep.toString()}
                  onValueChange={(value) => setEditingVideo({ ...editingVideo, currentStep: parseInt(value) })}
                >
                  <SelectTrigger className="bg-black/50 border-purple-500/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((step) => (
                      <SelectItem key={step} value={step.toString()}>
                        {getStepName(step)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="videoUrl">Final Video URL</Label>
                <Input
                  id="videoUrl"
                  value={editingVideo.finalVideoUrl || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, finalVideoUrl: e.target.value })}
                  className="bg-black/50 border-purple-500/30 text-white"
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setEditingVideo(null)}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingVideo) {
                  updateVideoMutation.mutate({
                    id: editingVideo.id,
                    updates: {
                      title: editingVideo.title,
                      description: editingVideo.description,
                      currentStep: editingVideo.currentStep,
                      finalVideoUrl: editingVideo.finalVideoUrl,
                    },
                  });
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={updateVideoMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingVideo} onOpenChange={() => setDeletingVideo(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Delete Video</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300">
            Are you sure you want to delete "{deletingVideo?.title}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              onClick={() => setDeletingVideo(null)}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingVideo) {
                  deleteVideoMutation.mutate(deletingVideo.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteVideoMutation.isPending}
            >
              Delete Video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}