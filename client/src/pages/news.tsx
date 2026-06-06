import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Calendar, Newspaper, ArrowRight } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NewsArticleCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  toolName: string;
  publishedAt: string;
  url: string;
}

interface NewsResponse {
  articles: NewsArticleCard[];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function NewsPage() {
  const { data, isLoading, error } = useQuery<NewsResponse>({
    queryKey: ["/api/news"],
  });

  const articles = data?.articles ?? [];

  return (
    <>
      <Helmet>
        <title>News - AI Video Creation Guides | NeonVideo.ai</title>
        <meta
          name="description"
          content="Read NeonVideo.ai news, AI video creation guides, and practical tutorials for music videos, story videos, captions, upscaling, and AI video tools."
        />
        <meta property="og:title" content="NeonVideo.ai News" />
        <meta
          property="og:description"
          content="AI video creation guides, news, and tutorials for NeonVideo.ai tools."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neonvideo.ai/news" />
        <link rel="canonical" href="https://neonvideo.ai/news" />
      </Helmet>

      <div className="min-h-screen flex flex-col bg-black dark:bg-black">
        <NavigationHeader />

        <main className="flex-1 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <header className="text-center mb-12">
              <div className="inline-flex items-center gap-2 text-purple-300 mb-4">
                <Newspaper className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wide">News</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                NeonVideo.ai News
              </h1>
              <p className="text-xl text-gray-300">
                AI video guides, product workflows, and creator-focused tutorials.
              </p>
            </header>

            {isLoading && (
              <div className="text-center py-12 text-gray-300">Loading news...</div>
            )}

            {error && (
              <div className="text-center py-12 text-red-300">Unable to load news articles.</div>
            )}

            {!isLoading && !error && articles.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">No news articles yet. Check back soon.</p>
              </div>
            )}

            <div className="space-y-6">
              {articles.map((article) => (
                <Card
                  key={article.id}
                  className="bg-black/30 backdrop-blur-md border-purple-500/20 hover:border-purple-500/40 transition-all"
                  data-testid={`card-news-${article.slug}`}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2 text-purple-400 text-sm mb-2">
                      <Newspaper className="h-4 w-4" />
                      <span>{article.toolName}</span>
                      <span className="text-gray-500">-</span>
                      <Calendar className="h-4 w-4" />
                      <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                    </div>
                    <CardTitle className="text-2xl text-white hover:text-purple-400 transition-colors">
                      <Link href={`/news/${article.slug}`}>{article.title}</Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-300 mb-4 leading-relaxed">
                      {article.excerpt}
                    </CardDescription>
                    <Link href={`/news/${article.slug}`}>
                      <Button
                        variant="ghost"
                        className="text-purple-400 hover:text-purple-300 hover:bg-purple-950/50 p-0"
                        data-testid={`button-read-news-${article.slug}`}
                      >
                        Read More
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
