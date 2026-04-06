/**
 * Applies SQL in scripts/sql/add-story-video-projects-columns.sql using DATABASE_URL from .env.
 *
 * Run from repo root: npx tsx scripts/add-story-video-columns.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rawUrl = process.env.DATABASE_URL ?? "";
const DATABASE_URL = rawUrl.replace(/^["']|["']$/g, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env and run again.");
  process.exit(1);
}

const sqlPath = join(__dirname, "sql", "add-story-video-projects-columns.sql");

function splitSqlStatements(source: string): string[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlockComments.split(/\r?\n/);
  const out: string[] = [];
  let buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    buf.push(line);
    if (trimmed.endsWith(";")) {
      const stmt = buf.join("\n").trim();
      if (stmt.length > 0) {
        out.push(stmt.replace(/;\s*$/, "").trim());
      }
      buf = [];
    }
  }
  const tail = buf.join("\n").trim();
  if (tail.length > 0) out.push(tail.replace(/;\s*$/, "").trim());
  return out.filter((s) => s.length > 0);
}

async function main() {
  let body: string;
  try {
    body = readFileSync(sqlPath, "utf8");
  } catch (e) {
    console.error("Could not read SQL file:", sqlPath, e);
    process.exit(1);
  }

  const statements = splitSqlStatements(body);
  if (statements.length === 0) {
    console.error("No SQL statements found in", sqlPath);
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL, {
    max: 1,
    onnotice: () => {
      /* suppress "column already exists" noise on re-runs */
    },
  });
  try {
    console.log(`Applying ${statements.length} statement(s) from ${sqlPath}`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\s+/g, " ").slice(0, 100);
      console.log(`  [${i + 1}/${statements.length}] ${preview}${stmt.length > 100 ? "…" : ""}`);
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
