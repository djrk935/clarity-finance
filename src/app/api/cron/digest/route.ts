/** Scheduled digest — hit by a cron (DO scheduled job or external) on
 *  whatever cadence the user wants. Intentionally NOT behind requireApiAuth
 *  (crons have no session cookie); instead it requires a shared secret in the
 *  Authorization header, compared in constant time like the login HMAC check.
 *  The secret must never ride in the URL query string (URLs land in logs).
 *
 *  Sending is additionally gated by the same user opt-in as spending alerts:
 *  the Settings toggle + email, and the provider env vars. Wiring up the cron
 *  is the digest's own opt-in — no separate setting. */

import { timingSafeEqual } from "crypto";
import { getSnapshot } from "@/lib/data/store";
import { loadSettings } from "@/lib/data/settings-store";
import { renderDigest } from "@/lib/digest";
import { notifyConfigured, sendEmail } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  // Unset or flimsy secret → the endpoint stays disabled entirely.
  if (secret.length < 16) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await loadSettings();
  if (!settings.alertsEnabled || !settings.alertEmail || !notifyConfigured()) {
    // 200 so the cron doesn't retry-storm; body says why nothing was sent.
    return Response.json({ ok: false, reason: "email alerts not enabled" });
  }

  const { subject, text } = renderDigest(await getSnapshot());
  const sent = await sendEmail(settings.alertEmail, subject, text);
  return Response.json({ ok: sent });
}

// Support both verbs — external cron services commonly only do GET.
export const GET = run;
export const POST = run;
