"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Landmark, Plus, X } from "lucide-react";

type PlaidAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
};
type Bank = {
  itemId: string;
  institution: string;
  accounts: PlaidAccount[];
  error?: string;
};
type Status = {
  configured: boolean;
  connected: boolean;
  banks: Bank[];
};

const EMPTY_STATUS: Status = { configured: false, connected: false, banks: [] };

/** Link and manage banks — several at once (Chase + Bank of America + …).
 *  Each bank can be removed on its own without touching the others. */
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
      setStatus(EMPTY_STATUS);
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
        if (active) setStatus(EMPTY_STATUS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep a fresh link token on hand whenever Plaid is configured — adding
  // another bank is always allowed. Tokens are single-use, so refetch after
  // every open/exit.
  useEffect(() => {
    if (status?.configured && !linkToken) {
      fetch("/api/plaid/link-token", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.link_token && setLinkToken(d.link_token as string))
        .catch(() => {});
    }
  }, [status, linkToken]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string } | null }) => {
      setBusy(true);
      await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata.institution?.name,
        }),
      });
      setLinkToken(null);
      await refresh();
      // Re-render the whole (dynamic) route so totals/activity pick up the link.
      router.refresh();
      setBusy(false);
    },
    [refresh, router],
  );

  const disconnect = useCallback(
    async (itemId: string) => {
      setBusy(true);
      await fetch("/api/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      await refresh();
      router.refresh();
      setBusy(false);
    },
    [refresh, router],
  );

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
          <Landmark className="ic" size={16} aria-hidden />
          Banks
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      </section>
    );
  }

  if (!status.configured) {
    return (
      <section className="panel">
        <h2 className="ptitle">
          <Landmark className="ic" size={16} aria-hidden />
          Banks
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          Add your Plaid keys (<code>PLAID_CLIENT_ID</code>,{" "}
          <code>PLAID_SECRET</code>) to <code>.env</code> to link a real
          account. See the README for where to get them.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="ptitle">
        <Landmark className="ic" size={16} aria-hidden />
        Banks
        {status.banks.length > 0 && (
          <span className="chip good" style={{ marginLeft: "auto" }}>
            {status.banks.length} CONNECTED
          </span>
        )}
      </h2>

      {status.banks.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
          Securely link your bank through Plaid&apos;s window. You&apos;ll sign
          in with your real bank credentials — Clarity only ever receives a
          secure token, never your login. You can link several banks and each
          shows up in your totals.
        </p>
      ) : (
        status.banks.map((b) => (
          <div className="acct" key={b.itemId}>
            <div>
              <div style={{ fontWeight: 600 }}>{b.institution}</div>
              <div className="txn-cat">
                {b.error
                  ? "Couldn't fetch balances right now"
                  : `${b.accounts.length} account${b.accounts.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <button
              type="button"
              className="iconbtn"
              disabled={busy}
              onClick={() => disconnect(b.itemId)}
              aria-label={`Disconnect ${b.institution}`}
              title={`Disconnect ${b.institution}`}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        ))
      )}

      <button
        className="cta"
        disabled={!ready || busy}
        onClick={() => open()}
        style={{ marginTop: status.banks.length > 0 ? 14 : 0 }}
      >
        <Plus size={16} aria-hidden />
        {busy
          ? "Working…"
          : status.banks.length > 0
            ? "Add another bank"
            : "Connect a bank →"}
      </button>
    </section>
  );
}
