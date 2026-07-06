import Link from "next/link";
import { Gauge } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import type { BudgetStatus } from "@/lib/types";

const TONE_COLOR: Record<BudgetStatus["tone"], string> = {
  good: "var(--accent)",
  warn: "#fbbf24",
  over: "var(--neg)",
};

/** Monthly category budgets with pace: bar fill = share of the limit spent,
 *  colored by whether the current pace stays under it. */
export function BudgetsPanel({ budgets }: { budgets: BudgetStatus[] }) {
  return (
    <section className="panel">
      <h2 className="ptitle">
        <Gauge className="ic" size={16} aria-hidden />
        Budgets · this month
      </h2>

      {budgets.length === 0 ? (
        <p className="empty-note">
          No budgets yet — set monthly limits per category in{" "}
          <Link href="/settings" style={{ color: "var(--accent)" }}>
            Settings
          </Link>{" "}
          and I&apos;ll track your pace here.
        </p>
      ) : (
        budgets.map((b) => (
          <div className="catrow" key={b.category}>
            <div className="catrow-top">
              <span style={{ textTransform: "capitalize" }}>
                {b.category}
                {b.tone === "over" && <span className="chip warn" style={{ marginLeft: 8 }}>over</span>}
              </span>
              <span className="catamt">
                {formatCurrency(b.spent, false)}{" "}
                <span style={{ color: "var(--muted-2)" }}>
                  / {formatCurrency(b.limit, false)}
                </span>
              </span>
            </div>
            <div
              className="prog"
              role="img"
              aria-label={`${b.category}: ${formatCurrency(b.spent)} of ${formatCurrency(
                b.limit,
              )} (${b.pct}%), ${
                b.tone === "over"
                  ? "over budget"
                  : b.tone === "warn"
                    ? "trending over"
                    : "on track"
              }`}
            >
              <span
                style={{
                  width: `${Math.min(100, Math.max(2, b.pct))}%`,
                  background: TONE_COLOR[b.tone],
                }}
              />
            </div>
            {b.tone !== "good" && (
              <div className="txn-cat" style={{ marginTop: 5 }}>
                {b.tone === "over"
                  ? `${formatCurrency(b.spent - b.limit)} over the limit`
                  : `on pace for ${formatCurrency(b.projected, false)}`}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
