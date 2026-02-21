/* service-worker.js */
const CACHE_NAME = "einkauf-rezepte-pwa-20260220123000";

const SW_MSG = (self.CONTRACTS && self.CONTRACTS.SW && self.CONTRACTS.SW.MSG) ? self.CONTRACTS.SW.MSG : null;
const SW_KEYS = (self.CONTRACTS && self.CONTRACTS.SW && self.CONTRACTS.SW.PAYLOAD) ? self.CONTRACTS.SW.PAYLOAD : null;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./offline.html",
  "./service-worker.js",
  ""./js/contracts.js"",
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
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        // Cache the latest index for offline
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(req, { ignoreSearch: true })) ||
               (await cache.match("./index.html")) ||
               (await cache.match("./offline.html"));
      }
    })());
    return;
  }

  // App shell assets: stale-while-revalidate (dev-friendly)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const isAsset = url.pathname.endsWith(".js") || url.pathname.endsWith(".css");
    const cached = await cache.match(req, { ignoreSearch: !isAsset });

    const fetchAndCache = async () => {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    };

    if (cached) {
      // Update in background for the next reload
      event.waitUntil(fetchAndCache().catch(() => {}));
      return cached;
    }

    try {
      return await fetchAndCache();
    } catch (e) {
      return cached || Response.error();
    }
  })());
});


self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
