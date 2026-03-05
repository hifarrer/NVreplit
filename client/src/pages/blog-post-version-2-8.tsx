import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Video, Sparkles, CheckCircle, Music, Film, Type, Palette, Wrench, Zap } from "lucide-react";

export default function Version280Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.8 Released - New Video Tools, API & Video Styles | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.8 brings new video tools, API endpoint availability, five video styles (Pro Mode, Simple Mode, Single Prompt, Instrumental, Lyric), plus enhancements and bug fixes." />
        <meta property="og:title" content="Version 2.8 Released - New Video Tools, API & Video Styles" />
        <meta property="og:description" content="NeonVideo.ai version 2.8 introduces new video tools, public API endpoints, five video creation styles, and multiple enhancements and bug fixes." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-8-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.8, AI music video, video tools, API, Pro Mode, Simple Mode, Single Prompt, Instrumental, Lyric videos" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-8-release" />
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
                <time dateTime="2026-03-04">March 4, 2026</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.8: New Video Tools, API Availability & Five Video Styles
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                Version 2.8 is here with powerful new video tools, API endpoint availability for developers and integrations, and our full suite of five video creation styles—Pro Mode, Simple Mode, Single Prompt, Instrumental, and Lyric—plus multiple enhancements and bug fixes to make creating AI music videos smoother than ever.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg" 
                  alt="NeonVideo.ai Video Styles - Pro Mode, Simple Mode, Single Prompt, Instrumental, Lyric"
                  className="w-full h-auto"
                  data-testid="image-video-styles"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  New Video Tools
                </h2>
                
                <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30 mb-6">
                  <CardContent className="pt-6 text-gray-300">
                    <p className="mb-4">
                      Version 2.8 adds new video tools to streamline your workflow and give you more control over every stage of creation—from trimming and editing to exporting and sharing.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Enhanced video generation pipeline</strong> for faster, more reliable results across all video styles</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Improved audio trimming and waveform tools</strong> for precise control over your tracks</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Better export options</strong> and quality presets for different platforms</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Unified creation flow</strong> so you can switch between video styles and tools without losing progress</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Zap className="h-8 w-8 text-purple-400" />
                  API Endpoint Availability
                </h2>
                
                <Card className="bg-purple-950/30 border-purple-500/20">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Wrench className="h-6 w-6 text-purple-400" />
                      Public API for Developers & Integrations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      NeonVideo.ai now offers API endpoint availability so you can integrate AI music video generation into your own apps, workflows, and platforms. Build automation, batch processing, or custom experiences on top of our video styles and tools.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">RESTful API:</strong> Create videos, check status, and download results via standard HTTP endpoints</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">API key authentication</strong> for secure access to your account and usage</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Documentation:</strong> Full API docs available in-app—visit <Link href="/api-docs" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-api-docs">API Docs</Link> when logged in for endpoints, parameters, and examples</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Support for all video styles</strong> so your integrations can use Pro Mode, Simple Mode, Single Prompt, Instrumental, and Lyric workflows</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  Five Video Styles: Pro, Simple, Single Prompt, Instrumental & Lyric
                </h2>
                
                <p className="text-gray-300 mb-6">
                  Choose the style that fits your project. Each mode is designed for a different creative need—from full control to one-click creation.
                </p>
                
                <div className="space-y-6">
                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Film className="h-6 w-6 text-purple-400" />
                        Pro Mode
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p>
                        Full creative control: customize characters, edit scenes one by one, toggle lip-sync per scene, and choose quality levels. Ideal for artists and creators who want to fine-tune every detail.
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
                    <CardContent className="text-gray-300">
                      <p>
                        A streamlined experience that balances ease of use with flexibility. Pick a style and a few options, then generate—great for quick, polished videos without the complexity of Pro Mode.
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
                    <CardContent className="text-gray-300">
                      <p>
                        Describe your video in one prompt—character, song idea, and vibe—and get a complete music video with auto-generated song and scenes. Perfect for fast content and experimentation.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Music className="h-6 w-6 text-purple-400" />
                        Instrumental
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p>
                        Music-first videos without characters: upload or generate instrumental tracks and pair them with auto-generated visual scenes. Optional text overlays and TikTok-style captions supported.
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
                    <CardContent className="text-gray-300">
                      <p>
                        Sync lyrics to your music with word-by-word TikTok-style captions. Use AI-generated or uploaded songs, pick caption style and font, and get shareable lyric videos in minutes.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Wrench className="h-8 w-8 text-purple-400" />
                  Enhancements & Bug Fixes
                </h2>
                
                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Performance improvements</strong> across video generation and the creation dashboard for a snappier experience
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">UI/UX refinements</strong> for navigation, video style selection, and settings so options are easier to find and use
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Stability fixes</strong> for generation errors, timeline behavior, and export under various conditions
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Caption and lyric sync</strong> improvements for more accurate word timing and display across styles
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Bug fixes</strong> addressing reported issues so you spend less time troubleshooting and more time creating
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started with Version 2.8</h2>
                <p className="text-gray-300 mb-6">
                  All new video tools, API access, five video styles (Pro Mode, Simple Mode, Single Prompt, Instrumental, and Lyric), and the latest enhancements are available now. Log in, try the new tools, and if you're a developer, head to API Docs to explore the endpoints.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/auth">
                    <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8" data-testid="button-start-creating">
                      Start Creating
                      <Rocket className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/api-docs">
                    <Button size="lg" variant="outline" className="border-purple-500/50 text-purple-300 hover:bg-purple-950/50" data-testid="button-api-docs">
                      API Docs
                      <Wrench className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </section>

              <section className="border-t border-purple-500/20 pt-8">
                <h2 className="text-2xl font-bold text-white mb-4">Have Feedback?</h2>
                <p className="text-gray-300">
                  We'd love to hear what you think about version 2.8. Share your ideas and report issues through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or connect with us on social media.
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
