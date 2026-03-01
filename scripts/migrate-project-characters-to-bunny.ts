/**
 * Migrate projects.character_image_url from ImageKit to Bunny Storage (characters folder).
 *
 * Uses the "postgres" package and raw SQL so it runs reliably locally and
 * against any Postgres/Neon DATABASE_URL.
 *
 * 1. Fetches the last 100 projects with character_image_url starting with https://ik.imagekit.io/
 * 2. Downloads each image, uploads to Bunny Storage (characters folder), updates the DB
 * 3. Writes a JSON and CSV log (old_url, new_url) for rollback if needed
 *
 * Usage:
 *   Set DATABASE_URL and BUNNY_STORAGE_* in .env.
 *   From project root: npx tsx scripts/migrate-project-characters-to-bunny.ts
 *
 * Run repeatedly (100 records per run) until no more records remain.
 *
 * Logs: scripts/migrate-project-characters-to-bunny-<timestamp>.json and .csv
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import postgres from "postgres";
import { uploadToBunnyStorage, isBunnyConfigured } from "../server/services/bunny.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIMIT = 2000;
const IMAGEKIT_PREFIX = "https://ik.imagekit.io/";

interface LogEntry {
    project_id: string;
    title: string;
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

    if (!isBunnyConfigured("characters")) {
        console.error(
            "Bunny Storage (characters) is not configured. Set BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_CDN_HOSTNAME, BUNNY_STORAGE_CHARACTERS_PATH in .env"
        );
        process.exit(1);
    }

    const sql = postgres(databaseUrl, { max: 1 });

    try {
        console.log("Fetching projects with ImageKit character_image_url (last", LIMIT, ")...");
        const rows = await sql`
      SELECT id, title, character_image_url, created_at
      FROM projects
      WHERE character_image_url LIKE ${IMAGEKIT_PREFIX + "%"}
      ORDER BY created_at DESC
      LIMIT ${LIMIT}
    `;

        if (rows.length === 0) {
            console.log("No projects found with ImageKit character_image_url. Nothing left to migrate!");
            return;
        }

        console.log("Found", rows.length, "project(s). Starting migration...\n");
        const log: LogEntry[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] as { id: string; title: string | null; character_image_url: string; created_at: Date | null };
            const oldUrl = row.character_image_url;
            const projectId = row.id;

            process.stdout.write(`[${i + 1}/${rows.length}] ${projectId} ... `);

            try {
                // Download from ImageKit
                const resp = await fetch(oldUrl);
                if (!resp.ok) {
                    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
                }
                const buffer = Buffer.from(await resp.arrayBuffer());

                // Determine extension from original URL (default .jpg)
                const urlPath = new URL(oldUrl).pathname;
                const ext = path.extname(urlPath) || ".jpg";

                // Use "projchar_" prefix to distinguish from saved_characters migrations
                const fileName = `migrated_projchar_${projectId}_${Date.now()}${ext}`;

                // Upload to Bunny characters folder
                const { url: newUrl } = await uploadToBunnyStorage("characters", fileName, buffer);

                // Update the DB
                await sql`UPDATE projects SET character_image_url = ${newUrl} WHERE id = ${projectId}`;

                log.push({
                    project_id: projectId,
                    title: row.title || "",
                    old_url: oldUrl,
                    new_url: newUrl,
                    status: "success",
                    created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
                });
                console.log("OK ->", newUrl.substring(0, 80) + (newUrl.length > 80 ? "..." : ""));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.push({
                    project_id: projectId,
                    title: row.title || "",
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
        const baseName = `migrate-project-characters-to-bunny-${timestamp}`;
        const scriptsDir = __dirname;
        const jsonPath = path.join(scriptsDir, `${baseName}.json`);
        const csvPath = path.join(scriptsDir, `${baseName}.csv`);

        fs.writeFileSync(jsonPath, JSON.stringify(log, null, 2), "utf-8");
        console.log("\nLog (JSON):", jsonPath);

        const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
        const csvHeader = "project_id,title,old_url,new_url,status,error,created_at\n";
        const csvRows = log.map(
            (e) =>
                [e.project_id, e.title, e.old_url, e.new_url, e.status, e.error || "", e.created_at || ""].map(esc).join(",")
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
