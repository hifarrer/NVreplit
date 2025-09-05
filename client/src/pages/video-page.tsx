import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Pause, ArrowLeft, Share2, User } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface VideoData {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  duration: number;
  creator: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

export default function VideoPage() {
  const params = useParams();
  const videoId = params.videoId as string;
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { data: video, isLoading, error } = useQuery<VideoData>({
    queryKey: ['/api/videos', videoId],
    retry: false
  });

  useEffect(() => {
    // Pause video when component unmounts
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Video link has been copied to clipboard",
    });
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner w-8 h-8"></div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/">
                <img 
                  src={logoImage} 
                  alt="neonvideo.ai" 
                  className="h-16 cursor-pointer" 
                />
              </Link>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Video not found</h1>
          <p className="text-muted-foreground mb-8">
            This video doesn't exist or has been removed.
          </p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go to Homepage
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="video-page">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-16 cursor-pointer" 
              />
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2"
              data-testid="button-share-video"
            >
              <Share2 className="h-4 w-4" />
              Share Video
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Video Player */}
          <Card className="overflow-hidden mb-6">
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                src={video.videoUrl}
                className="w-full h-full object-contain"
                onEnded={handleVideoEnded}
                playsInline
                data-testid="video-player"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full h-16 w-16 bg-background/80 hover:bg-background/90"
                  onClick={togglePlay}
                  data-testid="button-play-video"
                >
                  {isPlaying ? (
                    <Pause className="h-8 w-8" />
                  ) : (
                    <Play className="h-8 w-8 ml-0.5" />
                  )}
                </Button>
              </div>
            </div>
          </Card>

          {/* Video Info */}
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold mb-4">{video.title}</h1>
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{format(new Date(video.createdAt), "MMM d, yyyy")}</span>
                  <span>•</span>
                  <span>{formatDuration(video.duration)}</span>
                </div>
              </div>

              {/* Creator Info */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <Link href={`/u/${video.creator.username}`}>
                    <div className="flex items-center gap-4 hover:opacity-80 transition-opacity cursor-pointer">
                      <Avatar className="h-12 w-12 border-2 border-primary/20">
                        {video.creator.avatarUrl ? (
                          <AvatarImage src={video.creator.avatarUrl} alt={video.creator.username} />
                        ) : (
                          <AvatarFallback className="text-lg bg-gradient-to-br from-primary/20 to-secondary/20">
                            {video.creator.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <p className="font-semibold">@{video.creator.username}</p>
                        <p className="text-sm text-muted-foreground">Creator</p>
                      </div>
                    </div>
                  </Link>
                  <Link href={`/u/${video.creator.username}`}>
                    <Button variant="outline" size="sm" data-testid="button-view-creator-profile">
                      <User className="h-4 w-4 mr-2" />
                      View Profile
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}