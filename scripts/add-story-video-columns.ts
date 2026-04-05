/**
 * Adds story video columns to projects (see shared/schema.ts).
 * Run: npx tsx scripts/add-story-video-columns.ts
 * Requires DATABASE_URL in .env (same as the app).
 */
import "dotenv/config";
import postgres from "postgres";

const raw = process.env.DATABASE_URL ?? "";
const DATABASE_URL = raw.replace(/^["']|["']$/g, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env and run again.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const statements = [
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_type" text DEFAULT 'music_video'`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_prompt" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_duration" integer`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_narrator" boolean DEFAULT false`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_narrator_voice" text`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_characters" jsonb`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_script" jsonb`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_audio_urls" jsonb`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_scene_images" jsonb`,
  `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "story_scene_prompts" jsonb`,
  `UPDATE "projects" SET "project_type" = 'music_video' WHERE "project_type" IS NULL`,
];

async function main() {
  try {
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    console.log("Done: story video columns on projects are present (or were already there).");
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
