import { Helmet } from "react-helmet-async";
import { Link, Redirect } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Rocket, Video, CheckCircle, Sparkles } from "lucide-react";

const SHOWCASE_MP4 = "https://neonvideo.b-cdn.net/neonvideooutros/theverve.mp4";

export default function Version300Release() {
  return (
    <>
      <Helmet>
        <title>Version 3.0 Released - Reimagine Video Style | NeonVideo.ai</title>
        <meta
          name="description"
          content="NeonVideo.ai version 3.0 introduces Reimagine: transform any clip into a new artistic style with an AI prompt while keeping the original audio—plus quality-of-life updates across creation."
        />
        <meta property="og:title" content="Version 3.0 Released - Reimagine Video Style" />
        <meta
          property="og:description"
          content="Reimagine lets you restyle footage from a YouTube link or direct .mp4 URL with a text prompt, up to 30 seconds, with original sound preserved."
        />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-3-0-release" />
        <meta
          property="og:image"
          content="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg"
        />
        <meta
          name="keywords"
          content="NeonVideo.ai update, version 3.0, Reimagine, AI video style, music video, transform video style"
        />
        <link rel="canonical" href="https://neonvideo.ai/version-3-0-release" />
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
                <time dateTime="2026-04-15">April 15, 2026</time>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 3.0: Reimagine—A New Way to Restyle Your Video
              </h1>

              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We are rolling out <strong className="text-white">Reimagine</strong>, a dedicated video style that lets
                you take existing footage—via YouTube link or direct .mp4 URL—and transform its look with an AI prompt,
                while <strong className="text-white">keeping the original audio</strong>. Clips can run up to{" "}
                <strong className="text-white">30 seconds</strong>, so you can experiment with bold visual directions
                without reshooting.
              </p>

              <div className="mb-4 flex w-full justify-center px-2">
                <div
                  className="flex h-[min(420px,48vh)] w-[min(100%,260px)] items-center justify-center overflow-hidden rounded-lg border border-purple-500/20 bg-black shadow-lg sm:w-[280px]"
                  data-testid="video-reimagine-showcase-wrap"
                >
                  <video
                    src={SHOWCASE_MP4}
                    className="max-h-full max-w-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                    data-testid="video-reimagine-showcase"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-400 text-center mb-8">
                Showcase: Reimagine output—see how a familiar performance can take on a fresh visual treatment while the
                track stays intact.
              </p>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What Reimagine does
                </h2>

                <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30 mb-6">
                  <CardContent className="pt-6 text-gray-300">
                    <p className="mb-4">
                      Reimagine sits alongside Motion Control and our other specialized flows on the create hub. Point it
                      at source video, describe the style or mood you want, and we generate a new visual pass that
                      follows your prompt—ideal for remixes, social cuts, and creative experiments when the audio is
                      already locked.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Style-driven prompts:</strong> steer lighting, era, film look,
                          or art direction in natural language.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Flexible sources:</strong> paste a YouTube URL or use a direct
                          .mp4 link.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Original audio preserved:</strong> the soundtrack stays aligned
                          with your clip—no need to re-export stems.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong className="text-white">Up to 30 seconds per generation</strong> so you can iterate on
                          shorter passages efficiently.
                        </span>
                      </li>
                    </ul>
                    <p className="mt-4 text-sm text-gray-400">
                      Reimagine is optimized for visual transformation rather than lip-sync or scene-by-scene editing
                      after the fact—pair it with Pro Mode or Story Videos when you need full character and timeline
                      control.
                    </p>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  Try Reimagine in 3.0
                </h2>
                <p className="text-gray-300 mb-6">
                  Open <strong className="text-white">Create</strong>, choose <strong className="text-white">Reimagine</strong>,
                  add your source and prompt, and generate. Everything from 2.9—including Story Videos and the full music
                  video toolkit—remains available in parallel.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/auth">
                    <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8" data-testid="button-start-creating">
                      Start Creating
                      <Rocket className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/create/reimagine">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-purple-500/50 text-purple-300 hover:bg-purple-950/50"
                      data-testid="button-reimagine"
                    >
                      Reimagine
                      <Sparkles className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </section>

              <section className="border-t border-purple-500/20 pt-8">
                <h2 className="text-2xl font-bold text-white mb-4">Feedback</h2>
                <p className="text-gray-300">
                  We would love to hear how you use Reimagine alongside our other styles—reach us on the{" "}
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

/** @deprecated Old slug; kept so bookmarks to /version-2-10-release still work. */
export function Version210ReleaseRedirect() {
  return <Redirect to="/version-3-0-release" />;
}
