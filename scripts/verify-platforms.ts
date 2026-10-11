/**
 * Devora — connected-platform verification test.
 *
 * Run with:  npm run verify:platforms          (uses a known CodeChef handle)
 *            npx tsx scripts/verify-platforms.ts your-handle
 *
 * Three layers, because they fail for different reasons:
 *   1. Input resolution — pure, offline. A handle, a supported profile URL and
 *      a wrong-host URL must be told apart, and nothing may be truncated.
 *   2. Adapter contract — offline. Every adapter must return a classified
 *      outcome and must be internally coherent (exists only for VERIFIED).
 *   3. Live checks — actual requests to each platform, for a handle that does
 *      exist and one that does not. This is the part that proves a real account
 *      is no longer rejected as "invalid".
 *
 * Exits non-zero if any check fails.
 */

import {
  resolvePlatformInput,
  profileUrlFor,
} from "../src/lib/profile-links";
import { PLATFORMS, type VerificationOutcome } from "../src/lib/types";
import type { PlatformKey } from "../src/lib/validation";
import { getAdapter } from "../src/lib/platforms/registry";

const HANDLE = process.argv[2] ?? "crezicsaryan";
/** Deliberately impossible: no platform may ever call this one valid. */
const BOGUS = "zzz-devora-not-a-real-handle-9f3k2";

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

const OUTCOMES: VerificationOutcome[] = [
  "VERIFIED",
  "INVALID_PROFILE",
  "VERIFICATION_UNAVAILABLE",
  "RATE_LIMITED",
  "CONFIGURATION_ERROR",
  "NETWORK_ERROR",
];

/* ------------------------------------------------------------------ */
/* 1. Input resolution                                                 */
/* ------------------------------------------------------------------ */

function testInputResolution() {
  console.log("\nInput resolution (handle vs profile URL)");

  const bare = resolvePlatformInput("codechef", "crezicsaryan");
  check("a bare handle is accepted", bare.username === "crezicsaryan" && !bare.error);
  check(
    "a bare handle gets a canonical profile URL",
    bare.url === "https://codechef.com/users/crezicsaryan",
    bare.url ?? "(none)"
  );

  const pasted = resolvePlatformInput(
    "codechef",
    `https://www.codechef.com/users/${HANDLE}`
  );
  check(
    "the exact URL the user pasted is accepted",
    pasted.username === HANDLE && !pasted.error,
    JSON.stringify(pasted)
  );
  check(
    "the stored URL is not rewritten or truncated",
    pasted.url === `https://www.codechef.com/users/${HANDLE}`,
    pasted.url ?? "(none)"
  );

  const schemeless = resolvePlatformInput("leetcode", `leetcode.com/u/${HANDLE}`);
  check(
    "a scheme-less URL still works",
    schemeless.username === HANDLE && !schemeless.error,
    JSON.stringify(schemeless)
  );

  const wrongHost = resolvePlatformInput("codechef", `https://github.com/${HANDLE}`);
  check(
    "a URL on the wrong host is rejected",
    Boolean(wrongHost.error) && wrongHost.username === null,
    JSON.stringify(wrongHost)
  );

  const noHandle = resolvePlatformInput("codechef", "https://www.codechef.com/");
  check(
    "a URL with no username is rejected instead of guessed at",
    Boolean(noHandle.error) && noHandle.username === null,
    JSON.stringify(noHandle)
  );

  const long = resolvePlatformInput("codechef", "a".repeat(500));
  check("an over-long value is rejected, not truncated", Boolean(long.error));

  const badChars = resolvePlatformInput("codechef", "not a handle!");
  check("invalid handle characters are rejected", Boolean(badChars.error));

  // Never truncate URLs: the full path must survive validation.
  const deep = `https://www.codechef.com/users/${HANDLE}`;
  check(
    "validation preserves the whole URL string",
    resolvePlatformInput("codechef", deep).url === deep
  );

  // The exact URL shapes the platforms really serve. Regression guard: GfG's
  // live shape is /profile/{handle}, and reading the first path segment instead
  // of the one after "profile" stored the literal handle "profile".
  const realShapes: [PlatformKey, string][] = [
    ["github", `https://github.com/${HANDLE}`],
    ["leetcode", `https://leetcode.com/u/${HANDLE}/`],
    ["gfg", `https://www.geeksforgeeks.org/profile/${HANDLE}`],
    ["codechef", `https://www.codechef.com/users/${HANDLE}`],
    ["codeforces", `https://codeforces.com/profile/${HANDLE}`],
    ["hackerrank", `https://www.hackerrank.com/profile/${HANDLE}`],
  ];
  const pathWords = new Set(["profile", "users", "user", "u", "in"]);
  for (const [platform, url] of realShapes) {
    const resolved = resolvePlatformInput(platform, url);
    check(
      `${platform}: extracts the handle from its real profile URL`,
      resolved.username === HANDLE && !resolved.error,
      `got ${JSON.stringify(resolved.username)} (${resolved.error})`
    );
    check(
      `${platform}: never mistakes a path word for the handle`,
      resolved.username === null || !pathWords.has(resolved.username.toLowerCase()),
      `got ${resolved.username}`
    );
  }

  for (const meta of PLATFORMS) {
    const url = profileUrlFor(meta.key, "someone");
    check(
      `${meta.key}: canonical profile URL uses ${meta.profileHost}`,
      url.startsWith(`https://${meta.profileHost}/`),
      url
    );
  }
}

/* ------------------------------------------------------------------ */
/* 2. Adapter contract                                                 */
/* ------------------------------------------------------------------ */

function testAdapterContract() {
  console.log("\nAdapter contract");

  for (const meta of PLATFORMS) {
    const adapter = getAdapter(meta.key as PlatformKey);
    check(`${meta.key}: adapter is registered with a matching key`, adapter.key === meta.key);
    check(
      `${meta.key}: adapter label matches the UI metadata`,
      adapter.label === meta.label,
      `${adapter.label} vs ${meta.label}`
    );
  }

  check(
    "link-only platforms are exactly gfg and hackerrank",
    PLATFORMS.filter((p) => p.linkOnly).map((p) => p.key).join(",") === "gfg,hackerrank",
    PLATFORMS.filter((p) => p.linkOnly).map((p) => p.key).join(",")
  );
}

/* ------------------------------------------------------------------ */
/* 3. Live checks                                                      */
/* ------------------------------------------------------------------ */

async function verify(platform: PlatformKey, handle: string) {
  return getAdapter(platform).verify(handle);
}

async function testLive() {
  // Regression guard for shared adapter state: the verify ROUTE fills the
  // caller's handle/URL into the result object before responding. If an adapter
  // hands back a module-level constant instead of a fresh object, that write
  // sticks and the NEXT request sees this one's handle.
  console.log("\nAdapter result isolation");
  for (const platform of ["gfg", "hackerrank"] as PlatformKey[]) {
    const adapter = getAdapter(platform);
    const first = await adapter.verify(HANDLE);
    first.username = "leaked-handle";
    first.profileUrl = "https://leaked.example/";
    const second = await adapter.verify(BOGUS);
    check(
      `${platform}: verify() hands back a fresh result, not shared state`,
      second.username !== "leaked-handle" && second.profileUrl !== "https://leaked.example/",
      `username=${second.username} profileUrl=${second.profileUrl}`
    );
  }

  console.log(`\nLive verification (existing handle: ${HANDLE})`);

  const expectations: { platform: PlatformKey; expect: VerificationOutcome[] }[] = [
    { platform: "codechef", expect: ["VERIFIED"] },
    { platform: "leetcode", expect: ["VERIFIED", "VERIFICATION_UNAVAILABLE", "RATE_LIMITED"] },
    { platform: "codeforces", expect: ["VERIFIED", "INVALID_PROFILE"] },
    { platform: "github", expect: ["VERIFIED", "RATE_LIMITED", "CONFIGURATION_ERROR"] },
    { platform: "gfg", expect: ["VERIFICATION_UNAVAILABLE"] },
    { platform: "hackerrank", expect: ["VERIFICATION_UNAVAILABLE"] },
  ];

  for (const { platform, expect } of expectations) {
    const result = await verify(platform, HANDLE);
    check(
      `${platform}: ${HANDLE} -> ${result.outcome}`,
      OUTCOMES.includes(result.outcome) && expect.includes(result.outcome),
      `expected one of ${expect.join("/")} — message: ${result.message}`
    );
    check(
      `${platform}: outcome and exists agree`,
      result.exists === (result.outcome === "VERIFIED"),
      `outcome=${result.outcome} exists=${result.exists}`
    );
    // "We could not check" must NOT block the user: those outcomes are exactly
    // the ones where saving the link is the useful fallback. A genuinely
    // missing account (INVALID_PROFILE) must NOT be saveable as if it existed.
    if (
      result.outcome === "VERIFICATION_UNAVAILABLE" ||
      result.outcome === "RATE_LIMITED" ||
      result.outcome === "NETWORK_ERROR" ||
      result.outcome === "CONFIGURATION_ERROR"
    ) {
      check(
        `${platform}: an unverifiable result can still be saved as a link`,
        result.canSaveLink,
        `canSaveLink=${result.canSaveLink}`
      );
    }
    if (result.outcome === "INVALID_PROFILE") {
      check(
        `${platform}: a missing account cannot be saved as if it existed`,
        result.canSaveLink === false,
        `canSaveLink=${result.canSaveLink}`
      );
    }
  }

  console.log("\nLive verification (handle that does not exist)");
  for (const meta of PLATFORMS) {
    const result = await verify(meta.key as PlatformKey, BOGUS);
    check(
      `${meta.key}: a missing account is NEVER reported as verified`,
      result.exists === false,
      `outcome=${result.outcome} exists=${result.exists}`
    );
    check(
      `${meta.key}: outcome is classified`,
      OUTCOMES.includes(result.outcome),
      result.outcome
    );
  }

  console.log("\nPlatform statistics actually sourced");
  const codechef = await verify("codechef", HANDLE);
  if (codechef.outcome === "VERIFIED") {
    const stats = await getAdapter("codechef").fetchStats(HANDLE);
    check(
      "codechef: a real rating is read from the profile page",
      typeof stats.rating === "number" && stats.rating > 0,
      `rating=${stats.rating}`
    );
    check(
      "codechef: contest history is read",
      typeof stats.contests === "number" && stats.contests > 0,
      `contests=${stats.contests}`
    );
    check(
      "codechef: no solved count is invented",
      stats.solvedTotal === null,
      `solvedTotal=${stats.solvedTotal}`
    );
  } else {
    failed++;
    console.log(`  FAIL  codechef stats could not be tested — ${codechef.message}`);
  }

  const gfgStats = await getAdapter("gfg")
    .fetchStats("someone")
    .then(() => null)
    .catch((error: Error) => error);
  check(
    "gfg: refusing to sync is an explicit unsupported error, not a fake zero",
    gfgStats !== null && /public statistics|no public/i.test(gfgStats.message),
    gfgStats === null ? "no error thrown" : gfgStats.message
  );
}

async function main() {
  testInputResolution();
  testAdapterContract();
  await testLive();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\n[devora/verify-platforms] could not complete:", error);
  process.exitCode = 1;
});
