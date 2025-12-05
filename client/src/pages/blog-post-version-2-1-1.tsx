import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Clock, Video, Zap, CheckCircle, Sparkles, Gift, Infinity, ImagePlus, Layers } from "lucide-react";

export default function Version211Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.1.1 Released - Timeline Editing, Custom Scene Images & Unlimited Plan | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.1.1 is here! Edit your timeline and scene order, upload custom scene images, gift subscriptions, and enjoy our new unlimited plan." />
        <meta property="og:title" content="Version 2.1.1 Released - Timeline Editing, Custom Scene Images & Unlimited Plan" />
        <meta property="og:description" content="NeonVideo.ai version 2.1.1 brings timeline editing, custom scene images, subscription gifting, and a new unlimited plan for creators." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-1-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1763573973/squirrelneon_me4wfe.png" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.1.1, AI music video, timeline editing, scene order, custom images, gift subscription, unlimited plan" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-1-1-release" />
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
                NeonVideo.ai Version 2.1.1: Timeline Editing, Custom Images & Unlimited Plan
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're thrilled to announce version 2.1.1 of NeonVideo.ai! This update brings powerful new creative tools including timeline editing with drag-and-drop scene reordering, the ability to upload your own scene images, subscription gifting, and our brand new unlimited plan for serious creators.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <video 
                  src="https://res.cloudinary.com/dqemas8ht/video/upload/v1764901512/music-video_dpgwbb.mp4" 
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
                  What's New in Version 2.1.1
                </h2>
                
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
                        Take full control of your video's narrative flow with our new professional timeline editor. Drag and drop scenes to reorder them exactly how you want, creating the perfect visual story for your music.
                      </p>
                      <div className="rounded-lg overflow-hidden border border-purple-500/20 my-6">
                        <img 
                          src="https://res.cloudinary.com/dqemas8ht/image/upload/v1764899994/neontimeline_yk3d7l.png" 
                          alt="NeonVideo.ai Timeline Editor - Drag and drop scene reordering"
                          className="w-full h-auto"
                          data-testid="img-timeline-feature"
                        />
                      </div>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Intuitive drag-and-drop interface for scene reordering</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Visual timeline showing scene sequence and duration</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Scene order automatically saved and persisted</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Final video renders scenes in your custom order</span>
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
                        Want to use your own artwork or photos in your music video? Now you can! Upload custom images for any scene to create a truly personalized video experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Upload custom images for individual scenes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Mix AI-generated and custom images in the same video</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Supports common image formats (JPG, PNG, WebP)</span>
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
                        Share the power of AI music video creation with friends, family, or colleagues! You can now purchase subscription gifts for others, making it the perfect present for musicians, content creators, and creative minds.
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
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for holidays, birthdays, or just because</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Infinity className="h-6 w-6 text-purple-400" />
                        NEW: Unlimited Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        For power users and professional creators, we're introducing our new Unlimited Plan! Create as many music videos as you want without worrying about credits or limits.
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
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Access to all premium features</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>Perfect for agencies, studios, and prolific creators</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Video className="h-8 w-8 text-purple-400" />
                  Previous Release Features (v2.0.1)
                </h2>
                <p className="text-gray-300 mb-6">
                  In case you missed it, here are the powerful features we introduced in our previous release:
                </p>
                
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
                        One of our most requested features! You can edit and refine your previously created videos without starting from scratch. Make adjustments, regenerate specific scenes, or update elements to perfect your content.
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
                        We've optimized the platform for a smoother, faster experience with numerous bug fixes and performance improvements.
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
                <h2 className="text-3xl font-bold text-white mb-4">What This Means for You</h2>
                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Complete Creative Control:</strong> With timeline editing and custom image uploads, you now have unprecedented control over every aspect of your music video.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Perfect for Teams:</strong> Gift subscriptions to collaborators and choose the unlimited plan for your studio or agency.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">No Limits:</strong> The new unlimited plan means you can create as much content as you need without watching your credit balance.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Professional Results:</strong> Mix your own custom imagery with AI-generated content for truly unique, professional-quality videos.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and experience the next level of AI music video creation.
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
                  We'd love to hear what you think about version 2.1.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
