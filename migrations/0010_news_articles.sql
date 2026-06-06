CREATE TABLE IF NOT EXISTS "news_articles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "excerpt" text NOT NULL,
  "content" text NOT NULL,
  "meta_title" text NOT NULL,
  "meta_description" text NOT NULL,
  "keywords" jsonb NOT NULL,
  "tool_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "status" text DEFAULT 'published' NOT NULL,
  "published_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "news_articles_slug_unique" ON "news_articles" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "news_articles_published_tool_unique" ON "news_articles" ("tool_id") WHERE "status" = 'published';
