/**
 * Devora — MySQL connection + schema health check.
 *
 * Run with:  npm run verify:db
 *
 * This is the "is the database actually reachable and correctly shaped?" check.
 * It talks to MySQL through Prisma Client exactly the way the application will,
 * so a green run means the backend can genuinely use this database.
 *
 * It writes NOTHING permanent: the only row it inserts lives inside a
 * transaction that is deliberately rolled back.
 *
 * Exits non-zero if any check fails.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = join(import.meta.dirname, "..");

/* ------------------------------------------------------------------ */
/* Load DATABASE_URL from .env when the runner has not already set it. */
/* (tsx does not load .env files the way `next dev` does.)             */
/* ------------------------------------------------------------------ */
function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  try {
    const text = readFileSync(join(ROOT, ".env"), "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env — fall through and let Prisma report the missing variable.
  }
}

loadEnvFile();

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const prisma = new PrismaClient();

/** The 20 tables the MySQL schema is supposed to contain. */
const EXPECTED_TABLES = [
  "achievements",
  "activity_daily",
  "activity_events",
  "coding_stats",
  "notifications",
  "oauth_states",
  "platform_accounts",
  "platform_oauth_tokens",
  "profiles",
  "projects",
  "questions",
  "skills",
  "sync_jobs",
  "sync_logs",
  "topic_progress",
  "user_achievements",
  "user_questions",
  "user_skills",
  "username_registry",
];

/** Tables that must carry a touch-updated_at trigger. */
const EXPECTED_TRIGGERS = [
  "platform_accounts_touch_updated_at",
  "platform_oauth_tokens_touch_updated_at",
  "profiles_touch_updated_at",
  "projects_touch_updated_at",
];

async function main() {
  console.log("\nMySQL connection");

  const version = await prisma.$queryRawUnsafe<{ v: string }[]>(
    "select version() as v"
  );
  check("connected through Prisma Client", version.length === 1);
  console.log(`        server: MySQL ${version[0]?.v ?? "?"}`);

  const current = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "select database() as db"
  );
  check(
    "connected to the `devora` database",
    current[0]?.db === "devora",
    `got ${current[0]?.db ?? "none"}`
  );

  console.log("\nSchema");

  // Every information_schema column is aliased explicitly: MySQL reports those
  // column names in upper case, so an unaliased `select table_name` comes back
  // as `TABLE_NAME` and reading `.table_name` yields undefined.
  const tables = await prisma.$queryRawUnsafe<{ tname: string }[]>(
    "select table_name as tname from information_schema.tables where table_schema = database() and table_type = 'BASE TABLE'"
  );
  const tableNames = new Set(tables.map((t) => t.tname));
  const missing = EXPECTED_TABLES.filter((t) => !tableNames.has(t));
  check(
    `all ${EXPECTED_TABLES.length} tables exist`,
    missing.length === 0,
    `missing: ${missing.join(", ")}`
  );

  const fks = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*) as n from information_schema.table_constraints
      where table_schema = database() and constraint_type = 'FOREIGN KEY'`
  );
  check("same-database foreign keys present", Number(fks[0]?.n ?? 0) === 5,
    `expected 5, got ${Number(fks[0]?.n ?? 0)}`);

  const triggers = await prisma.$queryRawUnsafe<{ tname: string }[]>(
    "select trigger_name as tname from information_schema.triggers where trigger_schema = database()"
  );
  const triggerNames = new Set(triggers.map((t) => t.tname));
  const missingTriggers = EXPECTED_TRIGGERS.filter((t) => !triggerNames.has(t));
  check(
    "updated_at triggers applied",
    missingTriggers.length === 0,
    `missing: ${missingTriggers.join(", ")}`
  );

  console.log("\nCatalogue seed (reference data the app reads)");

  const [skills, achievements] = await Promise.all([
    prisma.skill.count(),
    prisma.achievement.count(),
  ]);
  check("skills seeded", skills >= 44, `got ${skills}`);
  check("achievements seeded", achievements >= 16, `got ${achievements}`);

  console.log("\nRound trip (rolled back — nothing is persisted)");

  /** Never matches a real Supabase user id (which is a random UUID). */
  const sentinel = "00000000-0000-4000-8000-00000000dead";
  let sawRow = false;

  try {
    await prisma.$transaction(async (tx) => {
      // Note: `visibility` is deliberately omitted. This is the exact shape of
      // the application's existing `ensureProfile` INSERT, and it must succeed.
      const created = await tx.profile.create({
        data: {
          user_id: sentinel,
          display_name: "Verification Row",
          email: "verify@devora.local",
        },
      });
      sawRow = created.user_id === sentinel && created.display_name === "Verification Row";

      const touched = await tx.profile.update({
        where: { user_id: sentinel },
        data: { bio: "temporary" },
      });
      sawRow = sawRow && touched.bio === "temporary";

      // Roll everything back.
      throw new Error("__ROLLBACK__");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(
      "transaction rolled back cleanly",
      message.includes("__ROLLBACK__"),
      message
    );
  }

  check("insert + update succeeded with an omitted JSON column", sawRow);

  const leftovers = await prisma.profile.count({ where: { user_id: sentinel } });
  check("no verification data left behind", leftovers === 0, `found ${leftovers} row(s)`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\n[devora/verify-db] could not complete:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
