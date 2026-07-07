"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

type Mode = "signin" | "signup";

/** Sign-in / create-account gate shown to anyone without a session.
 *  Signup is invite-only while the beta runs (see /api/signup). */
export function AuthGate() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function credentialsSignIn(): Promise<boolean> {
    const res = await signIn("credentials", { email, password, redirect: false });
    return !res?.error;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, invite }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "Could not create the account — try again.");
          setBusy(false);
          return;
        }
      }
      if (await credentialsSignIn()) {
        router.refresh();
        return;
      }
      setError(
        mode === "signup"
          ? "Account created, but sign-in failed — try signing in."
          : "Wrong email or password.",
      );
      setBusy(false);
    } catch {
      setError("Network hiccup — try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={submit} className="panel" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div className="bmark" aria-hidden>
            C
          </div>
          <div>
            <h1 className="bname">Clarity</h1>
            <div className="bsub">Personal finance</div>
          </div>
        </div>

        <div className="navchips" role="tablist" aria-label="Sign in or create account" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={mode === "signin" ? "nchip on" : "nchip"}
            onClick={() => switchMode("signin")}
            aria-pressed={mode === "signin"}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "nchip on" : "nchip"}
            onClick={() => switchMode("signup")}
            aria-pressed={mode === "signup"}
          >
            Create account
          </button>
        </div>

        {mode === "signup" && (
          <div className="ainput" style={{ marginTop: 0, marginBottom: 10 }}>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              aria-label="Name"
            />
          </div>
        )}
        <div className="ainput" style={{ marginTop: 0 }}>
          <input
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-label="Email"
            autoFocus
          />
        </div>
        <div className="ainput" style={{ marginTop: 10 }}>
          <input
            type="password"
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
            aria-label="Password"
          />
        </div>
        {mode === "signup" && (
          <div className="ainput" style={{ marginTop: 10 }}>
            <input
              type="text"
              maxLength={200}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Invite code"
              aria-label="Invite code"
            />
          </div>
        )}

        {error && (
          <p style={{ color: "var(--neg)", fontSize: 13, marginTop: 10 }}>{error}</p>
        )}
        <button
          type="submit"
          className="cta"
          disabled={busy}
          style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
        >
          {busy
            ? "One moment…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
        {mode === "signup" && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Clarity is in private beta — an invite code from the team is required.
          </p>
        )}
      </form>
    </div>
  );
}
