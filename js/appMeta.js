(() => {
  // Zentrale Build-/Versions-Infos.
  // Regel: bei JEDEM Update die version erhöhen. buildId kann pro Deploy neu sein.
  const version = "v0.4.35";
  const buildId = "20260221120957";

  const meta = {
    version,
    buildId,
    cacheName: `einkauf-rezepte-pwa-${version}-${buildId}`
  };

  try {
    (typeof self !== "undefined" ? self : window).APP_META = meta;
  } catch {
    // ignore
  }
})();
