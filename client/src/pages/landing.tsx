import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Video, Sparkles, Music, Wand2, Play, ArrowRight, Volume2, VolumeX, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import logoImage from "@assets/neonlogo_1756693683433.png";
import { useAuth } from "@/hooks/use-auth";
import { SiTiktok, SiFacebook, SiYoutube } from "react-icons/si";
import { Helmet } from "react-helmet-async";

const heroVideoHlsUrl =
  "https://vz-ec5a04eb-243.b-cdn.net/8938b165-4976-4c71-b56d-ef1d834fb568/playlist.m3u8";
const heroVideoPoster =
  "https://vz-ec5a04eb-243.b-cdn.net/8938b165-4976-4c71-b56d-ef1d834fb568/thumbnail.jpg";
const heroBackgroundMp4Url = "https://neonvideo.b-cdn.net/neonvideooutros/HeroBg.mp4";

interface FeaturedVideo {
  id: string;
  title: string;
  videoUrl: string;
  streamVideoId?: string | null;
  streamThumbnailUrl?: string | null;
  streamEmbedUrl?: string | null;
}

const homepageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://neonvideo.ai/#organization",
      name: "NeonVideo.ai",
      url: "https://neonvideo.ai/",
      logo: "https://neonvideo.ai/favicon.ico",
      sameAs: [
        "https://www.tiktok.com/@neonvideoai",
        "https://www.facebook.com/neonvideoai",
        "https://www.youtube.com/@NeonVideoAI",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://neonvideo.ai/#website",
      url: "https://neonvideo.ai/",
      name: "NeonVideo.ai",
      publisher: {
        "@id": "https://neonvideo.ai/#organization",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://neonvideo.ai/#software",
      name: "NeonVideo.ai",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: "https://neonvideo.ai/",
      description:
        "AI video platform for creating music videos, story videos, lyric videos, video shorts, captions, video upscales, prompt-based video edits, and background removal.",
      offers: {
        "@type": "Offer",
        url: "https://neonvideo.ai/plans",
        priceCurrency: "USD",
      },
      featureList: [
        "AI music video generation",
        "Character video generation",
        "Story video generation",
        "Lyric video generation",
        "Long-form AI video generation",
        "Video captions",
        "Video upscaling",
        "AI video editing",
        "Video background removal",
        "Public API",
      ],
      documentation: "https://neonvideo.ai/docs.md",
      softwareHelp: "https://neonvideo.ai/api-docs",
    },
    {
      "@type": "WebAPI",
      "@id": "https://neonvideo.ai/#api",
      name: "NeonVideo.ai Public API",
      url: "https://neonvideo.ai/openapi.json",
      documentation: "https://neonvideo.ai/docs.md",
      provider: {
        "@id": "https://neonvideo.ai/#organization",
      },
      description:
        "API for creating AI videos and running NeonVideo video tools including captions, upscaling, AI video editing, and background removal.",
    },
  ],
};

export default function LandingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(true);
  const [visibleRows, setVisibleRows] = useState(5);
  const [selectedVideo, setSelectedVideo] = useState<FeaturedVideo | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const VIDEOS_PER_ROW = 5;
  const ROWS_PER_BATCH = 5;

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(heroVideoHlsUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = heroVideoHlsUrl;
    }
  }, []);

  const { data: featuredVideos = [], isLoading: isFeaturedVideosLoading } = useQuery<FeaturedVideo[]>({
    queryKey: ["/api/trending-videos", "featured-landing"],
    queryFn: async () => {
      const response = await fetch("/api/trending-videos?limit=500");
      if (!response.ok) throw new Error("Failed to fetch featured videos");
      return response.json();
    },
  });

  const visibleCount = visibleRows * VIDEOS_PER_ROW;
  const visibleVideos = featuredVideos.slice(0, visibleCount);
  const canLoadMore = visibleCount < featuredVideos.length;

  const handleGetStarted = () => {
    if (user) {
      navigate("/");
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background overflow-x-hidden">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(homepageJsonLd)}
        </script>
      </Helmet>
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
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover pointer-events-none"
          src={heroBackgroundMp4Url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="absolute inset-0 z-[1] bg-background/75 backdrop-blur-[1px]" aria-hidden="true" />
        <div
          className="absolute inset-0 z-[2] bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-50 pointer-events-none"
          aria-hidden="true"
        />
        <div className="container mx-auto px-4 py-16 md:py-24 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto rounded-2xl border border-white/10 bg-black/45 px-6 py-8 sm:px-8 sm:py-10 backdrop-blur-sm">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                The Best AI Video platform, period.
              </h1>
              <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground mb-8">
                Transform your ideas into stunning videos with the power of AI. 
                Generate songs, create characters, and produce professional videos in a few minutes.
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
            <div className="relative mx-auto lg:mx-0 lg:ml-6 xl:ml-10 w-full max-w-[220px] sm:max-w-[260px] md:max-w-[280px] lg:max-w-[300px]">
              <div className="relative overflow-hidden rounded-xl shadow-2xl aspect-[9/16]">
                <video
                  ref={heroVideoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  poster={heroVideoPoster}
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
                  className="absolute bottom-4 left-4 bg-black/50 hover:bg-black/70 transition-colors p-3 rounded-full backdrop-blur-sm"
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

      {/* Featured Videos Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent max-w-4xl mx-auto px-2">
            No Cherry-Picking, real first-try results.
          </h2>
          <h3 className="text-3xl font-bold mb-3">Featured Videos</h3>
          <p className="text-muted-foreground">
            Discover AI-generated music videos from our community
          </p>
        </div>

        {isFeaturedVideosLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="loading-spinner w-6 h-6"></div>
          </div>
        ) : featuredVideos.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No featured videos available right now.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {visibleVideos.map((video) => {
                const trimmedTitle = video.title.length > 50 ? `${video.title.slice(0, 50)}...` : video.title;
                const hasStream = !!video.streamThumbnailUrl;
                return (
                  <div key={video.id} className="space-y-2" data-testid={`featured-video-${video.id}`}>
                    <h3 className="text-sm font-medium text-center line-clamp-1" title={video.title}>
                      {trimmedTitle}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedVideo(video)}
                      className="block w-full rounded-lg overflow-hidden bg-black/60 hover:opacity-90 transition-opacity relative group"
                    >
                      <div className="aspect-[3/4]">
                        {hasStream ? (
                          <img
                            src={video.streamThumbnailUrl!}
                            alt={video.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            className="w-full h-full object-cover"
                            src={video.videoUrl}
                            preload="metadata"
                            muted
                            playsInline
                          />
                        )}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-black/50 rounded-full p-3 backdrop-blur-sm">
                          <Play className="h-8 w-8 text-white" fill="white" />
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {canLoadMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => setVisibleRows((rows) => rows + ROWS_PER_BATCH)}
                  data-testid="featured-videos-load-more"
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Bunny Stream Player Modal */}
      <Dialog open={!!selectedVideo} onOpenChange={(open) => { if (!open) setSelectedVideo(null); }}>
        <DialogContent className="max-w-2xl md:max-w-[min(42rem,calc(80vh*3/4))] p-0 overflow-hidden border-none bg-black [&>button]:hidden">
          {selectedVideo && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 rounded-full p-1.5 transition-colors"
                aria-label="Close video"
              >
                <X className="h-5 w-5 text-white" />
              </button>
              <div className="aspect-[3/4] bg-black">
                {selectedVideo.streamEmbedUrl ? (
                  <iframe
                    src={`${selectedVideo.streamEmbedUrl}?autoplay=true&preload=true`}
                    loading="lazy"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-none"
                  />
                ) : (
                  <video
                    className="w-full h-full object-contain"
                    src={selectedVideo.videoUrl}
                    controls
                    autoPlay
                    playsInline
                  />
                )}
              </div>
              <div className="px-4 py-3 bg-black/90">
                <h3 className="text-white text-sm font-medium line-clamp-2">{selectedVideo.title}</h3>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Why choose NeonVideo */}
      <section className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">Why choose NeonVideo</h2>
          <p className="text-muted-foreground">
            See how we compare to the competition
          </p>
        </div>
        <div className="max-w-4xl mx-auto overflow-hidden rounded-lg border border-border bg-card/50 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-semibold text-muted-foreground w-[40%]">Feature</th>
                  <th className="px-4 py-3 font-semibold text-primary">NeonVideo.AI</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">The Competition</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Video Quality</td>
                  <td className="px-4 py-3">HD</td>
                  <td className="px-4 py-3 text-muted-foreground">SD</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Video Length Limit</td>
                  <td className="px-4 py-3">4 minutes</td>
                  <td className="px-4 py-3 text-muted-foreground">15 seconds</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Commercial Use</td>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">Yes</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Number of AI songs available to generate</td>
                  <td className="px-4 py-3">Unlimited</td>
                  <td className="px-4 py-3 text-muted-foreground">10</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">AI Models Quality</td>
                  <td className="px-4 py-3">Premium Models included in all plans</td>
                  <td className="px-4 py-3 text-muted-foreground">Basic/cheap models or pay for extra for Premium models</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Edit Videos</td>
                  <td className="px-4 py-3">Yes (Unlimited)</td>
                  <td className="px-4 py-3 text-muted-foreground">No</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">API use</td>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">No</td>
                </tr>
                <tr className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">Basic Plan cost</td>
                  <td className="px-4 py-3">$9</td>
                  <td className="px-4 py-3 text-muted-foreground">$39</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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

      {/* Featured On Badge */}
      <section className="container mx-auto px-4 py-8 flex justify-center">
        <a href="https://theresanaiforthat.com/ai/neonvideo-ai/?ref=featured&v=6052648" target="_blank" rel="nofollow">
          <img width="300" src="https://media.theresanaiforthat.com/featured-on-taaft.png?width=600" alt="Featured on There's An AI For That" />
        </a>
      </section>

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
