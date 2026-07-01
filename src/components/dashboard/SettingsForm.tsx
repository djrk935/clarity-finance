"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Settings } from "@/lib/types";

type NumKey = "buffer" | "savingsGoal" | "extraDebtPayment" | "billWindowDays";

/** Form state holds raw strings so numeric fields can be cleared/edited freely
 *  (no snap-to-zero); values are coerced on submit. */
type FormState = { userName: string } & Record<NumKey, string>;

function toForm(s: Settings): FormState {
  return {
    userName: s.userName,
    buffer: String(s.buffer),
    savingsGoal: String(s.savingsGoal),
    extraDebtPayment: String(s.extraDebtPayment),
    billWindowDays: String(s.billWindowDays),
  };
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof FormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    // Coerce numbers; omit a blank name so it keeps the current value.
    const payload: Record<string, unknown> = {
      buffer: Number(form.buffer) || 0,
      savingsGoal: Number(form.savingsGoal) || 0,
      extraDebtPayment: Number(form.extraDebtPayment) || 0,
      billWindowDays: Number(form.billWindowDays) || 0,
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
