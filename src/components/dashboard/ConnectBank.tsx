"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

type PlaidAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
};
type Status = {
  configured: boolean;
  connected: boolean;
  accounts: PlaidAccount[];
};

export function ConnectBank() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/plaid/status");
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ configured: false, connected: false, accounts: [] });
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/plaid/status");
        const data = (await res.json()) as Status;
        if (active) setStatus(data);
      } catch {
        if (active) setStatus({ configured: false, connected: false, accounts: [] });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fetch a fresh link token whenever Plaid is configured, not linked, and we
  // don't currently hold one (covers first load and re-opening after exit,
  // since link tokens are single-use).
  useEffect(() => {
    if (status?.configured && !status.connected && !linkToken) {
      fetch("/api/plaid/link-token", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.link_token && setLinkToken(d.link_token as string))
        .catch(() => {});
    }
  }, [status, linkToken]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken }),
      });
      setLinkToken(null);
      await refresh();
      // Re-render the whole (dynamic) route so totals/activity pick up the link.
      router.refresh();
      setBusy(false);
    },
    [refresh, router],
  );

  const disconnect = useCallback(async () => {
    setBusy(true);
    await fetch("/api/plaid/disconnect", { method: "POST" });
    await refresh();
    router.refresh();
    setBusy(false);
  }, [refresh, router]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      // Link tokens are single-use — drop it so the effect fetches a fresh one.
      setLinkToken(null);
    },
  });

  if (!status) {
    return (
      <section className="panel">
        <h2 className="ptitle">
          <span className="ic" aria-hidden>
            ⚿
          </span>{" "}
          Connect a bank
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      </section>
    );
  }

  if (!status.configured) {
    return (
      <section className="panel">
        <h2 className="ptitle">
          <span className="ic" aria-hidden>
            ⚿
          </span>{" "}
          Connect a bank
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          Add your Plaid sandbox keys (<code>PLAID_CLIENT_ID</code>,{" "}
          <code>PLAID_SECRET</code>) to <code>.env</code> to link a real
          account. See the README for where to get them.
        </p>
      </section>
    );
  }

  if (status.connected) {
    const n = status.accounts.length;
    return (
      <section className="panel">
        <h2 className="ptitle">
          <span className="ic" aria-hidden>
            ⚿
          </span>{" "}
          Linked bank
        </h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 14 }}>
            {n} account{n === 1 ? "" : "s"} linked via Plaid
          </span>
          <span className="chip good">CONNECTED</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
          These are now included in your totals and account lists.
        </p>
        <button className="cta" disabled={busy} onClick={disconnect}>
          {busy ? "Disconnecting…" : "Disconnect"}
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="ptitle">
        <span className="ic" aria-hidden>
          ⚿
        </span>{" "}
        Connect a bank
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.55,
          marginBottom: 14,
        }}
      >
        Securely link your bank through Plaid&apos;s window. You&apos;ll sign in
        with your real bank credentials — Clarity only ever receives a secure
        token, never your login.
      </p>
      <button
        className="cta"
        disabled={!ready || busy}
        onClick={() => open()}
      >
        {busy ? "Linking…" : "Connect a bank →"}
      </button>
    </section>
  );
}
