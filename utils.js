(() => {
  // js/utils.js
  // Kleine, zentrale Helfer (keine App-Logik)

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return window.models?.uid ? window.models.uid() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function toNumber(v) {
    return window.models?.toNumber ? window.models.toNumber(v) : Number(String(v ?? "").replace(",", "."));
  }

  function euro(n) {
    const x = Number(n) || 0;
    return window.models?.euro ? window.models.euro(x) : `${x.toFixed(2)} €`;
  }

  function clone(x) {
    try {
      if (typeof structuredClone === "function") return structuredClone(x);
    } catch {}
    return JSON.parse(JSON.stringify(x));
  }

  function round2(n) {
    return Number((Number(n) || 0).toFixed(2));
  }

  function isFiniteNumber(n) {
    return Number.isFinite(n);
  }

  function dateKey(iso) {
    return iso ? String(iso).slice(0, 10) : "";
  }

  function parseDateMaybe(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizeStr(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
  }

  window.utils = {
    esc,
    uid,
    toNumber,
    euro,
    clone,
    round2,
    isFiniteNumber,
    dateKey,
    parseDateMaybe,
    normalizeStr
  };
})();
