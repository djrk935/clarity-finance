/** Persists each user's Plaid access token (one linked item per user).
 *
 *  Dual-mode so the same code works locally and in production:
 *   - DATABASE_URL starts with "postgres" → a Postgres table keyed by user
 *     (survives restarts on ephemeral hosts like DigitalOcean App Platform).
 *   - otherwise → .plaid/token-<userId>.json files (handy for local dev).
 *
 *  Balances/liabilities are fetched live from Plaid on each request;
 *  transactions are additionally persisted + synced incrementally in
 *  production (see data/txn-store.ts). */

import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";
import { safeIdSegment } from "./data/id-util";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");

/* ---------------- local file mode ---------------- */

const PLAID_DIR = path.join(process.cwd(), ".plaid");

function tokenFile(userId: string): string {
  return path.join(PLAID_DIR, `token-${safeIdSegment(userId)}.json`);
}

async function fileSave(
  userId: string,
  accessToken: string,
  itemId: string,
): Promise<void> {
  await fs.mkdir(PLAID_DIR, { recursive: true });
  await fs.writeFile(
    tokenFile(userId),
    JSON.stringify({ accessToken, itemId }, null, 2),
  );
}
async function fileRead(userId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(tokenFile(userId), "utf8");
    return (JSON.parse(raw).accessToken as string) ?? null;
  } catch {
    return null;
  }
}
async function fileClear(userId: string): Promise<void> {
  try {
    await fs.rm(tokenFile(userId), { force: true });
  } catch {
    /* already gone */
  }
}
async function fileFindByItemId(
  itemId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  try {
    const entries = await fs.readdir(PLAID_DIR);
    for (const name of entries) {
      const m = /^token-([A-Za-z0-9-]{1,64})\.json$/.exec(name);
      if (!m) continue;
      try {
        const parsed = JSON.parse(await fs.readFile(path.join(PLAID_DIR, name), "utf8"));
        if (parsed.itemId === itemId && typeof parsed.accessToken === "string") {
          return { userId: m[1], accessToken: parsed.accessToken };
        }
      } catch {
        /* skip malformed file */
      }
    }
  } catch {
    /* no dir yet */
  }
  return null;
}

/* ---------------- postgres mode ---------------- */

const globalForPool = globalThis as unknown as { pgPool?: Pool };

/** Shared Postgres pool (also used by the other stores). */
export function pool(): Pool {
  if (!globalForPool.pgPool) {
    const raw = process.env.DATABASE_URL ?? "";
    // pg v8 treats `sslmode=require` as `verify-full`, which rejects DO managed
    // Postgres' CA chain (SELF_SIGNED_CERT_IN_CHAIN) and overrides the ssl
    // option below. Strip sslmode so our explicit ssl config is authoritative.
    let connectionString = raw;
    try {
      const u = new URL(raw);
      u.searchParams.delete("sslmode");
      connectionString = u.toString();
    } catch {
      /* not a parseable URL — use as-is */
    }
    globalForPool.pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalForPool.pgPool;
}

async function pgEnsure(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS plaid_item (
       user_id TEXT PRIMARY KEY,
       access_token TEXT NOT NULL,
       item_id TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}
async function pgSave(
  userId: string,
  accessToken: string,
  itemId: string,
): Promise<void> {
  await pgEnsure();
  // Single-statement upsert: replacing a link can never leave the user with
  // no token (the failure mode the old delete-then-insert had to guard).
  await pool().query(
    `INSERT INTO plaid_item (user_id, access_token, item_id, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       item_id = EXCLUDED.item_id,
       created_at = now()`,
    [safeIdSegment(userId), accessToken, itemId],
  );
}
async function pgRead(userId: string): Promise<string | null> {
  await pgEnsure();
  const res = await pool().query<{ access_token: string }>(
    "SELECT access_token FROM plaid_item WHERE user_id = $1",
    [safeIdSegment(userId)],
  );
  return res.rows[0]?.access_token ?? null;
}
async function pgClear(userId: string): Promise<void> {
  await pgEnsure();
  await pool().query("DELETE FROM plaid_item WHERE user_id = $1", [
    safeIdSegment(userId),
  ]);
}
async function pgFindByItemId(
  itemId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  await pgEnsure();
  const res = await pool().query<{ user_id: string; access_token: string }>(
    "SELECT user_id, access_token FROM plaid_item WHERE item_id = $1",
    [itemId],
  );
  const row = res.rows[0];
  return row ? { userId: row.user_id, accessToken: row.access_token } : null;
}

/* ---------------- public API ---------------- */

export function savePlaidToken(
  userId: string,
  accessToken: string,
  itemId: string,
): Promise<void> {
  return isPostgres
    ? pgSave(userId, accessToken, itemId)
    : fileSave(userId, accessToken, itemId);
}
export function readPlaidToken(userId: string): Promise<string | null> {
  return isPostgres ? pgRead(userId) : fileRead(userId);
}
export function clearPlaidToken(userId: string): Promise<void> {
  return isPostgres ? pgClear(userId) : fileClear(userId);
}
/** Which user owns a Plaid item — how webhook payloads find their tenant. */
export function findUserByItemId(
  itemId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  return isPostgres ? pgFindByItemId(itemId) : fileFindByItemId(itemId);
}
