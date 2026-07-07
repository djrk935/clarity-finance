/** The data store — REAL DATA ONLY, per user.
 *
 *  Everything comes from the signed-in user's linked bank via Plaid (accounts,
 *  transactions, liabilities → debts, recurring → bills). When no bank is
 *  linked it returns empty and the UI shows a Connect prompt — no demo/seed
 *  data.
 *
 *  Balances/liabilities/recurring are fetched live on each request (behind a
 *  short per-user cache); transactions sync incrementally into Postgres in
 *  production (see txn-store.ts) so history accumulates for the reports. */

import { assembleDashboard, assembleSnapshot } from "./assemble";
import {
  getPlaidAccounts,
  getPlaidTransactions,
  getPlaidLiabilities,
  getPlaidRecurring,
} from "./plaid-source";
import { getCachedRaw, setCachedRaw } from "./cache";
import { loadSettings } from "./settings-store";
import { recordNetWorthSnapshot } from "./history-store";
import { runSpendingAlerts } from "../notify";
import { readAccessToken } from "../plaid";
import { cashflowFromTransactions, detectRecurringBills, netWorth } from "../finance";
import type { DashboardData, FinancialSnapshot, RawData } from "../types";

const EMPTY: RawData = {
  accounts: [],
  bills: [],
  debts: [],
  transactions: [],
  cashflow: [],
};

async function getRealRaw(userId: string, now: Date): Promise<RawData> {
  const token = await readAccessToken(userId);
  if (!token) return EMPTY; // nothing linked yet

  // Reuse the recent pull so tab switches don't re-hit Plaid every time.
  const hit = getCachedRaw(userId, token);
  if (hit) return hit;

  const accounts = await getPlaidAccounts(token);
  if (accounts.length === 0) return EMPTY;

  const [txnResult, debts, plaidBills] = await Promise.all([
    getPlaidTransactions(userId, token),
    getPlaidLiabilities(token),
    getPlaidRecurring(token),
  ]);
  const { transactions, degraded } = txnResult;

  // Prefer Plaid's recurring product when available; otherwise derive recurring
  // bills from the transaction history (that product is a gated add-on).
  const bills =
    plaidBills.length > 0 ? plaidBills : detectRecurringBills(transactions, now);

  const raw: RawData = {
    accounts,
    transactions,
    debts,
    bills,
    cashflow: cashflowFromTransactions(transactions, now),
  };
  // Don't pin a degraded (partial fallback) dataset for the full cache TTL —
  // let the next request retry the store right away.
  if (!degraded) {
    setCachedRaw(userId, token, raw);
    // Record today's net-worth point (one per UTC day) now that a full sync
    // completed. History is best-effort: never let it break the request.
    try {
      await recordNetWorthSnapshot(userId, netWorth(accounts, debts), now);
    } catch (err) {
      console.error("Net-worth snapshot failed:", err);
    }
    // Post-sync spending alerts (opt-in, de-duped) — same best-effort rule.
    try {
      const settings = await loadSettings(userId);
      await runSpendingAlerts(
        userId,
        assembleDashboard(raw, settings, now),
        settings,
        now,
      );
    } catch (err) {
      console.error("Spending alerts failed:", err);
    }
  }
  return raw;
}

export async function getDashboardData(
  userId: string,
  now: Date = new Date(),
): Promise<DashboardData> {
  const [raw, settings] = await Promise.all([
    getRealRaw(userId, now),
    loadSettings(userId),
  ]);
  return assembleDashboard(raw, settings, now);
}

export async function getSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<FinancialSnapshot> {
  const [raw, settings] = await Promise.all([
    getRealRaw(userId, now),
    loadSettings(userId),
  ]);
  return assembleSnapshot(raw, settings, now);
}
