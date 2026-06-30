import type { CashflowDay } from "@/lib/types";
import { formatCurrency } from "@/lib/finance";

/** Daily money in (cyan) vs out (violet) over the last 7 days. */
export function CashflowChart({ days }: { days: CashflowDay[] }) {
  const max = Math.max(...days.flatMap((d) => [d.outflow, d.inflow]), 1);
  const totalIn = days.reduce((s, d) => s + d.inflow, 0);
  const totalOut = days.reduce((s, d) => s + d.outflow, 0);
  const aria =
    `Cash flow over the last 7 days. Money in ${formatCurrency(totalIn, false)}, ` +
    `out ${formatCurrency(totalOut, false)}. ` +
    days
      .map((d) => `${d.label}: in $${d.inflow}, out $${d.outflow}`)
      .join("; ");

  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ▦
        </span>{" "}
        Cash flow · last 7 days
      </h2>

      <div className="cf-legend" aria-hidden>
        <span>
          <i className="dot in" /> In {formatCurrency(totalIn, false)}
        </span>
        <span>
          <i className="dot out" /> Out {formatCurrency(totalOut, false)}
        </span>
      </div>

      <div className="bars io" role="img" aria-label={aria}>
        {days.map((d, i) => (
          <div className="grp" key={`${d.label}-${i}`}>
            <i
              className="in"
              style={{ height: `${Math.round((d.inflow / max) * 100)}%` }}
            />
            <i
              className="out"
              style={{ height: `${Math.round((d.outflow / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="barlbl" aria-hidden>
        {days.map((d, i) => (
          <span key={`${d.label}-${i}`}>{d.label}</span>
        ))}
      </div>
    </section>
  );
}
