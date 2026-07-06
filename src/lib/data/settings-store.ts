/** Persists the single user's settings (buffer, savings goal, extra debt
 *  payment, etc.). Dual-mode like the token store:
 *   - DATABASE_URL starts with "postgres" → a Postgres table (survives restarts
 *     on ephemeral hosts).
 *   - otherwise → a local .plaid/settings.json file (dev).
 *
 *  Cached in memory (busted on save) so reading settings on every page render
 *  doesn't add a round-trip. */

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../token-store";
import { round2, sanitizeBudgets } from "../finance";
import { DEFAULT_SETTINGS, type Settings } from "../types";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const SETTINGS_FILE = path.join(process.cwd(), ".plaid", "settings.json");
const CACHE_TTL_MS = 30_000;

// On globalThis so the cache is shared across Next's separate route/page
// bundles — a save through the API must be visible to page renders at once.
const g = globalThis as unknown as {
  claritySettingsCache?: { value: Settings; at: number } | null;
};

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

async function fileRead(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
async function fileWrite(s: Settings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
       data JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}
async function pgRead(): Promise<Settings> {
  await pgEnsure();
  const res = await pool().query<{ data: unknown }>(
    "SELECT data FROM app_settings WHERE id = 1",
  );
  return normalize(res.rows[0]?.data);
}
async function pgWrite(s: Settings): Promise<void> {
  await pgEnsure();
  await pool().query(
    `INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(s)],
  );
}

/* ---------------- public API ---------------- */

export async function loadSettings(): Promise<Settings> {
  // Short TTL so a change made on another instance (Postgres mode) self-heals,
  // while still sparing a DB round-trip on rapid navigation.
  const cache = g.claritySettingsCache;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const value = isPostgres ? await pgRead() : await fileRead();
  g.claritySettingsCache = { value, at: Date.now() };
  return value;
}

/** Merge a partial update over current settings, persist, and refresh cache. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = normalize({ ...current, ...patch });
  if (isPostgres) await pgWrite(next);
  else await fileWrite(next);
  g.claritySettingsCache = { value: next, at: Date.now() };
  return next;
}
