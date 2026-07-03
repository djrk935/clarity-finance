/** The data store — REAL DATA ONLY.
 *
 *  Everything comes from the linked bank via Plaid (accounts, transactions,
 *  liabilities → debts, recurring → bills). When no bank is linked it returns
 *  empty and the UI shows a Connect prompt — no demo/seed data.
 *
 *  Data is fetched live from Plaid on each request; only the access token is
 *  persisted (see token-store.ts). */

import { assembleDashboard, assembleSnapshot } from "./assemble";
import {
  getPlaidAccounts,
  getPlaidTransactions,
  getPlaidLiabilities,
  getPlaidRecurring,
} from "./plaid-source";
import { getCachedRaw, setCachedRaw } from "./cache";
import { loadSettings } from "./settings-store";
import { readAccessToken } from "../plaid";
import { cashflowFromTransactions, detectRecurringBills } from "../finance";
import type { DashboardData, FinancialSnapshot, RawData } from "../types";

const EMPTY: RawData = {
  accounts: [],
  bills: [],
  debts: [],
  transactions: [],
  cashflow: [],
};

async function getRealRaw(now: Date): Promise<RawData> {
  const token = await readAccessToken();
  if (!token) return EMPTY; // nothing linked yet

  // Reuse the recent pull so tab switches don't re-hit Plaid every time.
  const hit = getCachedRaw(token);
  if (hit) return hit;

  const accounts = await getPlaidAccounts();
  if (accounts.length === 0) return EMPTY;

  const [transactions, debts, plaidBills] = await Promise.all([
    getPlaidTransactions(),
    getPlaidLiabilities(),
    getPlaidRecurring(),
  ]);

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
  setCachedRaw(token, raw);
  return raw;
}

export async function getDashboardData(
  now: Date = new Date(),
): Promise<DashboardData> {
  const [raw, settings] = await Promise.all([getRealRaw(now), loadSettings()]);
  return assembleDashboard(raw, settings, now);
}

export async function getSnapshot(
  now: Date = new Date(),
): Promise<FinancialSnapshot> {
  const [raw, settings] = await Promise.all([getRealRaw(now), loadSettings()]);
  return assembleSnapshot(raw, settings, now);
}
