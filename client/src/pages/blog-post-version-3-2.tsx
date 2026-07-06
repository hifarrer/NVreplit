import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
  CheckCircle,
  Clapperboard,
  FileText,
  Rocket,
  Scissors,
  Sparkles,
  Video,
} from "lucide-react";

const EDITOR_URL = "https://editor.neonvideo.ai";

export default function Version320Release() {
  return (
    <>
      <Helmet>
        <title>Version 3.2 Released: AI video editor. | NeonVideo.ai</title>
        <meta
          name="description"
          content="NeonVideo.ai version 3.2 introduces a browser-based AI video editor with an AI assistant, transcript editing, automatic cleanup, shorts discovery, animated captions, timeline tools, and flexible exports."
        />
        <meta property="og:title" content="Version 3.2 Released: AI video editor." />
        <meta
          property="og:description"
          content="Generate and arrange media, edit spoken video like text, find short-form highlights, create animated captions, and finish projects on a full multitrack timeline."
        />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-3-2-release" />
        <meta
          name="keywords"
          content="NeonVideo.ai update, version 3.2, AI video editor, transcript video editing, automatic captions, shorts creator, timeline editor"
        />
        <link rel="canonical" href="https://neonvideo.ai/version-3-2-release" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-black dark:bg-black">
        <NavigationHeader />

        <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
          <Link href="/blog">
            <Button
              variant="ghost"
              className="mb-6 text-white hover:text-white/80"
              data-testid="button-back-blog"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Button>
          </Link>

          <article className="bg-black/30 backdrop-blur-md rounded-lg border border-purple-500/20 p-8 md:p-12">
            <header className="mb-10">
              <div className="flex items-center gap-2 text-purple-400 text-sm mb-4">
                <Rocket className="h-4 w-4" />
                <span>Product Update</span>
                <span className="text-gray-500">•</span>
                <time dateTime="2026-07-06">July 6, 2026</time>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                Version 3.2 Released: AI video editor.
              </h1>

              <p className="text-xl text-gray-300 leading-relaxed">
                Version 3.2 adds a complete browser-based editing workspace to NeonVideo.ai. It combines a
                professional multitrack timeline with an AI assistant that can help generate media, understand your
                project, clean up spoken footage, create captions, and turn long videos into short-form clips.
              </p>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Bot className="h-8 w-8 text-purple-400" />
                  An AI assistant inside the editor
                </h2>

                <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                  <CardContent className="pt-6 text-gray-300">
                    <p className="mb-5">
                      Describe what you want in plain language. The assistant can inspect the active timeline and media
                      library, explain what is in the project, select relevant clips, and move the playhead to a
                      specific moment. It also connects creation and editing in one workflow.
                    </p>
                    <ul className="space-y-3">
                      <Feature>
                        <strong className="text-white">Generate full AI videos</strong> from a prompt in landscape or
                        vertical format, with optional reference imagery or source audio.
                      </Feature>
                      <Feature>
                        <strong className="text-white">Create short AI clips</strong> from text or animate an attached
                        reference image, then place the result directly at the playhead.
                      </Feature>
                      <Feature>
                        <strong className="text-white">Generate original music options</strong> from a description,
                        style tags, and optional lyrics, preview the choices, and add the selected track to the project.
                      </Feature>
                      <Feature>
                        <strong className="text-white">Ask for editing help</strong> such as transcription, captions,
                        cleanup, shorts discovery, or an explanation of the current timeline.
                      </Feature>
                    </ul>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <FileText className="h-8 w-8 text-purple-400" />
                  Edit spoken video like a document
                </h2>
                <p className="text-gray-300 mb-6">
                  Transcribe the full timeline mix or an individual video or audio file. Every word receives a precise
                  timestamp, so clicking a word jumps to that moment. Search the transcript, select a passage, and
                  delete it to ripple the corresponding time out of the timeline.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <FeatureCard title="Transcript editing" icon={<FileText className="h-6 w-6 text-purple-400" />}>
                    Remove selected words, filler words, or long pauses without hunting through the waveform. Language
                    selection and automatic detection are included.
                  </FeatureCard>
                  <FeatureCard title="Magic cleanup" icon={<Sparkles className="h-6 w-6 text-purple-400" />}>
                    Detect silences, filler words, and repeated takes. Preview every suggested cut, disable any you want
                    to keep, and apply the approved cleanup as one undoable edit.
                  </FeatureCard>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Scissors className="h-8 w-8 text-purple-400" />
                  Find the strongest short-form moments
                </h2>
                <p className="text-gray-300 mb-5">
                  The Shorts tool analyzes long videos such as podcasts, interviews, and tutorials for self-contained
                  hooks, memorable quotes, funny or emotional moments, and useful topic changes. Preview the suggested
                  segments, choose the best candidates, and push them to the timeline.
                </p>
                <ul className="space-y-3 text-gray-300">
                  <Feature>Review scored clip suggestions before adding anything to the edit.</Feature>
                  <Feature>Build for 9:16 TikTok and Reels, 1:1 square, or 16:9 YouTube layouts.</Feature>
                  <Feature>Add synchronized captions while moving selected shorts to the timeline.</Feature>
                </ul>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Clapperboard className="h-8 w-8 text-purple-400" />
                  Full timeline control when you need it
                </h2>
                <p className="text-gray-300 mb-6">
                  AI speeds up repetitive work, while the timeline keeps every creative decision in your hands. Upload
                  video, images, and audio, or connect your NeonVideo account to bring existing videos, characters, and
                  music into the media library.
                </p>

                <Card className="bg-black/30 border-purple-500/20">
                  <CardContent className="pt-6">
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-gray-300">
                      <Feature>Drag-and-drop multitrack editing</Feature>
                      <Feature>Split, trim, duplicate, and delete clips</Feature>
                      <Feature>Auto snapping and ripple editing</Feature>
                      <Feature>Timeline zoom and bookmarks</Feature>
                      <Feature>Separate or restore a video's source audio</Feature>
                      <Feature>Multiple scenes within one project</Feature>
                      <Feature>Position, scale, rotation, opacity, and blending</Feature>
                      <Feature>Speed, volume, mute, masks, and visual effects</Feature>
                      <Feature>Custom text styling, backgrounds, and stickers</Feature>
                      <Feature>Keyframes and motion curve controls</Feature>
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  Captions designed for the final platform
                </h2>
                <p className="text-gray-300 mb-5">
                  Generate captions from speech or import existing SRT and ASS subtitle files. Four AI caption presets
                  cover clean readable phrases, one-word pop animation, karaoke-style highlighting, and bold boxed
                  phrases. Captions are added as editable text tracks, so their typography, placement, color, and timing
                  remain adjustable.
                </p>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  Flexible project setup and export
                </h2>
                <p className="text-gray-300 mb-6">
                  Start with 16:9, 9:16, 1:1, or 4:3, enter a custom canvas size, and choose a frame rate from 24 to 120
                  fps. When the edit is ready, export MP4 for broad compatibility or WebM for a smaller file, select
                  your quality level, and decide whether to include audio.
                </p>
              </section>

              <section className="border-t border-purple-500/20 pt-8">
                <h2 className="text-2xl font-bold text-white mb-4">Start editing in Version 3.2</h2>
                <p className="text-gray-300 mb-6">
                  Open the AI video editor in your browser, connect your NeonVideo account, and move from generated
                  assets to a finished video in one workspace.
                </p>
                <div className="flex flex-wrap gap-4">
                  <a href={EDITOR_URL} target="_blank" rel="noreferrer">
                    <Button
                      size="lg"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                      data-testid="button-open-ai-video-editor"
                    >
                      Open AI Video Editor
                      <Clapperboard className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-purple-500/50 text-purple-300 hover:bg-purple-950/50"
                      data-testid="button-editor-feedback"
                    >
                      Share Feedback
                    </Button>
                  </Link>
                </div>
              </section>
            </div>
          </article>
        </main>

        <Footer />
      </div>
    </>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function FeatureCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-black/30 border-purple-500/20">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-3">
          {icon}
          <h3 className="text-xl font-semibold text-white">{title}</h3>
        </div>
        <p className="text-gray-300">{children}</p>
      </CardContent>
    </Card>
  );
}
