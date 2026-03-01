import "dotenv/config";
import postgres from "postgres";

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    const r1 = await sql`SELECT count(*)::int as cnt FROM saved_characters WHERE image_url LIKE '/objects/%'`;
    console.log("Remaining /objects/ paths: ", r1[0].cnt);
    await sql.end();
}
main();
