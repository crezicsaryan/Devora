/**
 * Adapter registry.
 *
 * The only place that knows which adapters exist. Everything downstream —
 * sync runner, API routes, UI metadata — looks up through here, which is what
 * keeps six platforms from becoming six systems.
 */

import "server-only";
import type { PlatformKey } from "@/lib/validation";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { githubAdapter } from "@/lib/platforms/adapters/github";
import { leetcodeAdapter } from "@/lib/platforms/adapters/leetcode";
import { codeforcesAdapter } from "@/lib/platforms/adapters/codeforces";
import { codechefAdapter } from "@/lib/platforms/adapters/codechef";
import { gfgAdapter } from "@/lib/platforms/adapters/gfg";
import { hackerrankAdapter } from "@/lib/platforms/adapters/hackerrank";

const ADAPTERS: Record<PlatformKey, PlatformAdapter> = {
  github: githubAdapter,
  leetcode: leetcodeAdapter,
  codeforces: codeforcesAdapter,
  codechef: codechefAdapter,
  gfg: gfgAdapter,
  hackerrank: hackerrankAdapter,
};

export function getAdapter(platform: PlatformKey): PlatformAdapter {
  return ADAPTERS[platform];
}

export function allAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTERS);
}

export function adapterSupportsOAuth(platform: PlatformKey): boolean {
  return ADAPTERS[platform]?.authType === "oauth";
}
