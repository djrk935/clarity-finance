/** Persists each user's linked Plaid items — one row per linked BANK, so a
 *  user can have Chase and Bank of America connected at the same time.
 *
 *  Dual-mode so the same code works locally and in production:
 *   - DATABASE_URL starts with "postgres" → a Postgres table keyed by item
 *     (survives restarts on ephemeral hosts like DigitalOcean App Platform).
 *   - otherwise → .plaid/items-<userId>.json files (handy for local dev).
 *
 *  Balances/liabilities are fetched live from Plaid on each request;
 *  transactions are additionally persisted + synced incrementally per item in
 *  production (see data/txn-store.ts). */

import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";
import { safeIdSegment } from "./data/id-util";

const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");

export interface PlaidItem {
  itemId: string;
  accessToken: string;
  /** Bank name from Link ("Chase", "Bank of America") — labels the UI. */
  institution: string;
  createdAt: string;
}

/* ---------------- local file mode ---------------- */

const PLAID_DIR = path.join(process.cwd(), ".plaid");

function itemsFile(userId: string): string {
  return path.join(PLAID_DIR, `items-${safeIdSegment(userId)}.json`);
}

async function fileReadAll(userId: string): Promise<PlaidItem[]> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(itemsFile(userId), "utf8"));
    return Array.isArray(raw) ? (raw as PlaidItem[]) : [];
  } catch {
    return [];
  }
}

async function fileWriteAll(userId: string, items: PlaidItem[]): Promise<void> {
  await fs.mkdir(PLAID_DIR, { recursive: true });
  await fs.writeFile(itemsFile(userId), JSON.stringify(items, null, 2));
}

async function fileFindByItemId(
  itemId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  try {
    const entries = await fs.readdir(PLAID_DIR);
    for (const name of entries) {
      const m = /^items-([A-Za-z0-9-]{1,64})\.json$/.exec(name);
      if (!m) continue;
      try {
        const items: unknown = JSON.parse(
          await fs.readFile(path.join(PLAID_DIR, name), "utf8"),
        );
        if (!Array.isArray(items)) continue;
        const hit = (items as PlaidItem[]).find((i) => i.itemId === itemId);
        if (hit) return { userId: m[1], accessToken: hit.accessToken };
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
    `CREATE TABLE IF NOT EXISTS plaid_items (
       item_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       access_token TEXT NOT NULL,
       institution TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  await pool().query(
    `CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items (user_id)`,
  );
}

/* ---------------- public API ---------------- */

/** Add (or re-key) one linked bank. Re-exchanging the same item just updates
 *  its token — it never disturbs the user's other banks. */
export async function savePlaidItem(
  userId: string,
  item: { itemId: string; accessToken: string; institution?: string },
): Promise<void> {
  const institution = (item.institution ?? "").trim().slice(0, 60) || "Linked bank";
  if (isPostgres) {
    await pgEnsure();
    await pool().query(
      `INSERT INTO plaid_items (item_id, user_id, access_token, institution, created_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (item_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         access_token = EXCLUDED.access_token,
         institution = EXCLUDED.institution`,
      [item.itemId, safeIdSegment(userId), item.accessToken, institution],
    );
    return;
  }
  const items = await fileReadAll(userId);
  const next = items.filter((i) => i.itemId !== item.itemId);
  next.push({
    itemId: item.itemId,
    accessToken: item.accessToken,
    institution,
    createdAt: new Date().toISOString(),
  });
  await fileWriteAll(userId, next);
}

/** Every bank this user has linked, oldest first. */
export async function listPlaidItems(userId: string): Promise<PlaidItem[]> {
  if (isPostgres) {
    await pgEnsure();
    const res = await pool().query<{
      item_id: string;
      access_token: string;
      institution: string;
      created_at: Date;
    }>(
      `SELECT item_id, access_token, institution, created_at
       FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
      [safeIdSegment(userId)],
    );
    return res.rows.map((r) => ({
      itemId: r.item_id,
      accessToken: r.access_token,
      institution: r.institution,
      createdAt: r.created_at.toISOString(),
    }));
  }
  return fileReadAll(userId);
}

/** Remove ONE linked bank — scoped by user so nobody can unlink another
 *  tenant's item by guessing ids. */
export async function removePlaidItem(
  userId: string,
  itemId: string,
): Promise<void> {
  if (isPostgres) {
    await pgEnsure();
    await pool().query(
      "DELETE FROM plaid_items WHERE user_id = $1 AND item_id = $2",
      [safeIdSegment(userId), itemId],
    );
    return;
  }
  const items = await fileReadAll(userId);
  await fileWriteAll(
    userId,
    items.filter((i) => i.itemId !== itemId),
  );
}

/** Which user owns a Plaid item — how webhook payloads find their tenant. */
export async function findUserByItemId(
  itemId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  if (isPostgres) {
    await pgEnsure();
    const res = await pool().query<{ user_id: string; access_token: string }>(
      "SELECT user_id, access_token FROM plaid_items WHERE item_id = $1",
      [itemId],
    );
    const row = res.rows[0];
    return row ? { userId: row.user_id, accessToken: row.access_token } : null;
  }
  return fileFindByItemId(itemId);
}
