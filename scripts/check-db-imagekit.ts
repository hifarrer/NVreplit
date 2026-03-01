import "dotenv/config";
import postgres from "postgres";

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

    const tables = ['projects', 'saved_characters', 'songs', 'users'];

    for (const table of tables) {
        const cols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ${table} 
      AND data_type IN ('character varying', 'text', 'json', 'jsonb')
    `;

        for (const col of cols) {
            if (col.data_type === 'json' || col.data_type === 'jsonb') {
                const res = await sql.unsafe(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col.column_name}::text LIKE '%ik.imagekit.io%'`);
                if (res[0].cnt > 0) console.log(`[JSON/JSONB] Found ${res[0].cnt} ImageKit rows in ${table}.${col.column_name}`);
            } else {
                const res = await sql.unsafe(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col.column_name} LIKE '%ik.imagekit.io%'`);
                if (res[0].cnt > 0) console.log(`[TEXT] Found ${res[0].cnt} ImageKit rows in ${table}.${col.column_name}`);
            }
        }
    }

    await sql.end();
}

main().catch(console.error);
