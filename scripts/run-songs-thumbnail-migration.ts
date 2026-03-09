/**
 * One-off migration: add thumbnail_url to songs table if missing.
 * Run from project root: npx tsx scripts/run-songs-thumbnail-migration.ts
 * (Loads .env from cwd automatically.)
 */
import "dotenv/config";
import postgres from "postgres";

const raw = process.env.DATABASE_URL ?? "";
const DATABASE_URL = raw.replace(/^["']|["']$/g, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Set it in .env and run: npx tsx scripts/run-songs-thumbnail-migration.ts");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  try {
    await sql.unsafe(`
      ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;
    `);
    console.log("Migration applied: songs.thumbnail_url column added (or already exists).");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
