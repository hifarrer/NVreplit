import { useState, lazy, Suspense } from "react";
import { useLocation, Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VideoStylePreview } from "@/components/video-style-preview";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles } from "lucide-react";

// Lazy-loaded so tool modal code is not in the initial /create JS bundle (reduces Lighthouse "unused JavaScript"
// until a user opens a tool). All modals are still required for full functionality.
const AddCaptionsToolModal = lazy(() =>
  import("@/components/modals/add-captions-tool-modal").then((m) => ({ default: m.AddCaptionsToolModal })),
);
const TrimVideoToolModal = lazy(() =>
  import("@/components/modals/trim-video-tool-modal").then((m) => ({ default: m.TrimVideoToolModal })),
);
const TrimAudioToolModal = lazy(() =>
  import("@/components/modals/trim-audio-tool-modal").then((m) => ({ default: m.TrimAudioToolModal })),
);
const AudioToLyricsToolModal = lazy(() =>
  import("@/components/modals/audio-to-lyrics-tool-modal").then((m) => ({ default: m.AudioToLyricsToolModal })),
);
const VideoUpscalerToolModal = lazy(() =>
  import("@/components/modals/video-upscaler-tool-modal").then((m) => ({ default: m.VideoUpscalerToolModal })),
);
const AIVideoEditionToolModal = lazy(() =>
  import("@/components/modals/ai-video-edition-tool-modal").then((m) => ({ default: m.AIVideoEditionToolModal })),
);
const VideoBackgroundRemoverToolModal = lazy(() =>
  import("@/components/modals/video-background-remover-tool-modal").then((m) => ({
    default: m.VideoBackgroundRemoverToolModal,
  })),
);

export default function CreateSelect() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isOnFreePlan = user && (!user.plan || user.plan.name?.toLowerCase() === 'free');
  const [addCaptionsOpen, setAddCaptionsOpen] = useState(false);
  const [trimVideoOpen, setTrimVideoOpen] = useState(false);
  const [trimAudioOpen, setTrimAudioOpen] = useState(false);
  const [videoUpscalerOpen, setVideoUpscalerOpen] = useState(false);
  const [aiVideoEditionOpen, setAIVideoEditionOpen] = useState(false);
  const [videoBgRemoverOpen, setVideoBgRemoverOpen] = useState(false);
  const [audioToLyricsOpen, setAudioToLyricsOpen] = useState(false);

  const allPurposeMode = {
    id: "all-purpose",
    title: "All Purpose / Long Format Video",
    description: "All Purpose / Long Format Video",
    explanation: "Don't get limited by 10 second videos",
    videoUrl:
      "https://stream.mux.com/6mkV14sCmLrl7eS2dHyXB1YmKCQopHb1wPq00Q3O7Gbg.m3u8?redundant_streams=true",
    route: "/create/all-purpose",
    available: true,
  } as const;

  const videoModes = [
    {
      id: "story-mode",
      title: "Pro Mode",
      description: "Pro Mode",
      explanation: "Full control with character customization and scene editing",
      videoUrl: "https://stream.mux.com/izYi3JADnbg7h8SHzsASpOyB9ajBYAJc5LsC02i9TC02c.m3u8?redundant_streams=true",
      route: "/create/story-mode",
      available: true,
    },
    {
      id: "simple-mode",
      title: "Simple Mode",
      description: "Simple Mode",
      explanation: "Prompt-first flow with optional song and image attachments",
      videoUrl: "https://stream.mux.com/qqkJMythzHpac01DZzzzDYacWsFTSMdXXNL2uQXQ1jBc.m3u8?redundant_streams=true",
      route: "/create/simple-mode",
      available: true,
    },
    {
      id: "loop-video",
      title: "Seamless Loop Video",
      description: "Seamless Loop Video",
      explanation: "Create a video loop for any song",
      videoUrl: "https://stream.mux.com/VNcm3lLuOzdlm02EngDb7uWpU3JNDKo1JVsJAEzgRfMI.m3u8?redundant_streams=true",
      route: "/create/loop-video",
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
      videoUrl: "https://stream.mux.com/02hJ7SQZDm1rsQgkxGa02W02DdOgk02Iy00QJmA9NBb01im1I.m3u8?redundant_streams=true",
      route: "/create/instrumental",
      available: true,
    },
    {
      id: "lyric",
      title: "Lyric",
      description: "Lyric",
      explanation: "Automatically add lyrics to any song",
      videoUrl: "https://stream.mux.com/3xcUjCgA00x9Uu6BZEfVAYmU3L7FoUaE2rId8GedrxeE.m3u8?redundant_streams=true",
      route: "/create/lyric",
      available: true,
    },
    {
      id: "video-shorts",
      title: "Music Video Shorts",
      description: "Music Video Shorts",
      explanation: "Create stunning 12-second video shorts from a single prompt",
      videoUrl: "https://stream.mux.com/009H5uoHfflL1Y00PQkW3w8FvrTUxYXbsmIrHh13i00800s.m3u8?redundant_streams=true",
      route: "/create/video-shorts",
      available: true,
    },
  ];

  const handleModeClick = (mode: typeof allPurposeMode | (typeof videoModes)[0]) => {
    if (mode.available) {
      navigate(mode.route);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <NavigationHeader currentPage="home" />
      
      <main className="flex-1 container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          {isOnFreePlan && (
            <div className="mb-8 p-5 rounded-xl border-2 border-primary/40 bg-gradient-to-r from-primary/10 to-purple-500/10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <h2 className="text-lg font-bold">You need a plan to start creating</h2>
                    <p className="text-sm text-muted-foreground">Try NeonVideo for just $1/month. Get 4,000 credits to create AI music videos.</p>
                  </div>
                </div>
                <Link href="/plans?trial=1">
                  <Button className="shrink-0">Start $1 Trial</Button>
                </Link>
              </div>
            </div>
          )}

          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mt-8 sm:mt-12 mb-8 sm:mb-12">
            Music Video Style
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
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
                <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                  {"imageUrl" in mode && mode.imageUrl ? (
                    <img
                      src={mode.imageUrl}
                      alt={mode.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : "videoUrl" in mode && mode.videoUrl ? (
                    <VideoStylePreview
                      hlsUrl={mode.videoUrl}
                      className="absolute inset-0"
                    />
                  ) : null}
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
            Story Videos
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => navigate("/create/story-video")}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                <VideoStylePreview
                  hlsUrl="https://stream.mux.com/UyR7Y01LqlVFKJzYcXHAvHl2OCHM4FUZyKpHTxz7BSNs.m3u8?redundant_streams=true"
                  className="absolute inset-0"
                />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Create AI-generated story videos with characters and narration
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Story Video
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-16 mb-6">
            All Purpose Video
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <Card
              className={`overflow-hidden border transition-all ${
                allPurposeMode.available
                  ? "border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer"
                  : "border-border/50 opacity-60 cursor-not-allowed"
              }`}
              onClick={() => handleModeClick(allPurposeMode)}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                <VideoStylePreview
                  hlsUrl={allPurposeMode.videoUrl}
                  className="absolute inset-0"
                />
                {!allPurposeMode.available && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">Coming Soon</span>
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">{allPurposeMode.explanation}</p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  {allPurposeMode.description}
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-16 mb-6">
            Music Tools
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => navigate("/create/create-song")}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/neonmusic.jpg"
                  alt="Neon Music"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  High Quality AI Music Generation
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Create Music
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setAudioToLyricsOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/lyricstile.jpg"
                  alt="Audio to Lyrics"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Extract lyrics from audio URL or file
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Audio to Lyrics
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-16 mb-6">
            Visual Tools
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => navigate("/create/character-creator")}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383314/characters_bsaw13.png"
                  alt="Character Creator"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Create a unique character for your videos
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  Character Creator
                </p>
              </CardContent>
            </Card>
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => navigate("/create/ai-image-edit")}
            >
              <div className="relative aspect-[4/3] overflow-hidden flex items-center justify-center bg-gradient-to-br from-pink-500/20 via-background to-purple-500/20">
                <span className="text-5xl" aria-hidden>✨</span>
              </div>
              <div className="px-4 sm:px-6 pt-3 pb-2">
                <p className="text-center text-pink-500 text-xs sm:text-sm">
                  Edit any image with a prompt using AI
                </p>
              </div>
              <CardContent className="p-4 sm:p-6 pt-2">
                <p className="text-center text-foreground text-sm sm:text-base font-medium">
                  AI Image Edit
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-16 mb-6">
            Video Tools
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <Card
              className="overflow-hidden border border-border hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.5),0_0_30px_rgba(236,72,153,0.3),0_0_45px_rgba(236,72,153,0.2)] cursor-pointer transition-all"
              onClick={() => setAddCaptionsOpen(true)}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/styletiktok2.jpg"
                  alt="Add Captions"
                  className="w-full h-full object-cover"
                />
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/StyleVideoTrim.jpg"
                  alt="Trim Video"
                  className="w-full h-full object-cover"
                />
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/Style_audioTrim.jpg"
                  alt="Trim Audio"
                  className="w-full h-full object-cover"
                />
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/styleUpscale.jpg"
                  alt="Video Upscaler"
                  className="w-full h-full object-cover"
                />
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/styleAIedit.jpg"
                  alt="AI Video Edition"
                  className="w-full h-full object-cover"
                />
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src="https://neonvideo.b-cdn.net/logos/styleBGremover.jpg"
                  alt="Video Background Remover"
                  className="w-full h-full object-cover"
                />
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

      <Suspense fallback={null}>
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
        <AudioToLyricsToolModal
          isOpen={audioToLyricsOpen}
          onClose={() => setAudioToLyricsOpen(false)}
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
      </Suspense>

      <Footer />
    </div>
  );
}
