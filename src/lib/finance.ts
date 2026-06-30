/** Pure, dependency-free finance calculations. No React, no Next, no I/O —
 *  so every function here is trivially unit-testable. */

import type {
  Account,
  Bill,
  Debt,
  Transaction,
  SpendingTrend,
  CashflowDay,
  CategorySpend,
  MerchantSpend,
  PeriodKey,
  PeriodSummary,
  MonthlyPoint,
} from "./types";

const DEPOSITORY: AccountTypeLite[] = ["checking", "savings", "cash"];
const SPENDABLE: AccountTypeLite[] = ["checking", "cash"];
type AccountTypeLite = Account["type"];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(n: number, withCents = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(n);
}

/* ---------- balances ---------- */

export function totalLiquidity(accounts: Account[]): number {
  return round2(
    accounts
      .filter((a) => DEPOSITORY.includes(a.type))
      .reduce((s, a) => s + a.balance, 0),
  );
}

/** Cash you can actually spend right now (excludes savings). */
export function spendableBalance(accounts: Account[]): number {
  return round2(
    accounts
      .filter((a) => SPENDABLE.includes(a.type))
      .reduce((s, a) => s + a.balance, 0),
  );
}

/* ---------- bills ---------- */

/* All calendar bucketing is done in UTC. Plaid delivers date-only strings
 * ("2026-06-01") which we store as UTC midnight, and the app deploys on a UTC
 * server — so comparing in UTC keeps a transaction on its real calendar date
 * (local-time bucketing would shift it to the previous day west of UTC). */

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  // UTC has no DST, so a fixed-size day shift is exact.
  return new Date(d.getTime() + days * 86_400_000);
}

/** Bills due between today and `withinDays` from now (inclusive). */
export function upcomingBills(
  bills: Bill[],
  withinDays: number,
  from: Date = new Date(),
): Bill[] {
  const lo = startOfDay(from);
  const hi = startOfDay(addDays(from, withinDays));
  return bills
    .filter((b) => {
      const d = startOfDay(new Date(b.dueDate));
      return d >= lo && d <= hi;
    })
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
}

export function billsTotal(bills: Bill[]): number {
  return round2(bills.reduce((s, b) => s + b.amount, 0));
}

/* ---------- safe to spend ---------- */

export interface SafeToSpendInput {
  spendable: number;
  upcomingBills: number;
  buffer: number;
  reservedForGoals: number;
}

/** Discretionary money left after bills, a safety buffer, and goal savings. */
export function safeToSpend(i: SafeToSpendInput): number {
  return round2(
    Math.max(0, i.spendable - i.upcomingBills - i.buffer - i.reservedForGoals),
  );
}

/* ---------- credit ---------- */

export function creditUtilization(card: {
  balance: number;
  creditLimit?: number;
}): number {
  if (!card.creditLimit || card.creditLimit <= 0) return 0;
  return round2((card.balance / card.creditLimit) * 100);
}

/** How much to pay down to get utilization to/under `targetPct` (0–100). */
export function payToUtilizationTarget(
  balance: number,
  creditLimit: number,
  targetPct: number,
): number {
  const raw = balance - (targetPct / 100) * creditLimit;
  if (raw <= 0) return 0;
  return Math.ceil(raw / 5) * 5; // round up to a tidy $5
}

/* ---------- debt payoff ---------- */

export function debtPayoffProgress(debts: Debt[]): {
  total: number;
  remaining: number;
  paid: number;
  pct: number;
} {
  const total = round2(debts.reduce((s, d) => s + d.originalBalance, 0));
  const remaining = round2(debts.reduce((s, d) => s + d.currentBalance, 0));
  const paid = round2(total - remaining);
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return { total, remaining, paid, pct };
}

/* ---------- spending trends ---------- */

/** Total outflow for a category within [from, to] (inclusive by day). */
export function spendByCategory(
  transactions: Transaction[],
  category: string,
  from: Date,
  to: Date,
): number {
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  return round2(
    transactions
      .filter((t) => {
        if (t.category !== category || t.amount >= 0) return false;
        const d = startOfDay(new Date(t.date));
        return d >= lo && d <= hi;
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0),
  );
}

/** Compare this week (last 7 days) vs the prior week for a category. */
export function categoryTrend(
  transactions: Transaction[],
  category: string,
  now: Date = new Date(),
): SpendingTrend {
  const thisWeek = spendByCategory(transactions, category, addDays(now, -6), now);
  const lastWeek = spendByCategory(
    transactions,
    category,
    addDays(now, -13),
    addDays(now, -7),
  );
  const pct =
    lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
  return { category, thisWeek, lastWeek, pct };
}

/** Daily inflow + outflow over the last 7 days (by weekday label), derived
 *  from transactions. Used for the cash-flow chart. */
export function cashflowFromTransactions(
  transactions: Transaction[],
  now: Date = new Date(),
): CashflowDay[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days: CashflowDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = startOfDay(addDays(now, -i));
    const end = addDays(start, 1);
    let outflow = 0;
    let inflow = 0;
    for (const t of transactions) {
      const d = startOfDay(new Date(t.date));
      if (d < start || d >= end) continue;
      if (t.amount < 0) outflow += Math.abs(t.amount);
      else inflow += t.amount;
    }
    days.push({
      label: labels[start.getUTCDay()],
      date: start.toISOString(),
      outflow: Math.round(outflow),
      inflow: Math.round(inflow),
    });
  }
  return days;
}

/* ---------- spending (current calendar month) ---------- */

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Days remaining in the current calendar month (including today). */
export function daysUntilMonthEnd(now: Date = new Date()): number {
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const diff =
    Math.round(
      (startOfDay(lastDay).getTime() - startOfDay(now).getTime()) / 86_400_000,
    ) + 1;
  return Math.max(1, diff);
}

/** Total spent so far this calendar month. Delegates so the boundary
 *  convention (inclusive by day, UTC) is identical to the period functions. */
export function totalSpentThisMonth(
  transactions: Transaction[],
  now: Date = new Date(),
): number {
  const { from, to } = periodRange("month", now);
  return spendingInRange(transactions, from, to);
}

/** Outflow totals per category for the current month, biggest first. */
export function categorySpendThisMonth(
  transactions: Transaction[],
  now: Date = new Date(),
): CategorySpend[] {
  const { from, to } = periodRange("month", now);
  return categorySpendInRange(transactions, from, to);
}

/* ---------- forecasting / runway ---------- */

/** Average daily outflow over the last `windowDays` days. */
export function avgDailySpend(
  transactions: Transaction[],
  now: Date = new Date(),
  windowDays = 14,
): number {
  const lo = startOfDay(addDays(now, -(windowDays - 1)));
  const hi = startOfDay(now);
  let total = 0;
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const d = startOfDay(new Date(t.date));
    if (d >= lo && d <= hi) total += Math.abs(t.amount);
  }
  return round2(total / windowDays);
}

/** How many days spendable cash lasts at the recent burn rate. null = unknown. */
export function runwayDays(spendable: number, avgDaily: number): number | null {
  if (avgDaily <= 0) return null;
  return Math.max(0, Math.floor(spendable / avgDaily));
}

/** Safe-to-spend split into a per-day allowance for the rest of the period. */
export function dailySafeToSpend(safeToSpend: number, daysLeft: number): number {
  if (daysLeft <= 0) return round2(safeToSpend);
  return round2(safeToSpend / daysLeft);
}

/** Months of expenses your liquidity covers. null = unknown. */
export function monthsOfRunway(
  liquidity: number,
  monthlyExpenses: number,
): number | null {
  if (monthlyExpenses <= 0) return null;
  return round2(liquidity / monthlyExpenses);
}

/* ---------- dates ---------- */

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1); // avoid month-overflow (e.g. Jan 31 + 1 → Mar)
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/* ---------- payoff strategy ---------- */

/** Debts ordered by the avalanche method (highest APR first). */
export function avalancheOrder<T extends { apr: number }>(debts: T[]): T[] {
  return [...debts].sort((a, b) => b.apr - a.apr);
}

export interface PayoffResult {
  months: number;
  totalInterest: number;
}

/* ---------- income & date ranges ---------- */

function inDayRange(dateStr: string, lo: Date, hi: Date): boolean {
  const d = startOfDay(new Date(dateStr));
  return d >= lo && d <= hi;
}

/** Total money out (absolute) within [from, to], inclusive by day. */
export function spendingInRange(
  transactions: Transaction[],
  from: Date,
  to: Date,
): number {
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  let total = 0;
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (inDayRange(t.date, lo, hi)) total += Math.abs(t.amount);
  }
  return round2(total);
}

/** Total money in within [from, to], inclusive by day. */
export function incomeInRange(
  transactions: Transaction[],
  from: Date,
  to: Date,
): number {
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  let total = 0;
  for (const t of transactions) {
    if (t.amount <= 0) continue;
    if (inDayRange(t.date, lo, hi)) total += t.amount;
  }
  return round2(total);
}

/** Money in so far this calendar month. */
export function incomeThisMonth(
  transactions: Transaction[],
  now: Date = new Date(),
): number {
  return incomeInRange(transactions, startOfMonth(now), now);
}

/** Outflow totals per category within [from, to], biggest first. */
export function categorySpendInRange(
  transactions: Transaction[],
  from: Date,
  to: Date,
): CategorySpend[] {
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (!inDayRange(t.date, lo, hi)) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

/** Biggest outflow destinations within [from, to], grouped by merchant. */
export function topMerchants(
  transactions: Transaction[],
  from: Date,
  to: Date,
  limit = 5,
): MerchantSpend[] {
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  const map = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (!inDayRange(t.date, lo, hi)) continue;
    const key = t.description?.trim() || "Other";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += Math.abs(t.amount);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/* ---------- periods / statements ---------- */

/** Resolve a named period to a concrete [from, to] range + human label. */
export function periodRange(
  key: PeriodKey,
  now: Date = new Date(),
): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (key) {
    case "week":
      return { from: addDays(now, -6), to: now, label: "Last 7 days" };
    case "month":
      return { from: new Date(Date.UTC(y, m, 1)), to: now, label: "This month" };
    case "last-month":
      // Date.UTC normalizes a negative month index across the year boundary,
      // and day 0 of month m = the last day of month m-1.
      return {
        from: new Date(Date.UTC(y, m - 1, 1)),
        to: new Date(Date.UTC(y, m, 0)),
        label: "Last month",
      };
    case "year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: now, label: "This year" };
  }
}

/** A full statement for a named period: totals + category/merchant breakdowns. */
export function summarizePeriod(
  transactions: Transaction[],
  key: PeriodKey,
  now: Date = new Date(),
): PeriodSummary {
  const { from, to, label } = periodRange(key, now);
  const lo = startOfDay(from);
  const hi = startOfDay(to);
  const income = incomeInRange(transactions, from, to);
  const spending = spendingInRange(transactions, from, to);
  const txnCount = transactions.filter((t) => inDayRange(t.date, lo, hi)).length;
  return {
    key,
    label,
    from: lo.toISOString(),
    to: hi.toISOString(),
    income,
    spending,
    net: round2(income - spending),
    txnCount,
    byCategory: categorySpendInRange(transactions, from, to),
    topMerchants: topMerchants(transactions, from, to, 5),
  };
}

/** Rolling in/out/net per calendar month, oldest → newest. */
export function monthlyTrend(
  transactions: Transaction[],
  now: Date = new Date(),
  months = 6,
): MonthlyPoint[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // Format in UTC since `from` is the 1st at UTC midnight (a local formatter
  // would label it as the previous month west of UTC).
  const labelFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const out: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    // Build each month from a year/month index so there's no day-overflow.
    const from = new Date(Date.UTC(y, m - i, 1));
    const to = i === 0 ? now : new Date(Date.UTC(y, m - i + 1, 0));
    const income = incomeInRange(transactions, from, to);
    const spending = spendingInRange(transactions, from, to);
    out.push({
      label: labelFmt.format(from),
      income,
      spending,
      net: round2(income - spending),
    });
  }
  return out;
}

/** Month-by-month avalanche simulation: pay every minimum, then throw the
 *  remaining budget at the highest-APR balance until everything clears. */
export function simulatePayoff(
  debts: { apr: number; currentBalance: number; minPayment: number }[],
  monthlyBudget: number,
  maxMonths = 600,
): PayoffResult {
  const rows = debts.map((d) => ({
    apr: d.apr,
    bal: d.currentBalance,
    min: d.minPayment,
  }));
  const totalMin = rows.reduce((s, r) => s + r.min, 0);
  const budgetFloor = Math.max(monthlyBudget, totalMin);

  let months = 0;
  let totalInterest = 0;

  while (rows.some((r) => r.bal > 0.005) && months < maxMonths) {
    months += 1;

    // accrue monthly interest
    for (const r of rows) {
      if (r.bal > 0) {
        const interest = r.bal * (r.apr / 100 / 12);
        r.bal += interest;
        totalInterest += interest;
      }
    }

    // pay the minimum on each (capped at the balance)
    let budget = budgetFloor;
    for (const r of rows) {
      if (r.bal > 0) {
        const pay = Math.min(r.min, r.bal);
        r.bal -= pay;
        budget -= pay;
      }
    }

    // throw what's left at the highest-APR balance
    for (const r of [...rows]
      .filter((x) => x.bal > 0)
      .sort((a, b) => b.apr - a.apr)) {
      if (budget <= 0) break;
      const pay = Math.min(budget, r.bal);
      r.bal -= pay;
      budget -= pay;
    }
  }

  return { months, totalInterest: round2(totalInterest) };
}
