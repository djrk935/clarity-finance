import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/data/user-store";
import { readPlaidToken } from "@/lib/token-store";
import { PageHead } from "@/components/dashboard/PageHead";

export const dynamic = "force-dynamic";

const joinedFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Operator roster — every account, whether a bank is linked, and a link into
 *  the read-only per-user view. Server-gated by ADMIN_EMAIL on every render. */
export default async function AdminPage() {
  if (!(await isAdmin())) return null;

  const users = await listUsers();
  const linked = await Promise.all(
    users.map(async (u) => (await readPlaidToken(u.id)) !== null),
  );

  return (
    <>
      <PageHead
        title="Admin"
        subtitle="Operator view — every account on this instance. Views of user data are logged."
      />
      <section className="panel">
        <h2 className="ptitle">
          <ShieldCheck className="ic" size={16} aria-hidden />
          Users · {users.length}
        </h2>
        {users.length === 0 ? (
          <p className="empty-note">No accounts yet — share the invite code.</p>
        ) : (
          users.map((u, i) => (
            <div className="acct" key={u.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{u.name || u.email}</div>
                <div className="txn-cat">
                  {u.email} · joined {joinedFmt.format(new Date(u.createdAt))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={linked[i] ? "chip good" : "chip"}>
                  {linked[i] ? "BANK LINKED" : "NO BANK"}
                </span>
                <Link href={`/admin/${u.id}`} className="nchip">
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
