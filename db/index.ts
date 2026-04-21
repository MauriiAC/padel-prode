import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// postgres.js works both with Neon (pooled connection) and local Postgres
// (docker-compose). For serverless runtimes on Vercel, use the Neon pooled
// URL (`-pooler` in host) so connections are multiplexed.
const client = postgres(env.DATABASE_URL, {
  prepare: false, // required for Neon pooler compatibility
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
