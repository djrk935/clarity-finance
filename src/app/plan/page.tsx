import { TrendingDown, Target, Flag } from "lucide-react";
import { getDashboardData } from "@/lib/data/store";
import { avalancheOrder, formatCurrency } from "@/lib/finance";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  if (!(await isAuthed())) return null;
  const d = await getDashboardData();
  const order = avalancheOrder(d.debts);
  const minTotal = d.debts.reduce((s, x) => s + x.minPayment, 0);
  const extra = d.rescue.monthlyPayment - minTotal;
  const hasDebt = d.rescue.remaining > 0;

  return (
    <>
      <PageHead
        title="Debt payoff"
        subtitle="Avalanche strategy — clear the highest-interest debt first."
      />

      {!hasDebt ? (
        <section className="panel">
          <h2 className="ptitle">
            <TrendingDown className="ic" size={16} aria-hidden />
            Debt payoff
          </h2>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
            No debts detected on your linked accounts. If you have credit cards
            or loans elsewhere, link them from the Accounts page and they&apos;ll
            show up here with a payoff plan.
          </p>
        </section>
      ) : (
        <>
          <div className="kpis">
            <KpiCard
              label="Debt remaining"
              amount={d.rescue.remaining}
              valueStyle={{ color: "var(--neg)" }}
            >
              <span style={{ color: "var(--muted)" }}>
                {d.debts.length} {d.debts.length === 1 ? "balance" : "balances"}
              </span>
            </KpiCard>
            <KpiCard label="Monthly minimums" amount={d.rescue.monthlyPayment}>
              <span style={{ color: "var(--muted)" }}>
                {extra > 0
                  ? `minimums + ${formatCurrency(extra, false)} extra`
                  : "sum of minimum payments"}
              </span>
            </KpiCard>
            <section className="panel">
              <div className="label">Debt-free</div>
              <div className="val" style={{ fontSize: 30 }}>
                {d.rescue.payoffDate}
              </div>
              <div style={{ marginTop: 11 }}>
                <span className="chip good">
                  {d.rescue.monthsAhead > 0
                    ? `${d.rescue.monthsAhead} months ahead`
                    : `~${d.rescue.projectedMonths} months`}
                </span>
              </div>
            </section>
          </div>

          <div className="grid-main">
            <div className="col">
              {order.map((debt, i) => (
                <section className="panel" key={debt.id}>
                  <h2 className="ptitle">
                    <span className="ic" aria-hidden>
                      {i + 1}
                    </span>{" "}
                    {debt.name}
                  </h2>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>
                      {formatCurrency(debt.currentBalance)} owed
                    </span>
                    <span className="chip warn">{debt.apr}% APR</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Minimum {formatCurrency(debt.minPayment, false)}/mo
                  </div>
                </section>
              ))}
            </div>

            <div className="col">
              <section className="panel">
                <h2 className="ptitle">
                  <Target className="ic" size={16} aria-hidden />
                  Focus order
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.5,
                    marginBottom: 14,
                  }}
                >
                  Pay every minimum, then put any extra toward #1 (highest APR)
                  until it&apos;s gone, then the next.
                </p>
                {order.map((debt, i) => (
                  <div className="acct" key={debt.id}>
                    <span>
                      <b style={{ color: "var(--accent)" }}>{i + 1}.</b> {debt.name}
                    </span>
                    <span className="amt tabular">{debt.apr}%</span>
                  </div>
                ))}
              </section>

              <section className="panel">
                <h2 className="ptitle">
                  <Flag className="ic" size={16} aria-hidden />
                  Why avalanche
                </h2>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                  Targeting the highest APR first minimises the total interest
                  you pay.
                  {order[0]
                    ? ` Clearing ${order[0].name} (${order[0].apr}%) saves the most.`
                    : ""}
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
