/**
 * One-time backfill: push existing featured videos to Bunny Stream.
 *
 * Finds all featured, completed projects that have a finalVideoUrl but no
 * bunnyVideoId, then calls the Bunny Stream "Fetch from URL" API for each.
 *
 * Run from repo root:  npx tsx scripts/migrate-featured-to-bunny-stream.ts
 */
import "dotenv/config";
import postgres from "postgres";

const rawUrl = process.env.DATABASE_URL ?? "";
const DATABASE_URL = rawUrl.replace(/^["']|["']$/g, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env and run again.");
  process.exit(1);
}

const LIBRARY_ID = process.env.BUNNY_STREAM_FINAL_LIBRARY_ID || "";
const API_KEY = process.env.BUNNY_STREAM_FINAL_API_KEY || "";

if (!LIBRARY_ID || !API_KEY) {
  console.error("BUNNY_STREAM_FINAL_LIBRARY_ID and BUNNY_STREAM_FINAL_API_KEY must be set in .env");
  process.exit(1);
}

const FETCH_URL = `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/fetch`;
const DELAY_BETWEEN_MS = 2000;

async function pushToStream(sourceUrl: string, title: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(FETCH_URL, {
      method: "POST",
      headers: {
        AccessKey: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: sourceUrl, title }),
    });

    if (res.status === 429) {
      const wait = Math.min(5000 * (attempt + 1), 30000);
      console.warn(`  Rate limited (429), waiting ${wait}ms before retry...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bunny Stream fetch failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error(`No video ID returned: ${JSON.stringify(data)}`);
    return data.id;
  }
  throw new Error("Exceeded retry limit for Bunny Stream fetch");
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    const rows = await sql`
      SELECT id, title, final_video_url
      FROM projects
      WHERE is_featured = true
        AND is_completed = true
        AND final_video_url IS NOT NULL
        AND (bunny_video_id IS NULL OR bunny_video_id = '')
      ORDER BY created_at DESC
    `;

    console.log(`Found ${rows.length} featured video(s) to migrate.\n`);

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      const { id, title, final_video_url } = row;
      console.log(`[${success + failed + 1}/${rows.length}] "${title}" (${id})`);

      try {
        const streamVideoId = await pushToStream(final_video_url, title || "Untitled");

        await sql`
          UPDATE projects
          SET bunny_video_id = ${streamVideoId},
              bunny_library_id = ${LIBRARY_ID},
              bunny_video_status = 'processing'
          WHERE id = ${id}
        `;

        console.log(`  -> Stream video: ${streamVideoId}`);
        success++;
      } catch (err) {
        console.error(`  -> FAILED:`, err);
        failed++;
      }

      if (success + failed < rows.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
      }
    }

    console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  } finally {
    await sql.end();
  }
}

main();
