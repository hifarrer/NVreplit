/**
 * Migrate video_segments from CloudFront/Wavespeed/ImageKit to Bunny Storage.
 *
 * Uses the "postgres" package and raw SQL (no Neon driver) so it runs reliably
 * locally and against any Postgres/Neon DATABASE_URL.
 *
 * 1. Fetches projects that have non-empty video_segments (last 100 by updated_at).
 * 2. For each segment URL: if not already Bunny, download MP4 → upload to Bunny (VideoScenes) → replace in array.
 * 3. Updates the project's video_segments column with the new URLs.
 * 4. Writes JSON and CSV logs (old_video_segments, new_video_segments) for rollback.
 *
 * Usage:
 *   Set DATABASE_URL and BUNNY_STORAGE_* in .env. For production, point DATABASE_URL at prod.
 *   From project root: npm run migrate:video-segments-to-bunny
 *
 * Logs: scripts/migrate-video-segments-to-bunny-<timestamp>.json and .csv
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

const LIMIT = 100;

interface LogEntry {
  project_id: string;
  title: string;
  old_video_segments: string[];
  new_video_segments: string[];
  status: "success" | "failed" | "partial";
  error?: string;
  updated_at?: string;
}

function parseVideoSegments(raw: unknown): string[] {
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

  if (!isBunnyConfigured("scenes")) {
    console.error(
      "Bunny Storage (scenes) is not configured. Set BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_HOSTNAME, BUNNY_STORAGE_CDN_HOSTNAME, BUNNY_STORAGE_SCENES_PATH in .env"
    );
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log("Fetching projects with non-empty video_segments (last", LIMIT, ")...");
    const rows = await sql`
      SELECT id, title, video_segments, updated_at
      FROM projects
      WHERE video_segments IS NOT NULL
        AND jsonb_typeof(video_segments) = 'array'
        AND CASE WHEN jsonb_typeof(video_segments) = 'array' THEN jsonb_array_length(video_segments) ELSE 0 END > 0
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${LIMIT}
    `;

    if (rows.length === 0) {
      console.log("No projects found with video_segments. Exiting.");
      return;
    }

    console.log("Found", rows.length, "project(s). Starting migration...\n");
    const log: LogEntry[] = [];

    for (let p = 0; p < rows.length; p++) {
      const row = rows[p] as {
        id: string;
        title: string | null;
        video_segments: unknown;
        updated_at: Date | null;
      };
      const projectId = row.id;
      const oldSegments = parseVideoSegments(row.video_segments);
      const newSegments: string[] = [];

      process.stdout.write(`[${p + 1}/${rows.length}] ${projectId} (${oldSegments.length} segments) ... `);

      let failed = false;
      let lastError = "";

      for (let s = 0; s < oldSegments.length; s++) {
        const url = oldSegments[s];
        if (isBunnyUrl(url)) {
          newSegments.push(url);
          continue;
        }
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          const buffer = Buffer.from(await resp.arrayBuffer());
          const fileName = `scene_${projectId}_${s + 1}_${Date.now()}.mp4`;
          const { url: newUrl } = await uploadToBunnyStorage("scenes", fileName, buffer);
          newSegments.push(newUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          lastError = `Segment ${s + 1}: ${message}`;
          failed = true;
          newSegments.push(url);
        }
      }

      if (!failed) {
        const segmentsJson = JSON.stringify(newSegments);
        await sql`UPDATE projects SET video_segments = ${segmentsJson}::jsonb WHERE id = ${projectId}`;
        log.push({
          project_id: projectId,
          title: row.title || "",
          old_video_segments: oldSegments,
          new_video_segments: newSegments,
          status: "success",
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        });
        console.log("OK");
      } else {
        const updated = newSegments.some((u, i) => u !== oldSegments[i]);
        if (updated) {
          const segmentsJson = JSON.stringify(newSegments);
          await sql`UPDATE projects SET video_segments = ${segmentsJson}::jsonb WHERE id = ${projectId}`;
        }
        log.push({
          project_id: projectId,
          title: row.title || "",
          old_video_segments: oldSegments,
          new_video_segments: newSegments,
          status: "partial",
          error: lastError,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        });
        console.log("PARTIAL –", lastError);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const baseName = `migrate-video-segments-to-bunny-${timestamp}`;
    const scriptsDir = __dirname;
    const jsonPath = path.join(scriptsDir, `${baseName}.json`);
    const csvPath = path.join(scriptsDir, `${baseName}.csv`);

    fs.writeFileSync(jsonPath, JSON.stringify(log, null, 2), "utf-8");
    console.log("\nLog (JSON):", jsonPath);

    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const csvHeader = "project_id,title,status,error,old_video_segments,new_video_segments,updated_at\n";
    const csvRows = log.map((e) =>
      [
        e.project_id,
        e.title,
        e.status,
        e.error || "",
        JSON.stringify(e.old_video_segments),
        JSON.stringify(e.new_video_segments),
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
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
