"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 429
            ? (data.error ?? "Too many attempts. Try again later.")
            : "Incorrect password — try again.",
        );
        setBusy(false);
      }
    } catch {
      setError("Network hiccup — try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={submit}
        className="panel"
        style={{ width: "100%", maxWidth: 380 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div className="bmark" aria-hidden>
            C
          </div>
          <div>
            <h1 className="bname">Clarity</h1>
            <div className="bsub">RESCUE MODE · LOCKED</div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>
          Enter your password to access your finances.
        </p>
        <div className="ainput" style={{ marginTop: 0 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoFocus
          />
        </div>
        {error && (
          <p style={{ color: "#ff9aa9", fontSize: 13, marginTop: 10 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="cta"
          disabled={busy}
          style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
