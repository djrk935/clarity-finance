import { getDashboardData } from "@/lib/data/store";
import { summarizePeriod, monthlyTrend } from "@/lib/finance";
import { PageHead } from "@/components/dashboard/PageHead";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { isAuthed } from "@/lib/auth";
import type { PeriodKey, PeriodSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIOD_KEYS: PeriodKey[] = ["week", "month", "last-month", "year"];

export default async function ReportsPage() {
  if (!(await isAuthed())) return null;
  const d = await getDashboardData();
  const now = new Date();

  // Compute every period server-side so the toggle is instant and there's no
  // client/server clock drift (no hydration mismatch).
  const summaries = Object.fromEntries(
    PERIOD_KEYS.map((k) => [k, summarizePeriod(d.transactions, k, now)]),
  ) as Record<PeriodKey, PeriodSummary>;
  const trend = monthlyTrend(d.transactions, now, 6);

  const empty = d.transactions.length === 0;

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Your statement, by period — what came in, what went out, and where."
      />
      {empty ? (
        <section className="panel">
          <h2 className="ptitle">
            <span className="ic" aria-hidden>
              ▦
            </span>{" "}
            No data yet
          </h2>
          <p className="empty-note">
            Link a bank from the Accounts page and your statements will be
            generated here automatically from your real transactions.
          </p>
        </section>
      ) : (
        <ReportsView summaries={summaries} trend={trend} />
      )}
    </>
  );
}
