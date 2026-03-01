import "dotenv/config";
import postgres from "postgres";

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

    // Let's check if the /objects/ paths have corresponding imagekit backups
    const rows = await sql`
    SELECT s.id, s.image_url, i.imagekit_url 
    FROM saved_characters s
    LEFT JOIN imagekit_backups i ON i.original_path = s.image_url
    WHERE s.image_url LIKE '/objects/%'
    LIMIT 5
  `;

    console.log("Sample /objects/ characters with their imagekit URLs:");
    console.dir(rows, { depth: null });

    await sql.end();
}

main();
