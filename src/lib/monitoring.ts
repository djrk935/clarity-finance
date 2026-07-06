/** Sentry event/breadcrumb scrubbing — pure functions (type-only Sentry
 *  imports, so the unit tests can exercise them without loading the SDK).
 *
 *  This is a finance app: dollar amounts ARE the sensitive payload, so
 *  anything that looks like money is redacted from messages, breadcrumbs,
 *  and URLs before an event leaves the process. Cookies and auth headers are
 *  dropped wholesale. */

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// "$1,240.50", "$ -35", "1240.50" (bare 2-decimal amounts) — but not plain
// integers like HTTP status codes or counts.
const AMOUNT_RE = /\$\s?-?[\d,]*\d(?:\.\d+)?|\b\d[\d,]*\.\d{2}\b/g;

export function scrubText(s: string): string {
  return s.replace(AMOUNT_RE, "[amount]");
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    for (const key of Object.keys(crumb.data)) {
      const v = crumb.data[key];
      // Strings can carry amounts (URLs, messages); numbers here are status
      // codes / durations and stay useful.
      if (typeof v === "string") crumb.data[key] = scrubText(v);
    }
  }
  return crumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) event.request.url = scrubText(event.request.url);
    if (typeof event.request.data === "string") {
      event.request.data = scrubText(event.request.data);
    } else {
      delete event.request.data;
    }
  }
  delete event.user;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  return event;
}
