(() => {
  // Zentrale Build-/Versions-Infos.
  // Regel: bei JEDEM Update die version erhöhen. buildId kann pro Deploy neu sein.
  const version = "v0.4.25";
  const buildId = "20260220195000";

  const meta = {
    version,
    buildId,
    cacheName: `einkauf-rezepte-pwa-${buildId}`
  };

  // In normalen Seiten ist `self` == `window`. Im Service Worker ist `self` der SW-Global.
  try {
    (typeof self !== "undefined" ? self : window).APP_META = meta;
  } catch {
    // ignore
  }
})();
