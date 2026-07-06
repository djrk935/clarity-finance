/** Outbound email notifications (spending alerts, and the digest later).
 *
 *  Provider: Resend via plain fetch — no SDK dependency. Configured entirely
 *  through env vars (same rule as ANTHROPIC_API_KEY: never committed):
 *    RESEND_API_KEY    — API key from https://resend.com
 *    ALERT_EMAIL_FROM  — verified sender, e.g. "Clarity <alerts@yourdomain>"
 *
 *  Sending is double-gated: these env vars AND the user's Settings toggle
 *  (alertsEnabled + alertEmail) must both be set, so nothing ever goes out
 *  unless the user explicitly opted in. */

import { alertsToFire } from "./finance";
import { readSentAlertKeys, markAlertsSent } from "./data/alert-store";
import type { DashboardData, Settings } from "./types";

export function notifyConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM);
}

/** Send one plain-text email. Returns whether the provider accepted it. */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!notifyConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM,
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      // Status only — the response body may echo addresses/content.
      console.error(`Email send failed: ${res.status}`);
    }
    return res.ok;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

/** Post-sync hook: evaluate the alert conditions from the already-assembled
 *  dashboard numbers and email whatever hasn't been sent yet this month.
 *  De-dupe keys are only persisted after the provider accepts the send, so a
 *  failed send simply retries on a later sync. */
export async function runSpendingAlerts(
  data: DashboardData,
  settings: Settings,
  now: Date = new Date(),
): Promise<void> {
  if (!settings.alertsEnabled || !settings.alertEmail || !notifyConfigured()) {
    return;
  }

  const alerts = alertsToFire({
    budgets: data.budgets,
    safeToSpend: data.metrics.safeToSpend,
    safeToSpendBelow: settings.alertSafeToSpendBelow,
    month: now.toISOString().slice(0, 7), // UTC, same calendar as the numbers
    alreadySent: await readSentAlertKeys(),
  });
  if (alerts.length === 0) return;

  const subject =
    alerts.length === 1
      ? `Clarity: ${alerts[0].title}`
      : `Clarity: ${alerts.length} spending alerts`;
  const text =
    alerts.map((a) => `${a.title}\n${a.detail}`).join("\n\n") +
    "\n\n— Clarity · manage alerts in Settings";

  if (await sendEmail(settings.alertEmail, subject, text)) {
    await markAlertsSent(
      alerts.map((a) => a.key),
      now,
    );
  }
}
