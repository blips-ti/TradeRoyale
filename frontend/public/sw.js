/* TradeRoyale service worker — installable PWA with a safe, network-first cache.
   Deliberately bypasses Next internals (/_next/, RSC payloads), websockets, and
   the API so dev HMR and realtime are never intercepted. */
const CACHE = "traderoyale-v2";
const SHELL = ["/connect", "/dashboard", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function shouldBypass(url, request) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/socket.io") ||
    url.pathname.startsWith("/api/") ||
    url.search.includes("_rsc=")
  )
    return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (shouldBypass(url, event.request)) return;

  // Navigations: network-first, fall back to cache then the app shell (offline).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((r) => r || caches.match("/dashboard") || caches.match("/connect")),
        ),
    );
    return;
  }

  // Static same-origin assets (icons, manifest, images): stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
