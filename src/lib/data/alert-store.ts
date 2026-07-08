/** Persists which alert keys have already been emailed per user, so the same
 *  alert fires once — not on every sync. Keys embed the month (see
 *  alertsToFire), so pruning by age keeps the set tiny without ever un-arming
 *  a live month.
 *
 *  Dual-mode like the other stores: Postgres table in production,
 *  .plaid/alerts-<userId>.json locally. */

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../token-store";
import { safeIdSegment } from "./id-util";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
function alertsFile(userId: string): string {
  return path.join(process.cwd(), ".plaid", `alerts-${safeIdSegment(userId)}.json`);
}
/** Keys re-arm monthly, so anything older than ~3 months is dead weight. */
const PRUNE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/* ---------------- local file mode ---------------- */

/** { [key]: sentAtIso } — validated on read (choke point for this store). */
async function fileRead(userId: string): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(alertsFile(userId), "utf8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === "string" && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function fileMark(userId: string, keys: string[], now: Date): Promise<void> {
  const entries = await fileRead(userId);
  for (const k of keys) entries[k] = now.toISOString();
  const cutoff = now.getTime() - PRUNE_AFTER_MS;
  for (const [k, v] of Object.entries(entries)) {
    if (new Date(v).getTime() < cutoff) delete entries[k];
  }
  const file = alertsFile(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(entries, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS alert_log (
       user_id TEXT NOT NULL,
       key TEXT NOT NULL,
       sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (user_id, key)
     )`,
  );
  // Single-user-era table (PRIMARY KEY on key alone): add the user column so
  // reads don't fail. Marking still works per (user_id, key) upsert on fresh
  // tables; on a legacy table a cross-user key collision is rejected by the
  // old PK and simply retries — alerts are opt-in and best-effort by design.
  await pool().query(
    `ALTER TABLE alert_log ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`,
  );
}

async function pgRead(userId: string): Promise<string[]> {
  await pgEnsure();
  const res = await pool().query<{ key: string }>(
    "SELECT key FROM alert_log WHERE user_id = $1",
    [safeIdSegment(userId)],
  );
  return res.rows.map((r) => r.key);
}

async function pgMark(userId: string, keys: string[], now: Date): Promise<void> {
  await pgEnsure();
  const uid = safeIdSegment(userId);
  for (const key of keys) {
    await pool().query(
      `INSERT INTO alert_log (user_id, key, sent_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET sent_at = EXCLUDED.sent_at`,
      [uid, key, now.toISOString()],
    );
  }
  await pool().query("DELETE FROM alert_log WHERE sent_at < $1", [
    new Date(now.getTime() - PRUNE_AFTER_MS).toISOString(),
  ]);
}

/* ---------------- public API ---------------- */

/** Every alert key one user has already been sent (recent months only). */
export async function readSentAlertKeys(userId: string): Promise<string[]> {
  return isPostgres ? pgRead(userId) : Object.keys(await fileRead(userId));
}

/** Record keys as sent — call only after the send actually succeeded. */
export async function markAlertsSent(
  userId: string,
  keys: string[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return;
  if (isPostgres) await pgMark(userId, keys, now);
  else await fileMark(userId, keys, now);
}
