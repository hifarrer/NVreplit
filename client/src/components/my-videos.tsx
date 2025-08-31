import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video, Calendar, Download, Play, X } from "lucide-react";
import { format } from "date-fns";

interface CompletedVideo {
  id: string;
  title: string;
  videoUrl: string;
  createdAt: string;
  updatedAt: string;
}

export function MyVideos() {
  const [selectedVideo, setSelectedVideo] = useState<CompletedVideo | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: videos = [], isLoading } = useQuery<CompletedVideo[]>({
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

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            My Videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="loading-spinner w-6 h-6"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isExpanded) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              My Videos
              {videos.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({videos.length})
                </span>
              )}
            </CardTitle>
            {videos.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(true)}
                data-testid="button-expand-videos"
              >
                View All
              </Button>
            )}
          </div>
        </CardHeader>
        {videos.length === 0 && (
          <CardContent>
            <p className="text-muted-foreground text-center py-4">
              No videos generated yet. Complete the workflow to create your first music video!
            </p>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              My Videos
              <span className="text-sm font-normal text-muted-foreground">
                ({videos.length})
              </span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              data-testid="button-collapse-videos"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Your completed AI-generated music videos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No videos generated yet. Complete the workflow to create your first music video!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <Card 
                  key={video.id} 
                  className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedVideo(video)}
                  data-testid={`video-card-${video.id}`}
                >
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Play className="h-12 w-12 text-primary/50" />
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

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video">
            {selectedVideo && (
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full rounded-lg"
                data-testid="video-player"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}