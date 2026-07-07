/** Per-user settings persistence. Dual-mode like token-store:
 *   - Postgres: `user_settings` table keyed by user_id (JSONB payload)
 *   - local dev: .plaid/settings-<userId>.json
 *
 *  normalize() is the single validation choke point — applied on every read
 *  AND write, so out-of-range / string / older-shape stored data can't slip
 *  past regardless of where it came from. */

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../token-store";
import { safeIdSegment } from "./id-util";
import { round2, sanitizeBudgets } from "../finance";
import { DEFAULT_SETTINGS, type Settings } from "../types";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const CACHE_TTL_MS = 30_000;
/** Cap on per-user cache entries; beyond it the stalest entry is evicted. */
const MAX_CACHE = 500;

// On globalThis so the cache is shared across Next's separate route/page
// bundles — a save through the API must be visible to page renders at once.
const g = globalThis as unknown as {
  claritySettingsCache?: Map<string, { value: Settings; at: number }>;
};

function cache(): Map<string, { value: Settings; at: number }> {
  return (g.claritySettingsCache ??= new Map());
}

function cachePut(userId: string, value: Settings): void {
  const c = cache();
  if (c.size >= MAX_CACHE && !c.has(userId)) {
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
  c.set(userId, { value, at: Date.now() });
}

/** Coerce + clamp one numeric field (strings, out-of-range, NaN all handled). */
function clampNum(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** The single source of truth for valid settings — applied on every read and
 *  write, so out-of-range / string / older-shape stored data can't slip past
 *  (the API is only one entry point; hand-edited files/DB rows are another). */
function normalize(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  const name = typeof s.userName === "string" ? s.userName.trim().slice(0, 40) : "";
  return {
    userName: name || DEFAULT_SETTINGS.userName,
    buffer: round2(clampNum(s.buffer, DEFAULT_SETTINGS.buffer, 0, 1_000_000)),
    savingsGoal: round2(clampNum(s.savingsGoal, DEFAULT_SETTINGS.savingsGoal, 0, 1_000_000)),
    extraDebtPayment: round2(
      clampNum(s.extraDebtPayment, DEFAULT_SETTINGS.extraDebtPayment, 0, 1_000_000),
    ),
    billWindowDays: Math.round(
      clampNum(s.billWindowDays, DEFAULT_SETTINGS.billWindowDays, 1, 60),
    ),
    budgets: sanitizeBudgets(s.budgets),
    // Strict === true so junk in a hand-edited row can't switch emails on.
    alertsEnabled: s.alertsEnabled === true,
    alertEmail: sanitizeEmail(s.alertEmail),
    alertSafeToSpendBelow: round2(
      clampNum(
        s.alertSafeToSpendBelow,
        DEFAULT_SETTINGS.alertSafeToSpendBelow,
        0,
        100_000,
      ),
    ),
  };
}

/** Minimal shape check — enough to stop obvious junk without rejecting valid
 *  addresses; the provider is the real validator. Invalid → "" (alerts off). */
function sanitizeEmail(v: unknown): string {
  if (typeof v !== "string") return "";
  const e = v.trim().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

/* ---------------- file mode ---------------- */

function settingsFile(userId: string): string {
  return path.join(process.cwd(), ".plaid", `settings-${safeIdSegment(userId)}.json`);
}

async function fileRead(userId: string): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsFile(userId), "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
async function fileWrite(userId: string, s: Settings): Promise<void> {
  const file = settingsFile(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(s, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS user_settings (
       user_id TEXT PRIMARY KEY,
       data JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}
async function pgRead(userId: string): Promise<Settings> {
  await pgEnsure();
  const res = await pool().query<{ data: unknown }>(
    "SELECT data FROM user_settings WHERE user_id = $1",
    [safeIdSegment(userId)],
  );
  return normalize(res.rows[0]?.data);
}
async function pgWrite(userId: string, s: Settings): Promise<void> {
  await pgEnsure();
  await pool().query(
    `INSERT INTO user_settings (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [safeIdSegment(userId), JSON.stringify(s)],
  );
}

/* ---------------- public API ---------------- */

export async function loadSettings(userId: string): Promise<Settings> {
  // Short TTL so a change made on another instance (Postgres mode) self-heals,
  // while still sparing a DB round-trip on rapid navigation.
  const hit = cache().get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = isPostgres ? await pgRead(userId) : await fileRead(userId);
  cachePut(userId, value);
  return value;
}

/** Merge a partial update over current settings, persist, and refresh cache. */
export async function saveSettings(
  userId: string,
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await loadSettings(userId);
  const next = normalize({ ...current, ...patch });
  if (isPostgres) await pgWrite(userId, next);
  else await fileWrite(userId, next);
  cachePut(userId, next);
  return next;
}
