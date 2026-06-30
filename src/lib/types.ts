/** Domain model for Clarity. These shapes intentionally mirror the Prisma
 *  schema (prisma/schema.prisma) so the mock store can be swapped for a real
 *  database without touching the UI. */

export type AccountType = "checking" | "savings" | "cash" | "credit";

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  /** Depository: cash on hand (positive). Credit: statement balance owed (positive). */
  balance: number;
  /** Only set for credit accounts. */
  creditLimit?: number;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  /** ISO date string. */
  dueDate: string;
  category: string;
}

export interface Debt {
  id: string;
  name: string;
  originalBalance: number;
  currentBalance: number;
  /** Annual percentage rate, e.g. 22.9 */
  apr: number;
  minPayment: number;
}

export interface Transaction {
  id: string;
  /** ISO date string. */
  date: string;
  description: string;
  /** Negative = outflow, positive = inflow. */
  amount: number;
  category: string;
}

export type InsightTone = "warn" | "good" | "info";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
}

export interface CashflowDay {
  label: string;
  outflow: number;
}

export interface Metrics {
  totalLiquidity: number;
  spendable: number;
  upcomingBillsTotal: number;
  buffer: number;
  reservedForGoals: number;
  safeToSpend: number;
  savedThisMonth: number;
  /** Discretionary budget for the period; used for the hero progress bar. */
  periodBudget: number;
}

export interface RescuePlan {
  totalDebt: number;
  paid: number;
  remaining: number;
  pct: number;
  payoffDate: string;
  monthsAhead: number;
  /** Total monthly payment in the active plan (minimums + extra). */
  monthlyPayment: number;
  /** Projected months until debt-free under the active plan. */
  projectedMonths: number;
}

export interface Utilization {
  card: string;
  pct: number;
  balance: number;
  limit: number;
}

export interface SpendingTrend {
  category: string;
  thisWeek: number;
  lastWeek: number;
  /** Percentage change; negative means spending went down. */
  pct: number;
}

/** Raw entities from a data source (mock or database), before assembly. */
export interface RawData {
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  transactions: Transaction[];
  cashflow: CashflowDay[];
}

/** Everything the dashboard needs, assembled by the data store. */
export interface DashboardData {
  user: { name: string };
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  metrics: Metrics;
  rescue: RescuePlan;
  utilization: Utilization | null;
  spendingTrend: SpendingTrend | null;
  cashflow: CashflowDay[];
  insights: Insight[];
}

/** Compact snapshot handed to the AI advisor so its answers stay grounded. */
export interface FinancialSnapshot {
  userName: string;
  safeToSpend: number;
  totalLiquidity: number;
  spendable: number;
  upcomingBillsTotal: number;
  upcomingBillsCount: number;
  nextBill: { name: string; amount: number; dueDate: string } | null;
  buffer: number;
  savedThisMonth: number;
  rescue: RescuePlan;
  utilization: Utilization | null;
}
