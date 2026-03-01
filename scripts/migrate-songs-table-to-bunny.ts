/**
 * Migrate songs from the songs table (url field) from ImageKit to Bunny Storage (songs folder).
 *
 * Uses the "postgres" package and raw SQL so it runs reliably locally and
 * against any Postgres/Neon DATABASE_URL.
 *
 * 1. Fetches the last 100 songs with url starting with https://ik.imagekit.io/
 * 2. Downloads each audio file, uploads to Bunny Storage (songs folder), updates the DB
 * 3. Writes a JSON and CSV log (old_url, new_url) for rollback if needed
 *
 * Usage:
 *   Set DATABASE_URL and BUNNY_STORAGE_* in .env.
 *   From project root: npx tsx scripts/migrate-songs-table-to-bunny.ts
 *
 * Run repeatedly (100 records per run) until no more records remain.
 *
 * Logs: scripts/migrate-songs-table-to-bunny-<timestamp>.json and .csv
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import postgres from "postgres";
import { uploadToBunnyStorage, isBunnyConfigured } from "../server/services/bunny.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIMIT = 100;
const IMAGEKIT_PREFIX = "https://ik.imagekit.io/";

interface LogEntry {
    song_id: string;
    title: string;
    user_id: string;
    old_url: string;
    new_url: string;
    status: "success" | "failed";
    error?: string;
    created_at?: string;
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error("Missing DATABASE_URL. Set it in .env or pass it when running.");
        process.exit(1);
    }

    if (!isBunnyConfigured("songs")) {
        console.error(
            "Bunny Storage (songs) is not configured. Set BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_CDN_HOSTNAME, BUNNY_STORAGE_SONGS_PATH in .env"
        );
        process.exit(1);
    }

    const sql = postgres(databaseUrl, { max: 1 });

    try {
        console.log("Fetching songs with ImageKit url (last", LIMIT, ")...");
        const rows = await sql`
      SELECT id, title, user_id, url, created_at
      FROM songs
      WHERE url LIKE ${IMAGEKIT_PREFIX + "%"}
      ORDER BY created_at DESC
      LIMIT ${LIMIT}
    `;

        if (rows.length === 0) {
            console.log("No songs found with ImageKit url. Nothing left to migrate!");
            return;
        }

        console.log("Found", rows.length, "song(s). Starting migration...\n");
        const log: LogEntry[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] as { id: string; title: string | null; user_id: string; url: string; created_at: Date | null };
            const oldUrl = row.url;
            const songId = row.id;

            process.stdout.write(`[${i + 1}/${rows.length}] ${songId} ... `);

            try {
                // Download from ImageKit
                const resp = await fetch(oldUrl);
                if (!resp.ok) {
                    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
                }
                const buffer = Buffer.from(await resp.arrayBuffer());

                // Determine extension from original URL (default .mp3)
                const urlPath = new URL(oldUrl).pathname;
                const ext = path.extname(urlPath) || ".mp3";

                // Use "song_" prefix to distinguish from project audio migrations
                const fileName = `migrated_song_${songId}_${Date.now()}${ext}`;

                // Upload to Bunny songs folder
                const { url: newUrl } = await uploadToBunnyStorage("songs", fileName, buffer);

                // Update the DB
                await sql`UPDATE songs SET url = ${newUrl} WHERE id = ${songId}`;

                log.push({
                    song_id: songId,
                    title: row.title || "",
                    user_id: row.user_id,
                    old_url: oldUrl,
                    new_url: newUrl,
                    status: "success",
                    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                });
                console.log("OK ->", newUrl.substring(0, 80) + (newUrl.length > 80 ? "..." : ""));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.push({
                    song_id: songId,
                    title: row.title || "",
                    user_id: row.user_id,
                    old_url: oldUrl,
                    new_url: "",
                    status: "failed",
                    error: message,
                    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                });
                console.log("FAILED:", message);
            }
        }

        // Write logs
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const baseName = `migrate-songs-table-to-bunny-${timestamp}`;
        const scriptsDir = __dirname;
        const jsonPath = path.join(scriptsDir, `${baseName}.json`);
        const csvPath = path.join(scriptsDir, `${baseName}.csv`);

        fs.writeFileSync(jsonPath, JSON.stringify(log, null, 2), "utf-8");
        console.log("\nLog (JSON):", jsonPath);

        const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
        const csvHeader = "song_id,title,user_id,old_url,new_url,status,error,created_at\n";
        const csvRows = log.map(
            (e) =>
                [e.song_id, e.title, e.user_id, e.old_url, e.new_url, e.status, e.error || "", e.created_at || ""].map(esc).join(",")
        );
        fs.writeFileSync(csvPath, csvHeader + csvRows.join("\n"), "utf-8");
        console.log("Log (CSV):", csvPath);

        const succeeded = log.filter((e) => e.status === "success").length;
        const failed = log.length - succeeded;
        console.log("\nDone. Success:", succeeded, "| Failed:", failed);
        if (rows.length === LIMIT) {
            console.log("There may be more records. Run the script again to process the next batch.");
        }
    } finally {
        await sql.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
