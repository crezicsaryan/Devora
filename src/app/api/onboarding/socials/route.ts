/**
 * PATCH /api/onboarding/socials — save optional social links.
 *
 * Every field is optional. Each value is validated as an http(s) URL with the
 * expected host, so `javascript:` payloads can never reach the database.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  updateProfile,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import {
  validateOptionalEmail,
  validateUrl,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as Record<string, unknown>;

    const checks = [
      { key: "linkedin", host: "linkedin.com", label: "LinkedIn" },
      { key: "github", host: "github.com", label: "GitHub" },
      { key: "twitter", host: "x.com", label: "X" },
    ] as const;

    const socials: Record<string, string> = {};
    const errors: string[] = [];

    for (const check of checks) {
      const raw = body[check.key];
      if (typeof raw !== "string" || raw.trim() === "") {
        socials[check.key] = "";
        continue;
      }
      const result = validateUrl(raw, {
        requiredHost: check.host,
        label: check.label,
      });
      if (result.error || !result.url) {
        errors.push(result.error ?? `${check.label} link is invalid.`);
        continue;
      }
      socials[check.key] = result.url;
    }

    // Portfolio and website are free-form, but still must be real http(s) URLs.
    const portfolioRaw = body.portfolio ?? body.website;
    const portfolio = validateUrl(portfolioRaw, { label: "Portfolio" });
    if (portfolio.error) errors.push(portfolio.error);

    const email = validateOptionalEmail(body.email);
    if (email.error) errors.push(email.error);

    if (errors.length > 0) {
      return errorResponse(new Error(errors[0]), errors[0]);
    }

    // Twitter/x.com and Twitter/twitter.com both resolve to x.com above.
    const twitter =
      socials.twitter ||
      (() => {
        const legacy = validateUrl(body.twitter, { label: "X" });
        return legacy.url ?? "";
      })();

    await updateProfile(user.id, {
      socials: {
        linkedin: socials.linkedin ?? "",
        github: socials.github ?? "",
        twitter,
        portfolio: portfolio.url ?? "",
        website: portfolio.url ?? "",
      },
      email: email.value || undefined,
    });

    const completion = await computeProfileCompletion(user.id);
    return okResponse({ ok: true, completion });
  } catch (error) {
    return errorResponse(error, "Could not save your links.");
  }
}
