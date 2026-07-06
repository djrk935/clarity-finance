/** Renders the emailed digest from a FinancialSnapshot. Pure string assembly —
 *  every number comes from the snapshot (the same assembly the dashboard and
 *  advisor read), so the email can never disagree with the app. */

// Explicit .ts extension so the Node strip-types test runner can resolve this
// module (check-finance.mts exercises renderDigest directly).
import { formatCurrency, pluralize } from "./finance.ts";
import type { FinancialSnapshot } from "./types";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC", // bill dates are UTC-midnight ISO strings
});

export function renderDigest(s: FinancialSnapshot): {
  subject: string;
  text: string;
} {
  const lines: string[] = [];

  lines.push(`Hi ${s.userName} — here's where things stand.`);
  lines.push("");
  lines.push(
    `SAFE TO SPEND: ${formatCurrency(s.safeToSpend)}` +
      (s.forecast.dailySafeToSpend > 0
        ? ` (≈${formatCurrency(s.forecast.dailySafeToSpend)}/day for the rest of the month)`
        : ""),
  );
  lines.push(
    `Spendable cash ${formatCurrency(s.spendable, false)} · ` +
      `${pluralize(s.upcomingBillsCount, "bill")} totaling ${formatCurrency(
        s.upcomingBillsTotal,
        false,
      )} due in the next ${pluralize(s.billWindowDays, "day")}`,
  );
  if (s.nextBill) {
    lines.push(
      `Next bill: ${s.nextBill.name} ${formatCurrency(s.nextBill.amount)} on ${dayFmt.format(
        new Date(s.nextBill.dueDate),
      )}`,
    );
  }

  lines.push("");
  lines.push("THIS MONTH");
  lines.push(
    `In ${formatCurrency(s.incomeThisMonth, false)} · out ${formatCurrency(
      s.spentThisMonth,
      false,
    )} · net ${formatCurrency(s.savedThisMonth, false)}`,
  );
  if (s.topCategories.length > 0) {
    lines.push(
      "Top categories: " +
        s.topCategories
          .slice(0, 3)
          .map((c) => `${c.category} ${formatCurrency(c.total, false)}`)
          .join(" · "),
    );
  }

  if (s.budgets.length > 0) {
    lines.push("");
    lines.push("BUDGETS");
    for (const b of s.budgets) {
      const state =
        b.tone === "over"
          ? `OVER by ${formatCurrency(b.spent - b.limit)}`
          : b.tone === "warn"
            ? `trending over (pace ${formatCurrency(b.projected, false)})`
            : "on track";
      lines.push(
        `${b.category}: ${formatCurrency(b.spent, false)} / ${formatCurrency(
          b.limit,
          false,
        )} (${b.pct}%) — ${state}`,
      );
    }
  }

  if (s.rescue.remaining > 0) {
    lines.push("");
    lines.push("DEBT");
    lines.push(
      `${formatCurrency(s.rescue.remaining, false)} remaining (${s.rescue.pct}% paid off) · ` +
        `debt-free by ${s.rescue.payoffDate} on the current plan`,
    );
  }
  if (s.utilization) {
    lines.push(
      `${s.utilization.card} utilization: ${Math.round(s.utilization.pct)}%`,
    );
  }

  if (s.forecast.runwayDays !== null || s.forecast.monthsOfRunway !== null) {
    lines.push("");
    lines.push("RUNWAY");
    const parts: string[] = [];
    if (s.forecast.runwayDays !== null) {
      parts.push(`~${pluralize(s.forecast.runwayDays, "day")} of cash at the recent pace`);
    }
    if (s.forecast.monthsOfRunway !== null) {
      parts.push(`${s.forecast.monthsOfRunway} months of expenses on hand`);
    }
    lines.push(parts.join(" · "));
  }

  lines.push("");
  lines.push("— Clarity · manage alerts in Settings");

  return {
    subject: `Clarity digest: ${formatCurrency(s.safeToSpend, false)} safe to spend`,
    text: lines.join("\n"),
  };
}
