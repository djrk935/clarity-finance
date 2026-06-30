import { formatCurrency } from "@/lib/finance";
import type { Account } from "@/lib/types";

export function AccountsPanel({ accounts }: { accounts: Account[] }) {
  const depository = accounts.filter((a) => a.type !== "credit");
  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ≡
        </span>{" "}
        Accounts
      </h2>
      {depository.map((a) => (
        <div className="acct" key={a.id}>
          <span>{a.name}</span>
          <span className="amt tabular">{formatCurrency(a.balance)}</span>
        </div>
      ))}
    </section>
  );
}
