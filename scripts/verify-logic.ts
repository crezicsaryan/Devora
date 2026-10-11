/**
 * Logic verification for the pure (network-free, DB-free) parts of the
 * onboarding + dashboard pipeline.
 *
 * Run with:  npx tsx scripts/verify-logic.ts
 *
 * These are the rules that must hold regardless of what any external platform
 * returns, so they are worth asserting directly.
 */

import {
  DEVELOPER_ROLES,
  PLATFORM_KEYS,
  firstIssue,
  isValidUsername,
  normalizeUsername,
  profileStepSchema,
  sanitizeMultiline,
  sanitizeText,
  skillsStepSchema,
  socialStepSchema,
  validateAvatar,
  validateOptionalEmail,
  validateUrl,
} from "../src/lib/validation";
import { LINK_SPECS, parseProfileLink, parseProfileLinks } from "../src/lib/profile-links";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

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

function section(title: string) {
  console.log(`\n${title}`);
}

/* --------------------------- username rules --------------------------- */

section("Username");
check("accepts a normal handle", isValidUsername("aryan_dev"));
check("accepts hyphens", isValidUsername("aryan-dev"));
check("accepts digits", isValidUsername("dev123"));
check("rejects spaces", !isValidUsername("aryan dev"));
check("rejects dots", !isValidUsername("aryan.dev"));
check("rejects too short (2)", !isValidUsername("ab"));
check("rejects too long (31)", !isValidUsername("a".repeat(31)));
check("rejects empty", !isValidUsername(""));
check("rejects unicode", !isValidUsername("aryan_dev_ü"));

check("normalizes case", normalizeUsername("Aryan_Dev") === "aryan_dev");
check("normalizes surrounding space", normalizeUsername("  Aryan_Dev  ") === "aryan_dev");
// normalizeUsername is the lenient helper used for lookups: it strips
// disallowed characters rather than failing. The strict rule lives in
// profileStepSchema, which rejects instead of mangling (asserted below).
check("strips disallowed characters", normalizeUsername("a b") === "ab");
check("strips dots", normalizeUsername("john.doe") === "johndoe");
check("strips unicode", normalizeUsername("üser") === "ser");

/* ----------------------------- URL rules ------------------------------ */

section("URL validation");
check("accepts https", validateUrl("https://example.com").error === null);
check("accepts http", validateUrl("http://example.com").error === null);
check("adds scheme when missing", validateUrl("example.com").url === "https://example.com/");
check("rejects javascript: scheme", validateUrl("javascript:alert(1)").error !== null);
check("rejects data: scheme", validateUrl("data:text/html,<script>").error !== null);
check("rejects bare word (no dot)", validateUrl("notaurl").error !== null);
check("rejects empty -> no error, no url", (() => {
  const r = validateUrl("");
  return r.error === null && r.url === null;
})());
check(
  "enforces requiredHost (linkedin)",
  validateUrl("https://evil.com/x", { requiredHost: "linkedin.com" }).error !== null
);
check(
  "accepts correct requiredHost (linkedin)",
  validateUrl("https://www.linkedin.com/in/aryan", { requiredHost: "linkedin.com" }).error === null
);
check(
  "requiredHost is not fooled by a lookalike suffix",
  validateUrl("https://notlinkedin.com/x", { requiredHost: "linkedin.com" }).error !== null
);

section("Email");
check("accepts a valid address", validateOptionalEmail("a@b.com").error === null);
check("allows empty (optional)", validateOptionalEmail("").error === null);
check("rejects a malformed address", validateOptionalEmail("a@b").error !== null);

/* ---------------------------- sanitizing ------------------------------ */

section("Sanitizing");
check(
  "strips control characters from single-line text",
  !/[\u0000-\u001f]/.test(sanitizeText("he\u0000llo\u0007", 80))
);
check(
  "strips control characters from multiline text but keeps newlines",
  (() => {
    const out = sanitizeMultiline("line1\u0000\nline2", 200);
    return !out.includes("\u0000") && out.includes("\n");
  })()
);

/* ------------------------------ avatars ------------------------------- */

section("Avatar payloads");
// validateAvatar returns { value, error } — an empty error means accepted.
// Image binaries are NEVER stored in the database: data: URLs are rejected and
// the client must upload to object storage first, then persist the https URL.
check(
  "accepts an https URL",
  validateAvatar("https://cdn.example.com/a.png").error === null
);
check(
  "rejects a data URL (binaries are uploaded to storage, not the DB)",
  validateAvatar("data:image/jpeg;base64," + "A".repeat(64)).error !== null
);
check(
  "rejects a png data URL",
  validateAvatar("data:image/png;base64," + "A".repeat(64)).error !== null
);
check(
  "rejects a data URL with a non-image mime",
  validateAvatar("data:text/html;base64,AAAA").error !== null
);
check(
  "rejects an http (non-https) URL",
  validateAvatar("http://example.com/a.png").error !== null
);
check(
  "treats empty as no photo (not an error)",
  validateAvatar("").error === null && validateAvatar("").value === null
);

/* --------------------------- step schemas ----------------------------- */

section("Profile step schema");
{
  const ok = profileStepSchema.safeParse({
    displayName: "Aryan Sharma",
    username: "aryan_dev",
    bio: "Backend dev",
    developerRole: DEVELOPER_ROLES[1],
    location: "Bengaluru",
    avatarUrl: "",
  });
  check("accepts a well-formed step 1 payload", ok.success);

  const badName = profileStepSchema.safeParse({ displayName: "", username: "aryan_dev" });
  check("rejects an empty display name", !badName.success);

  const badRole = profileStepSchema.safeParse({
    displayName: "Aryan",
    username: "aryan_dev",
    developerRole: "Astronaut",
  });
  check("rejects a role outside the allowed list", !badRole.success);

  const badUser = profileStepSchema.safeParse({
    displayName: "Aryan",
    username: "aryan dev",
  });
  check("rejects a username with a space", !badUser.success);

  // The point of the strict rule: an invalid handle is refused, never silently
  // rewritten into a different handle the user did not choose.
  const dotted = profileStepSchema.safeParse({ displayName: "Aryan", username: "john.doe" });
  check("rejects (does not silently rewrite) a dotted username", !dotted.success);

  const upper = profileStepSchema.safeParse({ displayName: "Aryan", username: "Aryan_Dev" });
  check(
    "lower-cases a valid mixed-case username",
    upper.success && upper.data.username === "aryan_dev"
  );
}

section("Skills step schema");
{
  const ok = skillsStepSchema.safeParse({ skills: ["Java", "TypeScript"] });
  check("accepts a normal skill list", ok.success);

  const dedup = skillsStepSchema.safeParse({
    skills: ["Java", "java", "Java", "TypeScript"],
  });
  check(
    "de-duplicates case-insensitively",
    dedup.success && dedup.data.skills.length === 2,
    dedup.success ? `got ${dedup.data.skills.length}` : "parse failed"
  );

  const tooMany = skillsStepSchema.safeParse({
    skills: Array.from({ length: 61 }, (_, i) => `skill-${i}`),
  });
  check("rejects more than the maximum", !tooMany.success);

  const blanks = skillsStepSchema.safeParse({ skills: ["", "   ", "Java"] });
  check(
    "drops blank entries",
    blanks.success && blanks.data.skills.length === 1,
    blanks.success ? `got ${blanks.data.skills.length}` : "parse failed"
  );
}

section("Social step schema");
{
  const ok = socialStepSchema.safeParse({
    linkedin: "https://linkedin.com/in/aryan",
    github: "https://github.com/aryan",
    twitter: "",
    portfolio: "https://aryan.dev",
    website: "",
    email: "aryan@example.com",
  });
  check(
    "accepts a valid socials payload",
    ok.success &&
      ok.data.linkedin.error === null &&
      ok.data.github.error === null &&
      ok.data.portfolio.error === null &&
      ok.data.email.error === null,
    ok.success ? "" : firstIssue(ok.error)
  );

  const wrongHost = socialStepSchema.safeParse({ linkedin: "https://facebook.com/aryan" });
  check(
    "flags a LinkedIn field pointing elsewhere",
    wrongHost.success && wrongHost.data.linkedin.error !== null
  );

  const okAllEmpty = socialStepSchema.safeParse({});
  check(
    "accepts an entirely empty payload (all optional)",
    okAllEmpty.success && okAllEmpty.data.linkedin.error === null
  );

  const javascript = socialStepSchema.safeParse({ website: "javascript:alert(1)" });
  check(
    "rejects a javascript: URL",
    javascript.success && javascript.data.website.error !== null
  );
}

section("Platform registry");
check("has six platforms", PLATFORM_KEYS.length === 6);
check(
  "keys are unique",
  new Set(PLATFORM_KEYS).size === PLATFORM_KEYS.length
);
check("includes github", PLATFORM_KEYS.includes("github"));

/* ------------------------- profile link parsing ------------------------ */

section("Profile links — host validation");
{
  // Wrong host must be rejected, including lookalike domains.
  check("rejects a lookalike host", parseProfileLink("github", "https://notgithub.com/x").error !== null);
  check("rejects a wrong host", parseProfileLink("leetcode", "https://github.com/x").error !== null);
  check("rejects javascript: payloads", parseProfileLink("portfolio", "javascript:alert(1)").error !== null);
  check("rejects data: payloads", parseProfileLink("portfolio", "data:text/html,x").error !== null);
  check("rejects a bare word", parseProfileLink("portfolio", "notaurl").error !== null);
  check(
    "accepts a www. subdomain",
    parseProfileLink("linkedin", "https://www.linkedin.com/in/aryan").error === null
  );
}

section("Profile links — handle extraction");
{
  check(
    "github: /username",
    parseProfileLink("github", "https://github.com/aryan").username === "aryan"
  );
  check(
    "leetcode: /u/username",
    parseProfileLink("leetcode", "https://leetcode.com/u/aryan").username === "aryan"
  );
  check(
    "leetcode: bare /username still works",
    parseProfileLink("leetcode", "https://leetcode.com/aryan").username === "aryan"
  );
  check(
    // GfG's live URL is /profile/{handle}; /user/{handle} is the legacy shape.
    // Both must yield the handle, and neither may yield the path segment.
    "gfg: /profile/username",
    parseProfileLink("gfg", "https://geeksforgeeks.org/profile/aryan").username === "aryan" &&
      parseProfileLink("gfg", "https://geeksforgeeks.org/user/aryan").username === "aryan"
  );
  check(
    "codechef: /users/username",
    parseProfileLink("codechef", "https://www.codechef.com/users/aryan").username === "aryan"
  );
  check(
    "codeforces: /profile/username",
    parseProfileLink("codeforces", "https://codeforces.com/profile/aryan").username === "aryan"
  );
  check(
    "hackerrank: /profile/username",
    parseProfileLink("hackerrank", "https://www.hackerrank.com/profile/aryan").username === "aryan"
  );
  check(
    "linkedin: /in/username",
    parseProfileLink("linkedin", "https://www.linkedin.com/in/aryan").username === "aryan"
  );
  check(
    "a URL with no handle still saves (username null, no error)",
    (() => {
      const r = parseProfileLink("linkedin", "https://www.linkedin.com/company/acme");
      return r.error === null && r.url !== "" && r.username === null;
    })()
  );
  check(
    "a scheme-less URL is normalised",
    parseProfileLink("github", "github.com/aryan").url === "https://github.com/aryan"
  );
}

section("Profile links — optional fields");
{
  const empty = parseProfileLink("github", "");
  check("empty is valid and stores nothing", empty.error === null && empty.url === "");

  const allEmpty = parseProfileLinks({});
  check("an entirely empty form produces no errors", allEmpty.errors.length === 0);
  check("and returns a row for every field", allEmpty.links.length === LINK_SPECS.length);

  const mixed = parseProfileLinks({
    github: "https://github.com/aryan",
    linkedin: "https://facebook.com/aryan",
  });
  check("collects the error from only the bad field", mixed.errors.length === 1);
  check(
    "and still returns the good link",
    mixed.links.find((l) => l.key === "github")?.url === "https://github.com/aryan"
  );
}

section("Profile links — storage targets");
{
  const platformBacked = LINK_SPECS.filter((s) => s.storage.kind === "platform");
  check("six links map onto platform_accounts", platformBacked.length === 6);
  check(
    "linkedin and portfolio map onto the profile row",
    LINK_SPECS.filter((s) => s.storage.kind === "profile").length === 2
  );
  check(
    "every spec has a distinct key",
    new Set(LINK_SPECS.map((s) => s.key)).size === LINK_SPECS.length
  );
  check(
    "no spec points at a logo file that does not exist",
    LINK_SPECS.every((s) => s.logo === "" || existsSync(join(ROOT, "public", s.logo.replace(/^\//, ""))))
  );
}

/* ------------------------------ summary ------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
