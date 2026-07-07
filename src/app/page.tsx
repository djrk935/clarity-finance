import { getDashboardData } from "@/lib/data/store";
import { formatCurrency, pluralize } from "@/lib/finance";
import { currentUserId } from "@/lib/auth";
import { KpiHero } from "@/components/dashboard/KpiHero";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { RescuePlan } from "@/components/dashboard/RescuePlan";
import { InsightsPanel } from "@/components/dashboard/InsightsPanel";
import { AccountsPanel } from "@/components/dashboard/AccountsPanel";
import { BillsPanel } from "@/components/dashboard/BillsPanel";
import { BudgetsPanel } from "@/components/dashboard/BudgetsPanel";
import { AdvisorChat } from "@/components/dashboard/AdvisorChat";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await currentUserId();
  if (!userId) return null;
  const d = await getDashboardData(userId);
  const accountCount = d.accounts.filter((a) => a.type !== "credit").length;

  return (
    <>
      <div className="kpis">
        <KpiHero
          safeToSpend={d.metrics.safeToSpend}
          buffer={d.metrics.buffer}
          periodBudget={d.metrics.periodBudget}
        />
        <KpiCard label="Total liquidity" amount={d.metrics.totalLiquidity}>
          <span style={{ color: "var(--muted)" }}>{accountCount} accounts</span>
        </KpiCard>
        <KpiCard
          label={`Bills · ${pluralize(d.metrics.billWindowDays, "day")}`}
          amount={d.metrics.upcomingBillsTotal}
          valueStyle={{ color: "var(--neg)" }}
        >
          <span
            className="delta"
            style={{
              color: d.metrics.savedThisMonth >= 0 ? "var(--pos)" : "var(--neg)",
            }}
          >
            {d.metrics.savedThisMonth >= 0
              ? `Saved +${formatCurrency(d.metrics.savedThisMonth, false)} MTD`
              : `Net ${formatCurrency(d.metrics.savedThisMonth, false)} MTD`}
          </span>
        </KpiCard>
      </div>

      <div className="grid-main">
        <div className="col">
          <AdvisorChat />
          <CashflowChart days={d.cashflow} />
          <BillsPanel bills={d.subscriptions} />
        </div>
        <div className="col">
          <InsightsPanel insights={d.insights} />
          <BudgetsPanel budgets={d.budgets} />
          <RescuePlan rescue={d.rescue} />
          <AccountsPanel accounts={d.accounts} />
        </div>
      </div>
    </>
  );
}
