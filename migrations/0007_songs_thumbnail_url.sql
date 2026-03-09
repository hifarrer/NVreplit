-- Add album cover thumbnail URL to songs table
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;
