"use client";

import { useMemo, useState } from "react";
import { Download, Receipt, Search } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { formatCurrency, transactionsToCsv } from "@/lib/finance";

// Format in UTC: dates are stored as UTC midnight, and this component renders
// on both server and client — a TZ-dependent formatter would hydrate-mismatch.
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function fmtDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

/** Searchable, filterable list of every transaction — "show me what I spent". */
export function ActivityView({ transactions }: { transactions: Transaction[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set(transactions.map((t) => t.category));
    return ["All", ...[...set].sort()];
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [transactions, query, category]);

  // Exports exactly what's on screen — the current search/category filter.
  function exportCsv() {
    const blob = new Blob([transactionsToCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clarity-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    let income = 0;
    let spending = 0;
    for (const t of filtered) {
      if (t.transfer) continue; // internal movement — not real spend/income
      if (t.amount >= 0) income += t.amount;
      else spending += Math.abs(t.amount);
    }
    return { income, spending, net: income - spending };
  }, [filtered]);

  if (transactions.length === 0) {
    return (
      <section className="panel">
        <h2 className="ptitle">
          <Receipt className="ic" size={16} aria-hidden />
          Transactions
        </h2>
        <p className="empty-note">
          No transactions yet. Link a bank from the Accounts page and your
          activity will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="ptitle">
        <Receipt className="ic" size={16} aria-hidden />
        Transactions
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {filtered.length} of {transactions.length}
        </span>
        <button
          type="button"
          className="nchip"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          aria-label={`Export ${filtered.length} transactions as CSV`}
        >
          <Download className="ic" size={14} aria-hidden />
          CSV
        </button>
      </h2>

      <div className="ainput" style={{ marginTop: 0, marginBottom: 14 }}>
        <Search size={16} aria-hidden style={{ color: "var(--muted-2)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants or categories…"
          aria-label="Search transactions"
        />
      </div>

      <div
        className="navchips"
        style={{ marginBottom: 16 }}
        role="group"
        aria-label="Filter by category"
      >
        {categories.map((c) => (
          <button
            key={c}
            className={c === category ? "nchip on" : "nchip"}
            onClick={() => setCategory(c)}
            aria-pressed={c === category}
          >
            {c}
          </button>
        ))}
      </div>

      <div
        className="row"
        style={{ marginBottom: 14, fontSize: 12, color: "var(--muted)" }}
      >
        <span>
          In{" "}
          <b style={{ color: "var(--pos)" }}>
            {formatCurrency(totals.income, false)}
          </b>
        </span>
        <span>
          Out{" "}
          <b style={{ color: "var(--neg)" }}>
            {formatCurrency(totals.spending, false)}
          </b>
        </span>
        <span>
          Net{" "}
          <b style={{ color: totals.net >= 0 ? "var(--pos)" : "var(--neg)" }}>
            {totals.net >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(totals.net), false)}
          </b>
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-note">No transactions match that filter.</p>
      ) : (
        <div style={{ maxHeight: 560, overflowY: "auto", paddingRight: 4 }}>
          {filtered.map((t) => {
            const income = t.amount >= 0;
            return (
              <div className="acct" key={t.id}>
                <div>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    {t.description}
                    {t.pending && <span className="tag">pending</span>}
                    {t.transfer && <span className="tag">transfer</span>}
                  </div>
                  <div className="txn-cat">
                    {fmtDate(t.date)} · {t.category}
                  </div>
                </div>
                <span
                  className={income ? "txn-amt in tabular" : "txn-amt tabular"}
                  style={t.transfer ? { color: "var(--muted-2)" } : undefined}
                >
                  {income ? "+" : "−"}
                  {formatCurrency(Math.abs(t.amount))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
