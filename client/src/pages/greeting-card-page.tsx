import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MuxVideoPlayer } from "@/components/mux-video-player";
import { Gift, Heart, Play } from "lucide-react";
import { useState } from "react";
import logoImage from "@assets/neonlogo_1756693683433.png";

interface GreetingCardData {
  senderName: string;
  message: string | null;
  videoTitle: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  muxPlaybackId: string | null;
  bunny?: {
    videoId: string | null;
    status: string | null;
    hlsUrl: string | null;
    thumbnailUrl: string | null;
  };
  aspectRatio: string;
  createdAt: string;
}

export default function GreetingCardPage() {
  const { token } = useParams<{ token: string }>();
  const [showVideo, setShowVideo] = useState(false);

  const { data: greetingCard, isLoading, error } = useQuery<GreetingCardData>({
    queryKey: [`/api/greeting/${token}`],
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading your greeting...</p>
        </div>
      </div>
    );
  }

  if (error || !greetingCard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-pink-400 mb-4">
            <Gift className="w-16 h-16 mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Greeting Not Found</h1>
          <p className="text-gray-400 mb-6">
            This video greeting may have expired or the link is invalid.
          </p>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="border-pink-500/50 text-pink-400 hover:bg-pink-500/10"
          >
            Create Your Own Video
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center">
            <a href="/">
              <img 
                src={logoImage} 
                alt="neonvideo.ai" 
                className="h-12 cursor-pointer" 
              />
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 mb-4">
              <Gift className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              You've received a Video Greeting!
            </h1>
            <p className="text-gray-400">
              From <span className="text-pink-400 font-semibold">{greetingCard.senderName}</span>
            </p>
          </div>

          {greetingCard.message && (
            <Card className="bg-gray-800/50 border-gray-700 mb-6">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-pink-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-400 mb-2">Personal message:</p>
                    <p className="text-white text-lg italic">"{greetingCard.message}"</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className={`overflow-hidden bg-gray-800/50 border-gray-700 ${greetingCard.aspectRatio === "3:4" ? "max-w-md mx-auto" : ""}`} data-testid="greeting-video-card">
            <CardContent className="p-0">
              {!showVideo ? (
                <div 
                  className="relative cursor-pointer group"
                  onClick={() => setShowVideo(true)}
                  data-testid="button-play-greeting"
                >
                  <div className={`${greetingCard.aspectRatio === "3:4" ? "aspect-[3/4]" : "aspect-video"} bg-gradient-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center`}>
                    {greetingCard.thumbnailUrl ? (
                      <img 
                        src={greetingCard.thumbnailUrl} 
                        alt={greetingCard.videoTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <h3 className="text-xl font-semibold text-white mb-2">{greetingCard.videoTitle}</h3>
                        <p className="text-gray-400 text-sm">Click to play</p>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-colors">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-xl shadow-pink-500/30 group-hover:scale-110 transition-transform">
                      <Play className="w-10 h-10 text-white ml-1" fill="white" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={greetingCard.aspectRatio === "3:4" ? "aspect-[3/4]" : "aspect-video"}>
                  {greetingCard.muxPlaybackId || (greetingCard.bunny?.status === 'finished' && greetingCard.bunny?.hlsUrl) ? (
                    <MuxVideoPlayer
                      playbackId={greetingCard.muxPlaybackId}
                      bunnyHlsUrl={greetingCard.bunny?.status === 'finished' ? greetingCard.bunny.hlsUrl : null}
                      bunnyEmbedUrl={greetingCard.bunny?.embedUrl ?? null}
                      fallbackUrl={greetingCard.videoUrl}
                      autoPlay={true}
                      controls
                    />
                  ) : (
                    <video
                      src={greetingCard.videoUrl}
                      controls
                      autoPlay
                      className="w-full h-full"
                      data-testid="greeting-video-player"
                    >
                      Your browser does not support the video tag.
                    </video>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <p className="text-gray-500 text-sm mb-4">
              Want to create your own AI-generated video?
            </p>
            <Button
              onClick={() => window.location.href = '/'}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
              data-testid="button-create-video"
            >
              <Gift className="w-4 h-4 mr-2" />
              Create Your Own Video
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>© 2025 neonvideo.ai. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
