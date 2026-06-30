/** Seeded, realistic demo data for a "financial rescue" scenario.
 *  Dates are generated relative to `now` so bills always fall in-window and
 *  the dining trend stays meaningful. Swap this module for Prisma queries
 *  later — the shapes already match prisma/schema.prisma. */

import type { Account, Bill, Debt, Transaction, CashflowDay } from "../types";

function iso(now: Date, offsetDays: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export const accounts: Account[] = [
  { id: "acc_chk", name: "Chase Checking", institution: "Chase", type: "checking", balance: 2150.0 },
  { id: "acc_sav", name: "Ally Savings", institution: "Ally", type: "savings", balance: 5800.0 },
  { id: "acc_cash", name: "Cash", institution: "Wallet", type: "cash", balance: 500.0 },
  { id: "acc_cc", name: "Chase Sapphire", institution: "Chase", type: "credit", balance: 1190.0, creditLimit: 3500.0 },
];

export const debts: Debt[] = [
  { id: "debt_cc", name: "Chase Sapphire", originalBalance: 1800.0, currentBalance: 1190.0, apr: 22.9, minPayment: 85.0 },
  { id: "debt_loan", name: "Personal loan", originalBalance: 4600.0, currentBalance: 3110.0, apr: 11.5, minPayment: 140.0 },
];

/** Upcoming bills — total $420.00 within the next 14 days. */
export function getBills(now: Date = new Date()): Bill[] {
  return [
    { id: "bill_stream", name: "Streaming", amount: 20.0, dueDate: iso(now, 3), category: "Subscriptions" },
    { id: "bill_elec", name: "Electricity", amount: 90.0, dueDate: iso(now, 5), category: "Utilities" },
    { id: "bill_water", name: "Water", amount: 25.0, dueDate: iso(now, 7), category: "Utilities" },
    { id: "bill_net", name: "Internet", amount: 60.0, dueDate: iso(now, 9), category: "Utilities" },
    { id: "bill_ccmin", name: "Card minimum", amount: 85.0, dueDate: iso(now, 11), category: "Debt" },
    { id: "bill_ins", name: "Car insurance", amount: 80.0, dueDate: iso(now, 11), category: "Insurance" },
    { id: "bill_phone", name: "Phone", amount: 45.0, dueDate: iso(now, 12), category: "Utilities" },
    { id: "bill_gym", name: "Gym", amount: 15.0, dueDate: iso(now, 13), category: "Subscriptions" },
    // a couple beyond the 14-day window, to prove the filter works
    { id: "bill_rent", name: "Rent", amount: 1450.0, dueDate: iso(now, 19), category: "Housing" },
  ];
}

/** Dining this week totals $96, last week $109 → ~12% drop. */
export function getTransactions(now: Date = new Date()): Transaction[] {
  return [
    // this week (last 7 days) — dining $96
    { id: "tx1", date: iso(now, -1), description: "Tacos", amount: -28.0, category: "Dining" },
    { id: "tx2", date: iso(now, -3), description: "Coffee runs", amount: -22.0, category: "Dining" },
    { id: "tx3", date: iso(now, -5), description: "Dinner out", amount: -46.0, category: "Dining" },
    // last week — dining $109
    { id: "tx4", date: iso(now, -8), description: "Brunch", amount: -39.0, category: "Dining" },
    { id: "tx5", date: iso(now, -10), description: "Takeout", amount: -34.0, category: "Dining" },
    { id: "tx6", date: iso(now, -12), description: "Pizza night", amount: -36.0, category: "Dining" },
    // other categories (for realism)
    { id: "tx7", date: iso(now, -2), description: "Groceries", amount: -82.0, category: "Groceries" },
    { id: "tx8", date: iso(now, -4), description: "Gas", amount: -54.0, category: "Transport" },
    { id: "tx9", date: iso(now, -6), description: "Paycheck", amount: 2100.0, category: "Income" },
  ];
}

/** Outflow per day for the last 7 days (Mon→Sun) for the cash-flow chart. */
export const cashflow: CashflowDay[] = [
  { label: "Mon", outflow: 62 },
  { label: "Tue", outflow: 95 },
  { label: "Wed", outflow: 74 },
  { label: "Thu", outflow: 135 },
  { label: "Fri", outflow: 84 },
  { label: "Sat", outflow: 108 },
  { label: "Sun", outflow: 57 },
];
