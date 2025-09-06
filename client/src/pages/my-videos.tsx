import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Calendar, Download, Play, AlertTriangle, X, Trash2, Users } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

interface CompletedVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function MyVideosPage() {
  const { user } = useAuth();
  const [selectedVideo, setSelectedVideo] = useState<CompletedVideo | null>(null);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [videoToDelete, setVideoToDelete] = useState<CompletedVideo | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const { data: videos = [], isLoading, refetch } = useQuery<CompletedVideo[]>({
    queryKey: ["/api/my-videos"],
  });

  const handleDownload = (videoUrl: string, title: string) => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `${title.replace(/\s+/g, '_')}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <div className="min-h-screen flex flex-col" data-testid="my-videos-page">
      <NavigationHeader currentPage="my-videos" />

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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-black/50 hover:bg-red-500 text-white hover:text-white rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoToDelete(video);
                      }}
                      data-testid={`button-delete-${video.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      {video.thumbnailUrl ? (
                        <>
                          <img 
                            src={video.thumbnailUrl} 
                            alt={`${video.title} thumbnail`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/20" />
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                          <Video className="h-12 w-12 text-primary/70 mb-2" />
                          <p className="text-xs text-muted-foreground mb-1">Music Video</p>
                          <p className="text-xs text-muted-foreground opacity-75">Click to play</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Play className="h-16 w-16 text-white drop-shadow-lg" />
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2 line-clamp-1">{video.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(video.createdAt), "MMM d, yyyy")}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVideo(video);
                          }}
                          data-testid={`button-watch-${video.id}`}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Watch
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(video.videoUrl, video.title);
                          }}
                          data-testid={`button-download-${video.id}`}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
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
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full"
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
      <Footer />
    </div>
  );
}