// Postgres client — wired into the app as of the production cutover.
// Points at a real hosted Postgres (Supabase project "notabl"). Schema
// applied via the 14-table migration in drizzle-pg/0000_lush_deathbird.sql.
// Previously lived at lib/db/client.pg.ts as a validated-but-unwired draft
// (see docs/DEPLOYMENT.md for the cutover history); that file still exists
// as an identical reference copy.

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. lib/db/client.pg.ts requires a Postgres connection string " +
      "(from Supabase: click \"Connect\" at the top of the project dashboard -> " +
      "\"Transaction pooler\" tab -> copy the URI, port 6543)."
  );
}

// prepare: false is required when DATABASE_URL points at Supabase's
// Transaction pooler (port 6543, the recommended mode for serverless
// platforms like Vercel — see docs/DEPLOYMENT.md) since that pooler mode
// doesn't support prepared statements. Harmless if pointed at a Direct
// Connection or Session pooler instead.
const sql = postgres(process.env.DATABASE_URL, { max: 10, prepare: false });

export const db = drizzle(sql, { schema });
export { sql as pgClient };
