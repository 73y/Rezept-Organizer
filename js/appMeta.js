(() => {
  // Zentrale Build-/Versions-Infos.
  // Regel: bei JEDEM Update die version erhöhen. buildId kann pro Deploy neu sein.
  const version = "v0.4.27";
  const buildId = "20260220195517";

  const meta = {
    version,
    buildId,
    // Ein Cache-Name, der *beides* enthält: Release + Build.
    // So siehst du im UI sofort, ob SW/Cache wirklich zu deinem Release passt.
    cacheName: `einkauf-rezepte-pwa-${version}-${buildId}`
  };

  try {
    (typeof self !== "undefined" ? self : window).APP_META = meta;
  } catch {
    // ignore
  }
})();
