"use client";

import { useState } from "react";
import type { MonthlyPoint, PeriodKey, PeriodSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/finance";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "year", label: "Year" },
];

function CategoryBreakdown({ summary }: { summary: PeriodSummary }) {
  const max = Math.max(...summary.byCategory.map((c) => c.total), 1);
  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ◧
        </span>{" "}
        Where it went · {summary.label}
      </h2>
      {summary.byCategory.length === 0 ? (
        <p className="empty-note">No spending recorded in this period.</p>
      ) : (
        summary.byCategory.map((c) => (
          <div className="catrow" key={c.category}>
            <div className="catrow-top">
              <span className="catname" style={{ textTransform: "capitalize" }}>
                {c.category}
              </span>
              <span className="catamt">{formatCurrency(c.total)}</span>
            </div>
            <div className="prog">
              <span
                style={{ width: `${Math.max(2, Math.round((c.total / max) * 100))}%` }}
              />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function TopMerchants({ summary }: { summary: PeriodSummary }) {
  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ◈
        </span>{" "}
        Top merchants
      </h2>
      {summary.topMerchants.length === 0 ? (
        <p className="empty-note">No merchant activity in this period.</p>
      ) : (
        summary.topMerchants.map((m) => (
          <div className="acct" key={m.merchant}>
            <div>
              <div style={{ fontWeight: 600 }}>{m.merchant}</div>
              <div className="txn-cat">
                {m.count} {m.count === 1 ? "charge" : "charges"}
              </div>
            </div>
            <span className="txn-amt tabular">{formatCurrency(m.total)}</span>
          </div>
        ))
      )}
    </section>
  );
}

function TrendChart({ trend }: { trend: MonthlyPoint[] }) {
  const max = Math.max(...trend.flatMap((m) => [m.income, m.spending]), 1);
  const aria =
    "Monthly money in vs out: " +
    trend
      .map((m) => `${m.label} in $${Math.round(m.income)}, out $${Math.round(m.spending)}`)
      .join("; ");
  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ▦
        </span>{" "}
        6-month trend
      </h2>
      <div className="cf-legend" aria-hidden>
        <span>
          <i className="dot in" /> Income
        </span>
        <span>
          <i className="dot out" /> Spending
        </span>
      </div>
      <div className="bars io" role="img" aria-label={aria}>
        {trend.map((m) => (
          <div className="grp" key={m.label}>
            <i className="in" style={{ height: `${Math.round((m.income / max) * 100)}%` }} />
            <i className="out" style={{ height: `${Math.round((m.spending / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="barlbl" aria-hidden>
        {trend.map((m) => (
          <span key={m.label}>{m.label}</span>
        ))}
      </div>
    </section>
  );
}

/** Statements & reports: pick a period, see income vs spending and where it
 *  went. Powers "read my statements" + "track weekly/monthly/yearly". */
export function ReportsView({
  summaries,
  trend,
}: {
  summaries: Record<PeriodKey, PeriodSummary>;
  trend: MonthlyPoint[];
}) {
  const [key, setKey] = useState<PeriodKey>("month");
  const summary = summaries[key];
  const net = summary.net;

  return (
    <>
      <div
        className="navchips"
        style={{ marginBottom: 18 }}
        role="group"
        aria-label="Choose a period"
      >
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={p.key === key ? "nchip on" : "nchip"}
            onClick={() => setKey(p.key)}
            aria-pressed={p.key === key}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="kpis">
        <section className="panel">
          <div className="label">Money in · {summary.label}</div>
          <div className="val tabular" style={{ color: "var(--mint)", fontSize: 30 }}>
            {formatCurrency(summary.income, false)}
          </div>
          <div style={{ marginTop: 9, fontSize: 12, color: "var(--muted)" }}>
            {summary.txnCount} transactions
          </div>
        </section>
        <section className="panel">
          <div className="label">Money out</div>
          <div className="val tabular" style={{ color: "#ff9aa9", fontSize: 30 }}>
            {formatCurrency(summary.spending, false)}
          </div>
          <div style={{ marginTop: 9, fontSize: 12, color: "var(--muted)" }}>
            {summary.byCategory.length} categories
          </div>
        </section>
        <section className="panel">
          <div className="label">Net</div>
          <div
            className="val tabular"
            style={{ color: net >= 0 ? "var(--mint)" : "#ff9aa9", fontSize: 30 }}
          >
            {net >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(net), false)}
          </div>
          <div style={{ marginTop: 9 }}>
            <span className={net >= 0 ? "chip good" : "chip warn"}>
              {net >= 0 ? "CASH-FLOW POSITIVE" : "SPENDING > INCOME"}
            </span>
          </div>
        </section>
      </div>

      <div className="grid-main">
        <div className="col">
          <CategoryBreakdown summary={summary} />
        </div>
        <div className="col">
          <TopMerchants summary={summary} />
          <TrendChart trend={trend} />
        </div>
      </div>
    </>
  );
}
