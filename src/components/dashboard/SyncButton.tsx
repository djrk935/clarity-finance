"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function sync() {
    startTransition(() => {
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  }

  return (
    <button className="cta" onClick={sync} disabled={pending}>
      {pending ? "Syncing…" : done ? "✓ Synced" : "⟳ Sync data"}
    </button>
  );
}
