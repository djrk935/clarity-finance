/** Finance engine checks. Run with: npm test
 *  (requires Node 22.6+ for native TypeScript stripping) */

import assert from "node:assert/strict";
import * as F from "../src/lib/finance.ts";
import { generateInsights } from "../src/lib/insights.ts";
import { renderDigest } from "../src/lib/digest.ts";
import { toTransaction } from "../src/lib/data/plaid-map.ts";
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

check("netWorth = liquidity − outstanding debt (same numbers as the KPIs)", () => {
  const nw = F.netWorth(accounts, debts);
  assert.equal(nw.liquidity, F.totalLiquidity(accounts)); // 8450
  assert.equal(nw.debt, F.debtPayoffProgress(debts).remaining); // 4300
  assert.deepEqual(nw, { liquidity: 8450, debt: 4300, net: 4150 });
  assert.deepEqual(F.netWorth([], []), { liquidity: 0, debt: 0, net: 0 });
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

check("month boundaries: the 1st and the last day both land in-month", () => {
  // Pins the shared calendar basis: budgetProgress, totalSpentThisMonth, and
  // daysUntilMonthEnd must agree on what "this month" is at both edges.
  const jan31 = new Date("2026-01-31T12:00:00Z");
  const txns = [
    { id: "e1", date: "2026-01-01T00:00:00.000Z", description: "First", amount: -40, category: "Dining" },
    { id: "e2", date: "2026-01-31T00:00:00.000Z", description: "Last", amount: -60, category: "Dining" },
    { id: "e3", date: "2025-12-31T00:00:00.000Z", description: "Prev", amount: -500, category: "Dining" },
  ];
  assert.equal(F.totalSpentThisMonth(txns, jan31), 100); // Dec 31 excluded
  const [s] = F.budgetProgress([{ category: "Dining", limit: 300 }], txns, jan31);
  assert.equal(s.spent, 100); // same convention as totalSpentThisMonth
  assert.equal(s.projected, 100); // day 31 of 31 → projection = actual
  assert.equal(F.daysUntilMonthEnd(jan31), 1); // last day counts itself
  assert.equal(F.daysUntilMonthEnd(new Date("2026-01-01T12:00:00Z")), 31);
});

check("the current month rolls over on UTC, not server-local time", () => {
  // 01:00 UTC on Feb 1 is still Jan 31 in US timezones — every "this month"
  // function must follow the UTC calendar regardless of where the process runs.
  const utcFeb1 = new Date("2026-02-01T01:00:00Z");
  const janTxn = [
    { id: "z1", date: "2026-01-31T00:00:00.000Z", description: "Jan", amount: -80, category: "Dining" },
  ];
  assert.equal(
    F.periodRange("month", utcFeb1).from.toISOString(),
    "2026-02-01T00:00:00.000Z",
  );
  assert.equal(F.totalSpentThisMonth(janTxn, utcFeb1), 0); // January txn is out
  const [s] = F.budgetProgress([{ category: "Dining", limit: 300 }], janTxn, utcFeb1);
  assert.equal(s.spent, 0);
  assert.equal(F.daysUntilMonthEnd(utcFeb1), 28); // Feb 2026, from the 1st
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

/* --- budgets --- */

check("sanitizeBudgets cleans, clamps, and dedupes", () => {
  assert.deepEqual(F.sanitizeBudgets(null), []);
  assert.deepEqual(F.sanitizeBudgets("nope"), []);
  const out = F.sanitizeBudgets([
    { category: "  Dining ", limit: 300 },
    { category: "", limit: 100 }, // no category → dropped
    { category: "Zero", limit: 0 }, // zero limit → dropped
    { category: "Neg", limit: -5 }, // negative → dropped
    { category: "Big", limit: 99_000_000 }, // clamped to 1M
    { category: "dining", limit: 250 }, // dupe (case-insensitive) — last wins
    { category: "Str", limit: "150" }, // numeric string coerced
  ]);
  assert.deepEqual(out, [
    { category: "dining", limit: 250 },
    { category: "Big", limit: 1_000_000 },
    { category: "Str", limit: 150 },
  ]);
});

check("budgetProgress: good / warn / over tones with pace projection", () => {
  // Fixture: Dining spend this month = 205; now = Jun 24 of a 30-day month,
  // so pace projection = 205 / 24 × 30 = 256.25.
  const txns = getTransactions(now);
  const statuses = F.budgetProgress(
    [
      { category: "Dining", limit: 300 }, // projected 256.25 < 300 → good
      { category: "dining", limit: 150 }, // spent 205 > 150 → over (case-insensitive)
      { category: "Travel", limit: 100 }, // no spend → good, 0%
    ],
    txns,
    now,
  );
  // sanitize isn't applied here — budgetProgress takes them as given, so the
  // duplicate category exercises independent evaluation.
  const good = statuses.find((s) => s.limit === 300)!;
  assert.equal(good.spent, 205);
  assert.equal(good.pct, 68);
  assert.equal(good.projected, 256.25);
  assert.equal(good.tone, "good");
  const over = statuses.find((s) => s.limit === 150)!;
  assert.equal(over.tone, "over");
  assert.equal(over.spent, 205);
  const idle = statuses.find((s) => s.category === "Travel")!;
  assert.equal(idle.spent, 0);
  assert.equal(idle.tone, "good");
  // worst first
  assert.equal(statuses[0].limit, 150);
});

check("budgetProgress: pacing-over turns warn before the limit is crossed", () => {
  const txns = getTransactions(now);
  const [s] = F.budgetProgress([{ category: "Dining", limit: 250 }], txns, now);
  // spent 205 ≤ 250 but projected 256.25 > 250 → warn
  assert.equal(s.tone, "warn");
  assert.equal(s.projected, 256.25);
});

check("budgetProgress holds pace warnings in the first days of a month", () => {
  // Day 2: one $60 dinner projects to $900 against a $300 limit — but pace
  // isn't reliable yet, so tone stays good (over still fires immediately).
  const day2 = new Date("2026-06-02T09:00:00Z");
  const txns = [
    { id: "d1", date: "2026-06-01T12:00:00.000Z", description: "Dinner", amount: -60, category: "Dining" },
  ];
  const [early] = F.budgetProgress([{ category: "Dining", limit: 300 }], txns, day2);
  assert.equal(early.projected, 900);
  assert.equal(early.tone, "good"); // no pace warning yet
  const [overEarly] = F.budgetProgress([{ category: "Dining", limit: 50 }], txns, day2);
  assert.equal(overEarly.tone, "over"); // actually over → flags regardless
});

check("budgetProgress ignores transfers (uses the same spend convention)", () => {
  const txns = [
    ...getTransactions(now),
    { id: "tt", date: iso(now, -2), description: "To savings", amount: -500, category: "Dining", transfer: true },
  ];
  const [s] = F.budgetProgress([{ category: "Dining", limit: 300 }], txns, now);
  assert.equal(s.spent, 205); // transfer didn't count against the budget
});

check("alertsToFire: fires once per key, respects threshold, re-arms monthly", () => {
  const over = {
    category: "Dining",
    limit: 200,
    spent: 260,
    pct: 130,
    projected: 300,
    tone: "over" as const,
  };
  const pacing = { ...over, category: "Fun", spent: 150, pct: 75, tone: "warn" as const };
  const base = {
    budgets: [over, pacing],
    safeToSpend: 120,
    safeToSpendBelow: 300,
    month: "2026-07",
    alreadySent: [] as string[],
  };

  // First evaluation: the over-budget category and low-safe fire; warn doesn't.
  const first = F.alertsToFire(base);
  assert.deepEqual(
    first.map((a) => a.key).sort(),
    ["budget-over:dining:2026-07", "low-safe:2026-07"],
  );

  // Same state with those keys recorded → nothing fires again (no spam).
  assert.deepEqual(
    F.alertsToFire({ ...base, alreadySent: first.map((a) => a.key) }),
    [],
  );

  // New month → keys differ → both re-arm.
  assert.equal(
    F.alertsToFire({ ...base, month: "2026-08", alreadySent: first.map((a) => a.key) }).length,
    2,
  );

  // Threshold respected: safe-to-spend above it, and 0 disables entirely.
  assert.deepEqual(
    F.alertsToFire({ ...base, budgets: [], safeToSpend: 500 }),
    [],
  );
  assert.deepEqual(
    F.alertsToFire({ ...base, budgets: [], safeToSpendBelow: 0 }),
    [],
  );
});

check("insights: budget alerts can't crowd out utilization / low safe-to-spend", () => {
  // Worst case: high utilization + 3 over-budget categories + a pacing warn +
  // low safe-to-spend. Budget alerts are capped at 2 so both safety-critical
  // insights keep a slot in the 4-item list.
  const status = (category: string, tone: "over" | "warn") => ({
    category,
    limit: 100,
    spent: tone === "over" ? 150 : 80,
    pct: tone === "over" ? 150 : 80,
    projected: 160,
    tone,
  });
  const insights = generateInsights({
    metrics: {
      totalLiquidity: 5000,
      spendable: 800,
      upcomingBillsTotal: 400,
      buffer: 200,
      reservedForGoals: 0,
      safeToSpend: 120, // < 300 → "low-safe" must fire
      savedThisMonth: 0,
      periodBudget: 500,
      billWindowDays: 14,
    },
    rescue: {
      totalDebt: 0,
      paid: 0,
      remaining: 0,
      pct: 0,
      payoffDate: "",
      monthsAhead: 0,
      monthlyPayment: 0,
      projectedMonths: 0,
    },
    utilization: { card: "Visa", pct: 45, balance: 1575, limit: 3500 },
    spendingTrend: null,
    budgets: [
      status("Dining", "over"),
      status("Groceries", "over"),
      status("Transport", "over"),
      status("Fun", "warn"),
    ],
  });
  const ids = insights.map((i) => i.id);
  assert.equal(insights.length, 4);
  assert.ok(ids.includes("utilization"));
  assert.ok(ids.includes("low-safe"));
  assert.equal(ids.filter((id) => id.startsWith("budget-")).length, 2);
});

check("renderDigest carries the snapshot's numbers verbatim", () => {
  const { subject, text } = renderDigest({
    userName: "Dayan",
    safeToSpend: 1240.5,
    totalLiquidity: 8450,
    spendable: 2650,
    upcomingBillsTotal: 420,
    upcomingBillsCount: 8,
    billWindowDays: 14,
    nextBill: { name: "Rent", amount: 1200, dueDate: "2026-07-01T00:00:00.000Z" },
    buffer: 200,
    savedThisMonth: 1759,
    incomeThisMonth: 2100,
    spentThisMonth: 341,
    topCategories: [{ category: "Dining", total: 205 }],
    topMerchants: [],
    budgets: [
      { category: "Dining", limit: 150, spent: 205, pct: 137, projected: 256, tone: "over" },
    ],
    forecast: {
      dailySafeToSpend: 124.05,
      avgDailySpend: 24.36,
      runwayDays: 40,
      monthsOfRunway: 8.45,
    },
    rescue: {
      totalDebt: 6400,
      paid: 2100,
      remaining: 4300,
      pct: 33,
      payoffDate: "April 2027",
      monthsAhead: 2,
      monthlyPayment: 400,
      projectedMonths: 9,
    },
    utilization: { card: "Chase Sapphire", pct: 34, balance: 1190, limit: 3500 },
  });
  assert.equal(subject, "Clarity digest: $1,241 safe to spend");
  for (const expected of [
    "SAFE TO SPEND: $1,240.50",
    "8 bills totaling $420 due in the next 14 days",
    "Next bill: Rent $1,200.00 on Jul 1",
    "In $2,100 · out $341 · net $1,759",
    "Dining: $205 / $150 (137%) — OVER by $55.00",
    "$4,300 remaining (33% paid off) · debt-free by April 2027",
    "Chase Sapphire utilization: 34%",
    "~40 days of cash at the recent pace · 8.45 months of expenses on hand",
  ]) {
    assert.ok(text.includes(expected), `digest missing: ${expected}\n---\n${text}`);
  }
});

/* --- Plaid → domain mapping (plaid-map.ts) --- */

// Minimal Plaid transaction stub; toTransaction only reads these fields.
const plaidTxn = (over: Record<string, unknown>) =>
  ({
    transaction_id: "abc123",
    account_id: "acct9",
    date: "2026-06-01",
    name: "NETFLIX.COM",
    merchant_name: "Netflix",
    amount: 15.99, // Plaid: positive = money out
    pending: false,
    personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV" },
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

check("toTransaction flips Plaid's sign and maps core fields", () => {
  const t = toTransaction(plaidTxn({}));
  assert.equal(t.id, "plaid_abc123");
  assert.equal(t.amount, -15.99); // outflow becomes negative
  assert.equal(t.description, "Netflix");
  assert.equal(t.accountId, "acct9");
  assert.equal(t.pending, false);
  assert.equal(t.transfer, false);
  assert.equal(t.date, "2026-06-01T00:00:00.000Z"); // date-only → UTC midnight
});

check("toTransaction maps categories (FOOD_AND_DRINK → Dining, title-cases others)", () => {
  assert.equal(
    toTransaction(plaidTxn({ personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" } })).category,
    "Dining",
  );
  assert.equal(
    toTransaction(plaidTxn({ personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER" } })).category,
    "General Merchandise",
  );
  // no PFC → falls back to legacy category, then "Other"
  assert.equal(toTransaction(plaidTxn({ personal_finance_category: null, category: ["Shops"] })).category, "Shops");
  assert.equal(toTransaction(plaidTxn({ personal_finance_category: null, category: null })).category, "Other");
});

check("toTransaction flags only genuinely-internal movements as transfers", () => {
  const det = (detailed: string, primary = "TRANSFER_OUT") =>
    toTransaction(plaidTxn({ personal_finance_category: { primary, detailed } })).transfer;
  assert.equal(det("TRANSFER_OUT_SAVINGS"), true);
  assert.equal(det("TRANSFER_IN_ACCOUNT_TRANSFER", "TRANSFER_IN"), true);
  assert.equal(det("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "LOAN_PAYMENTS"), true);
  // real income / real spending stay counted
  assert.equal(det("TRANSFER_IN_DEPOSIT", "TRANSFER_IN"), false);
  assert.equal(det("LOAN_PAYMENTS_CAR_PAYMENT", "LOAN_PAYMENTS"), false);
  assert.equal(det("INCOME_WAGES", "INCOME"), false);
});

check("toTransaction preserves pending and falls back to name", () => {
  const t = toTransaction(plaidTxn({ pending: true, merchant_name: null }));
  assert.equal(t.pending, true);
  assert.equal(t.description, "NETFLIX.COM");
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
