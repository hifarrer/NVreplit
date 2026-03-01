/**
 * Migrate scene_images from ImageKit to Bunny Storage (ImageScenes folder).
 *
 * Uses the "postgres" package and raw SQL so it runs reliably locally and
 * against any Postgres/Neon DATABASE_URL.
 *
 * 1. Fetches the last 100 projects where scene_images contains ImageKit URLs.
 * 2. For each image URL: download → upload to Bunny (ImageScenes) → replace in array.
 * 3. Updates the project's scene_images column with the new URLs.
 * 4. Writes JSON and CSV logs (old_scene_images, new_scene_images) for rollback.
 *
 * Usage:
 *   Set DATABASE_URL and BUNNY_STORAGE_* in .env.
 *   From project root: npx tsx scripts/migrate-scene-images-to-bunny.ts
 *
 * Run repeatedly (100 records per run) until no more records remain.
 *
 * Logs: scripts/migrate-scene-images-to-bunny-<timestamp>.json and .csv
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import postgres from "postgres";
import {
    uploadToBunnyStorage,
    isBunnyConfigured,
    isBunnyUrl,
} from "../server/services/bunny.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIMIT = 1000;
const IMAGEKIT_PREFIX = "https://ik.imagekit.io/";

interface LogEntry {
    project_id: string;
    title: string;
    old_scene_images: string[];
    new_scene_images: string[];
    status: "success" | "failed" | "partial";
    error?: string;
    updated_at?: string;
}

function parseSceneImages(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    }
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === "string") : [];
        } catch {
            return [];
        }
    }
    return [];
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error("Missing DATABASE_URL. Set it in .env or pass it when running.");
        process.exit(1);
    }

    if (!isBunnyConfigured("imageScenes")) {
        console.error(
            "Bunny Storage (imageScenes) is not configured. Set BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_CDN_HOSTNAME, BUNNY_STORAGE_IMAGESCENES_PATH in .env"
        );
        process.exit(1);
    }

    const sql = postgres(databaseUrl, { max: 1 });

    try {
        // Find projects whose scene_images array contains at least one ImageKit URL.
        // We cast the array elements to text and check with LIKE.
        console.log("Fetching projects with ImageKit scene_images (last", LIMIT, ")...");
        const rows = await sql`
      SELECT id, title, scene_images, updated_at
      FROM projects
      WHERE scene_images IS NOT NULL
        AND jsonb_typeof(scene_images) = 'array'
        AND CASE WHEN jsonb_typeof(scene_images) = 'array' THEN jsonb_array_length(scene_images) ELSE 0 END > 0
        AND scene_images::text LIKE ${"%" + IMAGEKIT_PREFIX + "%"}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${LIMIT}
    `;

        if (rows.length === 0) {
            console.log("No projects found with ImageKit scene_images. Nothing left to migrate!");
            return;
        }

        console.log("Found", rows.length, "project(s). Starting migration...\n");
        const log: LogEntry[] = [];

        for (let p = 0; p < rows.length; p++) {
            const row = rows[p] as {
                id: string;
                title: string | null;
                scene_images: unknown;
                updated_at: Date | null;
            };
            const projectId = row.id;
            const oldImages = parseSceneImages(row.scene_images);
            const newImages: string[] = [];

            process.stdout.write(`[${p + 1}/${rows.length}] ${projectId} (${oldImages.length} images) ... `);

            let failed = false;
            let lastError = "";

            for (let s = 0; s < oldImages.length; s++) {
                const url = oldImages[s];

                // Skip if already a Bunny URL
                if (isBunnyUrl(url)) {
                    newImages.push(url);
                    continue;
                }

                // Skip non-ImageKit URLs (leave them as-is)
                if (!url.startsWith(IMAGEKIT_PREFIX)) {
                    newImages.push(url);
                    continue;
                }

                try {
                    const resp = await fetch(url);
                    if (!resp.ok) {
                        throw new Error(`HTTP ${resp.status}`);
                    }
                    const buffer = Buffer.from(await resp.arrayBuffer());

                    // Determine extension from original URL (default .jpg)
                    const urlPath = new URL(url).pathname;
                    const ext = path.extname(urlPath.split("_")[0]) || path.extname(urlPath) || ".jpg";

                    const fileName = `migrated_${projectId}_${s + 1}_${Date.now()}${ext}`;
                    const { url: newUrl } = await uploadToBunnyStorage("imageScenes", fileName, buffer);
                    newImages.push(newUrl);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    lastError = `Image ${s + 1}: ${message}`;
                    failed = true;
                    // Keep old URL on failure
                    newImages.push(url);
                }
            }

            // Update DB
            const segmentsJson = JSON.stringify(newImages);

            if (!failed) {
                await sql`UPDATE projects SET scene_images = ${segmentsJson}::jsonb WHERE id = ${projectId}`;
                log.push({
                    project_id: projectId,
                    title: row.title || "",
                    old_scene_images: oldImages,
                    new_scene_images: newImages,
                    status: "success",
                    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
                });
                console.log("OK");
            } else {
                // Still update with partial results (successfully migrated images + unchanged ones)
                const updated = newImages.some((u, i) => u !== oldImages[i]);
                if (updated) {
                    await sql`UPDATE projects SET scene_images = ${segmentsJson}::jsonb WHERE id = ${projectId}`;
                }
                log.push({
                    project_id: projectId,
                    title: row.title || "",
                    old_scene_images: oldImages,
                    new_scene_images: newImages,
                    status: "partial",
                    error: lastError,
                    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
                });
                console.log("PARTIAL –", lastError);
            }
        }

        // Write logs
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const baseName = `migrate-scene-images-to-bunny-${timestamp}`;
        const scriptsDir = __dirname;
        const jsonPath = path.join(scriptsDir, `${baseName}.json`);
        const csvPath = path.join(scriptsDir, `${baseName}.csv`);

        fs.writeFileSync(jsonPath, JSON.stringify(log, null, 2), "utf-8");
        console.log("\nLog (JSON):", jsonPath);

        const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
        const csvHeader = "project_id,title,status,error,old_scene_images,new_scene_images,updated_at\n";
        const csvRows = log.map((e) =>
            [
                e.project_id,
                e.title,
                e.status,
                e.error || "",
                JSON.stringify(e.old_scene_images),
                JSON.stringify(e.new_scene_images),
                e.updated_at || "",
            ]
                .map(esc)
                .join(",")
        );
        fs.writeFileSync(csvPath, csvHeader + csvRows.join("\n"), "utf-8");
        console.log("Log (CSV):", csvPath);

        const succeeded = log.filter((e) => e.status === "success").length;
        const partial = log.filter((e) => e.status === "partial").length;
        console.log("\nDone. Success:", succeeded, "| Partial:", partial);
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
