"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import type { Settings } from "@/lib/types";

type NumKey =
  | "buffer"
  | "savingsGoal"
  | "extraDebtPayment"
  | "billWindowDays"
  | "alertSafeToSpendBelow";

/** One editable budget row (strings while editing; coerced on submit). */
interface BudgetRow {
  category: string;
  limit: string;
}

/** Form state holds raw strings so numeric fields can be cleared/edited freely
 *  (no snap-to-zero); values are coerced on submit. */
type FormState = {
  userName: string;
  budgets: BudgetRow[];
  alertsEnabled: boolean;
  alertEmail: string;
} & Record<NumKey, string>;

function toForm(s: Settings): FormState {
  return {
    userName: s.userName,
    buffer: String(s.buffer),
    savingsGoal: String(s.savingsGoal),
    extraDebtPayment: String(s.extraDebtPayment),
    billWindowDays: String(s.billWindowDays),
    budgets: s.budgets.map((b) => ({ category: b.category, limit: String(b.limit) })),
    alertsEnabled: s.alertsEnabled,
    alertEmail: s.alertEmail,
    alertSafeToSpendBelow: String(s.alertSafeToSpendBelow),
  };
}

export function SettingsForm({
  initial,
  categorySuggestions = [],
}: {
  initial: Settings;
  categorySuggestions?: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function set(k: "userName" | NumKey, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function setBudget(i: number, patch: Partial<BudgetRow>) {
    setForm((f) => ({
      ...f,
      budgets: f.budgets.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    }));
    setSaved(false);
  }

  function addBudget() {
    setForm((f) => ({ ...f, budgets: [...f.budgets, { category: "", limit: "" }] }));
    setSaved(false);
  }

  function removeBudget(i: number) {
    setForm((f) => ({ ...f, budgets: f.budgets.filter((_, j) => j !== i) }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    // Coerce numbers; omit a blank name so it keeps the current value.
    // Blank/invalid budget rows are dropped here (and re-validated server-side).
    const payload: Record<string, unknown> = {
      buffer: Number(form.buffer) || 0,
      savingsGoal: Number(form.savingsGoal) || 0,
      extraDebtPayment: Number(form.extraDebtPayment) || 0,
      billWindowDays: Number(form.billWindowDays) || 0,
      budgets: form.budgets
        .map((b) => ({ category: b.category.trim(), limit: Number(b.limit) || 0 }))
        .filter((b) => b.category && b.limit > 0),
      alertsEnabled: form.alertsEnabled,
      alertEmail: form.alertEmail.trim(),
      alertSafeToSpendBelow: Number(form.alertSafeToSpendBelow) || 0,
    };
    if (form.userName.trim()) payload.userName = form.userName.trim();

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("Couldn't save — please try again.");
      } else {
        const data = (await res.json()) as { settings: Settings };
        setForm(toForm(data.settings)); // reflect clamped/normalized values
        setSaved(true);
        router.refresh(); // re-render pages with the new numbers
      }
    } catch {
      setError("Network hiccup — try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  const money = (k: NumKey, label: string, desc: string) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <div className="desc">{desc}</div>
      <div className="ainput" style={{ marginTop: 8 }}>
        <span style={{ color: "var(--muted-2)" }}>$</span>
        <input
          id={k}
          type="number"
          min={0}
          step={10}
          inputMode="decimal"
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="panel" style={{ maxWidth: 560 }}>
      <div className="field">
        <label htmlFor="userName">Display name</label>
        <div className="desc">Shown in greetings and the advisor.</div>
        <div className="ainput" style={{ marginTop: 8 }}>
          <input
            id="userName"
            type="text"
            maxLength={40}
            placeholder={initial.userName}
            value={form.userName}
            onChange={(e) => set("userName", e.target.value)}
          />
        </div>
      </div>

      {money("buffer", "Safety buffer", "Cash kept aside — held back from what's safe to spend.")}
      {money(
        "savingsGoal",
        "Monthly savings goal",
        "Set aside for savings each month — also held back from safe to spend.",
      )}
      {money(
        "extraDebtPayment",
        "Extra debt payment / month",
        "Paid toward debt on top of the minimums — powers the payoff plan and “months ahead”.",
      )}

      <div className="field">
        <label htmlFor="billWindowDays">Upcoming-bills window (days)</label>
        <div className="desc">How far ahead the dashboard looks for bills (1–60).</div>
        <div className="ainput" style={{ marginTop: 8 }}>
          <input
            id="billWindowDays"
            type="number"
            min={1}
            max={60}
            step={1}
            value={form.billWindowDays}
            onChange={(e) => set("billWindowDays", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Monthly category budgets</label>
        <div className="desc">
          Spending caps per category — the dashboard tracks your pace and warns
          when you&apos;re trending over.
        </div>
        <datalist id="budget-categories">
          {categorySuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {form.budgets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div className="ainput" style={{ marginTop: 0, flex: 2 }}>
              <input
                list="budget-categories"
                placeholder="Category (e.g. Dining)"
                aria-label={`Budget ${i + 1} category`}
                value={b.category}
                onChange={(e) => setBudget(i, { category: e.target.value })}
              />
            </div>
            <div className="ainput" style={{ marginTop: 0, flex: 1 }}>
              <span style={{ color: "var(--muted-2)" }}>$</span>
              <input
                type="number"
                min={1}
                step={10}
                inputMode="decimal"
                placeholder="Limit"
                aria-label={`Budget ${i + 1} monthly limit`}
                value={b.limit}
                onChange={(e) => setBudget(i, { limit: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="iconbtn"
              onClick={() => removeBudget(i)}
              aria-label={`Remove budget ${b.category || i + 1}`}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="nchip"
          style={{ marginTop: 10 }}
          onClick={addBudget}
        >
          <Plus className="ic" size={14} aria-hidden />
          Add budget
        </button>
      </div>

      <div className="field">
        <label htmlFor="alertsEnabled">Email alerts</label>
        <div className="desc">
          Get an email when a budget goes over or safe-to-spend runs low. Off by
          default — nothing is sent unless you turn this on.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            id="alertsEnabled"
            type="checkbox"
            checked={form.alertsEnabled}
            onChange={(e) => {
              const checked = e.target.checked;
              setForm((f) => ({ ...f, alertsEnabled: checked }));
              setSaved(false);
            }}
          />
          <label htmlFor="alertsEnabled" style={{ fontWeight: 400, fontSize: 13 }}>
            Send spending alerts by email
          </label>
        </div>
        {form.alertsEnabled && (
          <>
            <div className="ainput" style={{ marginTop: 8 }}>
              <input
                type="email"
                maxLength={254}
                placeholder="you@example.com"
                aria-label="Alert email address"
                value={form.alertEmail}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, alertEmail: v }));
                  setSaved(false);
                }}
              />
            </div>
            <div className="desc" style={{ marginTop: 10 }}>
              Alert when safe-to-spend drops below ($0 = never):
            </div>
            <div className="ainput" style={{ marginTop: 8 }}>
              <span style={{ color: "var(--muted-2)" }}>$</span>
              <input
                type="number"
                min={0}
                step={25}
                inputMode="decimal"
                aria-label="Safe-to-spend alert threshold"
                value={form.alertSafeToSpendBelow}
                onChange={(e) => set("alertSafeToSpendBelow", e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button type="submit" className="cta" disabled={saving}>
          {saved ? <Check size={16} aria-hidden /> : null}
          {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
        </button>
        {error && <span style={{ color: "var(--neg)", fontSize: 13 }}>{error}</span>}
      </div>
    </form>
  );
}
