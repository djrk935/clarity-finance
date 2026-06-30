import type { CashflowDay } from "@/lib/types";

export function CashflowChart({ days }: { days: CashflowDay[] }) {
  const max = Math.max(...days.map((d) => d.outflow), 1);
  const aria =
    "Daily outflow over the last 7 days: " +
    days.map((d) => `${d.label} $${d.outflow}`).join(", ");

  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ▦
        </span>{" "}
        Cash flow · last 7 days
      </h2>
      <div className="bars" role="img" aria-label={aria}>
        {days.map((d) => (
          <i
            key={d.label}
            className={d.outflow === max ? "hot" : undefined}
            style={{ height: `${Math.round((d.outflow / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="barlbl" aria-hidden>
        {days.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </section>
  );
}
