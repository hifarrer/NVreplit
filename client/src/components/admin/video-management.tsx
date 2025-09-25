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
import { Trash2, Edit, Video, Search, Filter, User, Calendar, ExternalLink, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

interface VideoWithUser extends Project {
  username?: string;
  thumbnailUrl?: string | null;
}

interface VideosResponse {
  videos: VideoWithUser[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function VideoManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingVideo, setEditingVideo] = useState<VideoWithUser | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<VideoWithUser | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // Fetch all completed videos (projects with finalVideoUrl) with pagination
  const { data: videosResponse, isLoading } = useQuery<VideosResponse>({
    queryKey: ["/api/admin/videos", currentPage, pageSize],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/videos?page=${currentPage}&limit=${pageSize}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return res.json();
    },
  });

  const videos = videosResponse?.videos || [];
  const pagination = videosResponse?.pagination;

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

  // Toggle featured status mutation
  const toggleFeaturedMutation = useMutation({
    mutationFn: async ({ id, isFeatured }: { id: string; isFeatured: boolean }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/videos/${id}/featured`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isFeatured }),
      });
      if (!res.ok) throw new Error("Failed to update featured status");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      toast({
        title: variables.isFeatured ? "Video Featured" : "Video Unfeatured",
        description: variables.isFeatured 
          ? "Video will now be shown on the home page." 
          : "Video removed from home page showcase.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update featured status",
        variant: "destructive",
      });
    },
  });

  // Filter videos based on search and status
  const filteredVideos = videos.filter((video) => {
    const matchesSearch = 
      video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                  placeholder="Search by title, description, or username..."
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
                  <div className="flex gap-4 flex-1">
                    {/* Video Preview */}
                    {video.finalVideoUrl && (
                      <div className="w-32 h-20 rounded-md overflow-hidden bg-black/50 flex-shrink-0 group relative">
                        <video
                          className="w-full h-full object-cover"
                          src={video.finalVideoUrl}
                          preload="metadata"
                          muted
                          playsInline
                          onMouseEnter={(e) => {
                            const videoEl = e.currentTarget;
                            videoEl.currentTime = 0;
                            videoEl.play().catch(() => {});
                          }}
                          onMouseLeave={(e) => {
                            const videoEl = e.currentTarget;
                            videoEl.pause();
                            videoEl.currentTime = 0;
                          }}
                          onError={(e) => {
                            // Hide video element if it fails to load
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        {!video.finalVideoUrl && <Video className="h-5 w-5 text-purple-400" />}
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
                          <span>{video.username || 'Unknown User'}</span>
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
                      onClick={() => {
                        toggleFeaturedMutation.mutate({
                          id: video.id,
                          isFeatured: !video.isFeatured
                        });
                      }}
                      variant="outline"
                      size="sm"
                      className={`border-yellow-500/30 ${
                        video.isFeatured 
                          ? 'text-yellow-300 bg-yellow-600/20' 
                          : 'text-yellow-300 hover:bg-yellow-600/20'
                      }`}
                      disabled={toggleFeaturedMutation.isPending}
                      data-testid={`feature-video-${video.id}`}
                      title={video.isFeatured ? "Remove from featured" : "Add to featured"}
                    >
                      <Star className={`h-4 w-4 ${video.isFeatured ? 'fill-current' : ''}`} />
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

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-600/20 mt-6">
            <div className="text-sm text-gray-400">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} videos
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <span className="text-sm text-gray-300 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.page + 1)}
                disabled={!pagination.hasNext}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
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