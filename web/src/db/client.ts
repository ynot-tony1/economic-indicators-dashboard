import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

function createDb() {
  if (!connectionString) return null;
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export const db = createDb();
export const isDbConfigured = Boolean(connectionString);
