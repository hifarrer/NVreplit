import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Clock, Video, Zap, CheckCircle, Sparkles, Gift, Infinity, ImagePlus, Layers, Smartphone, Palette, Gauge } from "lucide-react";

export default function Version231Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.3.1 Released - Vertical Videos, UI Improvements & Performance | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.3.1 is here! Create vertical videos for TikTok and Reels, enjoy improved UI design, and experience faster performance across the platform." />
        <meta property="og:title" content="Version 2.3.1 Released - Vertical Videos, UI Improvements & Performance" />
        <meta property="og:description" content="NeonVideo.ai version 2.3.1 brings vertical video support, UI improvements, and performance optimizations for a better creative experience." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-3-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1763573973/squirrelneon_me4wfe.png" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.3.1, AI music video, vertical videos, TikTok, Instagram Reels, UI improvements, performance" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-3-1-release" />
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
                <time dateTime="2025-12-05">December 5, 2025</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.3.1: Vertical Videos, UI Improvements & Better Performance
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're excited to announce version 2.3.1 of NeonVideo.ai! This update brings highly requested vertical video support for social media platforms, a cleaner and more intuitive user interface, and significant performance improvements across the entire platform.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <video 
                  src="https://res.cloudinary.com/dqemas8ht/video/upload/v1765317271/neonvideo_1765068376251_gjihhr.mp4" 
                  controls
                  autoPlay
                  muted
                  loop
                  className="w-full h-auto"
                  data-testid="video-release-banner"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What's New in Version 2.3.1
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Smartphone className="h-6 w-6 text-purple-400" />
                        Vertical Video Support (9:16)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Create stunning vertical videos optimized for TikTok, Instagram Reels, YouTube Shorts, and other social media platforms! Choose between horizontal (16:9) or vertical (9:16) aspect ratios when creating your music videos.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Choose between 16:9 (horizontal) or 9:16 (vertical) aspect ratios</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for TikTok, Instagram Reels, and YouTube Shorts</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>AI-optimized scene generation for vertical formats</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Characters and scenes automatically adapted to vertical framing</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Palette className="h-6 w-6 text-purple-400" />
                        User Interface Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've redesigned key parts of the user interface to make the video creation process smoother and more intuitive, especially on mobile devices.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>New tabbed interface for character creation - cleaner and easier to navigate</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved mobile responsiveness across all pages</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Streamlined video player with better controls</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced visual feedback during video generation</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Gauge className="h-6 w-6 text-purple-400" />
                        Performance Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've optimized the platform for faster load times, smoother interactions, and more reliable video generation.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Faster page load times across the entire platform</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Optimized video streaming and playback</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Reduced memory usage for smoother experience on all devices</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved error handling and recovery</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  Previous Release Features (v2.1.1)
                </h2>
                <p className="text-gray-300 mb-6">
                  In case you missed it, here are the powerful features we introduced in our previous release:
                </p>
                
                <div className="space-y-6">
                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Layers className="h-6 w-6 text-purple-400" />
                        Edit Timeline and Scene Orders
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Take full control of your video's narrative flow with our professional timeline editor. Drag and drop scenes to reorder them exactly how you want.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Intuitive drag-and-drop interface for scene reordering</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Visual timeline showing scene sequence and duration</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <ImagePlus className="h-6 w-6 text-purple-400" />
                        Upload Your Own Scene Images
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Upload custom images for any scene to create a truly personalized video experience. Mix AI-generated and custom images in the same video.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Upload custom images for individual scenes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for brand content and personalized videos</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Gift className="h-6 w-6 text-purple-400" />
                        Gift a Subscription
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Share the power of AI music video creation with friends and family! Purchase subscription gifts for others.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Gift any subscription tier to someone special</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Recipient receives instant access via email</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Infinity className="h-6 w-6 text-purple-400" />
                        Unlimited Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        For power users and professional creators, our Unlimited Plan lets you create as many music videos as you want without worrying about credits.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Unlimited video generation - no credit limits</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Priority processing for faster video creation</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Clock className="h-6 w-6 text-purple-400" />
                        Extended Video Duration (v2.0.1)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Create longer, more engaging music videos with extended maximum duration of 3 minutes.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Generate music videos up to 180 seconds long</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for full song productions</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Video className="h-6 w-6 text-purple-400" />
                        Edit Your Previous Videos (v2.0.1)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Edit and refine your previously created videos without starting from scratch.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Modify character prompts and regenerate characters</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Update scene descriptions and regenerate specific scenes</span>
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
                        <strong className="text-white">Social Media Ready:</strong> Create vertical videos perfect for TikTok, Instagram Reels, and YouTube Shorts to reach your audience where they are.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Smoother Experience:</strong> Enjoy a cleaner interface and faster performance, especially on mobile devices.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Better Mobile Support:</strong> Create amazing music videos on any device with our improved mobile experience.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Faster Workflows:</strong> Performance improvements mean less waiting and more creating.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and start creating vertical videos for your social media channels!
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
                  We'd love to hear what you think about version 2.3.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
