import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Video, Sparkles, CheckCircle, Music, Film, Type, Palette } from "lucide-react";

export default function Version271Release() {
  return (
    <>
      <Helmet>
        <title>Version 2.7.1 Released - New Video Styles & TikTok-Style Captions | NeonVideo.ai</title>
        <meta name="description" content="NeonVideo.ai version 2.7.1 introduces four powerful video creation styles: Pro Mode, Single Prompt, Instrumental, and Lyric videos, plus stunning TikTok-style captions with word-by-word animations." />
        <meta property="og:title" content="Version 2.7.1 Released - New Video Styles & TikTok-Style Captions" />
        <meta property="og:description" content="NeonVideo.ai version 2.7.1 brings four new video creation styles and TikTok-style captions with animated word-by-word highlighting for engaging music videos." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://neonvideo.ai/version-2-7-1-release" />
        <meta property="og:image" content="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg" />
        <meta name="keywords" content="NeonVideo.ai update, version 2.7.1, AI music video, Pro Mode, Single Prompt, Instrumental, Lyric videos, TikTok captions, animated subtitles" />
        <link rel="canonical" href="https://neonvideo.ai/version-2-7-1-release" />
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
                <time dateTime="2026-01-20">January 20, 2026</time>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                NeonVideo.ai Version 2.7.1: Four Powerful Video Styles & TikTok-Style Captions
              </h1>
              
              <p className="text-xl text-gray-300 leading-relaxed mb-8">
                We're excited to announce version 2.7.1! This major update introduces four distinct video creation styles to match your creative needs, plus stunning TikTok-style captions that bring your videos to life with animated word-by-word highlighting. Whether you want full creative control or instant results, there's a style perfect for you.
              </p>

              <div className="rounded-lg overflow-hidden border border-purple-500/20 mb-8">
                <img 
                  src="https://res.cloudinary.com/dqemas8ht/image/upload/v1771303462/videostyle_apxfyf.jpg" 
                  alt="NeonVideo.ai Video Styles"
                  className="w-full h-auto"
                  data-testid="image-video-styles"
                />
              </div>
            </header>

            <div className="prose prose-invert max-w-none">
              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  Four Powerful Video Creation Styles
                </h2>
                
                <div className="space-y-6">
                  <Card className="bg-gradient-to-r from-purple-950/50 to-violet-950/50 border-purple-500/30">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Film className="h-6 w-6 text-purple-400" />
                        Pro Mode
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-gray-300">
                      <p className="mb-4">
                        Pro Mode gives you complete creative control over every aspect of your music video. Perfect for creators who want to fine-tune every detail and craft a truly personalized video experience.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Full Character Customization:</strong> Create or upload your own character, choose from multiple styles, and customize every aspect of your character's appearance</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Advanced Scene Editing:</strong> Generate multiple scenes, reorder them, regenerate individual scenes, and fine-tune each scene's prompt to match your vision</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Scene-by-Scene Control:</strong> Toggle lip-sync on or off for individual scenes, giving you precise control over when your character sings</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Video Quality Selection:</strong> Choose from quick, medium, or premium quality settings to balance generation speed and visual fidelity</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Character Library:</strong> Save your favorite characters and reuse them across multiple projects</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Edit Mode:</strong> Return to any completed video to regenerate scenes, change character settings, or adjust video quality</span>
                        </li>
                      </ul>
                      <p className="mt-4 text-gray-400 italic">
                        Pro Mode is ideal for: Professional creators, music artists, content creators who want full creative control, and anyone who enjoys fine-tuning every detail of their video.
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
                      <p className="mb-4">
                        Single Prompt mode lets you create a complete music video instantly with just one description. No character customization needed—simply describe your vision and watch it come to life.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Instant Creation:</strong> Describe your character, song title, and video concept in a single prompt, and the system handles everything automatically</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Automatic Song Generation:</strong> The system automatically generates creative lyrics and creates a complete song based on your description</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Style Selection:</strong> Choose from multiple character styles including 3D Animation, Cartoon, Anime, Realistic, Hyper Realistic, Artistic, and Radiant</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Flexible Duration:</strong> Set your video length from 15 seconds to 3 minutes to match your needs</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Aspect Ratio Options:</strong> Create videos in landscape (16:9) or portrait (9:16) format</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Smart Prompt Parsing:</strong> The system intelligently extracts character details, song information, and video description from your prompt</span>
                        </li>
                      </ul>
                      <p className="mt-4 text-gray-400 italic">
                        Single Prompt is perfect for: Quick content creation, social media posts, rapid prototyping, and creators who want results fast without the complexity.
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
                      <p className="mb-4">
                        Instrumental mode creates beautiful music-only videos without characters or lip-sync features. Perfect for showcasing your music with stunning visual backgrounds and optional text overlays.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Music-Focused Videos:</strong> Create videos that put your music front and center without character distractions</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Dynamic Scene Generation:</strong> Automatically generates multiple scenes that match the mood and style of your music</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Optional Text Overlays:</strong> Add custom text overlays that appear throughout your video to highlight key messages or song information</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Upload or Generate Music:</strong> Use your own uploaded audio files or generate music with our built-in music generator</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Audio Trimming:</strong> Trim your audio to the perfect length with our visual waveform editor</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Caption Support:</strong> Add TikTok-style captions to your instrumental videos for enhanced engagement</span>
                        </li>
                      </ul>
                      <p className="mt-4 text-gray-400 italic">
                        Instrumental mode is great for: Music producers, instrumental tracks, background music videos, ambient music, and any content where the music is the star.
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
                      <p className="mb-4">
                        Lyric mode automatically adds synchronized lyrics to any song, creating engaging lyric videos that keep viewers hooked. Perfect for showcasing your song's lyrics with beautiful visuals.
                      </p>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Automatic Lyric Synchronization:</strong> The system automatically extracts and synchronizes lyrics with your audio, creating perfectly timed caption displays</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">TikTok-Style Captions:</strong> Lyrics appear with animated word-by-word highlighting, creating an engaging karaoke-style experience</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Multiple Caption Styles:</strong> Choose from plain white, yellow background, pink background, blue background, or red background styles</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Custom Font Selection:</strong> Select from popular Google Fonts to match your video's aesthetic</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Caption Positioning:</strong> Position your lyrics at the top, center, or bottom of the screen</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">AI-Generated or Uploaded Music:</strong> Use our music generator to create songs with lyrics, or upload your own audio file with lyrics</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <span><strong className="text-white">Visual Scene Generation:</strong> Beautiful background scenes are automatically generated to complement your lyrics and music</span>
                        </li>
                      </ul>
                      <p className="mt-4 text-gray-400 italic">
                        Lyric mode is ideal for: Song releases, lyric videos for social media, karaoke-style content, music promotion, and any video where lyrics are central to the experience.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Palette className="h-8 w-8 text-purple-400" />
                  TikTok-Style Captions
                </h2>
                
                <Card className="bg-gradient-to-r from-pink-950/50 to-purple-950/50 border-pink-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Type className="h-6 w-6 text-pink-400" />
                      Animated Word-by-Word Captions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <p className="mb-4">
                      Our new TikTok-style caption system brings your videos to life with engaging animated captions that highlight words as they're spoken. This feature is available across all video styles and creates a professional, engaging viewing experience.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Word-by-Word Highlighting:</strong> Each word pops into view with a smooth animation as it's spoken, creating a karaoke-style effect that keeps viewers engaged</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Multiple Style Presets:</strong> Choose from five beautiful caption styles:
                          <ul className="mt-2 ml-4 space-y-1">
                            <li>• <strong>Plain White:</strong> Clean white text with shadow for maximum readability</li>
                            <li>• <strong>Yellow Background:</strong> Vibrant yellow background with white text</li>
                            <li>• <strong>Pink Background:</strong> Eye-catching pink background with white text</li>
                            <li>• <strong>Blue Background:</strong> Cool blue background with white text</li>
                            <li>• <strong>Red Background:</strong> Bold red background with white text</li>
                          </ul>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Karaoke-Style Scaling:</strong> Active words scale up with a smooth animation, making it easy to follow along with the lyrics</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Smooth Transitions:</strong> Words transition seamlessly between each other, creating a polished, professional look</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Perfect Synchronization:</strong> Captions are automatically synchronized with your audio using advanced timing algorithms</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Custom Font Support:</strong> Choose from a wide selection of Google Fonts to match your video's personality</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Flexible Positioning:</strong> Place captions at the top, center, or bottom of your video to suit your content</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-pink-400 mt-0.5 flex-shrink-0" />
                        <span><strong className="text-white">Works with All Video Styles:</strong> Add TikTok-style captions to Pro Mode, Single Prompt, Instrumental, and Lyric videos</span>
                      </li>
                    </ul>
                    <p className="mt-4 text-gray-400 italic">
                      TikTok-style captions are perfect for: Increasing engagement, improving accessibility, making content more shareable, and creating that professional social media look that viewers love.
                    </p>
                  </CardContent>
                </Card>
              </section>

              <section className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">What This Means for You</h2>
                <div className="bg-gradient-to-r from-purple-950/40 to-violet-950/40 border border-purple-500/20 rounded-lg p-6">
                  <ul className="space-y-4 text-gray-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Choose Your Creative Path:</strong> Whether you want full control with Pro Mode or instant results with Single Prompt, there's a video style that matches your workflow and creative needs.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Enhanced Engagement:</strong> TikTok-style captions make your videos more engaging and accessible, helping viewers follow along with lyrics and increasing watch time.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">More Content Options:</strong> With four distinct video styles, you can create different types of content—from character-driven music videos to instrumental showcases and lyric-focused content.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" />
                      <div>
                        <strong className="text-white">Professional Results:</strong> All video styles produce high-quality results, and TikTok-style captions add that polished, professional touch that makes your content stand out on social media.
                      </div>
                    </li>
                  </ul>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Get Started Today</h2>
                <p className="text-gray-300 mb-6">
                  All these new features are available now to all NeonVideo.ai users. Log in to your account and explore the four video creation styles, try out TikTok-style captions, and discover which style works best for your creative projects!
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
                  We'd love to hear what you think about version 2.7.1! Your feedback helps us build the features you need. Reach out to us through our <Link href="/contact" className="text-purple-400 hover:text-purple-300 underline" data-testid="link-contact">contact page</Link> or share your creations with us on social media.
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
