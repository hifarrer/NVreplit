ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_story_reference_images" jsonb;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image_story_transition" text;
