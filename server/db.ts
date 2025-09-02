import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Construct proper DATABASE_URL from individual components
const constructDatabaseUrl = () => {
  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  const port = process.env.PGPORT || '5432';
  
  if (!host || !user || !password || !database) {
    throw new Error("Missing required PostgreSQL environment variables");
  }
  
  // Construct the connection string with SSL required for Neon
  return `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
};

const connectionString = constructDatabaseUrl();

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
