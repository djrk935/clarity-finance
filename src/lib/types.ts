/** Domain model for Clarity. Plain, source-agnostic shapes: the Plaid data
 *  source maps into these, the pure finance engine computes over them, and the
 *  UI renders them — so a different data source could be swapped in untouched. */

/** User-configurable settings that shape the numbers (persisted). */
export interface Settings {
  userName: string;
  /** Cash kept aside — excluded from "safe to spend". */
  buffer: number;
  /** Monthly amount reserved for savings goals — excluded from "safe to spend". */
  savingsGoal: number;
  /** Extra paid toward debt each month on top of the minimums. */
  extraDebtPayment: number;
  /** How many days ahead the "upcoming bills" window looks. */
  billWindowDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  userName: "Dayan",
  buffer: 0,
  savingsGoal: 0,
  extraDebtPayment: 0,
  billWindowDays: 14,
};

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
  /** Plaid account this belongs to (enables per-account views later). */
  accountId?: string;
  /** Not yet posted (amount may still change). */
  pending?: boolean;
  /** Internal movement — a transfer between accounts or a credit-card payment.
   *  Excluded from spending/income analytics so it doesn't distort totals. */
  transfer?: boolean;
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
  /** ISO date for the day (used for tooltips / ordering). */
  date?: string;
  outflow: number;
  inflow: number;
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

/** Raw entities straight from the data source, before assembly. */
export interface RawData {
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  transactions: Transaction[];
  cashflow: CashflowDay[];
}

export interface CategorySpend {
  category: string;
  total: number;
}

export interface MerchantSpend {
  merchant: string;
  total: number;
  count: number;
}

export type PeriodKey = "week" | "month" | "last-month" | "year";

/** A self-contained statement for a date range: what came in, what went out,
 *  and the breakdowns behind it. Powers the Reports/Statements page. */
export interface PeriodSummary {
  key: PeriodKey;
  label: string;
  /** ISO date strings bounding the period (inclusive). */
  from: string;
  to: string;
  income: number;
  spending: number;
  net: number;
  txnCount: number;
  byCategory: CategorySpend[];
  topMerchants: MerchantSpend[];
}

/** One month of in/out totals — for the rolling trend on the Reports page. */
export interface MonthlyPoint {
  label: string;
  income: number;
  spending: number;
  net: number;
}

export interface Forecast {
  /** Discretionary amount per day for the rest of the month. */
  dailySafeToSpend: number;
  /** Average daily outflow over the last 14 days. */
  avgDailySpend: number;
  /** Days spendable cash lasts at the current burn rate (null = unknown). */
  runwayDays: number | null;
  /** Months of expenses your liquidity covers (null = unknown). */
  monthsOfRunway: number | null;
}

/** Everything the dashboard needs, assembled by the data store. */
export interface DashboardData {
  user: { name: string };
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  transactions: Transaction[];
  subscriptions: Bill[];
  spendingByCategory: CategorySpend[];
  totalSpentThisMonth: number;
  forecast: Forecast;
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
  incomeThisMonth: number;
  spentThisMonth: number;
  /** Top spending categories this month (biggest first, up to ~5). */
  topCategories: CategorySpend[];
  /** Biggest merchants this month (biggest first, up to ~5). */
  topMerchants: MerchantSpend[];
  forecast: Forecast;
  rescue: RescuePlan;
  utilization: Utilization | null;
}
