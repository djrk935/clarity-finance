import { formatCurrency } from "@/lib/finance";
import { Money } from "../ui/Money";

export function KpiHero({
  safeToSpend,
  buffer,
  periodBudget,
}: {
  safeToSpend: number;
  buffer: number;
  periodBudget: number;
}) {
  const pctLeft = Math.min(
    100,
    Math.max(0, Math.round((safeToSpend / periodBudget) * 100)),
  );

  return (
    <section className="panel hero" aria-label="Safe to spend">
      <div className="label">Safe to spend</div>
      <div className="val tabular">
        <Money amount={safeToSpend} />
      </div>
      <p className="hsub" style={{ fontSize: 12, margin: "12px 0" }}>
        Includes {formatCurrency(buffer, false)} buffer · {pctLeft}% of period left
      </p>
      <div className="prog">
        <span style={{ width: `${pctLeft}%` }} />
      </div>
    </section>
  );
}
