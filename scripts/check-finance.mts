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
    x.setUTCDate(x.getUTCDate() + off);
    x.setUTCHours(12, 0, 0, 0);
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

check("totalSpentThisMonth sums this month's outflows", () => {
  assert.equal(F.totalSpentThisMonth(getTransactions(now), now), 341);
});

check("categorySpendThisMonth ranks categories", () => {
  const cats = F.categorySpendThisMonth(getTransactions(now), now);
  assert.equal(cats[0].category, "Dining");
  assert.equal(cats[0].total, 205);
  assert.equal(cats.find((c) => c.category === "Groceries")?.total, 82);
});

check("avgDailySpend over the last 14 days", () => {
  assert.equal(F.avgDailySpend(getTransactions(now), now), 24.36);
});

check("runway, daily allowance, months of runway", () => {
  assert.equal(F.runwayDays(1000, 25), 40);
  assert.equal(F.runwayDays(100, 0), null);
  assert.equal(F.dailySafeToSpend(1240.5, 10), 124.05);
  assert.equal(F.dailySafeToSpend(100, 0), 100);
  assert.equal(F.monthsOfRunway(8450, 1000), 8.45);
  assert.equal(F.monthsOfRunway(100, 0), null);
});

check("daysUntilMonthEnd counts inclusively", () => {
  assert.equal(F.daysUntilMonthEnd(now), 7); // Jun 24 → Jun 30
});

check("cashflow now reports inflow as well as outflow", () => {
  const cf = F.cashflowFromTransactions(getTransactions(now), now);
  assert.equal(cf.length, 7);
  // the paycheck (+2100, 6 days ago) lands as inflow on day index 0
  assert.equal(cf[0].inflow, 2100);
  assert.equal(cf.reduce((s, d) => s + d.inflow, 0), 2100);
});

check("incomeThisMonth sums this month's inflows", () => {
  assert.equal(F.incomeThisMonth(getTransactions(now), now), 2100);
});

check("income / spending in range (last 7 days)", () => {
  const { from, to } = F.periodRange("week", now);
  assert.equal(F.spendingInRange(getTransactions(now), from, to), 232);
  assert.equal(F.incomeInRange(getTransactions(now), from, to), 2100);
});

check("topMerchants ranks outflows by merchant", () => {
  const { from, to } = F.periodRange("month", now);
  const m = F.topMerchants(getTransactions(now), from, to, 5);
  assert.equal(m[0].merchant, "Groceries");
  assert.equal(m[0].total, 82);
  assert.equal(m[0].count, 1);
  assert.equal(m.length, 5);
});

check("summarizePeriod (month) is a complete statement", () => {
  const s = F.summarizePeriod(getTransactions(now), "month", now);
  assert.equal(s.income, 2100);
  assert.equal(s.spending, 341);
  assert.equal(s.net, 1759);
  assert.equal(s.byCategory[0].category, "Dining");
  assert.equal(s.byCategory[0].total, 205);
});

check("periodRange resolves named windows (UTC)", () => {
  assert.equal(F.periodRange("month", now).from.getUTCMonth(), 5); // June
  assert.equal(F.periodRange("last-month", now).label, "Last month");
  assert.equal(F.periodRange("year", now).from.getUTCMonth(), 0); // January
});

check("monthlyTrend returns oldest→newest in/out per month", () => {
  const t = F.monthlyTrend(getTransactions(now), now, 2);
  assert.equal(t.length, 2);
  assert.equal(t[1].label, "Jun");
  assert.equal(t[1].spending, 341);
  assert.equal(t[1].income, 2100);
  assert.equal(t[0].spending, 0); // May had no transactions in the fixture
});

/* --- regression: date/timezone & month-end boundaries (review findings) --- */

check("UTC-midnight date-only txns are attributed to the right month", () => {
  // Plaid date-only strings are stored as UTC midnight; bucketing must not
  // shift a "1st of the month" transaction into the previous month.
  const nowJun = new Date("2026-06-24T09:00:00Z");
  const txns = [
    { id: "x", date: "2026-06-01T00:00:00.000Z", description: "Rent", amount: -1000, category: "Housing" },
    { id: "y", date: "2026-05-31T00:00:00.000Z", description: "Old", amount: -500, category: "Other" },
  ];
  const month = F.periodRange("month", nowJun);
  const lastMonth = F.periodRange("last-month", nowJun);
  assert.equal(F.totalSpentThisMonth(txns, nowJun), 1000); // June only
  assert.equal(F.spendingInRange(txns, month.from, month.to), 1000);
  assert.equal(F.spendingInRange(txns, lastMonth.from, lastMonth.to), 500); // May
});

check("periodRange('last-month') is valid on the 31st (no addMonths rollover)", () => {
  const mar31 = new Date("2026-03-31T12:00:00Z");
  const r = F.periodRange("last-month", mar31);
  assert.equal(r.from.getUTCMonth(), 1); // February
  assert.equal(r.from.getUTCDate(), 1);
  assert.equal(r.to.getUTCMonth(), 1); // February
  assert.equal(r.to.getUTCDate(), 28);
  assert.ok(r.from.getTime() <= r.to.getTime()); // not inverted
});

check("monthlyTrend has no skipped/duplicated months on the 31st", () => {
  const mar31 = new Date("2026-03-31T12:00:00Z");
  const labels = F.monthlyTrend([], mar31, 6).map((m) => m.label);
  assert.deepEqual(labels, ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
});

check("current-month spend matches the period statement (same convention)", () => {
  const s = F.summarizePeriod(getTransactions(now), "month", now);
  assert.equal(F.totalSpentThisMonth(getTransactions(now), now), s.spending);
});

check("detectRecurringBills finds consistent monthly & weekly bills", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    // monthly Netflix (30-day gaps, constant amount)
    { id: "n1", date: at(-65), description: "Netflix", amount: -15.99, category: "Subscriptions" },
    { id: "n2", date: at(-35), description: "Netflix", amount: -15.99, category: "Subscriptions" },
    { id: "n3", date: at(-5), description: "Netflix", amount: -15.99, category: "Subscriptions" },
    // weekly Spotify (7-day gaps, constant amount)
    { id: "s1", date: at(-20), description: "Spotify", amount: -9.99, category: "Subscriptions" },
    { id: "s2", date: at(-13), description: "Spotify", amount: -9.99, category: "Subscriptions" },
    { id: "s3", date: at(-6), description: "Spotify", amount: -9.99, category: "Subscriptions" },
    // weekly cadence but inconsistent amount → rejected
    { id: "g1", date: at(-18), description: "Big Grocer", amount: -60, category: "Groceries" },
    { id: "g2", date: at(-11), description: "Big Grocer", amount: -140, category: "Groceries" },
    { id: "g3", date: at(-4), description: "Big Grocer", amount: -70, category: "Groceries" },
    // only two occurrences → rejected
    { id: "o1", date: at(-30), description: "OneOff", amount: -50, category: "Other" },
    { id: "o2", date: at(-3), description: "OneOff", amount: -50, category: "Other" },
    // irregular cadence → rejected
    { id: "r1", date: at(-40), description: "Random", amount: -25, category: "Other" },
    { id: "r2", date: at(-37), description: "Random", amount: -25, category: "Other" },
    { id: "r3", date: at(-3), description: "Random", amount: -25, category: "Other" },
    // recurring transfer → excluded (transfer flag)
    { id: "t1", date: at(-65), description: "Auto Save", amount: -500, category: "Transfer Out", transfer: true },
    { id: "t2", date: at(-35), description: "Auto Save", amount: -500, category: "Transfer Out", transfer: true },
    { id: "t3", date: at(-5), description: "Auto Save", amount: -500, category: "Transfer Out", transfer: true },
  ];
  const bills = F.detectRecurringBills(txns, now);
  assert.deepEqual(bills.map((b) => b.name).sort(), ["Netflix", "Spotify"]);
  const nf = bills.find((b) => b.name === "Netflix")!;
  assert.equal(nf.amount, 15.99);
  assert.equal(nf.category, "Subscriptions");
  assert.equal(nf.cadenceDays, 30);
  assert.ok(new Date(nf.dueDate).getTime() > now.getTime()); // next date is in the future
  const sp = bills.find((b) => b.name === "Spotify")!;
  assert.equal(sp.amount, 9.99);
  assert.equal(sp.cadenceDays, 7);
});

check("detectRecurringBills has no false positives on one-off history", () => {
  assert.deepEqual(F.detectRecurringBills(getTransactions(now), now), []);
});

check("detector survives a price change (single amount outlier tolerated)", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    { id: "p1", date: at(-95), description: "Netflix", amount: -15.49, category: "Subscriptions" },
    { id: "p2", date: at(-65), description: "Netflix", amount: -15.49, category: "Subscriptions" },
    { id: "p3", date: at(-35), description: "Netflix", amount: -15.49, category: "Subscriptions" },
    { id: "p4", date: at(-5), description: "Netflix", amount: -22.99, category: "Subscriptions" },
  ];
  const bills = F.detectRecurringBills(txns, now);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].name, "Netflix");
  assert.equal(bills[0].cadenceDays, 30);
});

check("detector survives one skipped cycle (gap of 2x cadence)", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    { id: "k1", date: at(-110), description: "Gym", amount: -40, category: "Fitness" },
    { id: "k2", date: at(-80), description: "Gym", amount: -40, category: "Fitness" },
    // one skipped month → 60-day gap
    { id: "k3", date: at(-20), description: "Gym", amount: -40, category: "Fitness" },
  ];
  const bills = F.detectRecurringBills(txns, now);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].name, "Gym");
  assert.equal(bills[0].amount, 40);
});

check("detector merges same-day charges (retry/split doesn't disqualify)", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    { id: "m1", date: at(-65), description: "Insurance", amount: -100, category: "Insurance" },
    { id: "m2", date: at(-35), description: "Insurance", amount: -100, category: "Insurance" },
    { id: "m3", date: at(-5), description: "Insurance", amount: -100, category: "Insurance" },
    // stray same-day partial charge — merged into that day's occurrence
    { id: "m4", date: at(-5), description: "Insurance", amount: -5, category: "Insurance" },
  ];
  const bills = F.detectRecurringBills(txns, now);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].amount, 100); // median of [100, 100, 105]
});

check("detector classifies biweekly cadence", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    { id: "b1", date: at(-42), description: "Cleaner", amount: -80, category: "Home" },
    { id: "b2", date: at(-28), description: "Cleaner", amount: -80, category: "Home" },
    { id: "b3", date: at(-14), description: "Cleaner", amount: -80, category: "Home" },
  ];
  const bills = F.detectRecurringBills(txns, now);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].cadenceDays, 14);
});

check("detector never crashes on malformed dates (and adds no phantom bill)", () => {
  const at = (off: number) => iso(now, off);
  const txns = [
    { id: "v1", date: at(-35), description: "Netflix", amount: -15.99, category: "Subscriptions" },
    { id: "v2", date: at(-5), description: "Netflix", amount: -15.99, category: "Subscriptions" },
    // garbage dates must be skipped, not crash toISOString or fake a 3rd occurrence
    { id: "v3", date: "not-a-date", description: "Netflix", amount: -15.99, category: "Subscriptions" },
    { id: "v4", date: "", description: "Netflix", amount: -15.99, category: "Subscriptions" },
  ];
  assert.deepEqual(F.detectRecurringBills(txns, now), []); // only 2 valid occurrences
});

check("detector rejects steady non-weekly habits (gas ~9d, groceries ~5-6d)", () => {
  const at = (off: number) => iso(now, off);
  const gas = [-27, -18, -9].map((off, i) => ({
    id: `gas${i}`, date: at(off), description: "Gas Station", amount: -45, category: "Transport",
  }));
  const grocery = [-16, -11, -5].map((off, i) => ({
    id: `gr${i}`, date: at(off), description: "Groceries", amount: -60, category: "Groceries",
  }));
  assert.deepEqual(F.detectRecurringBills([...gas, ...grocery], now), []);
  // …while a genuine weekly bill with ±1-day jitter still passes
  const weekly = [-21, -15, -7].map((off, i) => ({
    id: `w${i}`, date: at(off), description: "Lawn Care", amount: -30, category: "Home",
  }));
  assert.equal(F.detectRecurringBills(weekly, now).length, 1);
});

check("pluralize renders singular and plural units", () => {
  assert.equal(F.pluralize(1, "day"), "1 day");
  assert.equal(F.pluralize(14, "day"), "14 days");
  assert.equal(F.pluralize(1, "bill"), "1 bill");
  assert.equal(F.pluralize(0, "bill"), "0 bills");
});

check("transfers/card payments are excluded from spending & income", () => {
  const base = getTransactions(now);
  const withTransfers = [
    ...base,
    // $500 moved to savings and a $300 card payment — internal movement.
    { id: "mv1", date: iso(now, -2), description: "To savings", amount: -500, category: "Transfer Out", transfer: true },
    { id: "mv2", date: iso(now, -3), description: "Card payment", amount: -300, category: "Loan Payments", transfer: true },
    { id: "mv3", date: iso(now, -4), description: "From savings", amount: 400, category: "Transfer In", transfer: true },
  ];
  // spending/income/net unchanged vs the base fixture (341 out, 2100 in)
  assert.equal(F.totalSpentThisMonth(withTransfers, now), 341);
  assert.equal(F.incomeThisMonth(withTransfers, now), 2100);
  const s = F.summarizePeriod(withTransfers, "month", now);
  assert.equal(s.spending, 341);
  assert.equal(s.income, 2100);
  // and transfers don't create a phantom category or merchant
  assert.ok(!s.byCategory.some((c) => c.category.includes("Transfer")));
  assert.ok(!s.topMerchants.some((m) => m.merchant === "To savings"));
});

// local iso helper mirroring mock.ts (UTC noon on an offset day)
function iso(n: Date, off: number): string {
  const d = new Date(n);
  d.setUTCDate(d.getUTCDate() + off);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

console.log(`\nAll ${passed} checks passed.`);
