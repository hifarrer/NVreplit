-- Story video columns on public.projects
-- Idempotent: safe to re-run (IF NOT EXISTS).
-- Execute: npx tsx scripts/add-story-video-columns.ts
-- (uses DATABASE_URL from .env in project root)

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_type" text DEFAULT 'music_video';

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_prompt" text;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_duration" integer;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_narrator" boolean DEFAULT false;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_narrator_voice" text;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_characters" jsonb;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_script" jsonb;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_audio_urls" jsonb;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_scene_images" jsonb;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_scene_prompts" jsonb;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_audio_urls_right" jsonb;

UPDATE "projects" SET "project_type" = 'music_video' WHERE "project_type" IS NULL;
