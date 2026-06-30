/** Turns raw numbers into a short, prioritised list of human insights.
 *  Pure function — easy to test and reason about. */

import { formatCurrency, payToUtilizationTarget } from "./finance";
import type {
  CategorySpend,
  Insight,
  Metrics,
  RescuePlan,
  SpendingTrend,
  Utilization,
} from "./types";

const SAFE_UTILIZATION = 30;

export interface InsightInput {
  metrics: Metrics;
  rescue: RescuePlan;
  utilization: Utilization | null;
  spendingTrend: SpendingTrend | null;
  /** Largest spending category this month, if any. */
  topCategory?: CategorySpend | null;
}

export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { metrics, rescue, utilization, spendingTrend, topCategory } = input;

  if (utilization && utilization.pct >= SAFE_UTILIZATION) {
    const pay = payToUtilizationTarget(
      utilization.balance,
      utilization.limit,
      SAFE_UTILIZATION,
    );
    out.push({
      id: "utilization",
      tone: "warn",
      title: "High utilization",
      detail: `${utilization.card} is at ${Math.round(utilization.pct)}% — pay ${formatCurrency(
        pay,
        false,
      )} before your statement closes to get under ${SAFE_UTILIZATION}% and protect your score.`,
    });
  }

  if (metrics.safeToSpend < 300) {
    out.push({
      id: "low-safe",
      tone: "warn",
      title: "Tight week ahead",
      detail: `Only ${formatCurrency(
        metrics.safeToSpend,
      )} is safe to spend before your next bills. Hold off on non-essentials.`,
    });
  }

  if (spendingTrend && spendingTrend.pct < 0) {
    out.push({
      id: "dining-down",
      tone: "good",
      title: `${spendingTrend.category} down ${Math.abs(spendingTrend.pct)}%`,
      detail: `You spent ${formatCurrency(
        spendingTrend.thisWeek,
      )} this week vs ${formatCurrency(spendingTrend.lastWeek)} last week. Under budget — nice work.`,
    });
  }

  if (rescue.monthsAhead > 0) {
    out.push({
      id: "ahead",
      tone: "info",
      title: `${rescue.monthsAhead} months ahead of plan`,
      detail: `Keep this pace and you'll be debt-free by ${rescue.payoffDate}.`,
    });
  }

  if (topCategory && topCategory.total > 0) {
    out.push({
      id: "top-category",
      tone: "info",
      title: `${topCategory.category} is your biggest spend`,
      detail: `You've put ${formatCurrency(
        topCategory.total,
      )} toward ${topCategory.category} this month — your largest category so far.`,
    });
  }

  return out.slice(0, 3);
}
