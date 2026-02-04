import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Sparkles, Music, Wand2, Play, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { Link, useLocation } from "wouter";
import logoImage from "@assets/neonlogo_1756693683433.png";
import { useAuth } from "@/hooks/use-auth";
import { SiTiktok, SiFacebook, SiYoutube } from "react-icons/si";

const heroVideo = "https://res.cloudinary.com/dqemas8ht/video/upload/v1769200552/hero_video-BLAd97Wv_urt68e.mp4";

// TikTok embed has a fixed width of 325px, we use height 538px to hide bottom UI
function TikTokEmbed({ videoId }: { videoId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        // TikTok embed is 325x538 (reduced height to hide bottom UI)
        const scaleX = containerWidth / 325;
        const scaleY = containerHeight / 538;
        // Use the smaller scale to fit everything (1.00x - no extra scaling)
        const newScale = Math.min(scaleX, scaleY);
        setScale(newScale);
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateScale);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Card 
      className="overflow-hidden bg-card/50 backdrop-blur-sm"
      data-testid={`tiktok-video-${videoId}`}
    >
      <div 
        ref={containerRef}
        className="bg-black relative"
        style={{
          aspectRatio: '325 / 538', // Match the iframe aspect ratio (325:538)
        }}
      >
        <div
          className="absolute"
          style={{
            width: '325px',
            height: '538px',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <iframe
            src={`https://www.tiktok.com/embed/v2/${videoId}`}
            className="w-full h-full"
            style={{
              width: '325px',
              height: '538px',
              pointerEvents: 'auto',
            }}
            frameBorder="0"
            scrolling="no"
            allow="encrypted-media"
            allowFullScreen
            title={`TikTok video ${videoId}`}
          />
        </div>
      </div>
    </Card>
  );
}

export default function LandingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(true);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  const handleGetStarted = () => {
    if (user) {
      navigate("/");
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background overflow-x-hidden">
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

      {/* TikTok Videos Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">Featured Videos</h2>
          <p className="text-muted-foreground">
            Check out our latest AI-generated music videos on TikTok
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {[
            "7599078362769886494",
            "7575338797584469279",
            "7574658234779208991",
            "7602994316557978893",
            "7598756835025227039",
            "7561092405684915470",
            "7596083992202349837",
            "7573353727168433422",
            "7566720433408445709",
            "7592820321829276983",
            "7575203893395623198",
            "7578919925947895095",
            "7579090130250632462",
            "7592341002602515767",
            "7600984196785523999",
            "7574420688082144525",
            "7596167634417143070",
            "7559368462649281806",
            "7559236974125583629",
            "7559190585400167735",
            "7582630957912542477",
            "7576044166963023159",
            "7562576600429120781",
            "7593021385451113741",
            "7602437689744428318",
            "7600814100892896543",
            "7600659726912769311",
            "7582058866762943758",
            "7598649418065169677",
            "7598587535555693837",
            "7560303418946981175",
            "7560457124677963022",
            "7560544083698027790",
            "7560546740261227831",
            "7560860394026274061",
            "7564231136319147277",
            "7566983387001474359",
            "7564973260727782669",
            "7579059252707347725",
            "7564571361318882615",
            "7569271658574269751",
            "7581950539068411150",
          ].map((videoId) => (
            <TikTokEmbed key={videoId} videoId={videoId} />
          ))}
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