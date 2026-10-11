"use client";

/**
 * Thin JSON client for the Devora backend.
 *
 * Everything the onboarding and dashboard UI needs goes through here, so error
 * handling and the "never trust a 200" rule live in one place.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { json?: unknown }
): Promise<ApiResult<T>> {
  try {
    const { json, ...rest } = init ?? {};
    const response = await fetch(input, {
      ...rest,
      method: rest.method ?? (json !== undefined ? "POST" : "GET"),
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body:
        json !== undefined
          ? JSON.stringify(json)
          : (rest.body as BodyInit | null | undefined),
      cache: "no-store",
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) {
      const message =
        (parsed as { error?: string }).error ||
        `Request failed (${response.status}).`;
      return { ok: false, error: message, status: response.status };
    }

    return { ok: true, data: parsed as T };
  } catch {
    return {
      ok: false,
      error: "Could not reach the Devora server. Check your connection.",
      status: 0,
    };
  }
}

/* ------------------------------- endpoints ------------------------------- */

export const api = {
  usernameAvailability: (username: string) =>
    apiFetch<{
      username: string;
      available: boolean;
      reason: "ok" | "taken" | "invalid" | "reserved";
      message: string;
    }>(`/api/onboarding/username?u=${encodeURIComponent(username)}`),

  onboardingDraft: () =>
    apiFetch<{
      profile: {
        displayName: string;
        username: string;
        college: string;
        bio: string;
        developerRole: string;
        location: string;
        avatarUrl: string;
        email: string;
        socials: Record<string, string>;
      };
      skills: string[];
      platforms: { platform: string; username: string; status: string }[];
      onboardingCompleted: boolean;
      onboardingStep: number;
      completion: { percent: number; items: { label: string; done: boolean }[] };
    }>("/api/onboarding/profile"),

  saveProfileStep: (payload: Record<string, unknown>) =>
    apiFetch<{ ok: true; username: string; completion: { percent: number } }>(
      "/api/onboarding/profile",
      { method: "PATCH", json: payload }
    ),

  /**
   * Upload a cropped profile photo. The database only ever stores the https
   * URL this returns — the image bytes live in object storage.
   */
  uploadProfilePhoto: (image: string) =>
    apiFetch<{ ok: true; url: string }>("/api/profile/photo", {
      method: "POST",
      json: { image },
    }),

  removeProfilePhoto: () =>
    apiFetch<{ ok: true }>("/api/profile/photo", { method: "DELETE" }),

  skillCatalogue: () =>
    apiFetch<{
      catalogue: { slug: string; name: string; category: string }[];
      selected: string[];
    }>("/api/onboarding/skills"),

  saveSkills: (skills: string[]) =>
    apiFetch<{ ok: true; skills: string[]; completion: { percent: number } }>(
      "/api/onboarding/skills",
      { method: "PATCH", json: { skills } }
    ),

  saveSocials: (payload: Record<string, string>) =>
    apiFetch<{ ok: true; completion: { percent: number } }>(
      "/api/onboarding/socials",
      { method: "PATCH", json: payload }
    ),

  platforms: () =>
    apiFetch<{
      platforms: {
        platform: string;
        username: string;
        status: string;
        syncStatus: string;
        syncError: string | null;
        lastSyncedAt: string | null;
        profileUrl: string | null;
      }[];
      /**
       * LinkedIn and the personal website are stored on the profile row, not as
       * platform accounts — they are links, never synchronized integrations.
       */
      profileLinks?: { linkedin: string; portfolio: string };
    }>("/api/platforms"),

  /**
   * Connect or save a link. `input` is a handle OR a profile URL; the server
   * decides which of the two outcomes applies and says so in `message`.
   */
  connectPlatform: (platform: string, input: string) =>
    apiFetch<{
      ok: true;
      platform: string;
      username: string | null;
      profileUrl: string | null;
      connectionStatus: string;
      verification: import("@/lib/types").VerificationOutcome;
      message: string;
    }>("/api/platforms", { method: "POST", json: { platform, input } }),

  verifyPlatform: (platform: string, input: string) =>
    apiFetch<
      import("@/lib/types").PlatformVerifyResult & { linkOnly: boolean }
    >(
      `/api/platforms/verify?platform=${encodeURIComponent(platform)}&u=${encodeURIComponent(input)}`
    ),

  syncPlatform: (platform: string) =>
    apiFetch<{
      ok: boolean;
      platform: string;
      error: string | null;
      connectionStatus: string;
      syncStatus: string;
      lastSyncedAt: string | null;
    }>(`/api/platforms/${platform}/sync`, { method: "POST" }),

  disconnectPlatform: (platform: string) =>
    apiFetch<{
      ok: true;
      connectionStatus: string;
      platforms: { platform: string; username: string; status: string }[];
    }>(`/api/platforms/${platform}`, { method: "DELETE" }),

  completeOnboarding: () =>
    apiFetch<{
      ok: true;
      onboardingCompleted: boolean;
      completion: { percent: number };
      syncingPlatforms: number;
    }>("/api/onboarding/complete", { method: "POST" }),

  dashboard: (range: string) =>
    apiFetch<import("@/lib/types").DashboardPayload>(
      `/api/dashboard?range=${encodeURIComponent(range)}`
    ),

  session: () =>
    apiFetch<{
      authenticated: boolean;
      /** Display name from the verified session; available without a database. */
      name?: string;
      avatarUrl?: string | null;
      onboardingCompleted: boolean;
      hasUsername?: boolean;
      onboardingStep?: number;
      redirectTo: string;
      warning?: string;
    }>("/api/session"),

  notifications: () =>
    apiFetch<{
      notifications: import("@/lib/types").NotificationRow[];
      unread: number;
    }>("/api/notifications"),

  markNotificationsRead: (ids?: string[]) =>
    apiFetch<{ ok: true }>("/api/notifications", {
      method: "PATCH",
      json: { ids },
    }),

  projects: () =>
    apiFetch<{ projects: import("@/lib/types").ProjectRow[] }>("/api/projects"),

  createProject: (payload: Record<string, unknown>) =>
    apiFetch<{ ok: true; id: string; completion: { percent: number } }>(
      "/api/projects",
      { method: "POST", json: payload }
    ),

  deleteProject: (id: string) =>
    apiFetch<{ ok: true; projects: import("@/lib/types").ProjectRow[] }>(
      `/api/projects/${id}`,
      { method: "DELETE" }
    ),

  settings: () =>
    apiFetch<{
      visibility: import("@/lib/types").Visibility;
      email: string;
      username: string;
      completion: { percent: number; items: { label: string; done: boolean }[] };
    }>("/api/settings"),

  saveSettings: (visibility: Partial<import("@/lib/types").Visibility>) =>
    apiFetch<{ ok: true; visibility: import("@/lib/types").Visibility }>(
      "/api/settings",
      { method: "PATCH", json: { visibility } }
    ),
};
