import { getDashboardData } from "@/lib/data/store";
import { creditUtilization, formatCurrency } from "@/lib/finance";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ConnectBank } from "@/components/dashboard/ConnectBank";
import { isAuthed } from "@/lib/auth";

export default async function AccountsPage() {
  if (!(await isAuthed())) return null;
  const d = await getDashboardData();
  const depository = d.accounts.filter((a) => a.type !== "credit");
  const credit = d.accounts.filter((a) => a.type === "credit");
  const totalDebt = d.rescue.remaining;
  const net = d.metrics.totalLiquidity - totalDebt;

  return (
    <>
      <PageHead title="Accounts" subtitle="Everything you own and owe, in one place." />

      <div className="kpis">
        <KpiCard label="Total liquidity" amount={d.metrics.totalLiquidity}>
          <span style={{ color: "var(--muted)" }}>{depository.length} accounts</span>
        </KpiCard>
        <KpiCard label="Total debt" amount={totalDebt} valueStyle={{ color: "#ff9aa9" }}>
          <span style={{ color: "var(--muted)" }}>{d.debts.length} balances</span>
        </KpiCard>
        <KpiCard
          label="Net position"
          amount={net}
          valueStyle={{ color: net >= 0 ? "var(--mint)" : "#ff9aa9" }}
        >
          <span style={{ color: "var(--muted)" }}>liquidity − debt</span>
        </KpiCard>
      </div>

      <div className="grid-main">
        <div className="col">
          <section className="panel">
            <h2 className="ptitle">
              <span className="ic" aria-hidden>
                ≡
              </span>{" "}
              Cash &amp; savings
            </h2>
            {depository.map((a) => (
              <div className="acct" key={a.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      textTransform: "capitalize",
                    }}
                  >
                    {a.institution} · {a.type}
                  </div>
                </div>
                <span className="amt tabular">{formatCurrency(a.balance)}</span>
              </div>
            ))}
          </section>
        </div>

        <div className="col">
          <ConnectBank />
          {credit.map((c) => {
            const pct = creditUtilization(c);
            const high = pct >= 30;
            return (
              <section className="panel" key={c.id}>
                <h2 className="ptitle">
                  <span className="ic" aria-hidden>
                    ◧
                  </span>{" "}
                  {c.name}
                </h2>
                <div className="row" style={{ marginBottom: 11 }}>
                  <span style={{ fontSize: 14 }}>
                    {formatCurrency(c.balance)}{" "}
                    <span style={{ color: "var(--muted)" }}>
                      / {formatCurrency(c.creditLimit ?? 0)}
                    </span>
                  </span>
                  <span className={high ? "chip warn" : "chip good"}>
                    {Math.round(pct)}% USED
                  </span>
                </div>
                <div className="prog">
                  <span
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: high
                        ? "linear-gradient(90deg,#fb3b53,#fb7185)"
                        : undefined,
                    }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 11 }}>
                  {high
                    ? "Above the 30% mark — paying this down lifts your score."
                    : "Healthy utilization."}
                </p>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
