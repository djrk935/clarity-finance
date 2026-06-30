/** Pure, dependency-free finance calculations. No React, no Next, no I/O —
 *  so every function here is trivially unit-testable. */

import type {
  Account,
  Bill,
  Debt,
  Transaction,
  SpendingTrend,
  CashflowDay,
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
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

/** Daily outflow over the last 7 days (Mon→Sun by weekday label), derived
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
    const outflow = transactions
      .filter((t) => {
        const d = startOfDay(new Date(t.date));
        return t.amount < 0 && d >= start && d < end;
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    days.push({ label: labels[start.getDay()], outflow: Math.round(outflow) });
  }
  return days;
}

/* ---------- dates ---------- */

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
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
