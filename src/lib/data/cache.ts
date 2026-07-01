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

let cached: { token: string; at: number; raw: RawData } | null = null;

export function getCachedRaw(token: string, now: number = Date.now()): RawData | null {
  if (!cached || cached.token !== token) return null;
  if (now - cached.at > TTL_MS) return null;
  return cached.raw;
}

export function setCachedRaw(token: string, raw: RawData, now: number = Date.now()): void {
  cached = { token, at: now, raw };
}

/** Drop the cache so the next load re-fetches from Plaid. */
export function clearDataCache(): void {
  cached = null;
}
