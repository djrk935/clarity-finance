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
import { cashflowFromTransactions } from "../finance";
import type { DashboardData, FinancialSnapshot, RawData } from "../types";

const EMPTY: RawData = {
  accounts: [],
  bills: [],
  debts: [],
  transactions: [],
  cashflow: [],
};

async function getRealRaw(now: Date): Promise<RawData> {
  const accounts = await getPlaidAccounts();
  if (accounts.length === 0) return EMPTY; // nothing linked yet

  const [transactions, debts, bills] = await Promise.all([
    getPlaidTransactions(),
    getPlaidLiabilities(),
    getPlaidRecurring(),
  ]);

  return {
    accounts,
    transactions,
    debts,
    bills,
    cashflow: cashflowFromTransactions(transactions, now),
  };
}

export async function getDashboardData(
  now: Date = new Date(),
): Promise<DashboardData> {
  return assembleDashboard(await getRealRaw(now), now);
}

export async function getSnapshot(
  now: Date = new Date(),
): Promise<FinancialSnapshot> {
  return assembleSnapshot(await getRealRaw(now), now);
}
