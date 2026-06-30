/** Minimal in-memory rate limiter for the single-password login.
 *
 *  The login gate is the only thing standing between the public internet and
 *  real bank data, so we throttle failed attempts on two axes:
 *   - per-IP: locks out one client after MAX_ATTEMPTS failures, and
 *   - global: a backstop cap across ALL clients. Because the per-IP key comes
 *     from a (partly client-influenced) forwarded header, the global cap is
 *     what guarantees brute force is bounded even if an attacker rotates IPs.
 *
 *  Caveat: state lives in process memory — it resets on restart and is
 *  per-instance. That's fine for a single-instance deploy (DigitalOcean basic
 *  App Platform); a multi-instance setup would need a shared store (e.g. the
 *  Postgres we already use, or Redis). */

interface Bucket {
  count: number;
  /** When the rolling attempt window resets. */
  resetAt: number;
  /** Locked out until this timestamp (0 = not locked). */
  lockedUntil: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 min rolling window
const MAX_ATTEMPTS = 8; // per-IP failures before lockout
const GLOBAL_MAX_ATTEMPTS = 30; // total failures (all IPs) before a global cooloff
const LOCK_MS = 15 * 60 * 1000; // lockout duration

const buckets = new Map<string, Bucket>();
const GLOBAL_KEY = "\0global";

/** Keep the map from growing without bound on a long-lived process. */
function prune(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, b] of buckets) {
    if (key !== GLOBAL_KEY && b.lockedUntil <= now && b.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function bump(key: string, max: number, now: number): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS, lockedUntil: 0 });
    return;
  }
  b.count += 1;
  if (b.count >= max) b.lockedUntil = now + LOCK_MS;
}

function lockedFor(key: string, now: number): number {
  const b = buckets.get(key);
  return b && b.lockedUntil > now ? Math.ceil((b.lockedUntil - now) / 1000) : 0;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/** Is a login attempt currently allowed for this key? (Read-only.) */
export function loginRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const wait = Math.max(lockedFor(GLOBAL_KEY, now), lockedFor(key, now));
  return wait > 0 ? { allowed: false, retryAfterSec: wait } : { allowed: true, retryAfterSec: 0 };
}

/** Record a failed attempt against both the per-IP key and the global cap. */
export function noteFailedLogin(key: string, now: number = Date.now()): void {
  prune(now);
  bump(key, MAX_ATTEMPTS, now);
  bump(GLOBAL_KEY, GLOBAL_MAX_ATTEMPTS, now);
}

/** Clear attempt history after a successful login. Only the owner (who knows
 *  the password) can reach this, so clearing the global counter is safe. */
export function resetLogin(key: string): void {
  buckets.delete(key);
  buckets.delete(GLOBAL_KEY);
}
