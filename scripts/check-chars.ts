import "dotenv/config";
import postgres from "postgres";

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

    const r1 = await sql`SELECT count(*)::int as cnt FROM saved_characters WHERE image_url LIKE '/objects/%'`;
    console.log("Characters with /objects/ paths:", r1[0].cnt);

    const r2 = await sql`SELECT count(*)::int as cnt FROM saved_characters WHERE image_url LIKE 'https://ik.imagekit.io/%'`;
    console.log("Characters with imagekit URLs:", r2[0].cnt);

    const r3 = await sql`SELECT count(*)::int as cnt FROM saved_characters WHERE image_url LIKE 'https://neonvideo.b-cdn.net/%'`;
    console.log("Characters with bunny URLs:", r3[0].cnt);

    const r4 = await sql`SELECT image_url FROM saved_characters WHERE image_url NOT LIKE 'https://neonvideo.b-cdn.net/%' LIMIT 5`;
    console.log("Sample non-bunny URLs:", r4.map((r: any) => r.image_url));

    await sql.end();
}

main();
