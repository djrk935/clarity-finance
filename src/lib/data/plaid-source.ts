/** Account data from a linked Plaid item. Returns [] when Plaid isn't
 *  configured or no bank is linked, so callers can merge unconditionally.
 *  Balances/liabilities/recurring are fetched live; transactions sync
 *  incrementally into Postgres when available (see txn-store.ts).
 *
 *  Callers resolve the user's access token once (store.ts) and pass it in —
 *  these functions never guess whose data they're fetching. */

import type { PlaidApi, Transaction as PlaidTxn, AccountBase } from "plaid";
import { getPlaidClient } from "../plaid";
import { toTransaction, titleCase } from "./plaid-map";
import {
  txnStoreEnabled,
  readSyncCursor,
  applySyncDelta,
  readStoredTransactions,
} from "./txn-store";
import type { Account, AccountType, Transaction, Debt, Bill } from "../types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toAccount(a: AccountBase): Account | null {
  const id = `plaid_${a.account_id}`;
  const name = a.name ?? a.official_name ?? "Linked account";
  const institution = "Plaid (linked)";
  const type = String(a.type);
  const subtype = String(a.subtype ?? "");

  if (type === "depository") {
    const mapped: AccountType = subtype === "checking" ? "checking" : "savings";
    return {
      id,
      name,
      institution,
      type: mapped,
      balance: round2(a.balances.current ?? a.balances.available ?? 0),
    };
  }

  if (type === "credit") {
    return {
      id,
      name,
      institution,
      type: "credit",
      balance: round2(a.balances.current ?? 0),
      creditLimit: a.balances.limit ?? undefined,
    };
  }

  // Skip loan / investment / other for now (don't want to inflate liquidity).
  return null;
}

export async function getPlaidAccounts(token: string | null): Promise<Account[]> {
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.accountsBalanceGet({ access_token: token });
    return res.data.accounts
      .map(toAccount)
      .filter((a): a is Account => a !== null);
  } catch (err) {
    console.error("Plaid accounts fetch failed:", err);
    return [];
  }
}

interface SyncDelta {
  added: PlaidTxn[];
  modified: PlaidTxn[];
  /** Our-domain ids ("plaid_<txn_id>") of removed transactions. */
  removed: string[];
  cursor: string;
  /** True when the walk reached has_more=false. Per Plaid's contract a cursor
   *  must only be persisted from a completed walk — the pre-pagination cursor
   *  is the documented recovery point for MUTATION_DURING_PAGINATION. */
  completed: boolean;
}

/** One full cursor walk against /transactions/sync, gathering all pages of
 *  added / modified / removed. Throws on API errors (including Plaid's
 *  MUTATION_DURING_PAGINATION) — callers keep the old cursor and retry on the
 *  next request, which is safe because applying a delta is idempotent. */
async function syncFromPlaid(
  client: PlaidApi,
  token: string,
  cursor: string | null,
  maxPages: number,
): Promise<SyncDelta> {
  const added: PlaidTxn[] = [];
  const modified: PlaidTxn[] = [];
  const removed: string[] = [];
  let next: string | undefined = cursor ?? undefined;
  let finalCursor = cursor ?? "";
  let completed = false;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await client.transactionsSync({
      access_token: token,
      cursor: next,
      count: 500,
    });
    added.push(...res.data.added);
    modified.push(...res.data.modified);
    removed.push(...res.data.removed.map((r) => `plaid_${r.transaction_id}`));
    next = res.data.next_cursor;
    finalCursor = res.data.next_cursor;
    if (!res.data.has_more) {
      completed = true;
      break;
    }
  }
  return { added, modified, removed, cursor: finalCursor, completed };
}

export interface TransactionsResult {
  transactions: Transaction[];
  /** True when serving a partial live fetch because the store was unavailable
   *  — callers should avoid caching a degraded dataset for the full TTL. */
  degraded: boolean;
}

export async function getPlaidTransactions(
  userId: string,
  token: string | null,
): Promise<TransactionsResult> {
  const client = getPlaidClient();
  if (!token || !client) return { transactions: [], degraded: false };

  // Without postgres (local dev): fresh live fetch each request, as before.
  if (!txnStoreEnabled()) {
    try {
      const { added } = await syncFromPlaid(client, token, null, 5);
      return { transactions: added.map(toTransaction), degraded: false };
    } catch (err) {
      console.error("Plaid transactions fetch failed:", err);
      return { transactions: [], degraded: true };
    }
  }

  // Persistent path: pull only the delta since the stored cursor, apply it
  // atomically, then serve from the store. History accumulates beyond Plaid's
  // ~90-day default, so weekly/monthly/yearly reports stay complete.
  try {
    const cursor = await readSyncCursor(userId);
    // 500 pages × 500 txns is far beyond any personal account — purely a
    // runaway guard. An incomplete walk is never persisted (cursor contract).
    const delta = await syncFromPlaid(client, token, cursor, 500);
    if (!delta.completed) {
      console.error(
        "Plaid sync page cap hit with has_more=true — not persisting; will resume from the prior cursor",
      );
    } else if (delta.cursor && delta.cursor !== (cursor ?? "")) {
      // Dedupe: the same transaction can appear in both added and modified in
      // one walk; keep one row per id with the modified (newer) state winning,
      // so a duplicate id can't abort the multi-row upsert.
      const byId = new Map<string, PlaidTxn>();
      for (const t of delta.added) byId.set(t.transaction_id, t);
      for (const t of delta.modified) byId.set(t.transaction_id, t);
      const applied = await applySyncDelta(
        userId,
        [...byId.values()].map(toTransaction),
        delta.removed,
        delta.cursor,
        cursor,
      );
      if (!applied) {
        console.warn("Plaid sync round discarded (cursor changed underneath — wipe or concurrent sync)");
      }
    }
  } catch (err) {
    // Sync trouble (Plaid or DB) → serve what we already have; next request retries.
    console.error("Plaid incremental sync failed; serving stored data:", err);
  }

  try {
    return { transactions: await readStoredTransactions(userId), degraded: false };
  } catch (err) {
    console.error("Transaction store read failed; falling back to live fetch:", err);
    try {
      const { added } = await syncFromPlaid(client, token, null, 5);
      return { transactions: added.map(toTransaction), degraded: true };
    } catch (err2) {
      console.error("Plaid transactions fetch failed:", err2);
      return { transactions: [], degraded: true };
    }
  }
}

/** Real debts from Plaid Liabilities (credit cards, student loans, mortgages).
 *  Requires the Liabilities product on the linked item. */
export async function getPlaidLiabilities(token: string | null): Promise<Debt[]> {
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.liabilitiesGet({ access_token: token });
    const accountById = new Map(res.data.accounts.map((a) => [a.account_id, a]));
    const balanceOf = (id: string | null | undefined): number =>
      id ? round2(Math.abs(accountById.get(id)?.balances.current ?? 0)) : 0;

    const liabilities = res.data.liabilities;
    const debts: Debt[] = [];

    for (const c of liabilities?.credit ?? []) {
      const acct = c.account_id ? accountById.get(c.account_id) : undefined;
      const current = balanceOf(c.account_id) || round2(c.last_statement_balance ?? 0);
      const purchaseApr =
        (c.aprs ?? []).find((a) => String(a.apr_type) === "purchase_apr")?.apr_percentage ??
        (c.aprs ?? [])[0]?.apr_percentage ??
        0;
      debts.push({
        id: `plaid_credit_${c.account_id}`,
        name: acct?.name ?? "Credit card",
        originalBalance: current, // revolving — no original principal
        currentBalance: current,
        apr: round2(purchaseApr),
        minPayment: round2(c.minimum_payment_amount ?? Math.max(25, current * 0.02)),
      });
    }

    for (const s of liabilities?.student ?? []) {
      const acct = s.account_id ? accountById.get(s.account_id) : undefined;
      const current = balanceOf(s.account_id);
      debts.push({
        id: `plaid_student_${s.account_id}`,
        name: acct?.name ?? "Student loan",
        originalBalance: round2(s.origination_principal_amount ?? current),
        currentBalance: current,
        apr: round2(s.interest_rate_percentage ?? 0),
        minPayment: round2(s.minimum_payment_amount ?? 0),
      });
    }

    for (const m of liabilities?.mortgage ?? []) {
      const acct = m.account_id ? accountById.get(m.account_id) : undefined;
      const current = balanceOf(m.account_id);
      debts.push({
        id: `plaid_mortgage_${m.account_id}`,
        name: acct?.name ?? "Mortgage",
        originalBalance: round2(m.origination_principal_amount ?? current),
        currentBalance: current,
        apr: round2(m.interest_rate?.percentage ?? 0),
        minPayment: round2(m.next_monthly_payment ?? 0),
      });
    }

    return debts;
  } catch (err) {
    console.error("Plaid liabilities fetch failed:", err);
    return [];
  }
}

/** Real recurring bills from Plaid Recurring Transactions (outflow streams). */
export async function getPlaidRecurring(token: string | null): Promise<Bill[]> {
  const client = getPlaidClient();
  if (!token || !client) return [];

  try {
    const res = await client.transactionsRecurringGet({ access_token: token });
    const bills: Bill[] = [];
    for (const s of res.data.outflow_streams ?? []) {
      if (s.is_active === false) continue;
      const amount = round2(
        Math.abs(s.average_amount?.amount ?? s.last_amount?.amount ?? 0),
      );
      if (amount <= 0) continue;
      const nextDate = s.predicted_next_date ?? s.last_date;
      if (!nextDate) continue;
      const pfc = s.personal_finance_category?.primary;
      bills.push({
        id: `plaid_rec_${s.stream_id}`,
        name: s.merchant_name ?? s.description ?? "Recurring payment",
        amount,
        dueDate: new Date(nextDate).toISOString(),
        category: pfc ? titleCase(pfc) : "Recurring",
      });
    }
    return bills;
  } catch (err) {
    console.error("Plaid recurring fetch failed:", err);
    return [];
  }
}
