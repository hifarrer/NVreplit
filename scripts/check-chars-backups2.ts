import "dotenv/config";
import postgres from "postgres";

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

    const r1 = await sql`
      SELECT count(*)::int as cnt 
      FROM saved_characters s
      JOIN imagekit_backups i ON i.original_path = s.image_url
      WHERE s.image_url LIKE '/objects/%'
  `;
    console.log("Remaining /objects/ paths with ImageKit backups: ", r1[0].cnt);

    await sql.end();
}
main();
