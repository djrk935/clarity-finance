"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check } from "lucide-react";

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function sync() {
    startTransition(async () => {
      // Bust the server cache first so router.refresh() pulls fresh Plaid data.
      try {
        await fetch("/api/plaid/refresh", { method: "POST" });
      } catch {
        /* fall through — refresh below still re-renders */
      }
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  }

  return (
    <button className="cta sm" onClick={sync} disabled={pending}>
      {done ? (
        <Check size={15} aria-hidden />
      ) : (
        <RefreshCw size={15} aria-hidden className={pending ? "spin" : undefined} />
      )}
      {pending ? "Syncing…" : done ? "Synced" : "Sync"}
    </button>
  );
}
