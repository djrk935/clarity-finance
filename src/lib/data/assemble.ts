/** Pure assembly: raw entities → the shapes the UI consumes. Shared by every
 *  data source (mock today, Prisma tomorrow) so the numbers are computed in
 *  exactly one place. No I/O here. */

import * as F from "../finance";
import { generateInsights } from "../insights";
import type {
  DashboardData,
  FinancialSnapshot,
  RawData,
  Transaction,
} from "../types";

/** Tunables that would live in user settings. Zeroed for real data so nothing
 *  is fabricated; expose them as user settings later. */
const BUFFER = 0;
const RESERVED_FOR_GOALS = 0;
const BILL_WINDOW_DAYS = 14;
/** Extra thrown at debt each month on top of minimums (0 = minimums-only). */
const EXTRA_DEBT_PAYMENT = 0;

const USER_NAME = "Dayan";

/** Net cash flow so far this calendar month (inflows minus outflows). */
function netThisMonth(transactions: Transaction[], now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  let net = 0;
  for (const t of transactions) {
    const d = new Date(t.date);
    if (d >= start && d <= now) net += t.amount;
  }
  return Math.round(net * 100) / 100;
}

export function assembleDashboard(
  raw: RawData,
  now: Date = new Date(),
): DashboardData {
  const due = F.upcomingBills(raw.bills, BILL_WINDOW_DAYS, now);
  const upcomingBillsTotal = F.billsTotal(due);
  const spendable = F.spendableBalance(raw.accounts);
  const totalLiquidity = F.totalLiquidity(raw.accounts);

  const safeToSpend = F.safeToSpend({
    spendable,
    upcomingBills: upcomingBillsTotal,
    buffer: BUFFER,
    reservedForGoals: RESERVED_FOR_GOALS,
  });

  const card = raw.accounts.find((a) => a.type === "credit" && a.creditLimit);
  const utilization = card
    ? {
        card: card.name,
        pct: F.creditUtilization(card),
        balance: card.balance,
        limit: card.creditLimit as number,
      }
    : null;

  const payoff = F.debtPayoffProgress(raw.debts);
  const minTotal = raw.debts.reduce((s, d) => s + d.minPayment, 0);
  const planBudget = minTotal + EXTRA_DEBT_PAYMENT;
  const baseline = F.simulatePayoff(raw.debts, minTotal); // minimums only
  const plan = F.simulatePayoff(raw.debts, planBudget); // active plan
  const rescue = {
    totalDebt: payoff.total,
    paid: payoff.paid,
    remaining: payoff.remaining,
    pct: payoff.pct,
    payoffDate: F.formatMonthYear(F.addMonths(now, plan.months)),
    monthsAhead: Math.max(0, baseline.months - plan.months),
    monthlyPayment: planBudget,
    projectedMonths: plan.months,
  };

  const spendingTrend = F.categoryTrend(raw.transactions, "Dining", now);

  const metrics = {
    totalLiquidity,
    spendable,
    upcomingBillsTotal,
    buffer: BUFFER,
    reservedForGoals: RESERVED_FOR_GOALS,
    safeToSpend,
    savedThisMonth: netThisMonth(raw.transactions, now),
    periodBudget: Math.max(spendable, 1),
  };

  const insights = generateInsights({
    metrics,
    rescue,
    utilization,
    spendingTrend,
  });

  return {
    user: { name: USER_NAME },
    accounts: raw.accounts,
    bills: due,
    debts: raw.debts,
    metrics,
    rescue,
    utilization,
    spendingTrend,
    cashflow: raw.cashflow,
    insights,
  };
}

/** Compact, grounded snapshot for the AI advisor. */
export function assembleSnapshot(
  raw: RawData,
  now: Date = new Date(),
): FinancialSnapshot {
  const d = assembleDashboard(raw, now);
  const nextBill = d.bills[0]
    ? {
        name: d.bills[0].name,
        amount: d.bills[0].amount,
        dueDate: d.bills[0].dueDate,
      }
    : null;

  return {
    userName: d.user.name,
    safeToSpend: d.metrics.safeToSpend,
    totalLiquidity: d.metrics.totalLiquidity,
    spendable: d.metrics.spendable,
    upcomingBillsTotal: d.metrics.upcomingBillsTotal,
    upcomingBillsCount: d.bills.length,
    nextBill,
    buffer: d.metrics.buffer,
    savedThisMonth: d.metrics.savedThisMonth,
    rescue: d.rescue,
    utilization: d.utilization,
  };
}
