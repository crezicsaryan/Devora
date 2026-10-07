/**
 * Server-only Postgres connection for the Devora backend.
 *
 * Why this exists
 * ---------------
 * Devora uses Supabase (Postgres) as its single database. The onboarding and
 * dashboard backend needs capabilities the browser-scoped client cannot safely
 * provide:
 *
 *   - background sync jobs that write rows after the HTTP response is sent
 *   - GitHub OAuth token storage that must never be readable by any client
 *   - server-derived onboarding state (a user must not be able to set
 *     `onboarding_completed` themselves)
 *
 * The service-role key grants those capabilities, so it must never reach the
 * browser. NEXT_PUBLIC_* variables are inlined into the client bundle by the
 * bundler, which is why a plain server variable is used here instead.
 *
 * This module throws if imported into a client component.
 */

import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/db/pool.ts is server-only and must never be imported from client code."
  );
}

let pool: Pool | null = null;

function readConfig() {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.DEVORA_DATABASE_URL ?? "";

  if (!connectionString) return null;
  return { connectionString };
}

export function hasDatabase(): boolean {
  return readConfig() !== null;
}

/** Lazily created singleton pool. Reused across route handlers and jobs. */
export function getPool(): Pool {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "DATABASE_URL is not set. Add the Supabase Postgres connection string to devora/.env.local (server-side only)."
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.connectionString,
      // Supabase's pooler does not support named prepared statements.
      max: 5,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 8_000,
      ssl: config.connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
    pool.on("error", (err) => {
      console.error("[devora/db] idle client error", err.message);
    });
  }
  return pool;
}

/** Run a parameterised query. Always use $1/$2 placeholders — never interpolate. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** Single-row convenience helper. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Transaction helper for multi-statement writes. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
