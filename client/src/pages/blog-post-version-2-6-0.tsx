import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Users, Sparkles, CheckCircle, Bug, Cpu, Scissors, Video } from "lucide-react";

export default function Version260Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.6.0 Released - New Character Generator, Audio Trimming & More | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.6.0 is here! Discover the new character generator with expanded styles and AI models, powerful audio trimming tool, plus bug fixes and video generation improvements." />
        <meta property="og:title" content="Version 2.6.0 Released - New Character Generator, Audio Trimming & More" />
        <meta property="og:description" content="NeonVideo.ai version 2.6.0 brings a new character generator with expanded styles and AI models, powerful audio trimming tool, plus bug fixes and video generation improvements." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-6-0-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1768700740/neonreal_xoobex.jpg" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.6.0, AI music video, character generator, audio trimming, AI models, bug fixes, video generation" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-6-0-release" />
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
                <time dateTime="2026-01-15">January 15, 2026</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.6.0: New Character Generator, Audio Trimming & More
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're thrilled to announce version 2.6.0! This major update introduces a completely revamped character generator with new styles and AI models, a powerful audio trimming tool for precise control, and numerous bug fixes and video generation improvements to enhance your creative workflow.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1770399934/upload_character_awb4bg.png" 
                  alt="New Character Generator Interface"
                  className="w-full h-auto"
                  data-testid="image-character-generator"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What's New in Version 2.6.0
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Users className="h-6 w-6 text-purple-400" />
                        New Character Generator
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Our character generator has been completely redesigned with expanded style options and new AI models to give you more creative freedom than ever before.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">New Styles:</strong> Choose from an expanded library including Realistic Cinematic, Realistic Natural, 3D Animated, 3D Toon, Anime Clean Cel, Anime Realistic, Cyberpunk, Digital Painting, Fantasy, Futuristic, Goth, Toy Blocks, Manga, and more</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">New AI Models:</strong> Powered by cutting-edge models including Wavespeed AI's Qwen Image, Z-Image Turbo, Alibaba's WAN 2.5, and ByteDance's Seedream V4 for diverse character generation</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Style-Specific Enhancements:</strong> Each style now includes optimized prompt enhancers for better results tailored to your chosen aesthetic</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Improved Generation Quality:</strong> Enhanced algorithms deliver more consistent, higher-quality character images across all styles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Better Aspect Ratio Support:</strong> Optimized character generation for both 16:9 and 3:4 aspect ratios</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Scissors className="h-6 w-6 text-purple-400" />
                        Audio Trimming Tool
                      </CardTitle>
                    </CardHeader>
                    <div className="px-6 pt-0 pb-4">
                      <div className="rounded-lg overflow-hidden border border-purple-500/20">
                        <img 
                          src="https://res.cloudinary.com/dqemas8ht/image/upload/v1770401890/trimmedsong_j37cfj.jpg" 
                          alt="Audio Trimming Tool Interface"
                          className="w-full h-auto"
                          data-testid="image-audio-trimming-tool"
                        />
                      </div>
                    </div>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Take full control of your audio with our new intuitive audio trimming interface. Select exactly the portion of your song you want to use in your video.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Visual Waveform:</strong> See your audio waveform and easily identify the perfect section to trim</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Precise Selection:</strong> Drag handles to set exact start and end times with millisecond precision</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Live Preview:</strong> Play and preview your selected audio segment before trimming</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Keyboard Controls:</strong> Fine-tune your selection with arrow keys for frame-perfect accuracy</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Works with All Audio:</strong> Trim both uploaded audio files and AI-generated songs</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Plan-Based Limits:</strong> Free users can trim up to 30 seconds, paid users up to 4 minutes</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Video className="h-6 w-6 text-purple-400" />
                        Video Generation Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've made significant improvements to video generation quality, reliability, and performance.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced video rendering pipeline for smoother output</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved scene transitions and timing synchronization</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Better character animation consistency across scenes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Optimized processing speed for faster video generation</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced error handling and recovery mechanisms</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Bug className="h-6 w-6 text-purple-400" />
                        Bug Fixes & Stability
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've addressed numerous bugs and improved overall system stability for a smoother experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fixed character generation timeout issues</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Resolved audio upload and processing errors</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fixed timeline synchronization issues</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved error messages and user feedback</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced mobile responsiveness and touch interactions</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fixed memory leaks and performance optimizations</span>
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
                        <strong className="text-white">More Creative Options:</strong> With expanded character styles and AI models, you can create characters that perfectly match your vision, from photorealistic to stylized anime.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Precise Audio Control:</strong> The new audio trimming tool gives you complete control over which part of your song appears in your video, perfect for creating highlights or focusing on specific sections.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Better Quality & Reliability:</strong> Video generation improvements and bug fixes mean more consistent, higher-quality results with fewer errors.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Smoother Workflow:</strong> Enhanced stability and performance improvements make the entire creation process faster and more enjoyable.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and explore the new character generator, try out the audio trimming tool, and experience the improved video generation!
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
                  We'd love to hear what you think about version 2.6.0! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
