import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, ArrowRight, Calendar } from "lucide-react";

interface BlogPost {
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
}

const blogPosts: BlogPost[] = [
  {
    title: "Version 3.2 Released: AI video editor.",
    slug: "/version-3-2-release",
    excerpt:
      "NeonVideo.ai version 3.2 introduces a complete AI video editor with prompt-based generation, transcript editing, automatic cleanup, shorts discovery, animated captions, multitrack controls, and flexible exports.",
    date: "July 6, 2026",
    category: "Product Update",
    readTime: "7 min read"
  },
  {
    title: "Version 3.0 Released: Reimagine Video Style",
    slug: "/version-3-0-release",
    excerpt:
      "NeonVideo.ai version 3.0 introduces Reimagine—transform existing video with an AI style prompt (YouTube or .mp4), up to 30 seconds, while keeping the original audio. Watch the showcase and try it from Create.",
    date: "April 15, 2026",
    category: "Product Update",
    readTime: "4 min read"
  },
  {
    title: "Version 2.9 Released: Story Videos, UI Polish & Video Style Guide",
    slug: "/version-2-9-release",
    excerpt:
      "NeonVideo.ai version 2.9 introduces Story Videos—scripted narratives with characters, narration, and scene control—plus creation hub updates, reliability fixes, and practical tips for every music video style.",
    date: "April 7, 2026",
    category: "Product Update",
    readTime: "9 min read"
  },
  {
    title: "Version 2.8 Released: New Video Tools, API & Five Video Styles",
    slug: "/version-2-8-release",
    excerpt: "NeonVideo.ai version 2.8 brings new video tools, API endpoint availability, five video styles (Pro Mode, Simple Mode, Single Prompt, Instrumental, Lyric), plus multiple enhancements and bug fixes.",
    date: "March 4, 2026",
    category: "Product Update",
    readTime: "6 min read"
  },
  {
    title: "Best AI Music Generator",
    slug: "/best-ai-music-generator",
    excerpt: "NeonVideo.AI offers unlimited song generation on paid plans—while Suno and others limit you to just 10 songs per month. Create more music, no monthly cap.",
    date: "February 26, 2026",
    category: "AI Music",
    readTime: "4 min read"
  },
  {
    title: "Best AI Music Video Generator 2026",
    slug: "/best-ai-music-video-generator-2026",
    excerpt: "Compare the best AI music video generators in 2026: NeonVideo.AI, VidMuse.AI, and Aivideo.com. Free trials, HD quality, video limits, and pricing — so you can choose the right tool.",
    date: "February 26, 2026",
    category: "Comparison",
    readTime: "5 min read"
  },
  {
    title: "Best AI Tools for Independent Musicians",
    slug: "/best-ai-tools-independent-musicians",
    excerpt: "Discover the best AI tools for independent musicians: AI music generation, lyric writing, mastering, music video creation, and promotion. Level up your indie career without a big budget.",
    date: "February 26, 2026",
    category: "Guides",
    readTime: "7 min read"
  },
  {
    title: "NeonVideo.AI vs VidMuse.AI vs Aivideo.com – Best AI Music Video Generator 2026?",
    slug: "/neonvideo-vs-vidmuse-vs-aivideo",
    excerpt: "Compare NeonVideo.AI, VidMuse.AI, and Aivideo.com: pricing, video limits, AI quality, commercial rights, and professional output. Find the best AI music video tool for creators.",
    date: "February 26, 2026",
    category: "Comparison",
    readTime: "6 min read"
  },
  {
    title: "Version 2.7.1 Released: Four Powerful Video Styles & TikTok-Style Captions",
    slug: "/version-2-7-1-release",
    excerpt: "NeonVideo.ai version 2.7.1 introduces four powerful video creation styles: Pro Mode, Single Prompt, Instrumental, and Lyric videos, plus stunning TikTok-style captions with word-by-word animations.",
    date: "January 20, 2026",
    category: "Product Update",
    readTime: "6 min read"
  },
  {
    title: "Version 2.6.0 Released: New Character Generator, Audio Trimming & More",
    slug: "/version-2-6-0-release",
    excerpt: "NeonVideo.ai version 2.6.0 is here! Discover the new character generator with expanded styles and AI models, powerful audio trimming tool, plus bug fixes and video generation improvements.",
    date: "January 15, 2026",
    category: "Product Update",
    readTime: "5 min read"
  },
  {
    title: "Version 2.5.1 Released: More Realistic Characters & New AI Models",
    slug: "/version-2-5-1-release",
    excerpt: "NeonVideo.ai version 2.5.1 is here! Experience more realistic AI characters, choose from new Medium and Premium AI models, plus enjoy bug fixes and UI improvements.",
    date: "January 18, 2026",
    category: "Product Update",
    readTime: "4 min read"
  },
  {
    title: "Version 2.4.1 Released: New Public Characters, Audio Track & Lyrics Track",
    slug: "/version-2-4-1-release",
    excerpt: "NeonVideo.ai version 2.4.1 is here! Explore new public characters available to all users, enhanced timeline with dedicated audio and lyrics tracks, plus various bug fixes for a smoother experience.",
    date: "January 2, 2026",
    category: "Product Update",
    readTime: "4 min read"
  },
  {
    title: "How to Create a Christmas Postcard Video",
    slug: "/christmas-postcard-video",
    excerpt: "Learn how to create a personalized AI-generated Christmas postcard video in minutes. Follow our step-by-step guide to create and send festive video greetings to loved ones this holiday season.",
    date: "December 16, 2025",
    category: "Tutorial",
    readTime: "4 min read"
  },
  {
    title: "Version 2.3.1 Released: Vertical Videos, UI Improvements & Performance",
    slug: "/version-2-3-1-release",
    excerpt: "NeonVideo.ai version 2.3.1 is here! Create vertical videos for TikTok and Reels, enjoy a cleaner interface with improved mobile experience, and benefit from significant performance improvements.",
    date: "December 5, 2025",
    category: "Product Update",
    readTime: "5 min read"
  },
  {
    title: "Version 2.1.1 Released: Timeline Editing, Custom Scene Images & Unlimited Plan",
    slug: "/version-2-1-1-release",
    excerpt: "NeonVideo.ai version 2.1.1 is here! Edit your timeline and reorder scenes with drag-and-drop, upload your own scene images, gift subscriptions to friends, and enjoy our new unlimited plan for serious creators.",
    date: "December 5, 2025",
    category: "Product Update",
    readTime: "6 min read"
  },
  {
    title: "Version 2.0.1 Released: Longer Videos, Powerful Editing & More",
    slug: "/version-2-0-1-release",
    excerpt: "NeonVideo.ai version 2.0.1 is here! Create videos up to 3 minutes long, edit your existing videos, and enjoy improved performance. Discover all the new features and enhancements.",
    date: "November 19, 2025",
    category: "Product Update",
    readTime: "5 min read"
  },
  {
    title: "Best AI Music Video Generator 2025: Transform Text into Stunning Music Videos",
    slug: "/best-ai-music-generator-2025",
    excerpt: "Discover the best AI music video generator in 2025. Create stunning music videos from text prompts with AI-powered song generation, character creation, and scene animation.",
    date: "January 30, 2025",
    category: "AI Music & Video",
    readTime: "8 min read"
  }
];

export default function BlogPage() {
  return (
    <>
      <Helmet>
        <title>Blog - AI Music Video Generation Insights | NeonVideo.ai</title>
        <meta name="description" content="Explore the latest insights, guides, and tips on AI music video generation. Learn how to create stunning music videos with artificial intelligence." />
        <meta property="og:title" content="Blog - AI Music Video Generation Insights" />
        <meta property="og:description" content="Explore the latest insights, guides, and tips on AI music video generation." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neonvideo.ai/blog" />
        <link rel="canonical" href="https://neonvideo.ai/blog" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-black dark:bg-black">
        <NavigationHeader />
        
        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <header className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                NeonVideo.ai Blog
              </h1>
              <p className="text-xl text-gray-300">
                Insights, guides, and tips on AI music video generation
              </p>
            </header>

            <div className="space-y-6">
              {blogPosts.map((post) => (
                <Card 
                  key={post.slug}
                  className="bg-black/30 backdrop-blur-md border-purple-500/20 hover:border-purple-500/40 transition-all"
                  data-testid={`card-blog-post-${post.slug.replace(/\//g, '')}`}
                >
                  <CardHeader>
                    <div className="flex items-center gap-2 text-purple-400 text-sm mb-2">
                      <Music className="h-4 w-4" />
                      <span>{post.category}</span>
                      <span className="text-gray-500">•</span>
                      <Calendar className="h-4 w-4" />
                      <time>{post.date}</time>
                      <span className="text-gray-500">•</span>
                      <span>{post.readTime}</span>
                    </div>
                    <CardTitle className="text-2xl text-white hover:text-purple-400 transition-colors">
                      <Link href={post.slug}>
                        {post.title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-300 mb-4 leading-relaxed">
                      {post.excerpt}
                    </CardDescription>
                    <Link href={post.slug}>
                      <Button 
                        variant="ghost" 
                        className="text-purple-400 hover:text-purple-300 hover:bg-purple-950/50 p-0"
                        data-testid={`button-read-more-${post.slug.replace(/\//g, '')}`}
                      >
                        Read More
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>

            {blogPosts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">No blog posts yet. Check back soon!</p>
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
