/**
 * One-time: set last_known_location from ip-api.com for the 100 most recent users (by created_at),
 * using each row's last_ip_address. Respects ip-api free-tier rate limits (~45 req/min).
 *
 * Run from repo root: npx tsx scripts/backfill-recent-user-locations.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { isLikelyPublicIp, lookupCountryFromIp } from "../server/services/ipGeo";

const rawUrl = process.env.DATABASE_URL ?? "";
const DATABASE_URL = rawUrl.replace(/^["']|["']$/g, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env and run again.");
  process.exit(1);
}

/** ~45 requests/minute → stay under limit */
const DELAY_MS_BETWEEN_LOOKUPS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    const rows = await sql<
      { id: string; last_ip_address: string | null }[]
    >`SELECT id, last_ip_address FROM users ORDER BY created_at DESC LIMIT 100`;

    console.log(`Processing ${rows.length} user(s).`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ip = row.last_ip_address?.trim() ?? "";

      if (!ip || !isLikelyPublicIp(ip)) {
        console.log(`[${i + 1}/${rows.length}] skip ${row.id}: no public IP`);
        skipped++;
        continue;
      }

      const country = await lookupCountryFromIp(ip);
      if (!country) {
        console.log(`[${i + 1}/${rows.length}] skip ${row.id}: lookup failed for ${ip}`);
        failed++;
      } else {
        await sql`UPDATE users SET last_known_location = ${country} WHERE id = ${row.id}`;
        console.log(`[${i + 1}/${rows.length}] updated ${row.id} → ${country}`);
        updated++;
      }

      if (i < rows.length - 1) {
        await sleep(DELAY_MS_BETWEEN_LOOKUPS);
      }
    }

    console.log(`Done. updated=${updated} skipped=${skipped} lookup_failed=${failed}`);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
