import { useState } from "react";
import { useLocation } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { AddCaptionsToolModal } from "@/components/modals/add-captions-tool-modal";
import { TrimVideoToolModal } from "@/components/modals/trim-video-tool-modal";
import { TrimAudioToolModal } from "@/components/modals/trim-audio-tool-modal";
import { VideoUpscalerToolModal } from "@/components/modals/video-upscaler-tool-modal";
import { AIVideoEditionToolModal } from "@/components/modals/ai-video-edition-tool-modal";
import { VideoBackgroundRemoverToolModal } from "@/components/modals/video-background-remover-tool-modal";
import { Subtitles, Scissors, Music, ArrowUpRight, Wand2, Eraser } from "lucide-react";

export default function CreateSelect() {
  const [, navigate] = useLocation();
  const [addCaptionsOpen, setAddCaptionsOpen] = useState(false);
  const [trimVideoOpen, setTrimVideoOpen] = useState(false);
  const [trimAudioOpen, setTrimAudioOpen] = useState(false);
  const [videoUpscalerOpen, setVideoUpscalerOpen] = useState(false);
  const [aiVideoEditionOpen, setAIVideoEditionOpen] = useState(false);
  const [videoBgRemoverOpen, setVideoBgRemoverOpen] = useState(false);

  const videoModes = [
    {
      id: "story-mode",
      title: "Pro Mode",
      description: "Pro Mode",
      explanation: "Full control with character customization and scene editing",
      imageUrl: "https://res.cloudinary.com/dqemas8ht/image/upload/v1771118603/singkitty2a_n6vznj.png",
      route: "/create/story-mode",
      available: true,
    },
    {
      id: "simple-mode",
      title: "Simple Mode",
      description: "Simple Mode",
      explanation: "Prompt-first flow with optional song and image attachments",
      imageUrl: "https://neonvideo.b-cdn.net/custom/1.png",
      route: "/create/simple-mode",
      available: true,
    },
    {
      id: "single-prompt",
      title: "Single Prompt",
      description: "Single Prompt",
      explanation: "Create videos instantly with a single prompt - no character customization needed",
      imageUrl: "https://res.cloudinary.com/dqemas8ht/image/upload/v1771192705/singleprompt4_tnwfln.jpg",
      route: "/create/single-prompt",
      available: true,
    },
    {
      id: "instrumental",
      title: "Instrumental",
      description: "Instrumental",
      explanation: "Music-only videos without characters or lip-sync features",
      imageUrl: "https://res.cloudinary.com/dqemas8ht/image/upload/v1771302921/instrumental4_l55bhb.jpg",
      route: "/create/instrumental",
      available: true,
    },
    {
      id: "lyric",
      title: "Lyric",
      description: "Lyric",
      explanation: "Automatically add lyrics to any song",
      imageUrl: "https://res.cloudinary.com/dqemas8ht/image/upload/v1771295880/lyric_video_lh0pta.jpg",
      route: "/create/lyric",
      available: true,
    },
    {
      id: "video-shorts",
      title: "Music Video Shorts",
      description: "Music Video Shorts",
      explanation: "Create stunning 12-second video shorts from a single prompt",
      imageUrl: "https://neonvideo.b-cdn.net/custom/electricgoat.jpg",
      route: "/create/video-shorts",
      available: true,
    },
  ];

  const handleModeClick = (mode: typeof videoModes[0]) => {
    if (mode.available) {
      navigate(mode.route);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      
      <main className="flex-1 container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8 sm:mb-12">
            Music Video Style
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">
            {videoModes.map((mode) => (
              <Card
                key={mode.id}
                className={`overflow-hidden border transition-all ${
                  mode.available
                    ? "border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer"
                    : "border-border/50 opacity-60 cursor-not-allowed"
                }`}
                onClick={() => handleModeClick(mode)}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  <img
                    src={mode.imageUrl}
                    alt={mode.title}
                    className="w-full h-full object-cover"
                  />
                  {!mode.available && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <span className="text-muted-foreground text-sm font-medium">
                        Coming Soon
                      </span>
                    </div>
                  )}
                </div>
                <div className="px-4 sm:px-6 pt-3 pb-2">
                  <p className="text-center text-pink-500 text-xs sm:text-sm">
                    {mode.explanation}
                  </p>
                </div>
                <CardContent className="p-4 sm:p-6 pt-2">
                  <p className="text-center text-foreground text-sm sm:text-base font-medium">
                    {mode.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-16 mb-6">
            Video Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setAddCaptionsOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <Subtitles className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Add TikTok-style captions from a URL or upload
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Add Captions
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setTrimVideoOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <Scissors className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Set start and end time on a timeline
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Trim Video
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setTrimAudioOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <Music className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Trim to a desired length with fade out
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Trim Audio
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setVideoUpscalerOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <ArrowUpRight className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Upscale to 1080p, 2K, or 4K (credits-based)
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Video Upscaler
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setAIVideoEditionOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <Wand2 className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Targeted retakes with a prompt
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  AI Video Edition
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setVideoBgRemoverOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center">
                <Eraser className="h-16 w-16 text-muted-foreground/60" />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Remove background with AI
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Video Background Remover
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <AddCaptionsToolModal
        isOpen={addCaptionsOpen}
        onClose={() => setAddCaptionsOpen(false)}
        onSuccess={() => setAddCaptionsOpen(false)}
      />
      <TrimVideoToolModal
        isOpen={trimVideoOpen}
        onClose={() => setTrimVideoOpen(false)}
      />
      <TrimAudioToolModal
        isOpen={trimAudioOpen}
        onClose={() => setTrimAudioOpen(false)}
      />
      <VideoUpscalerToolModal
        isOpen={videoUpscalerOpen}
        onClose={() => setVideoUpscalerOpen(false)}
      />
      <AIVideoEditionToolModal
        isOpen={aiVideoEditionOpen}
        onClose={() => setAIVideoEditionOpen(false)}
      />
      <VideoBackgroundRemoverToolModal
        isOpen={videoBgRemoverOpen}
        onClose={() => setVideoBgRemoverOpen(false)}
      />

      <Footer />
    </div>
  );
}
