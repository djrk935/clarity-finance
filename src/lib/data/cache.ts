/** Short-lived in-memory cache of the live Plaid pull, per user.
 *
 *  Every page is dynamic and assembles from live Plaid data, so without this a
 *  tab switch re-hits Plaid 4× (accounts + transactions sync + liabilities +
 *  recurring) — seconds of latency per navigation. Caching the raw pull for a
 *  short TTL makes navigation instant while keeping data fresh; the Sync button
 *  and connect/disconnect bust it so changes show immediately.
 *
 *  Entries are keyed by userId and validated against that user's access token,
 *  so a re-link to a different bank never serves stale data — and one user's
 *  cache can never be handed to another. Single-instance only (same caveat as
 *  the rate limiter). */

import type { RawData } from "../types";

const TTL_MS = 60_000;
/** Hard cap on cached users per instance — beyond this the stalest entry goes. */
const MAX_ENTRIES = 200;

interface Entry {
  token: string;
  at: number;
  raw: RawData;
}

// Kept on globalThis (like the pg pool): Next bundles route handlers and pages
// as separate module graphs, so a module-level variable would exist once per
// bundle — and a cache-bust from an API route would never reach the copy the
// pages read. globalThis is shared across bundles in one process.
const g = globalThis as unknown as {
  clarityRawCache?: Map<string, Entry>;
};

function cache(): Map<string, Entry> {
  return (g.clarityRawCache ??= new Map());
}

export function getCachedRaw(
  userId: string,
  token: string,
  now: number = Date.now(),
): RawData | null {
  const hit = cache().get(userId);
  if (!hit || hit.token !== token) return null;
  if (now - hit.at > TTL_MS) return null;
  return hit.raw;
}

export function setCachedRaw(
  userId: string,
  token: string,
  raw: RawData,
  now: number = Date.now(),
): void {
  const c = cache();
  if (c.size >= MAX_ENTRIES && !c.has(userId)) {
    let oldest: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of c) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldest = k;
      }
    }
    if (oldest) c.delete(oldest);
  }
  c.set(userId, { token, at: now, raw });
}

/** Drop one user's cache (or every user's) so the next load re-fetches. */
export function clearDataCache(userId?: string): void {
  if (userId) cache().delete(userId);
  else cache().clear();
}
