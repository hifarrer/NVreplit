import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video, Calendar, Download, Play, ArrowLeft, LogOut, User, Home as HomeIcon, Music, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface CompletedVideo {
  id: string;
  title: string;
  videoUrl: string;
  createdAt: string;
  updatedAt: string;
}

export default function MyVideosPage() {
  const { user, logout } = useAuth();
  const [selectedVideo, setSelectedVideo] = useState<CompletedVideo | null>(null);
  const [videoError, setVideoError] = useState<boolean>(false);

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

  return (
    <div className="min-h-screen" data-testid="my-videos-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16" 
                data-testid="app-logo"
              />
              <nav className="flex items-center space-x-4">
                <Link href="/">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </Link>
                <Link href="/my-songs">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <Music className="h-4 w-4 mr-2" />
                    My Songs
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" disabled className="text-foreground">
                  <Video className="h-4 w-4 mr-2" />
                  My Videos
                </Button>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/profile">
                <div className="flex items-center space-x-2 hover:text-foreground cursor-pointer transition-colors">
                  <Avatar className="h-6 w-6">
                    {user?.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.username} />
                    ) : (
                      <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-secondary/20">
                        {user?.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="text-sm text-muted-foreground hover:text-foreground">{user?.username}</span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

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
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Create Your First Video
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((video) => (
                  <Card 
                    key={video.id} 
                    className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedVideo(video)}
                    data-testid={`video-card-${video.id}`}
                  >
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <Video className="h-12 w-12 text-primary/70 mb-2" />
                        <p className="text-xs text-muted-foreground mb-1">Music Video</p>
                        <p className="text-xs text-muted-foreground opacity-75">Click to play</p>
                      </div>
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
    </div>
  );
}