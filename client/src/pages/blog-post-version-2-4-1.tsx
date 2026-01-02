import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Users, Music, Type, CheckCircle, Sparkles, Bug } from "lucide-react";

export default function Version241Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.4.1 Released - New Public Characters, Audio Track & Lyrics Track | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.4.1 is here! Explore new public characters, improved timeline with audio and lyrics tracks, and various bug fixes for a smoother experience." />
        <meta property="og:title" content="Version 2.4.1 Released - New Public Characters, Audio Track & Lyrics Track" />
        <meta property="og:description" content="NeonVideo.ai version 2.4.1 brings new public characters, enhanced timeline features with audio and lyrics tracks, plus important bug fixes." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-4-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383314/characters_bsaw13.png" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.4.1, AI music video, public characters, audio track, lyrics track, timeline, bug fixes" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-4-1-release" />
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
                <time dateTime="2026-01-02">January 2, 2026</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.4.1: New Public Characters, Audio Track & Lyrics Track
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're kicking off 2026 with an exciting update! Version 2.4.1 introduces new public characters for everyone to use, powerful timeline improvements including dedicated audio and lyrics tracks, and various bug fixes to enhance your creative experience.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383314/characters_bsaw13.png" 
                  alt="New Public Characters in NeonVideo.ai Version 2.4.1"
                  className="w-full h-auto"
                  data-testid="img-release-banner"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What's New in Version 2.4.1
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Users className="h-6 w-6 text-purple-400" />
                        New Public Characters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've added a collection of stunning new public characters that are available to all users! These professionally designed characters are ready to star in your music videos without any additional setup.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Diverse range of character styles and personalities</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Instantly available to all users - no credits required</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for quick video creation and experimentation</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>High-quality AI-generated characters optimized for music videos</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Music className="h-6 w-6 text-purple-400" />
                        Audio Track in Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Our timeline editor now features a dedicated audio track that visualizes your music waveform, making it easier to sync your video scenes with the beat of your song.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Visual waveform display of your audio track</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Better synchronization between scenes and music</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Precise timing control for scene transitions</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced audio-visual editing experience</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <div className="rounded-lg overflow-hidden border border-purple-500/20">
                    <img 
                      src="https://res.cloudinary.com/dqemas8ht/image/upload/v1767383894/timeline_lvy1s5.png" 
                      alt="New Timeline with Audio and Lyrics Tracks in NeonVideo.ai"
                      className="w-full h-auto"
                      data-testid="img-timeline-showcase"
                    />
                  </div>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Type className="h-6 w-6 text-purple-400" />
                        Lyrics Track in Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        A brand new lyrics track has been added to the timeline, allowing you to see your song's lyrics synchronized with each scene for a more intuitive editing experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Lyrics displayed directly in the timeline editor</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Easy visualization of which lyrics appear in each scene</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Better context when arranging and editing scenes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Seamless integration with existing timeline features</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Bug className="h-6 w-6 text-purple-400" />
                        Bug Fixes & Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've squashed various bugs and made improvements across the platform for a smoother, more reliable experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fixed various UI inconsistencies and visual glitches</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved stability during video generation</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced error handling and user feedback</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Performance optimizations throughout the platform</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">What This Means for You</h2>
                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Start Creating Faster:</strong> Use the new public characters to jump straight into video creation without spending time generating custom characters.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Better Music Synchronization:</strong> The new audio track makes it easier than ever to create videos that are perfectly synced to your music.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Enhanced Lyric Awareness:</strong> With lyrics visible in the timeline, you can ensure your visuals perfectly match the story of your song.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Smoother Experience:</strong> Bug fixes and improvements mean less frustration and more time spent being creative.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and check out the new public characters and enhanced timeline features!
                </p>
                <div className="text-center">
                  <Link href="/auth">
                    <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8" data-testid="button-start-creating">
                      Start Creating
                      <Rocket className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </section>

              <section className="border-t border-purple-500/20 pt-8">
                <h2 className="text-2xl font-bold text-white mb-4">Have Feedback?</h2>
                <p className="text-gray-300">
                  We'd love to hear what you think about version 2.4.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
