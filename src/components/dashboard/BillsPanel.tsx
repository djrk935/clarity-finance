import { CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import type { Bill } from "@/lib/types";

// UTC formatting: due dates are stored as UTC midnight (server-rendered).
const DFMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const AVG_MONTH_DAYS = 30.44;
const MAX_ROWS = 8;

/** Recurring bills/subscriptions, soonest due first. The header total is a
 *  true monthly equivalent (weekly bills count ~4.35×), shown only when every
 *  bill's cadence is known; otherwise we just show the count. */
export function BillsPanel({ bills }: { bills: Bill[] }) {
  const monthlyTotal = bills.every((b) => b.cadenceDays && b.cadenceDays > 0)
    ? bills.reduce((s, b) => s + b.amount * (AVG_MONTH_DAYS / (b.cadenceDays as number)), 0)
    : null;
  const overflow = bills.length - MAX_ROWS;

  return (
    <section className="panel">
      <h2 className="ptitle">
        <CalendarClock className="ic" size={16} aria-hidden />
        Recurring bills
        {bills.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
            {monthlyTotal != null
              ? `≈ ${formatCurrency(monthlyTotal, false)}/mo`
              : `${bills.length} ${bills.length === 1 ? "bill" : "bills"}`}
          </span>
        )}
      </h2>

      {bills.length === 0 ? (
        <p className="empty-note">
          No recurring bills detected yet — once a subscription or bill repeats a
          few times in your transactions, it&apos;ll show up here.
        </p>
      ) : (
        <>
          {bills.slice(0, MAX_ROWS).map((b) => (
            <div className="acct" key={b.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div className="txn-cat">
                  next {DFMT.format(new Date(b.dueDate))} · {b.category}
                </div>
              </div>
              <span className="amt tabular">{formatCurrency(b.amount)}</span>
            </div>
          ))}
          <p className="empty-note" style={{ marginTop: 12 }}>
            {overflow > 0 ? `+${overflow} more · ` : ""}
            Estimated from repeating payments in your history.
          </p>
        </>
      )}
    </section>
  );
}
