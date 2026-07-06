/** Browser-side Sentry wiring (Next client instrumentation). Enabled only
 *  when NEXT_PUBLIC_SENTRY_DSN is set; same scrubbing rules as the server —
 *  no session replay, no tracing, no PII, no dollar amounts. */

import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./lib/monitoring";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
