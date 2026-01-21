import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Users, Sparkles, CheckCircle, Bug, Cpu } from "lucide-react";

export default function Version251Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.5.1 Released - More Realistic Characters & New AI Models | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.5.1 is here! Experience more realistic AI characters, choose from new Medium and Premium AI models, plus enjoy bug fixes and UI improvements." />
        <meta property="og:title" content="Version 2.5.1 Released - More Realistic Characters & New AI Models" />
        <meta property="og:description" content="NeonVideo.ai version 2.5.1 brings more realistic characters, new Medium and Premium AI models, plus bug fixes and UI improvements." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-5-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1768700740/neonreal_xoobex.jpg" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.5.1, AI music video, realistic characters, AI models, Medium AI, Premium AI, bug fixes" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-5-1-release" />
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
                <time dateTime="2026-01-18">January 18, 2026</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.5.1: More Realistic Characters & New AI Models
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're excited to announce version 2.5.1! This update brings significantly more realistic AI characters, introduces new Medium and Premium AI models for enhanced video generation, and includes various bug fixes and UI improvements.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <video 
                  src="https://res.cloudinary.com/dqemas8ht/video/upload/v1768972512/neonvideo_1768972293757_ndscux.mp4" 
                  className="w-full h-auto"
                  autoPlay
                  loop
                  muted
                  playsInline
                  data-testid="video-release-banner"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  What's New in Version 2.5.1
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Users className="h-6 w-6 text-purple-400" />
                        More Realistic Characters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've made significant improvements to our character generation technology, resulting in more lifelike and expressive AI characters for your music videos.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced facial expressions and natural movements</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved skin textures and lighting effects</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>More detailed hair and clothing rendering</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Better consistency across different scenes</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Cpu className="h-6 w-6 text-purple-400" />
                        New Medium and Premium AI Models
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We're introducing two new AI model tiers to give you more control over your video generation quality and speed.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Medium Model:</strong> Perfect balance of quality and speed for everyday use</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Premium Model:</strong> Maximum quality for professional productions</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Choose the right model based on your project needs</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Seamless switching between models in the editor</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-950/30 border-purple-500/20">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Bug className="h-6 w-6 text-purple-400" />
                        Bug Fixes & UI Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        We've addressed various issues and polished the user interface for a smoother, more intuitive experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Refined UI elements for better visual clarity</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Fixed loading states and progress indicators</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Improved navigation and workflow consistency</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Enhanced mobile responsiveness</span>
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
                        <strong className="text-white">Professional-Quality Characters:</strong> Your music videos will feature more realistic and engaging characters that captivate your audience.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Flexible Quality Options:</strong> Choose between Medium and Premium models based on your project requirements and budget.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Smoother Workflow:</strong> UI improvements and bug fixes mean a more enjoyable and productive creative experience.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and experience the enhanced character realism and new AI models!
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
                  We'd love to hear what you think about version 2.5.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
