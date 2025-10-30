// Silent SMS - Service Worker (basic offline shell)
// v1
const CACHE_NAME = "silentsms-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/account.html",
  "/send.html",
  "/dlr.html",
  "/hlr.html",
  "/lists.html",
  "/css/main.css",
  "/js/common.js",
  "/js/account.js",
  "/js/send.js",
  "/js/dlr.js",
  "/js/hlr.js",
  "/js/lists.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/api/")) {
    return; // network only
  }

  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (url.pathname.endsWith(".css") || url.pathname.endsWith(".js") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});
