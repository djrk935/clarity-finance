"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker (production only — a SW in dev
 *  serves stale assets and fights hot reload). Renders nothing. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported/blocked — the app works fine without it */
    });
  }, []);
  return null;
}
