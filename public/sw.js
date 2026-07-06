/* Clarity service worker — app-shell caching ONLY.
 *
 * Financial data must never sit in CacheStorage, so the rules are strict:
 *  - /api/*            → never touched (falls through to the network)
 *  - non-GET requests  → never touched
 *  - /_next/static/*   → cache-first (content-hashed, immutable by design)
 *  - /icon.svg, fonts  → cache-first (static brand/UI assets)
 *  - page navigations  → network ALWAYS; the cached /offline shell is served
 *                        only when the network itself fails.
 *
 * Bump VERSION to invalidate every cache after a breaking shell change. */

const VERSION = "clarity-shell-v1";
const OFFLINE_URL = "/offline";

const STATIC_PREFIXES = ["/_next/static/", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // financial data: hands off

  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    // Pages carry live numbers — always go to the network; the offline shell
    // is a fallback, not a cache.
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then((hit) => hit ?? Response.error()),
      ),
    );
  }
});
