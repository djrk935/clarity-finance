import { TrendingUp } from "lucide-react";
import type { NetWorthPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/finance";

const W = 600;
const H = 180;
const PAD = 10;

// UTC formatter: snapshot dates are UTC calendar days — a local formatter
// would label them as the previous day west of UTC.
const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayLabel = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** Net worth (liquidity − debt) over time, one point per day, captured as the
 *  bank data syncs. Line chart with a dashed zero line when it's in range. */
export function NetWorthChart({ history }: { history: NetWorthPoint[] }) {
  const latest = history[history.length - 1];

  if (history.length < 2) {
    return (
      <section className="panel">
        <h2 className="ptitle">
          <TrendingUp className="ic" size={16} aria-hidden />
          Net worth over time
        </h2>
        <p className="empty-note">
          {latest
            ? `Tracking started: ${formatCurrency(latest.net, false)} as of ${dayLabel(
                latest.date,
              )}. A point is captured each day your data syncs — the trend line appears tomorrow.`
            : "A net-worth point is captured each day your data syncs. The trend line appears once there are two days of history."}
        </p>
      </section>
    );
  }

  const first = history[0];
  const nets = history.map((p) => p.net);
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  const span = max - min;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (history.length - 1);
  const y = (v: number) =>
    span === 0 ? H / 2 : PAD + ((max - v) * (H - 2 * PAD)) / span;
  const line = history
    .map((p, i) => `${x(i).toFixed(1)},${y(p.net).toFixed(1)}`)
    .join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  const delta = Math.round((latest.net - first.net) * 100) / 100;
  const aria =
    `Net worth from ${dayLabel(first.date)} to ${dayLabel(latest.date)}: ` +
    `now ${formatCurrency(latest.net, false)}, ` +
    `${delta >= 0 ? "up" : "down"} ${formatCurrency(Math.abs(delta), false)} over ` +
    `${history.length} days. Lowest ${formatCurrency(min, false)}, highest ${formatCurrency(max, false)}.`;

  return (
    <section className="panel">
      <h2 className="ptitle">
        <TrendingUp className="ic" size={16} aria-hidden />
        Net worth over time
      </h2>

      <div className="cf-legend" aria-hidden>
        <span>
          <i className="dot in" /> Now {formatCurrency(latest.net, false)}
        </span>
        <span className={delta >= 0 ? "chip good" : "chip warn"}>
          {delta >= 0 ? "+" : "−"}
          {formatCurrency(Math.abs(delta), false)} since {dayLabel(first.date)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={aria}
        style={{ width: "100%", height: 180, display: "block" }}
      >
        {min < 0 && max > 0 && (
          <line
            x1={PAD}
            y1={y(0)}
            x2={W - PAD}
            y2={y(0)}
            stroke="var(--muted-2)"
            strokeDasharray="4 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polygon points={area} fill="var(--accent)" fillOpacity="0.08" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div
        aria-hidden
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 11,
          color: "var(--muted)",
        }}
      >
        <span>{dayLabel(first.date)}</span>
        <span>{dayLabel(latest.date)}</span>
      </div>
    </section>
  );
}
