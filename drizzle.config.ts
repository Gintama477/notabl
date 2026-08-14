import type { Config } from "drizzle-kit";

// Points at Postgres as of the production cutover — was SQLite
// (dialect: "sqlite", schema.ts, ./data/notabl.db) before. See
// docs/DEPLOYMENT.md for the cutover history. drizzle.config.pg.ts still
// exists as an identical reference copy from before the swap.

export default {
  schema: "./lib/db/schema.pg.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
} satisfies Config;
