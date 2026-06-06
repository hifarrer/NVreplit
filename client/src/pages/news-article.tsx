import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, ExternalLink, Newspaper } from "lucide-react";
import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";

interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  toolId: string;
  toolName: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
}

interface NewsArticleResponse {
  article: NewsArticle;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function renderInlineLinks(text: string) {
  const parts: Array<string | JSX.Element> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const label = match[1];
    const href = match[2];
    const isInternal = href.startsWith("/");
    parts.push(
      isInternal ? (
        <Link key={`${href}-${match.index}`} href={href} className="text-purple-300 hover:text-purple-200 underline underline-offset-4">
          {label}
        </Link>
      ) : (
        <a
          key={`${href}-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-300 hover:text-purple-200 underline underline-offset-4"
        >
          {label}
        </a>
      ),
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

function MarkdownArticle({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="list-disc pl-6 space-y-2 text-gray-200">
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`} className="leading-relaxed">
            {renderInlineLinks(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2).trim());
      continue;
    }

    flushList();

    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={`h3-${nodes.length}`} className="text-2xl font-semibold text-white mt-8 mb-3">
          {renderInlineLinks(line.slice(4))}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={`h2-${nodes.length}`} className="text-3xl font-bold text-white mt-10 mb-4">
          {renderInlineLinks(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h2 key={`h1-${nodes.length}`} className="text-3xl font-bold text-white mt-10 mb-4">
          {renderInlineLinks(line.slice(2))}
        </h2>,
      );
    } else {
      nodes.push(
        <p key={`p-${nodes.length}`} className="text-gray-200 leading-8">
          {renderInlineLinks(line)}
        </p>,
      );
    }
  }

  flushList();
  return <div className="space-y-5">{nodes}</div>;
}

export default function NewsArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = useQuery<NewsArticleResponse>({
    queryKey: [`/api/news/${slug}`],
    enabled: Boolean(slug),
  });

  const article = data?.article;
  const canonicalUrl = article ? `https://neonvideo.ai/news/${article.slug}` : "https://neonvideo.ai/news";
  const articleJsonLd = article
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: article.excerpt,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt || article.publishedAt,
        author: {
          "@type": "Organization",
          name: "NeonVideo.ai",
          url: "https://neonvideo.ai/",
        },
        publisher: {
          "@type": "Organization",
          name: "NeonVideo.ai",
          url: "https://neonvideo.ai/",
        },
        mainEntityOfPage: canonicalUrl,
      }
    : null;

  return (
    <>
      <Helmet>
        <title>{article?.metaTitle || "News Article | NeonVideo.ai"}</title>
        <meta name="description" content={article?.metaDescription || "Read NeonVideo.ai news and AI video creation guides."} />
        {article?.keywords?.length ? <meta name="keywords" content={article.keywords.join(", ")} /> : null}
        <meta property="og:title" content={article?.title || "NeonVideo.ai News"} />
        <meta property="og:description" content={article?.excerpt || "AI video creation guides from NeonVideo.ai."} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <link rel="canonical" href={canonicalUrl} />
        {articleJsonLd && (
          <script type="application/ld+json">{JSON.stringify(articleJsonLd)}</script>
        )}
      </Helmet>

      <div className="min-h-screen flex flex-col bg-black dark:bg-black">
        <NavigationHeader />

        <main className="flex-1 container mx-auto px-4 py-12">
          <article className="max-w-3xl mx-auto">
            <Link href="/news">
              <Button variant="ghost" className="mb-8 text-white hover:text-white/80" data-testid="button-back-news">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to News
              </Button>
            </Link>

            {isLoading && <div className="text-center py-12 text-gray-300">Loading article...</div>}
            {error && <div className="text-center py-12 text-red-300">Article not found.</div>}

            {article && (
              <>
                <header className="mb-10">
                  <div className="flex flex-wrap items-center gap-2 text-purple-400 text-sm mb-4">
                    <Newspaper className="h-4 w-4" />
                    <span>{article.toolName}</span>
                    <span className="text-gray-500">-</span>
                    <Calendar className="h-4 w-4" />
                    <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
                    {article.title}
                  </h1>
                  <p className="text-xl text-gray-300 leading-relaxed">{article.excerpt}</p>
                </header>

                <MarkdownArticle content={article.content} />

                <div className="mt-12 border-t border-purple-500/20 pt-8">
                  <Link href="/create">
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-news-create">
                      Try NeonVideo.ai
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </article>
        </main>

        <Footer />
      </div>
    </>
  );
}
