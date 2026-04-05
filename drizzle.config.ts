import { defineConfig } from "drizzle-kit";
import parse from "pg-connection-string";

/**
 * Drizzle-kit only applies `ssl` when dbCredentials does NOT use `url`.
 * With `url`, it does `new Pool({ connectionString, max: 1 })` and ignores ssl,
 * which breaks on Windows / corporate proxies (SELF_SIGNED_CERT_IN_CHAIN).
 *
 * Use pg's URL parser so passwords with special chars and query-param auth work.
 */
function dbCredentialsFromUrl(connectionString: string) {
  const c = parse(connectionString);
  if (!c.host) {
    throw new Error("DATABASE_URL is missing host");
  }
  const port =
    c.port === undefined || c.port === ""
      ? 5432
      : typeof c.port === "number"
        ? c.port
        : parseInt(String(c.port), 10);

  const password =
    (c.password && String(c.password)) ||
    process.env.PGPASSWORD ||
    process.env.DB_PASSWORD ||
    "";

  return {
    host: c.host,
    port,
    user: c.user ?? "",
    password,
    database: c.database ?? "postgres",
    ssl: { rejectUnauthorized: false } as const,
  };
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: dbCredentialsFromUrl(process.env.DATABASE_URL),
});
