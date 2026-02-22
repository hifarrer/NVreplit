import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Calendar, Download, Play, AlertTriangle, X, Trash2, Users, Share2, Edit3, Edit, Gift } from "lucide-react";
import { SendGreetingCardModal } from "@/components/modals/send-greeting-card-modal";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { MuxVideoPlayer } from "@/components/mux-video-player";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { downloadFileFromUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CompletedVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  sceneImages?: string[];
  createdAt: string;
  updatedAt: string;
  mux?: {
    playbackId: string | null;
    assetStatus: string | null;
    hlsUrl: string | null;
  };
}

export default function MyVideosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedVideo, setSelectedVideo] = useState<CompletedVideo | null>(null);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [videoToDelete, setVideoToDelete] = useState<CompletedVideo | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [editingVideo, setEditingVideo] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [greetingCardVideo, setGreetingCardVideo] = useState<CompletedVideo | null>(null);

  const { data: rawVideos = [], isLoading, refetch } = useQuery<CompletedVideo[]>({
    queryKey: ["/api/my-videos"],
  });

  // Ensure videos are sorted by creation date (newest first)
  const videos = rawVideos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Check if a video has valid (non-expired) scene images stored in object storage
  const hasValidSceneImages = (video: CompletedVideo): boolean => {
    if (!video.sceneImages || video.sceneImages.length === 0) {
      return false;
    }
    // Check if at least one scene image is stored in our object storage
    // (starts with /objects/ or /public-objects/)
    return video.sceneImages.some(
      url => url.startsWith('/objects/') || url.startsWith('/public-objects/')
    );
  };

  const handleEditVideo = (videoId: string) => {
    // Add timestamp to force re-initialization of edit mode
    setLocation(`/create/story-mode?edit=${videoId}&t=${Date.now()}`);
  };

  const handleDownload = async (videoUrl: string, title: string) => {
    const filename = `${title.replace(/\s+/g, "_")}.mp4`;
    try {
      await downloadFileFromUrl(videoUrl, filename);
      toast({ title: "Download started", description: `"${title}" is downloading.` });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download. Try opening the link and saving from your browser.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!videoToDelete) return;
    
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/projects/${videoToDelete.id}`);
      // Refresh the videos list
      refetch();
      setVideoToDelete(null);
    } catch (error) {
      console.error('Error deleting video:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShareVideo = (videoId: string, videoTitle: string) => {
    const url = `${window.location.origin}/v/${videoId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Video link copied!",
      description: `Link for "${videoTitle}" has been copied to clipboard`,
    });
  };

  const handleEditTitle = (video: CompletedVideo) => {
    setEditingVideo(video.id);
    setEditTitle(video.title);
  };

  const handleSaveTitle = async () => {
    if (!editingVideo || !editTitle.trim()) return;
    
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/projects/${editingVideo}`, {
        title: editTitle.trim()
      });
      
      // Refresh the videos list
      refetch();
      setEditingVideo(null);
      setEditTitle("");
      
      toast({
        title: "Title updated!",
        description: "Video title has been updated successfully",
      });
    } catch (error) {
      console.error('Error updating title:', error);
      toast({
        title: "Error",
        description: "Failed to update video title",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingVideo(null);
    setEditTitle("");
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="my-videos-page">
      <NavigationHeader currentPage="videos" />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              My Videos
              {videos.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({videos.length})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Your completed AI-generated music videos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="loading-spinner w-6 h-6"></div>
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-12">
                <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No videos generated yet
                </p>
                <Link href="/">
                  <Button variant="outline">
                    <Video className="h-4 w-4 mr-2" />
                    Create Your First Video
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((video) => (
                  <Card 
                    key={video.id} 
                    className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer relative"
                    onClick={() => setSelectedVideo(video)}
                    data-testid={`video-card-${video.id}`}
                  >
                    <div 
                      className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden group"
                      onMouseEnter={(e) => {
                        const videoEl = e.currentTarget.querySelector('video, mux-player') as HTMLVideoElement | null;
                        if (videoEl) {
                          videoEl.currentTime = 0;
                          videoEl.play?.().catch(() => {});
                        }
                      }}
                      onMouseLeave={(e) => {
                        const videoEl = e.currentTarget.querySelector('video, mux-player') as HTMLVideoElement | null;
                        if (videoEl) {
                          videoEl.pause?.();
                          videoEl.currentTime = 0;
                        }
                      }}
                    >
                      <MuxVideoPlayer
                        className="absolute inset-0 w-full h-full object-cover"
                        playbackId={video.mux?.assetStatus === 'ready' ? video.mux.playbackId : null}
                        fallbackUrl={video.videoUrl}
                        preload="metadata"
                        muted
                        playsInline
                        onError={() => {
                          console.warn(`Failed to load video ${video.id}`);
                        }}
                        data-testid={`preview-video-${video.id}`}
                      />
                      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                      <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Play className="h-16 w-16 text-white drop-shadow-lg" />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 z-50 h-8 w-8 p-0 bg-black/50 hover:bg-red-500 text-white hover:text-white rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoToDelete(video);
                      }}
                      data-testid={`button-delete-${video.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {editingVideo === video.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveTitle();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  handleCancelEdit();
                                }
                              }}
                              className="text-sm h-8"
                              autoFocus
                              data-testid={`edit-title-input-${video.id}`}
                            />
                            <Button
                              size="sm"
                              onClick={handleSaveTitle}
                              disabled={isSaving || !editTitle.trim()}
                              className="h-8 px-2"
                              data-testid={`save-title-${video.id}`}
                            >
                              {isSaving ? "..." : "✓"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                              className="h-8 px-2"
                              data-testid={`cancel-edit-${video.id}`}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-semibold line-clamp-1 flex-1">{video.title}</h3>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditTitle(video);
                              }}
                              className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
                              data-testid={`edit-title-${video.id}`}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(video.createdAt), "MMM d, yyyy")}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditVideo(video.id);
                          }}
                          data-testid={`button-edit-${video.id}`}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(video.videoUrl, video.title);
                          }}
                          data-testid={`button-download-${video.id}`}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShareVideo(video.id, video.title);
                          }}
                          data-testid={`button-share-${video.id}`}
                        >
                          <Share2 className="h-3 w-3 mr-1" />
                          Share
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs px-2 text-pink-500 border-pink-500/50 hover:bg-pink-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGreetingCardVideo(video);
                          }}
                          data-testid={`button-greeting-${video.id}`}
                        >
                          <Gift className="h-3 w-3 mr-1" />
                          Gift
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => {
        setSelectedVideo(null);
        setVideoError(false);
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {selectedVideo && !videoError && (
              <MuxVideoPlayer
                playbackId={selectedVideo.mux?.assetStatus === 'ready' ? selectedVideo.mux.playbackId : null}
                fallbackUrl={selectedVideo.videoUrl}
                className="w-full h-full"
                autoPlay
                controls
                data-testid="video-player"
                onError={() => {
                  console.error('Video playback failed:', selectedVideo.videoUrl);
                  setVideoError(true);
                }}
              />
            )}
            {videoError && (
              <div className="w-full h-full flex flex-col items-center justify-center text-white">
                <div className="text-red-400 mb-4">
                  <AlertTriangle className="w-12 h-12" />
                </div>
                <p className="text-lg font-medium mb-2">Video Unavailable</p>
                <p className="text-sm text-gray-300 text-center max-w-sm">
                  This video may have expired or is no longer accessible. Try downloading it if available.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => handleDownload(selectedVideo?.videoUrl || '', selectedVideo?.title || 'video')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Try Download
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!videoToDelete} onOpenChange={() => setVideoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Delete Video
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{videoToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setVideoToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send as Greeting Card Modal */}
      <SendGreetingCardModal
        isOpen={!!greetingCardVideo}
        onClose={() => setGreetingCardVideo(null)}
        projectId={greetingCardVideo?.id || ''}
        videoTitle={greetingCardVideo?.title || ''}
      />

      <Footer />
    </div>
  );
}