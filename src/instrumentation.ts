/** Server-side Sentry wiring (Next instrumentation hook). Enabled only when
 *  SENTRY_DSN is set — without it this is a no-op, so local dev and forks
 *  without a Sentry project run untouched. Amount/PII scrubbing lives in
 *  lib/monitoring.ts. */

import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./lib/monitoring";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0, // errors only — no performance payloads with data
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRequestError = Sentry.captureRequestError;
