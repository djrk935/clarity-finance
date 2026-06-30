import { formatCurrency } from "@/lib/finance";
import type { RescuePlan as RescuePlanData } from "@/lib/types";

export function RescuePlan({ rescue }: { rescue: RescuePlanData }) {
  const hasDebt = rescue.remaining > 0;

  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ▤
        </span>{" "}
        Debt payoff
      </h2>

      {!hasDebt ? (
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
          No debts detected on your linked accounts — nothing to pay off.
        </p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 11 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {formatCurrency(rescue.remaining, false)} remaining
            </span>
            <span className="chip good">{formatCurrency(rescue.totalDebt, false)} total</span>
          </div>
          <div className="prog">
            <span style={{ width: `${Math.max(2, rescue.pct)}%` }} />
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 11 }}>
            Projected debt-free {rescue.payoffDate}
            {rescue.monthsAhead > 0 ? ` · ${rescue.monthsAhead} months ahead` : ""}
          </p>
        </>
      )}
    </section>
  );
}
