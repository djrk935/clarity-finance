/** Persists which alert keys have already been emailed, so the same alert
 *  fires once — not on every sync. Keys embed the month (see alertsToFire),
 *  so pruning by age keeps the set tiny without ever un-arming a live month.
 *
 *  Dual-mode like the other stores: Postgres table in production,
 *  .plaid/alerts.json locally. */

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../token-store";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
const ALERTS_FILE = path.join(process.cwd(), ".plaid", "alerts.json");
/** Keys re-arm monthly, so anything older than ~3 months is dead weight. */
const PRUNE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/* ---------------- local file mode ---------------- */

/** { [key]: sentAtIso } — validated on read (choke point for this store). */
async function fileRead(): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(ALERTS_FILE, "utf8"));
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

async function fileMark(keys: string[], now: Date): Promise<void> {
  const entries = await fileRead();
  for (const k of keys) entries[k] = now.toISOString();
  const cutoff = now.getTime() - PRUNE_AFTER_MS;
  for (const [k, v] of Object.entries(entries)) {
    if (new Date(v).getTime() < cutoff) delete entries[k];
  }
  await fs.mkdir(path.dirname(ALERTS_FILE), { recursive: true });
  await fs.writeFile(ALERTS_FILE, JSON.stringify(entries, null, 2));
}

/* ---------------- postgres mode ---------------- */

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS alert_log (
       key TEXT PRIMARY KEY,
       sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

async function pgRead(): Promise<string[]> {
  await pgEnsure();
  const res = await pool().query<{ key: string }>("SELECT key FROM alert_log");
  return res.rows.map((r) => r.key);
}

async function pgMark(keys: string[], now: Date): Promise<void> {
  await pgEnsure();
  for (const key of keys) {
    await pool().query(
      `INSERT INTO alert_log (key, sent_at) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET sent_at = EXCLUDED.sent_at`,
      [key, now.toISOString()],
    );
  }
  await pool().query("DELETE FROM alert_log WHERE sent_at < $1", [
    new Date(now.getTime() - PRUNE_AFTER_MS).toISOString(),
  ]);
}

/* ---------------- public API ---------------- */

/** Every alert key that has already been sent (recent months only). */
export async function readSentAlertKeys(): Promise<string[]> {
  return isPostgres ? pgRead() : Object.keys(await fileRead());
}

/** Record keys as sent — call only after the send actually succeeded. */
export async function markAlertsSent(
  keys: string[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return;
  if (isPostgres) await pgMark(keys, now);
  else await fileMark(keys, now);
}
