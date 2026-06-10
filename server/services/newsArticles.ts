import fs from "fs";
import path from "path";
import { openai } from "./openai";

export interface NewsArticleTopic {
  id: string;
  name: string;
  route: string;
  primaryKeyword: string;
  audience: string;
  angle: string;
  internalLinks: string[];
}

export interface NewsArticleRecurringAngle {
  id: string;
  name: string;
  keywordModifier: string;
  audienceFocus: string;
  angle: string;
}

export interface GeneratedNewsArticle {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
}

export const NEWS_ARTICLE_TOPICS: NewsArticleTopic[] = [
  {
    id: "simple-ai-music-video-generator",
    name: "AI music video generator / Simple Mode",
    route: "/create/simple-mode",
    primaryKeyword: "AI music video generator",
    audience: "musicians and creators who want prompt-first video generation",
    angle: "how to turn a prompt, optional song, and optional reference image into a publishable AI music video",
    internalLinks: ["/create/simple-mode", "/api-docs", "/plans"],
  },
  {
    id: "pro-mode-music-video",
    name: "Pro Mode music video creation",
    route: "/create/story-mode",
    primaryKeyword: "AI music video maker with scene control",
    audience: "artists who want custom characters, scenes, and more creative control",
    angle: "why guided scene and character control improves AI music video storytelling",
    internalLinks: ["/create/story-mode", "/community", "/plans"],
  },
  {
    id: "single-prompt-music-video",
    name: "Single Prompt music video generation",
    route: "/create/single-prompt",
    primaryKeyword: "single prompt AI music video generator",
    audience: "creators testing ideas quickly",
    angle: "how one prompt can generate a song, character, scenes, and final music video",
    internalLinks: ["/create/single-prompt", "/create", "/community"],
  },
  {
    id: "seamless-loop-video",
    name: "Seamless Loop Video",
    route: "/create/loop-video",
    primaryKeyword: "AI loop video generator",
    audience: "musicians, DJs, livestreamers, and ambient visual creators",
    angle: "how looping visuals help songs, livestreams, and music promos stay visually engaging",
    internalLinks: ["/create/loop-video", "/create", "/community"],
  },
  {
    id: "instrumental-videos",
    name: "Instrumental videos",
    route: "/create/instrumental",
    primaryKeyword: "AI instrumental music video generator",
    audience: "producers, beat makers, soundtrack composers, and visual artists",
    angle: "how to create cinematic visuals for instrumental music without lip sync",
    internalLinks: ["/create/instrumental", "/create/create-song", "/community"],
  },
  {
    id: "lyric-videos",
    name: "Lyric videos",
    route: "/create/lyric",
    primaryKeyword: "AI lyric video maker",
    audience: "songwriters, musicians, labels, and social media teams",
    angle: "how lyric videos make songs easier to follow, share, and promote",
    internalLinks: ["/create/lyric", "/create/create-song", "/create"],
  },
  {
    id: "music-video-shorts",
    name: "Music Video Shorts",
    route: "/create/video-shorts",
    primaryKeyword: "AI video shorts generator",
    audience: "TikTok, Reels, and YouTube Shorts creators",
    angle: "how short AI videos help test hooks and promote music on social platforms",
    internalLinks: ["/create/video-shorts", "/community", "/plans"],
  },
  {
    id: "story-video",
    name: "Story Video",
    route: "/create/story-video",
    primaryKeyword: "AI story video generator",
    audience: "writers, educators, marketers, and narrative creators",
    angle: "how to turn a story idea into a narrated video with characters and scenes",
    internalLinks: ["/create/story-video", "/create", "/community"],
  },
  {
    id: "image-story",
    name: "Image Story",
    route: "/create/image-story",
    primaryKeyword: "AI image story video generator",
    audience: "creators who want narrated stories from still images",
    angle: "how still-image storytelling can make narrative video production lighter and more affordable",
    internalLinks: ["/create/image-story", "/create/story-video", "/create"],
  },
  {
    id: "all-purpose-long-format-video",
    name: "All Purpose / Long Format Video",
    route: "/create/all-purpose",
    primaryKeyword: "long format AI video generator",
    audience: "teams planning promos, explainers, tutorials, and flexible video projects",
    angle: "how scene-based generation helps structure longer AI videos",
    internalLinks: ["/create/all-purpose", "/create", "/api-docs"],
  },
  {
    id: "scene-guided-video",
    name: "Scene Guided Video",
    route: "/create/scene-guided",
    primaryKeyword: "scene guided AI video generator",
    audience: "creators who want hands-on direction over each video scene",
    angle: "how designing a video one scene at a time improves control and consistency",
    internalLinks: ["/create/scene-guided", "/create/story-mode", "/create"],
  },
  {
    id: "motion-control",
    name: "Motion Control",
    route: "/create/motion-control",
    primaryKeyword: "AI motion control video generator",
    audience: "creators reusing motion from source videos",
    angle: "how to transfer motion from one video onto a reference image",
    internalLinks: ["/create/motion-control", "/create", "/community"],
  },
  {
    id: "swap",
    name: "Swap",
    route: "/create/swap",
    primaryKeyword: "AI video swap tool",
    audience: "video creators replacing people, objects, or backgrounds",
    angle: "how reference-image video swaps open up remix and production workflows",
    internalLinks: ["/create/swap", "/create", "/community"],
  },
  {
    id: "reimagine",
    name: "Reimagine",
    route: "/create/reimagine",
    primaryKeyword: "AI video style transfer",
    audience: "creators making alternate styles from existing footage",
    angle: "how to restyle an existing video while preserving the original audio",
    internalLinks: ["/create/reimagine", "/create", "/blog"],
  },
  {
    id: "add-captions",
    name: "Add Captions",
    route: "/api-docs",
    primaryKeyword: "add captions to video with AI",
    audience: "social media creators and teams optimizing silent autoplay",
    angle: "why captions improve accessibility, retention, and social viewing",
    internalLinks: ["/api-docs", "/create", "/plans"],
  },
  {
    id: "video-upscaler",
    name: "Video Upscaler",
    route: "/api-docs",
    primaryKeyword: "AI video upscaler",
    audience: "creators who need sharper exports from existing videos",
    angle: "how upscaling helps repurpose video for higher quality publishing",
    internalLinks: ["/api-docs", "/create", "/plans"],
  },
  {
    id: "ai-video-edition",
    name: "AI Video Edition",
    route: "/api-docs",
    primaryKeyword: "AI video editing tool",
    audience: "creators making prompt-based edits and visual variants",
    angle: "how prompt-based editing speeds up experimentation with existing footage",
    internalLinks: ["/api-docs", "/create", "/community"],
  },
  {
    id: "video-background-remover",
    name: "Video Background Remover",
    route: "/api-docs",
    primaryKeyword: "video background remover AI",
    audience: "marketers, product creators, and social video editors",
    angle: "how background removal supports overlays, product clips, and compositing",
    internalLinks: ["/api-docs", "/create", "/plans"],
  },
  {
    id: "character-creator",
    name: "Character Creator",
    route: "/create/character-creator",
    primaryKeyword: "AI character creator for video",
    audience: "creators building consistent characters for AI videos",
    angle: "how custom characters give music videos and stories a recognizable visual identity",
    internalLinks: ["/create/character-creator", "/create/story-mode", "/create/story-video"],
  },
  {
    id: "ai-image-edit",
    name: "AI Image Edit",
    route: "/create/ai-image-edit",
    primaryKeyword: "AI image editor for video creators",
    audience: "creators preparing visual references and assets",
    angle: "how prompt-based image editing helps refine video concepts before generation",
    internalLinks: ["/create/ai-image-edit", "/create/character-creator", "/create"],
  },
  {
    id: "ai-music-song-generation",
    name: "AI Music / Song Generation",
    route: "/create/create-song",
    primaryKeyword: "AI music generator",
    audience: "musicians and video creators who need original songs",
    angle: "how generated songs can feed directly into AI music video workflows",
    internalLinks: ["/create/create-song", "/create/simple-mode", "/create/lyric"],
  },
  {
    id: "audio-to-lyrics",
    name: "Audio to Lyrics",
    route: "/create",
    primaryKeyword: "audio to lyrics AI",
    audience: "musicians creating lyric videos, captions, and searchable song content",
    angle: "how lyric extraction supports captions, lyric videos, and music publishing workflows",
    internalLinks: ["/create", "/create/lyric", "/api-docs"],
  },
];

export const NEWS_ARTICLE_RECURRING_ANGLES: NewsArticleRecurringAngle[] = [
  {
    id: "workflow-guide",
    name: "Workflow guide",
    keywordModifier: "workflow",
    audienceFocus: "creators looking for a practical end-to-end workflow",
    angle: "explain a step-by-step production workflow with concrete planning, prompting, review, and publishing advice",
  },
  {
    id: "social-publishing",
    name: "Social publishing",
    keywordModifier: "for social media",
    audienceFocus: "creators publishing on TikTok, Reels, YouTube Shorts, and social feeds",
    angle: "focus on adapting the tool for social video formats, hooks, captions, pacing, and repeatable publishing",
  },
  {
    id: "music-marketing",
    name: "Music marketing",
    keywordModifier: "for musicians",
    audienceFocus: "independent musicians, producers, labels, and music marketers",
    angle: "show how the tool can support music release campaigns, visualizers, teasers, lyric content, and fan engagement",
  },
  {
    id: "api-automation",
    name: "API automation",
    keywordModifier: "automation",
    audienceFocus: "developers and small teams building repeatable video generation processes",
    angle: "cover how teams can think about automation, reusable prompts, inputs, review, and handoff without inventing unsupported API details",
  },
  {
    id: "creative-direction",
    name: "Creative direction",
    keywordModifier: "creative direction",
    audienceFocus: "creators who care about visual consistency, art direction, and story clarity",
    angle: "explain how to make stronger creative decisions around prompts, references, scenes, characters, motion, and final presentation",
  },
  {
    id: "small-business",
    name: "Small business",
    keywordModifier: "for small business",
    audienceFocus: "small businesses, marketers, educators, and solo operators",
    angle: "focus on practical business use cases such as promos, explainers, product clips, training content, and brand storytelling",
  },
];

export function buildRecurringNewsArticleTopic(
  baseTopic: NewsArticleTopic,
  sequence: number,
): NewsArticleTopic {
  const safeSequence = Math.max(1, Math.floor(sequence));
  const angle = NEWS_ARTICLE_RECURRING_ANGLES[(safeSequence - 1) % NEWS_ARTICLE_RECURRING_ANGLES.length];
  const seriesNumber = Math.floor((safeSequence - 1) / NEWS_ARTICLE_RECURRING_ANGLES.length) + 1;

  return {
    ...baseTopic,
    id: `${baseTopic.id}--${angle.id}-${seriesNumber}`,
    name: `${baseTopic.name} - ${angle.name}`,
    primaryKeyword: `${baseTopic.primaryKeyword} ${angle.keywordModifier}`.trim(),
    audience: `${baseTopic.audience}; especially ${angle.audienceFocus}`,
    angle: `${angle.angle}. Tie the advice back to this NeonVideo tool: ${baseTopic.angle}. This is recurring article series ${seriesNumber}, so use a fresh title, examples, and structure.`,
    internalLinks: Array.from(new Set([...baseTopic.internalLinks, baseTopic.route, "/news"])),
  };
}

function getNewsSourceDocument(): string {
  const sourcePath = path.join(process.cwd(), "docs", "neonvideo-news-source.md");
  return fs.readFileSync(sourcePath, "utf8");
}

function normalizeSlug(rawSlug: string, fallback: string): string {
  const normalized = rawSlug
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return normalized || fallback;
}

function coerceStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return strings.length ? strings.slice(0, 12) : fallback;
}

export async function generateNewsArticleForTopic(
  topic: NewsArticleTopic,
  existingTitles: string[],
): Promise<GeneratedNewsArticle> {
  const sourceDocument = getNewsSourceDocument();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert SEO editor for NeonVideo.ai. Generate useful, original, factual news/blog articles that explain one NeonVideo tool and naturally include SEO keywords.

Return ONLY valid JSON with this exact shape:
{
  "slug": "url-safe-slug",
  "title": "Article title",
  "excerpt": "One or two sentence excerpt",
  "metaTitle": "SEO title under 65 characters",
  "metaDescription": "SEO meta description under 155 characters",
  "keywords": ["keyword one", "keyword two"],
  "content": "Markdown article body"
}

Content rules:
- Write 900 to 1300 words.
- Use Markdown headings, short paragraphs, and practical examples.
- Do not invent unsupported capabilities, guarantees, rankings, exact render times, or pricing.
- Keep the article distinct from these existing titles: ${existingTitles.join(" | ") || "none"}.
- Mention NeonVideo.ai naturally, not in every sentence.
- Include a clear call to action with the relevant internal route.
- Include 4 to 7 internal links from the provided topic when useful.`,
      },
      {
        role: "user",
        content: `SOURCE DOCUMENT:
${sourceDocument}

TARGET TOPIC:
${JSON.stringify(topic, null, 2)}

Generate one unique NeonVideo.ai article for this topic.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
    max_completion_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no article content");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid article JSON");
  }

  const fallbackSlug = `${topic.id}-${new Date().toISOString().slice(0, 10)}`;
  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : `How to Use ${topic.name} with NeonVideo.ai`;
  const articleContent = typeof parsed.content === "string" && parsed.content.trim()
    ? parsed.content.trim()
    : "";

  if (!articleContent) {
    throw new Error("OpenAI returned an empty article body");
  }

  return {
    slug: normalizeSlug(typeof parsed.slug === "string" ? parsed.slug : "", fallbackSlug),
    title,
    excerpt: typeof parsed.excerpt === "string" && parsed.excerpt.trim()
      ? parsed.excerpt.trim()
      : `Learn how ${topic.name} helps creators make better videos with NeonVideo.ai.`,
    content: articleContent,
    metaTitle: typeof parsed.metaTitle === "string" && parsed.metaTitle.trim()
      ? parsed.metaTitle.trim().slice(0, 80)
      : title.slice(0, 80),
    metaDescription: typeof parsed.metaDescription === "string" && parsed.metaDescription.trim()
      ? parsed.metaDescription.trim().slice(0, 180)
      : `Learn how to use ${topic.name} on NeonVideo.ai for AI video creation.`.slice(0, 180),
    keywords: coerceStringArray(parsed.keywords, [topic.primaryKeyword, topic.name, "NeonVideo.ai"]),
  };
}
