/* service-worker.js */
// buildId: 20260221005356
// Zentrale Build-/Versions-Infos einlesen (gleiche Quelle wie die App)
try { importScripts("./js/appMeta.js"); } catch {}

// IMPORTANT: bump happens via APP_META.buildId
const CACHE_NAME = (self.APP_META && self.APP_META.cacheName) ? self.APP_META.cacheName : "einkauf-rezepte-pwa-fallback";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./offline.html",
  "./service-worker.js",
  "./js/appMeta.js",
  "./js/storage.js",
  "./js/models.js",
  "./js/utils.js",
  "./js/ui.js",
  "./js/audit.js",
  "./js/actions.js",
  "./js/ingredients.js",
  "./js/recipes/recipesLogic.js",
  "./js/recipes/recipesModals.js",
  "./js/recipes/recipesView.js",
  "./js/shopping.js",
  "./js/dashboard.js",
  "./js/stats.js",
  "./js/inventory.js",
  "./js/settings.js",
  "./js/purchaselog.js",
  "./js/cookhistory.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (SPA)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Always try network first for HTML to avoid version mismatch.
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("./index.html")) || (await cache.match("./offline.html"));
      }
    })());
    return;
  }

  const isJsCss = url.pathname.endsWith(".js") || url.pathname.endsWith(".css");

  // JS/CSS: NetworkFirst to prevent "new HTML + old JS" situations.
  if (isJsCss) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(req, { ignoreSearch: false })) || Response.error();
      }
    })());
    return;
  }

  // Other assets: CacheFirst (icons, etc.)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) await cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});


self.addEventListener("message", (event) => {
  const type = event?.data?.type;

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Debug/Info: Settings kann damit auslesen, welchen Cache der laufende SW nutzt.
  // Antwort erfolgt über MessageChannel-Port (event.ports[0]).
  if (type === "GET_SW_META" && event.ports && event.ports[0]) {
    try {
      event.ports[0].postMessage({
        cacheName: CACHE_NAME,
        appMeta: self.APP_META || null,
      });
    } catch {
      // ignore
    }
  }
});
