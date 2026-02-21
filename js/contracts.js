// js/contracts.js
// Zentraler "Contract" für Cross-File Schnittstellen: Message-Typen, Keys, Magic-Strings.
// Ziel: Namen/Keys NICHT mehr "frei erfinden", sondern nur hier definieren und überall importieren.
//
// Hinweis: Bitte erweitert diese Datei bei neuen Cross-File-Schnittstellen.
// Keine App-Logik hier – nur Konstanten.

(function () {
  const CONTRACTS = {
    VERSIONING: {
      // muss zur APP_META passen
      APP_VERSION: "v0.4.40",
      BUILD_ID: "20260221142911",
    },

    SW: {
      // Message Types (Page <-> Service Worker)
      MSG: {
        SKIP_WAITING: "SKIP_WAITING",
        GET_SW_META: "GET_SW_META",
        GET_META: "GET_META",
        SW_META_REQUEST: "SW_META_REQUEST",
        SW_META: "SW_META",
      },

      // Keys in message payloads
      PAYLOAD: {
        // We send: { type:"SW_META", meta:{version,buildId,cacheName} }
        META_KEY: "meta",
        VERSION: "version",
        BUILD_ID: "buildId",
        CACHE_NAME: "cacheName",
      },
    },
  };

  try {
    (typeof self !== "undefined" ? self : window).CONTRACTS = CONTRACTS;
  } catch (_) {
    // ignore
  }
})();
