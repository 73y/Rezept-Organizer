/* service-worker.js */
const SW_META = {
  version: "v0.4.35",
  buildId: "20260221120957",
};

const CACHE_NAME = `einkauf-rezepte-pwa-${SW_META.version}-${SW_META.buildId}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./offline.html",
  "./service-worker.js",

  // Meta
  "./js/appMeta.js",

  // Core
  "./js/storage.js",
  "./js/models.js",
  "./js/utils.js",
  "./js/ui.js",
  "./js/audit.js",
  "./js/actions.js",

  // Views / Modules
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

  // Icons
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

  // JS/CSS: Network-first to avoid "new HTML + old JS" mismatch
  const isJsCss = url.pathname.endsWith(".js") || url.pathname.endsWith(".css");
  if (isJsCss) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Other assets: Cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

function replyToMessage(event, payload) {
  try {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
      return;
    }
    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage(payload);
      return;
    }
  } catch {
    // ignore
  }
}

self.addEventListener("message", (event) => {
  const type = event?.data?.type;

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // Meta queries from the app (support multiple names for backwards compatibility)
  if (type === "GET_SW_META" || type === "GET_META" || type === "GET_SW_INFO") {
    replyToMessage(event, {
      type: "SW_META",
      sw: {
        version: SW_META.version,
        buildId: SW_META.buildId,
        cacheName: CACHE_NAME,
      }
    });
    return;
  }

  if (type === "GET_CACHE_NAME") {
    replyToMessage(event, { type: "SW_CACHE_NAME", cacheName: CACHE_NAME });
  }
});
