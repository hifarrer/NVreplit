import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, Pause, Video, ArrowLeft, ExternalLink, Share2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface PublicVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  duration: number;
}

interface PublicProfile {
  user: {
    username: string;
    avatarUrl: string | null;
  };
  videos: PublicVideo[];
}

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { toast } = useToast();
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  const { data: profile, isLoading, error } = useQuery<PublicProfile>({
    queryKey: ['/api/users', username, 'videos'],
    retry: false
  });

  useEffect(() => {
    // Pause all videos when component unmounts
    return () => {
      Object.values(videoRefs.current).forEach(video => {
        if (video) video.pause();
      });
    };
  }, []);

  const togglePlay = (videoId: string) => {
    const video = videoRefs.current[videoId];
    if (!video) return;

    if (playingVideoId === videoId) {
      video.pause();
      setPlayingVideoId(null);
    } else {
      // Pause any currently playing video
      if (playingVideoId && videoRefs.current[playingVideoId]) {
        videoRefs.current[playingVideoId]?.pause();
      }
      video.play();
      setPlayingVideoId(videoId);
    }
  };

  const handleVideoEnded = (videoId: string) => {
    if (playingVideoId === videoId) {
      setPlayingVideoId(null);
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Profile link has been copied to clipboard",
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

  if (error || !profile) {
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
          <h1 className="text-2xl font-bold mb-4">User not found</h1>
          <p className="text-muted-foreground mb-8">
            The user @{username} doesn't exist or hasn't shared any videos yet.
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
    <div className="min-h-screen" data-testid="public-profile-page">
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
            >
              <Share2 className="h-4 w-4" />
              Share Profile
            </Button>
          </div>
        </div>
      </header>

      {/* Profile Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-6 mb-8">
          <Avatar className="h-24 w-24 border-2 border-primary/20">
            {profile.user.avatarUrl ? (
              <AvatarImage src={profile.user.avatarUrl} alt={profile.user.username} />
            ) : (
              <AvatarFallback className="text-2xl bg-gradient-to-br from-primary/20 to-secondary/20">
                {profile.user.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold mb-2">@{profile.user.username}</h1>
            <p className="text-muted-foreground">
              {profile.videos.length} {profile.videos.length === 1 ? 'video' : 'videos'}
            </p>
          </div>
        </div>

        {/* Videos Grid */}
        {profile.videos.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">
                This user hasn't created any videos yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profile.videos.map((video) => (
              <Card 
                key={video.id} 
                className="overflow-hidden hover:border-primary/50 transition-colors"
                data-testid={`video-card-${video.id}`}
              >
                <div className="relative aspect-video bg-black">
                  <video
                    ref={(el) => { videoRefs.current[video.id] = el; }}
                    src={video.videoUrl}
                    className="w-full h-full object-contain"
                    onEnded={() => handleVideoEnded(video.id)}
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="rounded-full h-12 w-12 bg-background/80 hover:bg-background/90"
                      onClick={() => togglePlay(video.id)}
                      data-testid={`button-play-${video.id}`}
                    >
                      {playingVideoId === video.id ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6 ml-0.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 line-clamp-1">{video.title}</h3>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{format(new Date(video.createdAt), "MMM d, yyyy")}</span>
                    <span>{formatDuration(video.duration)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}