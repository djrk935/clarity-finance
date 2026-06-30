/** Finance engine checks. Run with: npm test
 *  (requires Node 22.6+ for native TypeScript stripping) */

import assert from "node:assert/strict";
import * as F from "../src/lib/finance.ts";
import {
  accounts,
  debts,
  getBills,
  getTransactions,
} from "../src/lib/data/mock.ts";

const now = new Date("2026-06-24T09:00:00Z");
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("Finance engine checks:");

check("total liquidity excludes credit, sums depository", () => {
  assert.equal(F.totalLiquidity(accounts), 8450);
});

check("spendable balance excludes savings", () => {
  assert.equal(F.spendableBalance(accounts), 2650);
});

check("upcoming bills (14d) total 420 and excludes rent", () => {
  const due = F.upcomingBills(getBills(now), 14, now);
  assert.equal(due.length, 8);
  assert.equal(F.billsTotal(due), 420);
  assert.ok(!due.some((b) => b.name === "Rent"));
});

check("safe to spend = spendable - bills - buffer - goals", () => {
  assert.equal(
    F.safeToSpend({
      spendable: 2650,
      upcomingBills: 420,
      buffer: 200,
      reservedForGoals: 789.5,
    }),
    1240.5,
  );
});

check("credit utilization is 34%", () => {
  const card = accounts.find((a) => a.type === "credit")!;
  assert.equal(F.creditUtilization(card), 34);
});

check("pay-to-target gets card under 30%", () => {
  assert.equal(F.payToUtilizationTarget(1190, 3500, 30), 140);
});

check("debt payoff progress is 33%", () => {
  const p = F.debtPayoffProgress(debts);
  assert.equal(p.total, 6400);
  assert.equal(p.remaining, 4300);
  assert.equal(p.paid, 2100);
  assert.equal(p.pct, 33);
});

check("dining trend is down 12% week over week", () => {
  const t = F.categoryTrend(getTransactions(now), "Dining", now);
  assert.equal(t.thisWeek, 96);
  assert.equal(t.lastWeek, 109);
  assert.equal(t.pct, -12);
});

check("currency formats with and without cents", () => {
  assert.equal(F.formatCurrency(1240.5), "$1,240.50");
  assert.equal(F.formatCurrency(640, false), "$640");
});

check("avalanche orders by highest APR first", () => {
  const order = F.avalancheOrder(debts);
  assert.equal(order[0].name, "Chase Sapphire");
  assert.equal(order[1].name, "Personal loan");
});

check("simulatePayoff with no interest is exact", () => {
  const r = F.simulatePayoff(
    [{ apr: 0, currentBalance: 1000, minPayment: 100 }],
    100,
  );
  assert.equal(r.months, 10);
  assert.equal(r.totalInterest, 0);
});

check("a bigger budget clears debt faster, and interest accrues", () => {
  const min = debts.reduce((s, d) => s + d.minPayment, 0);
  const baseline = F.simulatePayoff(debts, min);
  const plan = F.simulatePayoff(debts, min + 300);
  assert.ok(plan.months > 0);
  assert.ok(plan.months < baseline.months);
  assert.ok(plan.totalInterest > 0);
  assert.ok(plan.totalInterest < baseline.totalInterest);
});

check("formatMonthYear + addMonths produce a readable date", () => {
  assert.equal(F.formatMonthYear(new Date("2027-04-10")), "April 2027");
  assert.equal(F.addMonths(new Date("2026-12-15"), 1).getFullYear(), 2027);
});

check("cashflow from transactions: 7 days, outflow only", () => {
  const at = (off: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() + off);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
  };
  const txns = [
    { id: "a", date: at(0), description: "x", amount: -50, category: "X" },
    { id: "b", date: at(-1), description: "x", amount: -20, category: "X" },
    { id: "c", date: at(-1), description: "x", amount: -10, category: "X" },
    { id: "d", date: at(0), description: "pay", amount: 100, category: "Income" },
    { id: "e", date: at(-10), description: "old", amount: -999, category: "X" },
  ];
  const cf = F.cashflowFromTransactions(txns, now);
  assert.equal(cf.length, 7);
  assert.equal(cf[6].outflow, 50); // today
  assert.equal(cf[5].outflow, 30); // yesterday
  // inflow (+100) and out-of-window (-999) excluded
  assert.equal(
    cf.reduce((s, d) => s + d.outflow, 0),
    80,
  );
});

console.log(`\nAll ${passed} checks passed.`);
