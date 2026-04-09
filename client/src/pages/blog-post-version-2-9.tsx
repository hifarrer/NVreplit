import { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import Hls from "hls.js";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Rocket,
  Video,
  Sparkles,
  CheckCircle,
  Music,
  Film,
  Type,
  Palette,
  BookOpen,
  Lightbulb,
  Wrench,
} from "lucide-react";

export default function Version290Release() {
  const featuredVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = featuredVideoRef.current;
    if (!video) return;

    const hlsUrl =
      "https://stream.mux.com/VsniqdvGwpGukMk8FT01DxuU9tEif1x8wU2FURa8AS3Q.m3u8?redundant_streams=true";

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>Version 2.9 Released - Story Videos, UI Polish & Video Style Guide | NeonVideo.ai</title>
        <meta
          name="description"
          content="NeonVideo.ai version 2.9 introduces Story Videos with narration, multi-character scenes, and script control—plus UI improvements, bug fixes, and practical tips for every music video style."
        />
        <meta property="og:title" content="Version 2.9 Released - Story Videos & More" />
        <meta
          property="og:description"
          content="Story Videos join Pro Mode, Simple Mode, Loop, Single Prompt, Instrumental, Lyric, and Shorts—with clearer creation flows and reliability fixes."
        />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-9-release" />
        <meta
          property="og:image"
          content="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg"
        />
        <meta
          name="keywords"
          content="NeonVideo.ai update, version 2.9, Story Videos, AI narration, AI music video, Pro Mode, Simple Mode, Single Prompt, Instrumental, Lyric, video shorts"
        />
        <link rel="canonical" href="https://neonvideo.ai/version-2-9-release" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-black dark:bg-black">
        <NavigationHeader />

        <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
          <Link href="/blog">
            <Button variant="ghost" className="mb-6 text-white hover:text-white/80" data-testid="button-back-blog">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Button>
          </Link>

          <article className="bg-black/30 backdrop-blur-md rounded-lg border border-purple-500/20 p-8 md:p-12">
            <header className="mb-8">
              <div className="flex items-center gap-2 text-purple-400 text-sm mb-4">
                <Rocket className="h-4 w-4" />
                <span>Product Update</span>
                <span className="text-gray-500">•</span>
                <time dateTime="2026-04-07">April 7, 2026</time>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.9: Story Videos, Refined Creation Hub & a Practical Guide to Every Video Style
              </h1>

              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                Version 2.9 centers on{" "}
                <strong className="text-white">Story Videos</strong>—a dedicated flow for scripted narratives with
                characters, optional narration, scene-by-scene visuals, and final assembly built for clarity and
                control. We have also polished the creation experience, tightened reliability in several pipelines, and
                summarized how to pick the right music video style for your goal.
              </p>

              <div className="w-1/4 mx-auto rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <video
                  ref={featuredVideoRef}
                  className="w-full h-auto"
                  controls
                  playsInline
                  preload="metadata"
                  data-testid="video-release-hero"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <BookOpen className="h-8 w-8 text-purple-400" />
                  Story Videos: narratives with characters and voice
                </h2>

                <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30 mb-6">
                  <CardContent className="pt-6 text-gray-300">
                    <p className="mb-4">
                      Story Videos are for short films, promos, explainers, and character-driven clips—not tied to a
                      single uploaded song like most music video modes. You start from a story prompt, review an
                      AI-generated script, then move through scene imagery, dialogue audio, and final render.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Guided steps:</strong> Story setup → script review → assets and
                          final story video, so you always know what happens next.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Optional narrator</strong> with a wide voice library (many
                          languages and accents) for exposition or storybook-style delivery.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Up to three characters</strong> from your library, each with
                          its own look and voice assignment.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Multi-character scenes</strong> when the script calls for two
                          people in frame, with configurable speaking order for natural back-and-forth.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Duration from 30 seconds to 5 minutes</strong>, with credits
                          scaling in 30-second blocks so longer stories stay predictable to budget.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Aspect ratios 16:9 or 3:4</strong> for YouTube-style landscape
                          or taller social feeds.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Edit and iterate:</strong> adjust the script, regenerate
                          individual scenes, upload a custom still for a scene when you want a specific composition, and
                          resume existing projects.
                        </span>
                      </li>
                    </ul>
                    <p className="mt-4 text-sm text-gray-400">
                      <strong className="text-gray-300">Tip:</strong> Write prompts that name motivations and setting
                      (who wants what, where, and why). The clearer the premise, the less rewriting you need in script
                      review.
                    </p>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  What else is new in 2.9
                </h2>

                <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-6 text-gray-300 space-y-3">
                  <p>
                    <strong className="text-white">Creation hub:</strong> Story Videos now appear alongside music video
                    styles on the main create page, with a live preview card so you can jump straight into narrative
                    workflows.
                  </p>
                  <p>
                    <strong className="text-white">Home and showcase content:</strong> Updated preview media on the
                    landing experience so new visitors see current capabilities—including story-style output—more
                    accurately.
                  </p>
                  <p>
                    <strong className="text-white">Operational improvements:</strong> Behind the scenes we continued hardening
                    generation steps, admin tooling, and analytics-related instrumentation to keep builds stable as usage
                    grows.
                  </p>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Lightbulb className="h-8 w-8 text-purple-400" />
                  Choosing a video style: quick guidelines
                </h2>

                <p className="text-gray-300 mb-6">
                  Each style trades control for speed and cost. Use this as a decision map—then pick the card that matches
                  on the create page.
                </p>

                <div className="space-y-6">
                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Film className="h-6 w-6 text-purple-400" />
                        Pro Mode
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Official releases and promos where you need
                        custom characters, per-scene edits, lip-sync, and quality tiers.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> Runtime is credit-limited—plan scene count
                        and length before you commit.
                      </p>
                      <p className="text-sm text-gray-400">
                        If you need maximum control for a <em>music</em> video, start here—not Story Video.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Palette className="h-6 w-6 text-purple-400" />
                        Simple Mode
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Fast music videos from one strong prompt, with
                        optional uploaded song and optional reference image for the singer.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> No full character builder; you trade deep
                        customization for speed. You can still edit and regenerate the video after generation.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Music className="h-6 w-6 text-purple-400" />
                        Seamless Loop Video
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Full-length tracks on a budget—song length is
                        not capped by credits the same way as scene-based modes.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> No singing characters, no deep scene
                        control, and no timeline editing after the fact. Ideal for ambient loops and continuous visuals.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Rocket className="h-6 w-6 text-purple-400" />
                        Single Prompt
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> One-shot ideas—music, character, and scenes
                        inferred from a single description when you want something complete with minimal clicking.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> No character studio, no lip-sync
                        characters, and limited post control. Great for prototypes and social experiments.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-purple-400" />
                        Instrumental
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Motivational reels, B-roll-heavy pieces, and
                        any video where vocals and lip-sync are not the point.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> Optimized for visuals over characters; no
                        scene-by-scene editing after generation.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Type className="h-6 w-6 text-purple-400" />
                        Lyric
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> TikTok- and Reels-style caption videos with
                        word-level timing over your track.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> Not a replacement for Pro Mode scene
                        storytelling—there is no character or scene customization workflow after generation.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Video className="h-6 w-6 text-purple-400" />
                        Music Video Shorts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Very short (~12s) vertical-friendly clips when
                        you want maximum cost efficiency per clip.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> No characters in-frame in the same sense as
                        Pro/Simple; treat it as a punchy visual hook, not a full narrative.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20 border-pink-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BookOpen className="h-6 w-6 text-pink-400" />
                        Story Video (new in 2.9)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300 space-y-2">
                      <p>
                        <strong className="text-white">Best for:</strong> Scripted stories, dialogue-driven shorts, and
                        character-led content where narration and scene beats matter more than a single music master
                        track.
                      </p>
                      <p>
                        <strong className="text-white">Keep in mind:</strong> Credits scale with target duration; refine
                        the script before generating all scene assets to avoid unnecessary reruns.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Wrench className="h-8 w-8 text-purple-400" />
                  Bug fixes and UI improvements
                </h2>

                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Story pipeline stability</strong> improvements around asset
                        generation, polling, and resume behavior so interrupted jobs are less confusing to recover.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Loop and sequential playback fixes</strong> for smoother
                        end-to-end video output in long-form loop-style renders.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Account quality safeguards</strong> (including stricter handling of
                        disposable signup domains) to reduce abuse and protect queue time for real creators.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">UI polish</strong> on the create hub and previews—clearer
                        grouping for music video styles vs. Story Videos vs. music tools, and more consistent cards on
                        smaller screens.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">General fixes</strong> from user reports across generation,
                        timelines, and export paths; thank you to everyone who sent concrete repro steps.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Start with 2.9</h2>
                <p className="text-gray-300 mb-6">
                  Open <strong className="text-white">Create</strong>, scroll to <strong className="text-white">Story Videos</strong>, or pick a music video style that fits your project using the guide above. Everything in 2.8—tools, API access, and the core music video modes—remains available alongside Story Videos.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/auth">
                    <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8" data-testid="button-start-creating">
                      Start Creating
                      <Rocket className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/create/story-video">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-purple-500/50 text-purple-300 hover:bg-purple-950/50"
                      data-testid="button-story-video"
                    >
                      Story Video
                      <BookOpen className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </section>

              <section className="border-t border-purple-500/20 pt-8">
                <h2 className="text-2xl font-bold text-white mb-4">Feedback</h2>
                <p className="text-gray-300">
                  Tell us what you want next for Story Videos and music styles—feature requests and bug reports are
                  welcome on our{" "}
                  <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">
                    contact page
                  </Link>
                  .
                </p>
              </section>
            </div>
          </article>
        </main>

        <Footer />
      </div>
    </>
  );
}
