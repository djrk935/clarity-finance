import { getDashboardData } from "@/lib/data/store";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ActivityView } from "@/components/dashboard/ActivityView";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  if (!(await isAuthed())) return null;
  const d = await getDashboardData();

  return (
    <>
      <PageHead
        title="Activity"
        subtitle="Every transaction from your linked accounts — search and filter."
      />

      <div className="kpis">
        <KpiCard label="Spent this month" amount={d.totalSpentThisMonth} valueStyle={{ color: "#ff9aa9" }}>
          <span style={{ color: "var(--muted)" }}>
            {d.transactions.length} transactions on file
          </span>
        </KpiCard>
        <KpiCard
          label="Net this month"
          amount={d.metrics.savedThisMonth}
          valueStyle={{ color: d.metrics.savedThisMonth >= 0 ? "var(--mint)" : "#ff9aa9" }}
        >
          <span style={{ color: "var(--muted)" }}>income − spending</span>
        </KpiCard>
        <KpiCard label="Avg / day" amount={d.forecast.avgDailySpend}>
          <span style={{ color: "var(--muted)" }}>
            last 14 days
            {d.forecast.runwayDays != null
              ? ` · ${d.forecast.runwayDays}d runway`
              : ""}
          </span>
        </KpiCard>
      </div>

      <ActivityView transactions={d.transactions} />
    </>
  );
}
