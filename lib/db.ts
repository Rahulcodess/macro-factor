/**
 * PostgreSQL database connection utility for Neon
 */

import { Pool, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Don't throw during build - return a mock pool that will fail gracefully
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.warn("DATABASE_URL not set during build - this is OK for static pages");
      pool = new Pool({
        connectionString: "postgresql://",
      });
      return pool;
    }
    throw new Error("DATABASE_URL environment variable is not set");
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const client = getPool();
  const result = await client.query<T>(text, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}
