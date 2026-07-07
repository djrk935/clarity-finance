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
import { listUserIds } from "@/lib/data/user-store";
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
  if (!notifyConfigured()) {
    // 200 so the cron doesn't retry-storm; body says why nothing was sent.
    return Response.json({ ok: false, reason: "email provider not configured" });
  }

  // Walk every user; only opted-in ones (alerts toggle + email) get a digest.
  // Counts only in the response — never per-user data on this public-ish route.
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const userId of await listUserIds()) {
    try {
      const settings = await loadSettings(userId);
      if (!settings.alertsEnabled || !settings.alertEmail) {
        skipped += 1;
        continue;
      }
      const { subject, text } = renderDigest(await getSnapshot(userId));
      if (await sendEmail(settings.alertEmail, subject, text)) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error("Digest failed for a user:", err);
    }
  }
  return Response.json({ ok: failed === 0, sent, skipped, failed });
}

// Support both verbs — external cron services commonly only do GET.
export const GET = run;
export const POST = run;
