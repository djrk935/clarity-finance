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
       date TIMESTAMPTZ NOT NULL,
       description TEXT NOT NULL,
       amount DOUBLE PRECISION NOT NULL,
       category TEXT NOT NULL,
       account_id TEXT,
       pending BOOLEAN NOT NULL DEFAULT FALSE,
       transfer BOOLEAN NOT NULL DEFAULT FALSE
     )`,
  );
  await pool().query(
    `CREATE INDEX IF NOT EXISTS idx_plaid_txn_user_date
       ON plaid_transactions (user_id, date DESC)`,
  );
  await pool().query(
    `CREATE TABLE IF NOT EXISTS plaid_sync (
       user_id TEXT PRIMARY KEY,
       cursor TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

export async function readSyncCursor(userId: string): Promise<string | null> {
  await ensureTables();
  const res = await pool().query<{ cursor: string }>(
    "SELECT cursor FROM plaid_sync WHERE user_id = $1",
    [safeIdSegment(userId)],
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
      "SELECT cursor FROM plaid_sync WHERE user_id = $1",
      [uid],
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
          const o = j * 9;
          values.push(
            t.id,
            uid,
            t.date,
            t.description,
            t.amount,
            t.category,
            t.accountId ?? null,
            t.pending ?? false,
            t.transfer ?? false,
          );
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`;
        })
        .join(", ");
      await client.query(
        `INSERT INTO plaid_transactions
           (id, user_id, date, description, amount, category, account_id, pending, transfer)
         VALUES ${rows}
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
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
      `INSERT INTO plaid_sync (user_id, cursor, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
      [uid, cursor],
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

/** Wipe one user's stored transactions + cursor (bank disconnected or
 *  re-linked — the cursor and rows belong to the old item and must not mix
 *  with the new one). */
export async function clearTransactionStore(userId: string): Promise<void> {
  await ensureTables();
  const uid = safeIdSegment(userId);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM plaid_transactions WHERE user_id = $1", [uid]);
    await client.query("DELETE FROM plaid_sync WHERE user_id = $1", [uid]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
