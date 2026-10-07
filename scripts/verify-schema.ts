/**
 * Consistency check between the application code and the database migration.
 *
 * Every `public.<table>` the server code reads or writes must exist in
 * supabase/onboarding.sql. A typo here would only fail at runtime, and only on
 * the code path that touches it — exactly the kind of bug that survives a
 * build. This catches it statically.
 *
 * Run with:  npx tsx scripts/verify-schema.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SQL_PATH = join(ROOT, "supabase", "onboarding.sql");

const sql = readFileSync(SQL_PATH, "utf8");

/* --------------------- tables defined in the migration -------------------- */

const definedTables = new Set<string>();
for (const match of sql.matchAll(/create table if not exists\s+public\.([a-z_]+)/gi)) {
  definedTables.add(match[1]);
}
// Also catch a plain `create table public.x` form, in case one is written that way.
for (const match of sql.matchAll(/create table\s+public\.([a-z_]+)/gi)) {
  definedTables.add(match[1]);
}

/* ------------------- functions defined in the migration ------------------- */

const definedFunctions = new Set<string>();
for (const match of sql.matchAll(/create or replace function\s+public\.([a-z_]+)/gi)) {
  definedFunctions.add(match[1]);
}

/* ----------------------- source files that query the DB ------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = walk(join(ROOT, "src"));

/** Tables referenced as `public.x` in SQL strings, or in `from public.x`-style clauses. */
const referenced = new Map<string, Set<string>>();
/** Functions called as `public.x(`. */
const calledFunctions = new Map<string, Set<string>>();

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");

  // Any `public.<ident>` occurrence inside a string literal is a DB reference.
  for (const match of text.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/gi)) {
    const name = match[1];
    // `public.something(` is a function call; otherwise treat it as a table.
    const after = text.slice(match.index! + match[0].length);
    const isCall = after.startsWith("(");
    const bucket = isCall ? calledFunctions : referenced;
    if (!bucket.has(name)) bucket.set(name, new Set());
    bucket.get(name)!.add(rel);
  }
}

/* ------------------------------- report ---------------------------------- */

let problems = 0;

console.log(`Tables defined in migration: ${definedTables.size}`);
console.log([...definedTables].sort().join(", "));
console.log(`\nFunctions defined in migration: ${definedFunctions.size}`);
console.log([...definedFunctions].sort().join(", "));

console.log("\nReferenced tables:");
const missingTables: string[] = [];
for (const [name, files] of [...referenced].sort()) {
  const ok = definedTables.has(name);
  if (!ok) missingTables.push(name);
  console.log(`  ${ok ? "ok  " : "MISS"}  public.${name}  (${[...files].join(", ")})`);
}

console.log("\nReferenced functions:");
const missingFunctions: string[] = [];
for (const [name, files] of [...calledFunctions].sort()) {
  const ok = definedFunctions.has(name);
  if (!ok) missingFunctions.push(name);
  console.log(`  ${ok ? "ok  " : "MISS"}  public.${name}()  (${[...files].join(", ")})`);
}

/* --------------------- structural sanity of the SQL ---------------------- */

console.log("\nMigration structure:");
const dollarQuotes = (sql.match(/\$\$/g) ?? []).length;
console.log(`  ${dollarQuotes % 2 === 0 ? "ok  " : "FAIL"}  $$ blocks are balanced (${dollarQuotes})`);
if (dollarQuotes % 2 !== 0) problems++;

const rlsEnabled = [...sql.matchAll(/alter table public\.([a-z_]+)\s+enable row level security/gi)]
  .map((m) => m[1]);
console.log(`  ok    RLS enabled on ${rlsEnabled.length} tables`);
const withoutRls = [...definedTables].filter((t) => !rlsEnabled.includes(t));
if (withoutRls.length > 0) {
  console.log(`  note  tables without RLS (intentional for service-role-only tables): ${withoutRls.join(", ")}`);
}

// The seed catalogue must not fabricate user statistics.
const seedsFakeStats = /insert into public\.(coding_stats|user_questions|user_achievements|activity_daily|activity_events)/i.test(sql);
console.log(`  ${seedsFakeStats ? "FAIL" : "ok  "}  no seeded user statistics`);
if (seedsFakeStats) problems++;

/* -------------------------------- verdict -------------------------------- */

if (missingTables.length > 0 || missingFunctions.length > 0) {
  console.log(`\nMISSING: ${[...missingTables, ...missingFunctions].join(", ")}`);
  problems++;
}

console.log(problems === 0 ? "\nSchema check passed." : `\n${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
