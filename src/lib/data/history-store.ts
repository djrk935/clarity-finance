/** Persists daily net-worth snapshots so /reports can chart the trend.
 *
 *  Dual-mode like token-store/settings-store:
 *   - DATABASE_URL starts with "postgres" → net_worth_snapshot table
 *   - otherwise → a local .plaid/history.json file (local dev)
 *
 *  At most one snapshot per UTC calendar day: recording again on the same day
 *  overwrites that day's row, so the series stays one-point-per-day no matter
 *  how often syncs run. */

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../token-store";
import { safeIdSegment } from "./id-util";
import { round2 } from "../finance";
import type { NetWorthPoint } from "../types";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
function historyFile(userId: string): string {
  return path.join(process.cwd(), ".plaid", `history-${safeIdSegment(userId)}.json`);
}
/** ~2 years of daily points — plenty for the chart, bounded for memory. */
const MAX_POINTS = 730;

/** UTC calendar day, matching the finance layer's date convention. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Validation choke point: keep only well-formed points, one per date,
 *  oldest → newest, bounded. Applied on every read and write. */
function normalize(raw: unknown): NetWorthPoint[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, NetWorthPoint>();
  for (const entry of raw) {
    const e = (entry ?? {}) as Partial<NetWorthPoint>;
    if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const liquidity = Number(e.liquidity);
    const debt = Number(e.debt);
    const net = Number(e.net);
    if (![liquidity, debt, net].every(Number.isFinite)) continue;
    byDate.set(e.date, {
      date: e.date,
      liquidity: round2(liquidity),
      debt: round2(debt),
      net: round2(net),
    });
  }
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-MAX_POINTS);
}

/* ---------------- local file mode ---------------- */

async function fileRead(userId: string): Promise<NetWorthPoint[]> {
  try {
    return normalize(JSON.parse(await fs.readFile(historyFile(userId), "utf8")));
  } catch {
    return [];
  }
}

async function fileRecord(userId: string, p: NetWorthPoint): Promise<void> {
  // normalize dedupes by date with the last entry winning → upsert on the day.
  const points = normalize([...(await fileRead(userId)), p]);
  const file = historyFile(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(points, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS net_worth_snapshot (
       id SERIAL PRIMARY KEY,
       user_id TEXT NOT NULL,
       captured_at DATE NOT NULL,
       liquidity DOUBLE PRECISION NOT NULL,
       debt DOUBLE PRECISION NOT NULL,
       net DOUBLE PRECISION NOT NULL
     )`,
  );
  // Single-user-era tables: add the user column (legacy rows keep '' and stay
  // out of every account) and swap the one-snapshot-per-day-GLOBAL uniqueness
  // for per-user — otherwise the second user's snapshot each day would fail.
  await pool().query(
    `ALTER TABLE net_worth_snapshot ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`,
  );
  await pool().query(
    `ALTER TABLE net_worth_snapshot DROP CONSTRAINT IF EXISTS net_worth_snapshot_captured_at_key`,
  );
  // Named unique index (not a table constraint) so fresh and migrated
  // databases converge on the same shape; ON CONFLICT matches it by columns.
  await pool().query(
    `CREATE UNIQUE INDEX IF NOT EXISTS net_worth_user_day
       ON net_worth_snapshot (user_id, captured_at)`,
  );
}

async function pgRecord(userId: string, p: NetWorthPoint): Promise<void> {
  await pgEnsure();
  await pool().query(
    `INSERT INTO net_worth_snapshot (user_id, captured_at, liquidity, debt, net)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, captured_at) DO UPDATE SET
       liquidity = EXCLUDED.liquidity,
       debt = EXCLUDED.debt,
       net = EXCLUDED.net`,
    [safeIdSegment(userId), p.date, p.liquidity, p.debt, p.net],
  );
}

async function pgRead(userId: string, limit: number): Promise<NetWorthPoint[]> {
  await pgEnsure();
  // to_char keeps the date a plain string — pg would otherwise parse DATE into
  // a local-midnight Date, shifting the day west of UTC.
  const res = await pool().query<{
    date: string;
    liquidity: number;
    debt: number;
    net: number;
  }>(
    `SELECT to_char(captured_at, 'YYYY-MM-DD') AS date, liquidity, debt, net
     FROM (
       SELECT * FROM net_worth_snapshot WHERE user_id = $1
       ORDER BY captured_at DESC LIMIT $2
     ) recent
     ORDER BY captured_at ASC`,
    [safeIdSegment(userId), limit],
  );
  return normalize(res.rows);
}

/* ---------------- public API ---------------- */

/** Upsert today's snapshot for one user (one row per UTC day). Callers treat
 *  history as best-effort — catch failures rather than breaking the request. */
export async function recordNetWorthSnapshot(
  userId: string,
  s: { liquidity: number; debt: number; net: number },
  now: Date = new Date(),
): Promise<void> {
  const point: NetWorthPoint = {
    date: utcDay(now),
    liquidity: round2(s.liquidity),
    debt: round2(s.debt),
    net: round2(s.net),
  };
  if (isPostgres) await pgRecord(userId, point);
  else await fileRecord(userId, point);
}

/** One user's snapshot series, oldest → newest (the most recent `limit` days). */
export async function readNetWorthHistory(
  userId: string,
  limit = MAX_POINTS,
): Promise<NetWorthPoint[]> {
  return isPostgres
    ? pgRead(userId, limit)
    : (await fileRead(userId)).slice(-limit);
}
