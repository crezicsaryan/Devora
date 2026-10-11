/**
 * Server-only MySQL access through Prisma Client.
 *
 * Why this module exists
 * ---------------------
 * Devora's schema and its single database are MySQL (see
 * devora/prisma/schema.prisma and prisma/sql/devora_triggers.sql). The previous
 * data layer spoke the Postgres wire protocol through node-postgres, which
 * cannot talk to MySQL at all — so *every* request that touched data failed
 * before it reached any business logic. This module is the one connection the
 * whole backend now shares.
 *
 * The client is created lazily and cached on `globalThis` so that Next.js'
 * development hot-reload does not open a new connection pool on every edit.
 *
 * This module throws if imported into a client component: the connection string
 * and every query must stay on the server.
 */

import "server-only";
import { PrismaClient } from "@prisma/client";

declare global {
  var __devoraPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient =
  globalThis.__devoraPrisma ?? createClient();

// In production the module is evaluated once; in development the global keeps
// the pool alive across hot reloads.
if (process.env.NODE_ENV !== "production") {
  globalThis.__devoraPrisma = prisma;
}

/**
 * Is a database configured?
 *
 * Read paths use this to render their "not configured" state instead of
 * throwing. Prisma needs DATABASE_URL, so its presence is the whole check.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Escape hatch for the few queries Prisma's query builder cannot express. */
export { Prisma } from "@prisma/client";
