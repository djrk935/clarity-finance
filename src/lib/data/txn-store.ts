/** Postgres persistence for transactions + the Plaid sync cursor, per user.
 *
 *  Why: Plaid only returns ~90 days of history by default (and re-fetching
 *  everything on each request is slow), so we persist transactions and sync
 *  incrementally with a cursor. History then accumulates beyond what Plaid
 *  retains, making the weekly/monthly/yearly reports complete, and each
 *  request only fetches deltas (added / modified / removed).
 *
 *  Every row carries user_id and every statement filters on it — one user's
 *  sync can never read or touch another's rows.
 *
 *  Postgres-only (production): local dev without a postgres DATABASE_URL keeps
 *  the previous live-fetch behavior — see plaid-source.ts. */

import { pool } from "../token-store";
import { safeIdSegment } from "./id-util";
import type { Transaction } from "../types";

export function txnStoreEnabled(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres");
}

async function ensureTables(): Promise<void> {
  await pool().query(
    `CREATE TABLE IF NOT EXISTS plaid_transactions (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       item_id TEXT NOT NULL DEFAULT '',
       date TIMESTAMPTZ NOT NULL,
       description TEXT NOT NULL,
       amount DOUBLE PRECISION NOT NULL,
       category TEXT NOT NULL,
       account_id TEXT,
       pending BOOLEAN NOT NULL DEFAULT FALSE,
       transfer BOOLEAN NOT NULL DEFAULT FALSE
     )`,
  );
  // Tables created by the single-user app (or an older beta) predate the
  // user/item columns — add them in place. Legacy rows keep '' and are simply
  // invisible to every account (archived in place, never mixed in).
  await pool().query(
    `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`,
  );
  await pool().query(
    `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS item_id TEXT NOT NULL DEFAULT ''`,
  );
  await pool().query(
    `CREATE INDEX IF NOT EXISTS idx_plaid_txn_user_date
       ON plaid_transactions (user_id, date DESC)`,
  );
  // One sync cursor per linked bank (item), not per user.
  await pool().query(
    `CREATE TABLE IF NOT EXISTS plaid_item_sync (
       user_id TEXT NOT NULL,
       item_id TEXT NOT NULL,
       cursor TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (user_id, item_id)
     )`,
  );
}

export async function readSyncCursor(
  userId: string,
  itemId: string,
): Promise<string | null> {
  await ensureTables();
  const res = await pool().query<{ cursor: string }>(
    "SELECT cursor FROM plaid_item_sync WHERE user_id = $1 AND item_id = $2",
    [safeIdSegment(userId), itemId],
  );
  return res.rows[0]?.cursor ?? null;
}

const UPSERT_CHUNK = 500;

/** Apply one completed sync round atomically: upsert added+modified, delete
 *  removed, and advance the cursor — all or nothing, so a failure can't leave
 *  the cursor ahead of the data (the next sync simply retries the round).
 *
 *  Guarded by a compare-and-set on the user's cursor: the round only commits
 *  if the stored cursor still equals the one the walk started from. If the
 *  store was wiped (bank re-linked) or another sync won the race meanwhile,
 *  the whole round is discarded — so a stale in-flight sync can never write
 *  the old item's transactions under a new item. Returns whether it applied. */
export async function applySyncDelta(
  userId: string,
  itemId: string,
  upserts: Transaction[],
  removedIds: string[],
  cursor: string,
  expectedPriorCursor: string | null,
): Promise<boolean> {
  await ensureTables();
  const uid = safeIdSegment(userId);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");

    const cur = await client.query<{ cursor: string }>(
      "SELECT cursor FROM plaid_item_sync WHERE user_id = $1 AND item_id = $2",
      [uid, itemId],
    );
    const stored = cur.rows[0]?.cursor ?? null;
    if (stored !== expectedPriorCursor) {
      await client.query("ROLLBACK");
      return false;
    }

    for (let i = 0; i < upserts.length; i += UPSERT_CHUNK) {
      const chunk = upserts.slice(i, i + UPSERT_CHUNK);
      const values: unknown[] = [];
      const rows = chunk
        .map((t, j) => {
          const o = j * 10;
          values.push(
            t.id,
            uid,
            itemId,
            t.date,
            t.description,
            t.amount,
            t.category,
            t.accountId ?? null,
            t.pending ?? false,
            t.transfer ?? false,
          );
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`;
        })
        .join(", ");
      await client.query(
        `INSERT INTO plaid_transactions
           (id, user_id, item_id, date, description, amount, category, account_id, pending, transfer)
         VALUES ${rows}
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           item_id = EXCLUDED.item_id,
           date = EXCLUDED.date,
           description = EXCLUDED.description,
           amount = EXCLUDED.amount,
           category = EXCLUDED.category,
           account_id = EXCLUDED.account_id,
           pending = EXCLUDED.pending,
           transfer = EXCLUDED.transfer`,
        values,
      );
    }

    // Parameterized IN list (chunked) rather than = ANY($1): identical result
    // on real Postgres, and it keeps the delete path covered by the pg-mem
    // integration test, where ANY(array-param) silently matches nothing.
    for (let i = 0; i < removedIds.length; i += UPSERT_CHUNK) {
      const chunk = removedIds.slice(i, i + UPSERT_CHUNK);
      const params = chunk.map((_, j) => `$${j + 2}`).join(", ");
      await client.query(
        `DELETE FROM plaid_transactions WHERE user_id = $1 AND id IN (${params})`,
        [uid, ...chunk],
      );
    }

    await client.query(
      `INSERT INTO plaid_item_sync (user_id, item_id, cursor, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, item_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
      [uid, itemId, cursor],
    );

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** One user's stored transactions, newest first (bounded to keep memory sane). */
export async function readStoredTransactions(
  userId: string,
  limit = 25_000,
): Promise<Transaction[]> {
  await ensureTables();
  const res = await pool().query<{
    id: string;
    date: Date;
    description: string;
    amount: number;
    category: string;
    account_id: string | null;
    pending: boolean;
    transfer: boolean;
  }>(
    `SELECT id, date, description, amount, category, account_id, pending, transfer
     FROM plaid_transactions WHERE user_id = $1 ORDER BY date DESC LIMIT $2`,
    [safeIdSegment(userId), limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    description: r.description,
    amount: r.amount,
    category: r.category,
    accountId: r.account_id ?? undefined,
    pending: r.pending,
    transfer: r.transfer,
  }));
}

/** Wipe ONE bank's stored transactions + cursor (that item was disconnected —
 *  its rows must not linger, and the other banks' rows must not be touched). */
export async function clearItemTransactions(
  userId: string,
  itemId: string,
): Promise<void> {
  await ensureTables();
  const uid = safeIdSegment(userId);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM plaid_transactions WHERE user_id = $1 AND item_id = $2",
      [uid, itemId],
    );
    await client.query(
      "DELETE FROM plaid_item_sync WHERE user_id = $1 AND item_id = $2",
      [uid, itemId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Wipe ALL of one user's stored transactions + cursors (full disconnect). */
export async function clearTransactionStore(userId: string): Promise<void> {
  await ensureTables();
  const uid = safeIdSegment(userId);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM plaid_transactions WHERE user_id = $1", [uid]);
    await client.query("DELETE FROM plaid_item_sync WHERE user_id = $1", [uid]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
