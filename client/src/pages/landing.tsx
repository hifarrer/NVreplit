import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Video, Sparkles, Music, Wand2, Play, Calendar, User, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import logoImage from "@assets/neonlogo_1756693683433.png";
import { useAuth } from "@/hooks/use-auth";
import { SiTiktok, SiFacebook, SiYoutube } from "react-icons/si";

const heroVideo = "https://res.cloudinary.com/dqemas8ht/video/upload/v1769200552/hero_video-BLAd97Wv_urt68e.mp4";

interface TrendingVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  createdAt: string;
  duration: number;
  creator: {
    username: string;
    avatarUrl?: string | null;
  };
}

export default function LandingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedVideo, setSelectedVideo] = useState<TrendingVideo | null>(null);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState(true);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  const { data: videos = [], isLoading } = useQuery<TrendingVideo[]>({
    queryKey: ["/api/trending-videos"],
  });

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  const handleGetStarted = () => {
    if (user) {
      navigate("/");
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-12 sm:h-16" 
                data-testid="landing-logo"
              />
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <Link href="/">
                    <Button variant="ghost" size="sm">
                      Dashboard
                    </Button>
                  </Link>
                  <Link href="/my-videos">
                    <Button variant="ghost" size="sm">
                      My Videos
                    </Button>
                  </Link>
                  <Link href="/community">
                    <Button variant="ghost" size="sm">
                      Community
                    </Button>
                  </Link>
                  <Link href="/profile">
                    <Button variant="ghost" size="sm">
                      Profile
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/community">
                    <Button variant="ghost" size="sm">
                      Community
                    </Button>
                  </Link>
                  <Link href="/auth">
                    <Button variant="ghost" size="sm">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/auth">
                    <Button size="sm" className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-50"></div>
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                Create AI Music Videos in Minutes
              </h1>
              <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground mb-8">
                Transform your ideas into stunning music videos with the power of AI. 
                Generate songs, create characters, and produce professional videos effortlessly.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center mb-12">
                <Button 
                  size="lg" 
                  onClick={handleGetStarted}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-lg px-8 py-6"
                  data-testid="hero-get-started"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  Start Creating Free
                </Button>
                <Link href="/plans">
                  <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                    View Plans
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right side - Video */}
            <div className="relative mx-auto lg:mx-0 w-full max-w-[300px] sm:max-w-[350px] md:max-w-[400px]">
              <div className="relative overflow-hidden rounded-xl shadow-2xl aspect-[3/4]">
                <video
                  ref={heroVideoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  src={heroVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onClick={() => {
                    setIsMuted(!isMuted);
                    if (heroVideoRef.current) {
                      heroVideoRef.current.muted = !isMuted;
                    }
                  }}
                />
                {/* Sound toggle overlay */}
                <button
                  className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/70 transition-colors p-3 rounded-full backdrop-blur-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted(!isMuted);
                    if (heroVideoRef.current) {
                      heroVideoRef.current.muted = !isMuted;
                    }
                  }}
                  aria-label={isMuted ? "Unmute video" : "Mute video"}
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5 text-white" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-white" />
                  )}
                </button>
                {/* Play icon overlay - shows when muted */}
                {isMuted && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/30 rounded-full p-4 backdrop-blur-sm">
                      <Play className="h-12 w-12 text-white/80" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-5xl mx-auto">
            <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <Music className="h-10 w-10 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-2">AI Song Generation</h3>
                <p className="text-sm text-muted-foreground">
                  Create original songs with lyrics in any style
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <Wand2 className="h-10 w-10 text-accent mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Smart Character Creation</h3>
                <p className="text-sm text-muted-foreground">
                  Generate unique characters that lip-sync perfectly
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <Video className="h-10 w-10 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Professional Videos</h3>
                <p className="text-sm text-muted-foreground">
                  Export high-quality videos ready to share
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trending Videos Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">Trending Videos</h2>
          <p className="text-muted-foreground">
            Discover amazing AI-generated music videos created by our community
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="loading-spinner w-6 h-6"></div>
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12">
            <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              No videos available yet
            </p>
            <Button 
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <Video className="h-4 w-4 mr-2" />
              Be the First to Create
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video) => (
              <Card 
                key={video.id} 
                className="overflow-hidden hover:border-primary/50 transition-all hover:scale-105 cursor-pointer bg-card/50 backdrop-blur-sm"
                onClick={() => setSelectedVideo(video)}
                data-testid={`trending-video-${video.id}`}
              >
                <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden group">
                  <video
                    className="absolute inset-0 w-full h-full object-cover"
                    src={video.videoUrl}
                    preload="metadata"
                    muted
                    onError={() => setVideoError(true)}
                  />
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Play className="h-12 w-12 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {formatDuration(video.duration)}
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 line-clamp-1">
                    {video.title || "Untitled Video"}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span className="truncate max-w-[120px]">
                        {video.creator.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(video.createdAt), "MMM d")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Create Your First Music Video?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of creators making amazing AI-powered music videos. 
              No technical skills required!
            </p>
            <Button 
              size="lg" 
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-lg px-8 py-6"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Get Started Now
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Video Player Modal */}
      {selectedVideo && (
        <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden" data-testid="video-player-modal">
            <div className="relative aspect-video bg-black">
              <video
                className="w-full h-full"
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                onError={() => setVideoError(true)}
                data-testid="video-player"
              />
            </div>
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-2">{selectedVideo.title}</h3>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>By {selectedVideo.creator.username}</span>
                <span>{format(new Date(selectedVideo.createdAt), "MMM d, yyyy")}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-8"
              />
              <span className="text-sm text-muted-foreground">
                © 2025 neonvideo.ai. All rights reserved.
              </span>
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/terms">
                <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground">
                  Terms
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground">
                  Privacy
                </Button>
              </Link>
              <Link href="/plans">
                <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground">
                  Pricing
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground">
                  Contact
                </Button>
              </Link>
              <Link href="/blog">
                <Button variant="link" size="sm" className="text-muted-foreground hover:text-foreground">
                  Blog
                </Button>
              </Link>
              <div className="flex items-center space-x-4 ml-4 border-l border-border/50 pl-4">
                <a
                  href="https://www.tiktok.com/@neonvideoai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-tiktok"
                  aria-label="TikTok"
                >
                  <SiTiktok className="w-5 h-5" />
                </a>
                <a
                  href="https://www.facebook.com/neonvideoai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-facebook"
                  aria-label="Facebook"
                >
                  <SiFacebook className="w-5 h-5" />
                </a>
                <a
                  href="https://www.youtube.com/@NeonVideoAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-youtube"
                  aria-label="YouTube"
                >
                  <SiYoutube className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}