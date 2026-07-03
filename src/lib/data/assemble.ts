/** Pure assembly: raw entities → the shapes the UI consumes. Centralises the
 *  numbers so they're computed in exactly one place. No I/O here. */

import * as F from "../finance";
import { generateInsights } from "../insights";
import {
  DEFAULT_SETTINGS,
  type DashboardData,
  type FinancialSnapshot,
  type Forecast,
  type RawData,
  type Settings,
} from "../types";

export function assembleDashboard(
  raw: RawData,
  settings: Settings = DEFAULT_SETTINGS,
  now: Date = new Date(),
): DashboardData {
  const due = F.upcomingBills(raw.bills, settings.billWindowDays, now);
  const upcomingBillsTotal = F.billsTotal(due);
  const spendable = F.spendableBalance(raw.accounts);
  const totalLiquidity = F.totalLiquidity(raw.accounts);

  const safeToSpend = F.safeToSpend({
    spendable,
    upcomingBills: upcomingBillsTotal,
    buffer: settings.buffer,
    reservedForGoals: settings.savingsGoal,
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
  const planBudget = minTotal + settings.extraDebtPayment;
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

  // Spending behaviour, derived once from the live transaction history.
  const spendingByCategory = F.categorySpendThisMonth(raw.transactions, now);
  const totalSpentThisMonth = F.totalSpentThisMonth(raw.transactions, now);
  const incomeThisMonth = F.incomeThisMonth(raw.transactions, now);
  // Net so far this month (inflows − outflows), same boundary convention.
  const savedThisMonth = F.round2(incomeThisMonth - totalSpentThisMonth);

  // Forward-looking forecast / runway.
  const avgDaily = F.avgDailySpend(raw.transactions, now);
  const forecast: Forecast = {
    dailySafeToSpend: F.dailySafeToSpend(safeToSpend, F.daysUntilMonthEnd(now)),
    avgDailySpend: avgDaily,
    runwayDays: F.runwayDays(spendable, avgDaily),
    monthsOfRunway: F.monthsOfRunway(totalLiquidity, F.round2(avgDaily * 30)),
  };

  const metrics = {
    totalLiquidity,
    spendable,
    upcomingBillsTotal,
    buffer: settings.buffer,
    reservedForGoals: settings.savingsGoal,
    safeToSpend,
    savedThisMonth,
    periodBudget: Math.max(spendable, 1),
    billWindowDays: settings.billWindowDays,
  };

  const insights = generateInsights({
    metrics,
    rescue,
    utilization,
    spendingTrend,
    topCategory: spendingByCategory[0] ?? null,
  });

  // Newest transactions first — the Activity browser and advisor read this.
  const transactions = [...raw.transactions].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date),
  );

  return {
    user: { name: settings.userName },
    accounts: raw.accounts,
    bills: due,
    debts: raw.debts,
    transactions,
    subscriptions: [...raw.bills].sort(
      (a, b) => +new Date(a.dueDate) - +new Date(b.dueDate),
    ),
    spendingByCategory,
    totalSpentThisMonth,
    forecast,
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
  settings: Settings = DEFAULT_SETTINGS,
  now: Date = new Date(),
): FinancialSnapshot {
  const d = assembleDashboard(raw, settings, now);
  const nextBill = d.bills[0]
    ? {
        name: d.bills[0].name,
        amount: d.bills[0].amount,
        dueDate: d.bills[0].dueDate,
      }
    : null;

  const monthRange = F.periodRange("month", now);

  return {
    userName: d.user.name,
    safeToSpend: d.metrics.safeToSpend,
    totalLiquidity: d.metrics.totalLiquidity,
    spendable: d.metrics.spendable,
    upcomingBillsTotal: d.metrics.upcomingBillsTotal,
    upcomingBillsCount: d.bills.length,
    billWindowDays: settings.billWindowDays,
    nextBill,
    buffer: d.metrics.buffer,
    savedThisMonth: d.metrics.savedThisMonth,
    incomeThisMonth: F.incomeThisMonth(raw.transactions, now),
    spentThisMonth: d.totalSpentThisMonth,
    topCategories: d.spendingByCategory.slice(0, 5),
    topMerchants: F.topMerchants(raw.transactions, monthRange.from, monthRange.to, 5),
    forecast: d.forecast,
    rescue: d.rescue,
    utilization: d.utilization,
  };
}
