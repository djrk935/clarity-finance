import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { isAdmin, auth } from "@/lib/auth";
import { getUserById } from "@/lib/data/user-store";
import { getDashboardData } from "@/lib/data/store";
import { formatCurrency } from "@/lib/finance";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { BudgetsPanel } from "@/components/dashboard/BudgetsPanel";
import { ActivityView } from "@/components/dashboard/ActivityView";

export const dynamic = "force-dynamic";

/** Read-only operator view of one user's account, exactly as the numbers
 *  appear to them. Strictly a view: no settings writes, no sync, no advisor —
 *  none of the mutating routes accept anyone else's user id. Every render is
 *  logged with who looked, so there's an access trail in the platform logs. */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  if (!(await isAdmin())) return null;

  const { userId } = await params;
  const user = await getUserById(userId).catch(() => null);
  if (!user) {
    return (
      <section className="panel">
        <p className="empty-note">
          No such user. <Link href="/admin" style={{ color: "var(--accent)" }}>Back to admin</Link>
        </p>
      </section>
    );
  }

  const session = await auth();
  console.log(
    `[admin-audit] ${session?.user?.email ?? "unknown"} viewed user ${user.id} (${user.email}) at ${new Date().toISOString()}`,
  );

  const d = await getDashboardData(user.id);

  return (
    <>
      <PageHead
        title={`Admin · ${user.name || user.email}`}
        subtitle={`Read-only view of ${user.email}'s account. This access is logged.`}
      />
      <div style={{ marginBottom: 14 }}>
        <Link href="/admin" className="nchip">
          ← All users
        </Link>
        <span className="chip warn" style={{ marginLeft: 10 }}>
          <ShieldCheck size={12} aria-hidden style={{ marginRight: 4 }} />
          OPERATOR VIEW
        </span>
      </div>

      {d.accounts.length === 0 ? (
        <section className="panel">
          <p className="empty-note">This user hasn&apos;t linked a bank yet.</p>
        </section>
      ) : (
        <>
          <div className="kpis">
            <KpiCard label="Safe to spend" amount={d.metrics.safeToSpend} />
            <KpiCard label="Liquidity" amount={d.metrics.totalLiquidity} />
            <KpiCard
              label="Debt remaining"
              amount={d.rescue.remaining}
              valueStyle={{ color: d.rescue.remaining > 0 ? "var(--neg)" : "var(--pos)" }}
            />
          </div>

          <section className="panel" style={{ marginBottom: 18 }}>
            <h2 className="ptitle">Accounts</h2>
            {d.accounts.map((a) => (
              <div className="acct" key={a.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="txn-cat">{a.type}</div>
                </div>
                <span className="txn-amt tabular">{formatCurrency(a.balance)}</span>
              </div>
            ))}
          </section>

          <div className="grid-main">
            <div className="col">
              <ActivityView transactions={d.transactions} />
            </div>
            <div className="col">
              <BudgetsPanel budgets={d.budgets} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
