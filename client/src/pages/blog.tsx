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
