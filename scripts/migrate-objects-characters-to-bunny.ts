/**
 * Migrate saved_characters with internal `/objects/` paths to Bunny Storage.
 *
 * Uses the "postgres" package and raw SQL so it runs reliably locally and
 * against any Postgres/Neon DATABASE_URL.
 *
 * 1. Fetches projects with image_url starting with `/objects/`
 * 2. Looks up the ImageKit backup URL in the `imagekit_backups` table
 * 3. Downloads each image, uploads to Bunny Storage (characters folder), updates the DB
 * 4. Writes a JSON and CSV log (old_url, new_url) for rollback if needed
 *
 * Usage:
 *   Set DATABASE_URL and BUNNY_STORAGE_* in .env.
 *   From project root: npx tsx scripts/migrate-objects-characters-to-bunny.ts
 *
 * Run repeatedly (100 records per run) until no more records remain.
 *
 * Logs: scripts/migrate-objects-characters-to-bunny-<timestamp>.json and .csv
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import postgres from "postgres";
import { uploadToBunnyStorage, isBunnyConfigured } from "../server/services/bunny.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIMIT = 1000;

interface LogEntry {
    character_id: string;
    name: string;
    user_id: string;
    old_db_url: string;
    imagekit_url: string;
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

    if (!isBunnyConfigured("characters")) {
        console.error(
            "Bunny Storage (characters) is not configured. Set BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_CDN_HOSTNAME, BUNNY_STORAGE_CHARACTERS_PATH in .env"
        );
        process.exit(1);
    }

    const sql = postgres(databaseUrl, { max: 1 });

    try {
        console.log("Fetching saved_characters with internal /objects/ paths (last", LIMIT, ")...");
        const rows = await sql`
      SELECT s.id, s.name, s.user_id, s.image_url, s.created_at, i.imagekit_url
      FROM saved_characters s
      LEFT JOIN imagekit_backups i ON i.original_path = s.image_url
      WHERE s.image_url LIKE '/objects/%'
      ORDER BY s.created_at DESC
      LIMIT ${LIMIT}
    `;

        if (rows.length === 0) {
            console.log("No saved_characters found with /objects/ paths! Nothing left to migrate.");
            return;
        }

        console.log("Found", rows.length, "character(s). Starting migration...\n");
        const log: LogEntry[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] as {
                id: string;
                name: string | null;
                user_id: string;
                image_url: string;
                created_at: Date | null;
                imagekit_url: string | null;
            };
            const oldDbUrl = row.image_url;
            const charId = row.id;

            process.stdout.write(`[${i + 1}/${rows.length}] ${charId} ... `);

            if (!row.imagekit_url) {
                console.log("FAILED: No ImageKit backup found for this object path.");
                log.push({
                    character_id: charId,
                    name: row.name || "",
                    user_id: row.user_id,
                    old_db_url: oldDbUrl,
                    imagekit_url: "",
                    new_url: "",
                    status: "failed",
                    error: "No ImageKit backup found",
                    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                });
                continue;
            }

            try {
                // Download from the ImageKit Backup URL
                const resp = await fetch(row.imagekit_url);
                if (!resp.ok) {
                    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
                }
                const buffer = Buffer.from(await resp.arrayBuffer());

                // Determine extension from original URL (default .jpg)
                const urlPath = new URL(row.imagekit_url).pathname;
                const ext = path.extname(urlPath) || ".jpg";

                const fileName = `migrated_char_obj_${charId}_${Date.now()}${ext}`;

                // Upload to Bunny characters folder
                const { url: newUrl } = await uploadToBunnyStorage("characters", fileName, buffer);

                // Update the DB
                await sql`UPDATE saved_characters SET image_url = ${newUrl} WHERE id = ${charId}`;

                log.push({
                    character_id: charId,
                    name: row.name || "",
                    user_id: row.user_id,
                    old_db_url: oldDbUrl,
                    imagekit_url: row.imagekit_url,
                    new_url: newUrl,
                    status: "success",
                    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                });
                console.log("OK ->", newUrl.substring(0, 80) + (newUrl.length > 80 ? "..." : ""));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.push({
                    character_id: charId,
                    name: row.name || "",
                    user_id: row.user_id,
                    old_db_url: oldDbUrl,
                    imagekit_url: row.imagekit_url,
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
        const baseName = `migrate-objects-characters-to-bunny-${timestamp}`;
        const scriptsDir = __dirname;
        const jsonPath = path.join(scriptsDir, `${baseName}.json`);
        const csvPath = path.join(scriptsDir, `${baseName}.csv`);

        fs.writeFileSync(jsonPath, JSON.stringify(log, null, 2), "utf-8");
        console.log("\nLog (JSON):", jsonPath);

        const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
        const csvHeader = "character_id,name,user_id,old_db_url,imagekit_url,new_url,status,error,created_at\n";
        const csvRows = log.map(
            (e) =>
                [e.character_id, e.name, e.user_id, e.old_db_url, e.imagekit_url, e.new_url, e.status, e.error || "", e.created_at || ""].map(esc).join(",")
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
