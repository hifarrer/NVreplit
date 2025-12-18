import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Music, User, Video, Gift, Sparkles, TreePine, Send, Calendar } from "lucide-react";

export default function ChristmasPostcardBlogPost() {
  return (
    <>
      <Helmet>
        <title>How to Create a Christmas Postcard Video | NeonVideo.ai</title>
        <meta name="description" content="Learn how to create a personalized AI-generated Christmas postcard video in minutes. Follow our step-by-step guide to create and send festive video greetings to loved ones." />
        <meta property="og:title" content="How to Create a Christmas Postcard Video" />
        <meta property="og:description" content="Create magical AI-generated Christmas video postcards in minutes. Perfect for sending holiday greetings to friends and family!" />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/christmas-postcard-video" />
        <meta name="keywords" content="Christmas video, holiday postcard, AI video generator, Christmas greetings, video postcard, festive video, holiday message" />
        <link rel="canonical" href="https://neonvideo.ai/christmas-postcard-video" />
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

          <article className="bg-black/30 backdrop-blur-md rounded-lg border border-red-500/20 p-8 md:p-12">
            <header className="mb-8">
              <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
                <TreePine className="h-4 w-4" />
                <span>Tutorial</span>
                <span className="text-gray-500">•</span>
                <time dateTime="2025-12-16">December 16, 2025</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                How to Create a Christmas Postcard Video
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                This holiday season, surprise your friends and family with a personalized AI-generated Christmas video postcard! In just a few minutes, you can create a magical, festive video greeting complete with custom music, animated characters, and heartfelt messages. Here's how to do it.
              </p>

              {/* Demo Video */}
              <div className="rounded-lg overflow-hidden border border-red-500/30 mb-8">
                <video 
                  src="https://res.cloudinary.com/dqemas8ht/video/upload/v1766075737/xmas2_cnuqud.mp4" 
                  controls
                  autoPlay
                  muted
                  loop
                  className="w-full h-auto"
                  data-testid="video-christmas-demo"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              {/* Step 1: Create Christmas Song */}
              <section className="mb-8">
                <Card className="bg-gradient-to-r from-red-950/50 to-red-900/30 border-red-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold">1</div>
                      <Music className="h-6 w-6 text-red-400" />
                      Describe Your Christmas Song or Jingle
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      Start by creating the perfect Christmas soundtrack for your video postcard. Our AI music generator will compose a unique holiday song based on your description.
                    </p>
                    
                    <div className="bg-black/40 rounded-lg p-4 border border-red-500/20">
                      <p className="text-sm text-gray-400 mb-2">Example prompt:</p>
                      <p className="text-red-300">"A cheerful Christmas jingle with sleigh bells and warm vocals about spreading holiday joy"</p>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Step 2: Create Christmas Character */}
              <section className="mb-8">
                <Card className="bg-gradient-to-r from-green-950/50 to-green-900/30 border-green-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">2</div>
                      <User className="h-6 w-6 text-green-400" />
                      Create Your Christmas Character
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      Design a festive character that will star in your Christmas video. This could be a cute elf, a jolly snowman, a friendly reindeer, or even a stylized version of yourself in holiday attire!
                    </p>
                    
                    <div className="bg-black/40 rounded-lg p-4 border border-green-500/20">
                      <p className="text-sm text-gray-400 mb-2">Example prompt:</p>
                      <p className="text-green-300">"A cute cartoon elf with a red hat and pointy ears, wearing a cozy green sweater, standing in a snowy winter wonderland"</p>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Step 3: Generate Scenes and Video */}
              <section className="mb-8">
                <Card className="bg-gradient-to-r from-purple-950/50 to-purple-900/30 border-purple-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">3</div>
                      <Video className="h-6 w-6 text-purple-400" />
                      Generate Scenes and Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      Now comes the magic! Our AI will automatically generate beautiful Christmas-themed scenes and animate your character to create a stunning music video with lip-sync animation.
                    </p>
                    
                    <div className="bg-black/40 rounded-lg p-4 border border-purple-500/20">
                      <p className="text-sm text-gray-400 mb-2">What the AI creates:</p>
                      <p className="text-purple-300">Festive backgrounds with snowy villages, cozy fireplaces, and Christmas trees - all animated with your character singing along!</p>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Step 4: Send or Schedule the Postcard */}
              <section className="mb-8">
                <Card className="bg-gradient-to-r from-pink-950/50 to-pink-900/30 border-pink-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">4</div>
                      <Gift className="h-6 w-6 text-pink-400" />
                      Send or Schedule Your Postcard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      Once your video is ready, click the "Gift" button to email your video postcard directly to your loved ones. Add a personal message and choose when to deliver it!
                    </p>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Send className="h-5 w-5 text-pink-400" />
                          <span className="font-semibold text-white">Send Now</span>
                        </div>
                        <p className="text-sm text-gray-400">
                          Instantly deliver your video postcard to the recipient's inbox.
                        </p>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 border border-pink-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="h-5 w-5 text-pink-400" />
                          <span className="font-semibold text-white">Schedule Delivery</span>
                        </div>
                        <p className="text-sm text-gray-400">
                          Pick the perfect date - like Christmas morning!
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Call to Action */}
              <section className="text-center py-8">
                <div className="bg-gradient-to-r from-red-950/50 via-green-950/50 to-red-950/50 rounded-xl p-8 border border-red-500/30">
                  <Sparkles className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Ready to Spread Holiday Cheer?
                  </h2>
                  <p className="text-gray-300 mb-6 max-w-xl mx-auto">
                    Create your personalized Christmas postcard video today and surprise your loved ones with a gift they'll never forget!
                  </p>
                  <Link href="/create">
                    <Button 
                      size="lg" 
                      className="bg-gradient-to-r from-red-500 to-green-600 hover:from-red-600 hover:to-green-700 text-white px-8"
                      data-testid="button-create-christmas-video"
                    >
                      <TreePine className="mr-2 h-5 w-5" />
                      Create Your Christmas Video
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
