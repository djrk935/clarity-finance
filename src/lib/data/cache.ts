/** Short-lived in-memory cache of the live Plaid pull.
 *
 *  Every page is dynamic and assembles from live Plaid data, so without this a
 *  tab switch re-hits Plaid 4× (accounts + transactions sync + liabilities +
 *  recurring) — seconds of latency per navigation. Caching the raw pull for a
 *  short TTL makes navigation instant while keeping data fresh; the Sync button
 *  and connect/disconnect bust it so changes show immediately.
 *
 *  Single-instance only (same caveat as the rate limiter). Keyed by access
 *  token so a re-link to a different bank never serves stale data. */

import type { RawData } from "../types";

const TTL_MS = 60_000;

// Kept on globalThis (like the pg pool): Next bundles route handlers and pages
// as separate module graphs, so a module-level variable would exist once per
// bundle — and the Sync/connect cache-bust from an API route would never reach
// the copy the pages read. globalThis is shared across bundles in one process.
const g = globalThis as unknown as {
  clarityRawCache?: { token: string; at: number; raw: RawData } | null;
};

export function getCachedRaw(token: string, now: number = Date.now()): RawData | null {
  const cached = g.clarityRawCache;
  if (!cached || cached.token !== token) return null;
  if (now - cached.at > TTL_MS) return null;
  return cached.raw;
}

export function setCachedRaw(token: string, raw: RawData, now: number = Date.now()): void {
  g.clarityRawCache = { token, at: now, raw };
}

/** Drop the cache so the next load re-fetches from Plaid. */
export function clearDataCache(): void {
  g.clarityRawCache = null;
}
