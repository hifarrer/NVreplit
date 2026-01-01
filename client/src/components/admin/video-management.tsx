import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Edit, Video, Search, Filter, User, Calendar, ExternalLink, Star, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Share2, Images, Film, Clock, Mic } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import type { SceneData } from "@/lib/types";

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
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingVideo, setEditingVideo] = useState<VideoWithUser | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<VideoWithUser | null>(null);
  const [viewingScenesVideo, setViewingScenesVideo] = useState<VideoWithUser | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const { data: videosResponse, isLoading } = useQuery<VideosResponse>({
    queryKey: ["/api/admin/videos", currentPage, pageSize, debouncedSearchTerm, statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem("adminToken");
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });
      if (debouncedSearchTerm.trim()) {
        params.append("search", debouncedSearchTerm.trim());
      }
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const res = await fetch(`/api/admin/videos?${params}`, {
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

  // Post to social media mutation
  const postToSocialMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/videos/${id}/post-to-social`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(data.error || "Failed to post to social media");
        (error as any).alreadyPosted = data.alreadyPosted;
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      toast({
        title: "Posted Successfully",
        description: "Video has been posted to Facebook, YouTube, and TikTok via Postiz.",
      });
    },
    onError: (error) => {
      const isAlreadyPosted = error && typeof error === 'object' && 'alreadyPosted' in error && (error as any).alreadyPosted;
      toast({
        title: isAlreadyPosted ? "Already Posted" : "Error",
        description: error instanceof Error ? error.message : "Failed to post to social media",
        variant: isAlreadyPosted ? "default" : "destructive",
      });
    },
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

  const parseSceneData = (video: VideoWithUser): SceneData[] => {
    const prompts = (video.scenePrompts as string[] | undefined) || [];
    const images = (video.sceneImages as string[] | undefined) || [];
    
    if (prompts.length === 0 && images.length === 0) return [];
    
    const maxLength = Math.max(prompts.length, images.length);
    const scenes: SceneData[] = [];
    
    for (let i = 0; i < maxLength; i++) {
      scenes.push({
        prompt: prompts[i] || '',
        imageUrl: images[i] || ''
      });
    }
    
    return scenes;
  };

  const getSceneOrder = (video: VideoWithUser): number[] => {
    if (!video.sceneOrder) return [];
    try {
      if (typeof video.sceneOrder === 'string') {
        return JSON.parse(video.sceneOrder);
      }
      return video.sceneOrder;
    } catch {
      return [];
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLipsyncScene = (index: number, audioDuration?: number): boolean => {
    if (!audioDuration) return false;
    if (audioDuration <= 30) {
      return index === 1 || index === 2;
    }
    return index % 2 === 1;
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
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-48 bg-black/50 border-purple-500/30 text-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Videos</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="featured">Featured</SelectItem>
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
        ) : videos.length === 0 ? (
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-8 text-center text-gray-300">
              No videos found
            </CardContent>
          </Card>
        ) : (
          videos.map((video) => (
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
                          {video.username ? (
                            <a
                              href={`/u/${video.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-400 hover:text-purple-300 hover:underline"
                              data-testid={`user-link-${video.username}`}
                            >
                              {video.username}
                            </a>
                          ) : (
                            <span>Unknown User</span>
                          )}
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
                    {parseSceneData(video).length > 0 && (
                      <Button
                        onClick={() => setViewingScenesVideo(video)}
                        variant="outline"
                        size="sm"
                        className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-600/20"
                        data-testid={`view-scenes-${video.id}`}
                        title="View scene images and timeline"
                      >
                        <Images className="h-4 w-4" />
                      </Button>
                    )}
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
                    {video.isCompleted && video.finalVideoUrl && (
                      <Button
                        onClick={() => postToSocialMutation.mutate(video.id)}
                        variant="outline"
                        size="sm"
                        className="border-blue-500/30 text-blue-300 hover:bg-blue-600/20"
                        disabled={postToSocialMutation.isPending}
                        data-testid={`post-to-social-${video.id}`}
                        title="Post to Facebook via Postiz"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
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
                onClick={() => setCurrentPage(1)}
                disabled={!pagination.hasPrev}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-first-page"
              >
                <ChevronsLeft className="h-4 w-4" />
                First
              </Button>

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

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(pagination.totalPages)}
                disabled={!pagination.hasNext}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                data-testid="button-last-page"
              >
                Last
                <ChevronsRight className="h-4 w-4" />
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

      {/* View Scenes Dialog */}
      <Dialog open={!!viewingScenesVideo} onOpenChange={() => setViewingScenesVideo(null)}>
        <DialogContent className="bg-gray-900 border-purple-500/20 text-white max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="h-5 w-5 text-cyan-400" />
              Scene Images - {viewingScenesVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {viewingScenesVideo && (() => {
            const scenes = parseSceneData(viewingScenesVideo);
            const sceneOrder = getSceneOrder(viewingScenesVideo);
            const audioDuration = viewingScenesVideo.audioDuration || 0;
            const effectiveOrder = sceneOrder.length > 0 ? sceneOrder : scenes.map((_, i) => i);
            const sceneCount = scenes.length;
            const sceneDuration = sceneCount > 0 ? Math.ceil(audioDuration / sceneCount) : 10;

            return (
              <ScrollArea className="max-h-[70vh]">
                <div className="space-y-6 pr-4">
                  {/* Video Info */}
                  <div className="bg-black/30 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{viewingScenesVideo.username || 'Unknown User'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Duration: {formatDuration(audioDuration)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Film className="h-3 w-3" />
                        <span>{scenes.length} scenes</span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline View */}
                  <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
                    <div className="flex items-center gap-2 mb-3">
                      <Film className="w-5 h-5 text-cyan-400" />
                      <h4 className="text-lg font-semibold text-white">Timeline</h4>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 rounded-t-xl opacity-60"></div>
                    
                    <div className="flex items-center gap-1 overflow-x-auto pb-2">
                      <div className="w-1 h-16 bg-cyan-500 rounded-full flex-shrink-0"></div>
                      
                      {effectiveOrder.map((originalIndex, orderPosition) => {
                        const scene = scenes[originalIndex];
                        if (!scene) return null;
                        
                        const isLipsync = isLipsyncScene(originalIndex, audioDuration);
                        const startTime = orderPosition * sceneDuration;
                        const endTime = Math.min((orderPosition + 1) * sceneDuration, audioDuration);
                        
                        return (
                          <div
                            key={`timeline-${originalIndex}-${orderPosition}`}
                            className="relative flex-shrink-0"
                            style={{ minWidth: '100px', maxWidth: '140px' }}
                          >
                            <div className={`relative rounded-lg overflow-hidden border-2 border-slate-600 ${isLipsync ? 'ring-2 ring-pink-500/30' : ''}`}>
                              <div className="absolute top-1 right-1 z-20 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
                                {orderPosition + 1}
                              </div>
                              
                              {isLipsync && (
                                <div className="absolute top-1 left-1 z-20">
                                  <Mic className="w-3 h-3 text-pink-400" />
                                </div>
                              )}
                              
                              <div className="w-full h-16 bg-gradient-to-br from-slate-700 to-slate-800">
                                {scene.imageUrl ? (
                                  <img 
                                    src={scene.imageUrl}
                                    alt={`Scene ${originalIndex + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Film className="w-6 h-6 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                                <div className="text-[9px] text-white/80 font-mono tracking-wide">
                                  {formatDuration(startTime)} - {formatDuration(endTime)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="w-1 h-16 bg-cyan-500 rounded-full flex-shrink-0"></div>
                    </div>
                    
                    <div className="mt-3 flex justify-between text-[10px] text-slate-400 font-mono px-1">
                      <span>0:00</span>
                      <span>{formatDuration(Math.floor(audioDuration / 2))}</span>
                      <span>{formatDuration(audioDuration)}</span>
                    </div>
                  </div>

                  {/* Scene Images Grid */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Images className="h-5 w-5 text-cyan-400" />
                      All Scene Images
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {scenes.map((scene, index) => (
                        <div key={index} className="bg-black/30 rounded-lg p-3 border border-slate-600">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-cyan-600 text-white text-xs">
                              Scene {index + 1}
                            </Badge>
                            {isLipsyncScene(index, audioDuration) && (
                              <Mic className="w-3 h-3 text-pink-400" />
                            )}
                          </div>
                          <div className="aspect-square bg-slate-800 rounded-lg overflow-hidden mb-2">
                            {scene.imageUrl ? (
                              <img
                                src={scene.imageUrl}
                                alt={`Scene ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film className="w-8 h-8 text-slate-500" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-3" title={scene.prompt}>
                            {scene.prompt || 'No prompt available'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            );
          })()}
          <DialogFooter>
            <Button
              onClick={() => setViewingScenesVideo(null)}
              variant="outline"
              className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}