/**
 * GET /api/platforms/github/callback
 *
 * Completes the GitHub OAuth handshake, then links the account and kicks off
 * the first sync in the background.
 *
 * What is deliberately NOT here:
 *   - no access token in the redirect URL, cookies, or response body
 *   - no token in localStorage (tokens never reach the browser at all)
 *   - no secret in a NEXT_PUBLIC_* variable
 *
 * The token is written to public.platform_oauth_tokens, which has RLS enabled
 * and zero policies, so only the service role can read it.
 */

import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import {
  createNotification,
  recomputeAggregates,
  recordActivityEvent,
  upsertPlatformAccount,
} from "@/lib/db/repository";
import { getSessionUser } from "@/lib/server-auth";
import {
  exchangeCodeForToken,
  githubAdapter,
} from "@/lib/platforms/adapters/github";
import { PlatformError } from "@/lib/platforms/types";
import { queueAndProcessAll } from "@/lib/platforms/sync-runner";

export const dynamic = "force-dynamic";

function backTo(origin: string, next: string, params: Record<string, string>) {
  const url = new URL(next.startsWith("/") ? next : "/profile/create", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const denied = searchParams.get("error");

  // The user declined on GitHub's side.
  if (denied || !code || !state) {
    return backTo(origin, "/profile/create", {
      platform_error: "github_denied",
    });
  }

  const user = await getSessionUser();
  if (!user) {
    // Session expired mid-handshake — the state is still consumed below.
    return NextResponse.redirect(`${origin}/login?next=/onboarding%3Fstep%3D3`);
  }

  // Consume the state token. Single use: the delete is the guard.
  const stateRow = await queryOne<{ user_id: string; next: string | null }>(
    `delete from public.oauth_states
      where state = $1 and provider = 'github' and expires_at > now()
      returning user_id, next`,
    [state]
  );

  if (!stateRow || stateRow.user_id !== user.id) {
    return backTo(origin, "/profile/create", {
      platform_error: "github_state_invalid",
    });
  }

  const next = stateRow.next ?? "/profile/create";
  const redirectUri = new URL("/api/platforms/github/callback", origin).toString();

  try {
    const token = await exchangeCodeForToken(code, redirectUri);

    // 1. Resolve the GitHub identity from the grant.
    const identity = await githubAdapter.connect({
      userId: user.id,
      accessToken: token.accessToken,
    });
    if (!identity) {
      throw new PlatformError("not_found", "GitHub did not return an account.");
    }

    // 2. Store the linked account.
    const accountId = await upsertPlatformAccount({
      userId: user.id,
      platform: "github",
      username: identity.username,
      externalUserId: identity.externalUserId,
      profileUrl: identity.profileUrl,
      avatarUrl: identity.avatarUrl,
      authType: "oauth",
      connectionStatus: "connected",
    });

    // 3. Store credentials server-side only. Never selected by any API route.
    await query(
      `insert into public.platform_oauth_tokens
         (platform_account_id, user_id, platform, access_token, refresh_token, scope, token_type, expires_at)
       values ($1,$2,'github',$3,$4,$5,'bearer',$6)
       on conflict (platform_account_id) do update set
         access_token = excluded.access_token,
         refresh_token = coalesce(excluded.refresh_token, public.platform_oauth_tokens.refresh_token),
         scope = excluded.scope,
         expires_at = excluded.expires_at`,
      [
        accountId,
        user.id,
        token.accessToken,
        token.refreshToken,
        token.scope,
        token.expiresAt,
      ]
    );

    await recordActivityEvent({
      userId: user.id,
      kind: "github_sync",
      title: "GitHub connected",
      detail: `@${identity.username}`,
      href: identity.profileUrl,
    });
    await createNotification({
      userId: user.id,
      kind: "platform",
      title: "GitHub connected",
      body: "Your GitHub profile, repositories and contributions are now linked.",
      href: "/dashboard/platforms",
    });

    // 4. First sync — queued and processed after the redirect so the user is
    //    not blocked on external API latency (PRD section 10).
    await queueAndProcessAll(user.id).catch(async () => {
      await recomputeAggregates(user.id).catch(() => undefined);
    });

    return backTo(origin, next, {
      platform_connected: "github",
      platform_handle: identity.username,
    });
  } catch (error) {
    const message =
      error instanceof PlatformError
        ? error.message
        : "GitHub authorization could not be completed.";

    await recordActivityEvent({
      userId: user.id,
      kind: "system",
      title: "GitHub connection failed",
      detail: message,
      href: "/dashboard/platforms",
    }).catch(() => undefined);

    return backTo(origin, next, {
      platform_error: "github_failed",
      platform_message: message.slice(0, 160),
    });
  }
}
