import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Clock, Video, Zap, CheckCircle, Sparkles } from "lucide-react";

export default function Version201Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.0.1 Released - Extended Video Duration & Video Editing | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.0.1 is here! Create videos up to 3 minutes long, edit your existing videos, and enjoy improved performance. Discover all the new features and enhancements." />
        <meta property="og:title" content="Version 2.0.1 Released - Extended Video Duration & Video Editing" />
        <meta property="og:description" content="NeonVideo.ai version 2.0.1 brings extended video duration up to 3 minutes, video editing capabilities, and performance improvements." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-0-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1763573973/squirrelneon_me4wfe.png" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.0.1, AI music video, video editing, extended duration, performance improvements" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-0-1-release" />
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
                <time dateTime="2025-11-19">November 19, 2025</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.0.1 Released: Longer Videos, Powerful Editing & More
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're excited to announce the release of NeonVideo.ai version 2.0.1! This update brings highly requested features including extended video duration, the ability to edit your previous videos, and significant performance improvements.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1763573973/squirrelneon_me4wfe.png" 
                  alt="NeonVideo.ai Version 2.0.1 Release" 
                  className="w-full h-auto"
                  data-testid="img-release-banner"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What's New in Version 2.0.1
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Clock className="h-6 w-6 text-purple-400" />
                        Extended Video Duration to 3 Minutes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Create longer, more engaging music videos with our extended maximum duration of 3 minutes. This upgrade allows you to tell deeper stories, showcase more complex narratives, and produce content that truly captivates your audience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Generate music videos up to 180 seconds long</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for full song productions and extended storytelling</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Ideal for YouTube content and long-form social media posts</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Video className="h-6 w-6 text-purple-400" />
                        Edit Your Previous Videos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        One of our most requested features is finally here! You can now edit and refine your previously created videos without starting from scratch. Make adjustments, regenerate specific scenes, or update elements to perfect your content.
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
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fine-tune your videos until they're perfect</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Save time by building on existing work</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Zap className="h-6 w-6 text-purple-400" />
                        Bug Fixes & Performance Optimization
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've been hard at work optimizing the platform for a smoother, faster experience. This update includes numerous bug fixes and performance improvements across the entire application.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Faster video generation processing times</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved stability and reliability</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced error handling and user feedback</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Better resource management for smoother performance</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">How to Use the New Features</h2>
                
                <div className="space-y-6">
                  <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-6">
                    <h3 className="text-xl font-bold text-white mb-3">Creating Longer Videos</h3>
                    <p className="text-gray-300">
                      When generating a new music video, you can now select durations up to 3 minutes during the song creation step. The AI will automatically generate appropriate content length to match your selected duration.
                    </p>
                  </div>

                  <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-6">
                    <h3 className="text-xl font-bold text-white mb-3">Editing Existing Videos</h3>
                    <p className="text-gray-300 mb-3">
                      Navigate to "My Videos" and select any of your previously created videos. You'll now see an "Edit" button that allows you to:
                    </p>
                    <ul className="space-y-2 text-gray-300 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Regenerate the character with a new prompt</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Modify individual scene descriptions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Regenerate specific scenes that need improvement</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>Update subtitle settings</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">What This Means for You</h2>
                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">More Creative Freedom:</strong> With 3-minute videos, you have more time to develop complex stories, showcase multiple characters, or create full-length music video productions.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Iterative Improvement:</strong> The ability to edit videos means you can refine your content over time, experimenting with different characters and scenes until you achieve perfection.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Better Performance:</strong> Our optimizations mean faster generation times and a more reliable experience, allowing you to create more content in less time.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Cost Efficiency:</strong> Edit existing videos instead of creating new ones from scratch, saving both time and credits.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Looking Ahead</h2>
                <p className="text-gray-300 mb-4">
                  This release is just the beginning. We're constantly working on new features and improvements based on your feedback. Some exciting updates in our pipeline include:
                </p>
                <ul className="space-y-2 text-gray-300 ml-6">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Advanced video editing tools and transitions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>More character animation styles</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Enhanced scene customization options</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Collaborative features for team projects</span>
                  </li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and start creating longer, more polished music videos with our enhanced platform.
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
                  We'd love to hear what you think about version 2.0.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
