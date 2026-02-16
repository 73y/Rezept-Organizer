(() => {
  const esc = (s) => (window.utils?.esc ? window.utils.esc(s) : String(s ?? ""));

  const uid = () => (window.utils?.uid ? window.utils.uid() : window.models.uid());
  const toNum = (v) => (window.utils?.toNumber ? window.utils.toNumber(v) : window.models.toNumber(v));
  const euro = (n) => (window.utils?.euro ? window.utils.euro(n) : window.models.euro(n));

  const normalizeUnit = (u) => {
    const raw = String(u ?? "").trim();
    const low = raw.toLowerCase();
    if (!raw) return "";
    if (low === "stück" || low === "stk" || low.includes("stück")) return "Stück";
    if (low === "g" || low.includes("gram")) return "g";
    if (low === "ml" || low.includes("milli")) return "ml";
    return raw;
  };

  const cleanBarcode = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    // EAN/UPC sind praktisch immer nur Zahlen. Wir strippen alles andere.
    return s.replace(/\s+/g, "").replace(/[^0-9]/g, "");
  };

  const isValidBarcode = (code) => {
    const c = cleanBarcode(code);
    // EAN-8 / UPC / EAN-13 / EAN-14
    return !!c && c.length >= 8 && c.length <= 14;
  };



  // Open Food Facts Autofill (Barcode -> Name/Packung)
  const OFF_FIELDS = "product_name,product_name_de,quantity,product_quantity,product_quantity_unit,brands,nutriments";
  const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";

  function ensureLookupCache(state) {
    if (!state || typeof state !== "object") return {};
    if (!state.barcodeLookupCache || typeof state.barcodeLookupCache !== "object") state.barcodeLookupCache = {};
    return state.barcodeLookupCache;
  }

  function parseOffQuantity(qty, unitRaw) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return null;
    const u = String(unitRaw || "").trim().toLowerCase();

    // weight
    if (u === "g" || u === "gram" || u === "grams") return { amount: n, unit: "g" };
    if (u === "kg" || u === "kilogram" || u === "kilograms") return { amount: n * 1000, unit: "g" };

    // volume
    if (u === "ml" || u === "milliliter" || u === "milliliters") return { amount: n, unit: "ml" };
    if (u === "l" || u === "lt" || u === "liter" || u === "liters") return { amount: n * 1000, unit: "ml" };
    if (u === "cl") return { amount: n * 10, unit: "ml" };
    if (u === "dl") return { amount: n * 100, unit: "ml" };

    // pieces
    if (u === "pcs" || u === "pc" || u === "piece" || u === "pieces" || u === "stk" || u.includes("stück")) return { amount: n, unit: "Stück" };

    return null;
  }

  function parseQuantityString(text) {
    const raw = String(text || "").trim().toLowerCase();
    if (!raw) return null;

    // multipack: 6x250 g -> wir nehmen 250 g als Packungsgröße
    const multi = raw.match(/(\d+(?:[\.,]\d+)?)\s*[x×]\s*(\d+(?:[\.,]\d+)?)\s*([a-zäöü]+)/i);
    if (multi) {
      const qty = Number(String(multi[2]).replace(",", "."));
      const unit = multi[3];
      return parseOffQuantity(qty, unit);
    }

    // normal: 200 g / 1l / 0.5 l
    const m = raw.match(/(\d+(?:[\.,]\d+)?)\s*([a-zäöü]+)/i);
    if (!m) return null;
    const qty = Number(String(m[1]).replace(",", "."));
    const unit = m[2];
    return parseOffQuantity(qty, unit);
  }

  function round1(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return null;
    return Math.round(x * 10) / 10;
  }

  function pickNutri(nutr, keyBase, preferMl) {
    if (!nutr || typeof nutr !== "object") return null;
    const a = preferMl ? `${keyBase}_100ml` : `${keyBase}_100g`;
    const b = preferMl ? `${keyBase}_100g` : `${keyBase}_100ml`;
    const v1 = nutr[a];
    if (Number.isFinite(Number(v1))) return Number(v1);
    const v2 = nutr[b];
    if (Number.isFinite(Number(v2))) return Number(v2);
    return null;
  }

  function pickKcal(nutr, preferMl) {
    // 1) direkt kcal
    const kcal = pickNutri(nutr, "energy-kcal", preferMl);
    if (kcal !== null) return kcal;

    // 2) fallback: kJ -> kcal (1 kJ = 0.239006 kcal)
    const kj = pickNutri(nutr, "energy", preferMl);
    if (kj !== null) return Number(kj) * 0.239006;

    return null;
  }

  async function fetchOffSuggestion(state, persist, barcode) {
    const code = cleanBarcode(barcode);
    if (!isValidBarcode(code)) return null;

    const cache = ensureLookupCache(state);
    const cached = cache[code];
    if (cached && typeof cached === "object" && (cached.name || (cached.amount && cached.unit))) return cached;

    try {
      const url = `${OFF_BASE}${encodeURIComponent(code)}?fields=${OFF_FIELDS}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) return null;
      const json = await res.json();

      if (!json || typeof json !== "object") return null;
      if (json.status === 0) return null;

      const prod = json.product && typeof json.product === "object" ? json.product : null;
      if (!prod) return null;

      const name = String(prod.product_name_de || prod.product_name || "").trim();
      const brands = String(prod.brands || "").trim();

      let parsed = null;
      if (prod.product_quantity && prod.product_quantity_unit) parsed = parseOffQuantity(prod.product_quantity, prod.product_quantity_unit);
      if (!parsed && prod.quantity) parsed = parseQuantityString(prod.quantity);

      const out = {
        name: name || "",
        brands: brands || "",
        amount: parsed?.amount ? Math.round(parsed.amount * 100) / 100 : null,
        unit: parsed?.unit || "",
        rawQuantity: String(prod.quantity || "").trim(),
        nutriments: (() => {
          const nutr = prod.nutriments && typeof prod.nutriments === "object" ? prod.nutriments : null;
          const preferMl = (parsed?.unit || "") === "ml";
          const kcal = round1(pickKcal(nutr, preferMl));
          const protein = round1(pickNutri(nutr, "proteins", preferMl));
          const carbs = round1(pickNutri(nutr, "carbohydrates", preferMl));
          const fat = round1(pickNutri(nutr, "fat", preferMl));
          const sugar = round1(pickNutri(nutr, "sugars", preferMl));
          const fiber = round1(pickNutri(nutr, "fiber", preferMl));
          const salt = round1(pickNutri(nutr, "salt", preferMl));
          if (kcal === null && protein === null && carbs === null && fat === null && sugar === null && fiber === null && salt === null) return null;
          return {
            base: preferMl ? "100ml" : "100g",
            kcalPer100: kcal,
            proteinPer100: protein,
            carbsPer100: carbs,
            fatPer100: fat,
            sugarPer100: sugar,
            fiberPer100: fiber,
            saltPer100: salt
          };
        })(),
        fetchedAt: new Date().toISOString()
      };

      cache[code] = out;
      if (typeof persist === "function") persist();
      return out;
    } catch {
      return null;
    }
  }

  const ui = {
    openIngredientMenus: new Set(),
    packsByIngredient: new Map(),
    flash: null,
    flashTimeout: null
  };

  function buildModal({
    title,
    contentHTML,
    okText = "Speichern",
    cancelText = "Abbrechen",
    okClass = "primary",
    onConfirm
  }) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "720px";

    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${esc(title)}</div>
        <button class="modal-close" data-action="close" title="Schließen">✕</button>
      </div>

      <div class="modal-body">${contentHTML}</div>

      <div class="modal-footer">
        <button data-action="cancel">${esc(cancelText)}</button>
        <button data-action="ok" class="${esc(okClass)}">${esc(okText)}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action === "close" || action === "cancel") return close();
      if (action === "ok") return onConfirm?.(modal, close);
    });

    return { overlay, modal, close };
  }

  function setFlash(text) {
    ui.flash = text;
    if (ui.flashTimeout) clearTimeout(ui.flashTimeout);
    ui.flashTimeout = setTimeout(() => {
      ui.flash = null;
      const v = document.querySelector("#view-ingredients");
      if (v && !v.classList.contains("hidden")) window.app.navigate("ingredients");
    }, 2500);
  }

  function ingredientsSorted(state) {
    return (state.ingredients || [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  }

  function getPacks(ingredientId) {
    const v = ui.packsByIngredient.get(ingredientId);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
  }

  function setPacks(ingredientId, value) {
    const n = Number(value);
    ui.packsByIngredient.set(ingredientId, Number.isFinite(n) && n > 0 ? Math.round(n) : 1);
  }

  function unitPriceText(ing) {
    const price = Number(ing.price) || 0;
    const amt = Number(ing.amount) || 0;
    if (!amt || !price) return "—";
    const per = price / amt;
    if (!Number.isFinite(per) || per <= 0) return "—";
    // pro 100g/ml wirkt oft sinnvoll, aber bei Stück lieber pro Stück
    if (String(ing.unit || "").toLowerCase() === "stück") return `${euro(per)} / Stk`;
    return `${euro(per * 100)} / 100 ${String(ing.unit || "")}`;
  }

  function ingredientCardHTML(ing) {
    const packLabel = `${Number(ing.amount) || 0} ${esc(ing.unit || "")}`.trim();
    const price = Number(ing.price) || 0;
    const shelf = Number(ing.shelfLifeDays) || 0;

    const open = ui.openIngredientMenus.has(ing.id) ? "open" : "";

    return `
      <div class="card" style="margin:10px 0;">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <div style="font-weight:750; font-size:18px; line-height:1.1;">${esc(ing.name)}</div>
              <span class="small" style="border:1px solid var(--border); padding:4px 10px; border-radius:999px;">Packung: <b>${esc(packLabel)}</b></span>
            </div>
            <div class="small" style="margin-top:8px; opacity:0.9; display:flex; gap:10px; flex-wrap:wrap;">
              <span>Preis: <b>${esc(euro(price))}</b></span>
              <span>·</span>
              <span>Einheit: ${esc(unitPriceText(ing))}</span>
              ${shelf > 0 ? `<span>· Haltbarkeit: ${esc(shelf)} Tag(e)</span>` : ``}
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:flex-start;">
            <details class="actions-menu ing-actions" data-ingredient="${esc(ing.id)}" ${open}>
              <summary title="Aktionen">⋯</summary>
              <div class="actions-panel">
                <div class="actions-row" style="justify-content:space-between; align-items:center;">
                  <span class="small muted2">Packungen</span>
                  <input data-action="packs" data-ingredient-id="${esc(ing.id)}" type="number" min="1" step="1" value="${esc(getPacks(ing.id))}" style="width:90px;" />
                </div>
                <div class="actions-row">
                  <button class="success" data-action="addShop" data-ingredient-id="${esc(ing.id)}">Zur Einkaufsliste</button>
                </div>
                <div class="actions-row" style="justify-content:space-between;">
                  <button class="info" data-action="edit" data-ingredient-id="${esc(ing.id)}">Bearbeiten</button>
                  <button class="danger" data-action="del" data-ingredient-id="${esc(ing.id)}">Löschen</button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    `;
  }

  function ensureShoppingSession(state) {
    if (!Array.isArray(state.shopping)) state.shopping = [];
    if (!state.shoppingSession || typeof state.shoppingSession !== "object") {
      state.shoppingSession = { active: false, checked: {}, startedAt: null };
    }
    if (!state.shoppingSession.checked || typeof state.shoppingSession.checked !== "object") {
      state.shoppingSession.checked = {};
    }
  }

  function addIngredientToShopping(state, ingredientId, packsToAdd = 1) {
    ensureShoppingSession(state);

    const add = Math.max(1, Math.round(Number(packsToAdd) || 1));
    const it = state.shopping.find((x) => x.ingredientId === ingredientId);

    if (!it) {
      state.shopping.push({ id: uid(), ingredientId, packs: add });
      return;
    }

    const before = Math.max(1, Math.round(Number(it.packs) || 1));
    it.packs = before + add;
  }
  function openBarcodeScannerModal(state, persist) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal scan-modal";
    modal.style.maxWidth = "720px";

    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">Barcode scannen</div>
        <button class="modal-close" data-action="close" title="Schließen">✕</button>
      </div>

      <div class="modal-body">
        <div class="scan-video-wrap">
          <video id="scan-video" class="scan-video" autoplay playsinline></video>
          <div class="scan-hint small muted2">Kamera auf den Barcode halten (EAN). Wenn dein Gerät das Scannen nicht unterstützt: „Ohne Barcode“.</div>
        </div>

        <div class="scan-result" id="scan-result">
          <span class="small muted2">Noch kein Barcode erkannt.</span>
        </div>

        <div id="scan-msg" class="small" style="margin-top:10px; color: rgba(239,68,68,0.9);"></div>
      </div>

      <div class="modal-footer" style="justify-content:space-between;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button data-action="nobarcode">Ohne Barcode</button>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="info" data-action="rescan">Neu scannen</button>
          <button class="success" data-action="next" disabled>Weiter</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const video = modal.querySelector("#scan-video");
    const msg = modal.querySelector("#scan-msg");
    const hint = modal.querySelector(".scan-hint");
    const result = modal.querySelector("#scan-result");
    const nextBtn = modal.querySelector('button[data-action="next"]');

    let stream = null;
    let detector = null;
    let raf = null;
    let scanning = false;
    let lastTick = 0;
    let scannedCode = "";
    let matchedIng = null;
    let offSuggestion = null;

    function setMsg(text, kind = "error") {
      if (!msg) return;
      msg.style.color = kind === "ok" ? "rgba(34,197,94,0.95)" : kind === "warn" ? "rgba(245,158,11,0.95)" : "rgba(239,68,68,0.9)";
      msg.textContent = text || "";
    }

    function setResult(code, ing, off = null, loading = false) {
      if (!result) return;
      if (!code) {
        result.innerHTML = `<span class=\"small muted2\">Noch kein Barcode erkannt.</span>`;
        return;
      }

      if (ing) {
        const packLabel = `${Number(ing.amount) || 0} ${esc(ing.unit || "")}`.trim();
        result.innerHTML = `
          <div class=\"small muted2\" style=\"margin-bottom:6px;\">Erkannt</div>
          <div style=\"font-size:18px; font-weight:900;\">${esc(ing.name)}</div>
          <div class=\"small muted2\" style=\"margin-top:6px;\">Packung: <b>${esc(packLabel)}</b> · Barcode: <b>${esc(code)}</b></div>
        `;
        return;
      }

      const hasOff = !!(off && (off.name || (off.amount && off.unit)));
      const extra = loading
        ? `<div class=\"small muted2\" style=\"margin-top:10px; border-top:1px solid var(--border); padding-top:10px;\">Suche Produktdaten…</div>`
        : hasOff
          ? `
            <div class=\"small\" style=\"margin-top:10px; border-top:1px solid var(--border); padding-top:10px;\">
              <div class=\"small muted2\" style=\"margin-bottom:6px;\">Vorschlag (Open Food Facts)</div>
              ${off.name ? `<div style=\"font-weight:900;\">${esc(off.name)}</div>` : ``}
              ${(off.amount && off.unit) ? `<div class=\"small muted2\" style=\"margin-top:6px;\">Packung: <b>${esc(off.amount)} ${esc(off.unit)}</b></div>` : ``}
              ${off.brands ? `<div class=\"small muted2\" style=\"margin-top:6px;\">Marke: ${esc(off.brands)}</div>` : ``}
              ${off.nutriments ? (() => {
                  const n = off.nutriments;
                  const parts = [];
                  if (Number.isFinite(n.kcalPer100)) parts.push(`${esc(n.kcalPer100)} kcal/${esc(n.base)}`);
                  if (Number.isFinite(n.proteinPer100)) parts.push(`Protein ${esc(n.proteinPer100)} g`);
                  if (Number.isFinite(n.carbsPer100)) parts.push(`KH ${esc(n.carbsPer100)} g`);
                  if (Number.isFinite(n.fatPer100)) parts.push(`Fett ${esc(n.fatPer100)} g`);
                  if (!parts.length) return ``;
                  return `<div class=\"small muted2\" style=\"margin-top:6px;\">Nährwerte: ${parts.join(" · ")}</div>`;
                })() : ``}
            </div>
          `
          : ``;

      result.innerHTML = `
        <div class=\"small muted2\" style=\"margin-bottom:6px;\">Unbekannt</div>
        <div style=\"font-size:18px; font-weight:900; letter-spacing:0.5px;\">${esc(code)}</div>
        <div class=\"small muted2\" style=\"margin-top:6px;\">Du kannst jetzt eine neue Zutat anlegen.</div>
        ${extra}
      `;
    }

    function setNextEnabled(on) {
      if (nextBtn) nextBtn.disabled = !on;
    }

    function setNextLabel(label) {
      if (!nextBtn) return;
      nextBtn.textContent = label;
    }

    async function startCamera() {
      if (!video) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        if (hint) hint.textContent = "Kamera wird vom Browser nicht unterstützt.";
        setMsg("Kamera wird vom Browser nicht unterstützt. Nutze ‚Ohne Barcode‘.", "warn");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        video.srcObject = stream;
        await video.play();
      } catch (e) {
        if (hint) hint.textContent = "Kamera-Zugriff blockiert. Erlaube Kamera in den Website-Einstellungen.";
        setMsg("Kamera-Zugriff nicht möglich. Erlaube Kamera – oder nutze ‚Ohne Barcode‘.", "warn");
      }
    }

    function stopCamera() {
      scanning = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;

      try {
        if (stream) {
          for (const t of stream.getTracks()) t.stop();
        }
      } catch {}

      stream = null;
      detector = null;
    }

    async function ensureDetector() {
      if (detector) return detector;
      if (typeof BarcodeDetector === "undefined") return null;
      try {
        detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        return detector;
      } catch {
        return null;
      }
    }

    async function tick(ts) {
      if (!scanning) return;
      raf = requestAnimationFrame(tick);

      if (ts - lastTick < 160) return;
      lastTick = ts;

      const det = await ensureDetector();
      if (!det || !video) {
        scanning = false;
        if (hint) hint.textContent = "Scanner wird auf diesem Gerät nicht unterstützt. Nutze ‚Ohne Barcode‘.";
        setMsg("Scanner nicht unterstützt. Nutze ‚Ohne Barcode‘.", "warn");
        return;
      }

      if (video.readyState < 2) return;

      try {
        const res = await det.detect(video);
        if (Array.isArray(res) && res.length) {
          const raw = res[0]?.rawValue || "";
          const code = cleanBarcode(raw);
          if (code) {
            scannedCode = code;
            matchedIng = (state.ingredients || []).find((x) => cleanBarcode(x?.barcode) === code) || null;
            offSuggestion = null;

            if (matchedIng) {
              setResult(code, matchedIng, null, false);
              setMsg(`Erkannt: ${matchedIng.name}`, "ok");
              setNextLabel("Bearbeiten");
              setNextEnabled(true);
              scanning = false;
              return;
            }

            // Unbekannt -> Open Food Facts Autofill versuchen
            setResult(code, null, null, true);
            setMsg("Suche Produktdaten…", "warn");
            setNextEnabled(false);
            scanning = false;

            offSuggestion = await fetchOffSuggestion(state, persist, code);

            if (offSuggestion) {
              setResult(code, null, offSuggestion, false);
              setMsg(offSuggestion.name ? ("Vorschlag gefunden: " + offSuggestion.name) : "Vorschlag gefunden", "ok");
              setNextLabel("Übernehmen");
            } else {
              setResult(code, null, null, false);
              setMsg(`Unbekannt: ${code}`, "ok");
              setNextLabel("Zutat anlegen");
            }
            setNextEnabled(true);
          }
        }
      } catch {
        // ignore
      }
    }

    function startScan() {
      setMsg("");
      scanning = true;
      lastTick = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function close() {
      stopCamera();
      overlay.remove();
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const a = btn.getAttribute("data-action");

      if (a === "close") return close();

      if (a === "nobarcode") {
        close();
        openIngredientModal(state, persist, null, { prefillBarcode: "" });
        return;
      }

      if (a === "rescan") {
        scannedCode = "";
        matchedIng = null;
        offSuggestion = null;
        setResult("", null);
        setMsg("");
        setNextLabel("Weiter");
        setNextEnabled(false);
        startScan();
        return;
      }

      if (a === "next") {
        if (!scannedCode) {
          setMsg("Noch kein Barcode erkannt. Bitte kurz warten oder ‚Ohne Barcode‘.", "warn");
          return;
        }

        const code = scannedCode;

        // Wenn schon bekannt: direkt bearbeiten
        const existing = matchedIng || (state.ingredients || []).find((x) => cleanBarcode(x?.barcode) === code) || null;
        close();

        if (existing) {
          openIngredientModal(state, persist, existing, { prefillBarcode: code });
          return;
        }

        openIngredientModal(state, persist, null, { prefillBarcode: code, prefillName: offSuggestion?.name || "", prefillAmount: offSuggestion?.amount || "", prefillUnit: offSuggestion?.unit || "", prefillBrands: offSuggestion?.brands || "", prefillNutriments: offSuggestion?.nutriments || null });
      }
    });

    // Start
    setTimeout(async () => {
      setResult("", null);
      setNextLabel("Weiter");
      setNextEnabled(false);
      await startCamera();
      startScan();
    }, 0);
  }
  function openIngredientModal(state, persist, ingOrNull, opts = {}) {
    const isEdit = !!ingOrNull;

    const unitRaw = String(ingOrNull?.unit || "").trim();
    const preUnitRaw = !isEdit ? String(opts?.prefillUnit ?? "").trim() : "";
    const unitNorm = normalizeUnit(isEdit ? unitRaw : (preUnitRaw || unitRaw));
    const knownUnits = ["Stück", "g", "ml"];
    const hasCustom = unitNorm && !knownUnits.includes(unitNorm);

    const preBarcode = cleanBarcode(String(opts?.prefillBarcode ?? ingOrNull?.barcode ?? ""));

    const unitOption = (value, label) =>
      `<option value="${esc(value)}" ${unitNorm === value ? "selected" : ""}>${esc(label)}</option>`;

    const content = `
      <div class="row">
        <div>
          <label class="small">Name</label><br/>
          <input id="i-name" placeholder="z. B. Eier" value="${esc(isEdit ? (ingOrNull?.name || "") : (opts?.prefillName || ""))}" />
        </div>
        <div>
          <label class="small">Menge pro Packung</label><br/>
          <input id="i-amount" type="number" min="0" step="0.01" placeholder="z. B. 10" value="${esc(isEdit ? (ingOrNull?.amount ?? "") : (opts?.prefillAmount ?? ""))}" />
        </div>
        <div>
          <label class="small">Einheit</label><br/>
          <select id="i-unit" style="width:100%;">
            <option value="" ${unitNorm ? "" : "selected"}>Bitte wählen…</option>
            ${unitOption("Stück", "Stück")}
            ${unitOption("g", "Gramm (g)")}
            ${unitOption("ml", "Milliliter (ml)")}
            ${hasCustom ? unitOption(unitNorm, `Andere: ${unitNorm}`) : ""}
          </select>
        </div>
      </div>

      ${(!isEdit && (opts?.prefillName || opts?.prefillAmount)) ? `<div class="small muted2" style="margin-top:8px;">Vorschlag aus Barcode-Daten übernommen. Preis/Haltbarkeit ggf. ergänzen.</div>` : ``}

      <div class="row" style="margin-top:10px;">
        <div>
          <label class="small">Preis pro Packung (€)</label><br/>
          <input id="i-price" type="number" min="0" step="0.01" placeholder="z. B. 2,99" value="${esc(ingOrNull?.price ?? "")}" />
        </div>
        <div>
          <label class="small">Haltbarkeit (Tage)</label><br/>
          <input id="i-shelf" type="number" min="0" step="1" placeholder="z. B. 7" value="${esc(ingOrNull?.shelfLifeDays ?? "")}" />
          <div class="small muted2" style="margin-top:6px;">Wird genutzt für Ablaufdatum beim Einkauf.</div>
        </div>
        <div>
          <label class="small">Barcode</label><br/>
          <div class="barcode-view" id="i-barcode-view">${preBarcode ? esc(preBarcode) : "—"}</div>
          <input id="i-barcode" type="hidden" value="${esc(preBarcode)}" />
          <div class="small muted2" style="margin-top:6px;">Automatisch beim Scannen. Manuelle Eingabe ist aus.</div>
          ${preBarcode ? `<button type="button" class="danger" data-action="clearBarcode" style="margin-top:8px;">Barcode entfernen</button>` : ``}
        </div>
      </div>

      
      <details class="nutri-details" style="margin-top:12px;">
        <summary class="small">Nährwerte (optional)</summary>
        <div class="small muted2" style="margin-top:6px;">Pro ${esc((() => {
          const u = normalizeUnit(isEdit ? unitRaw : (String(opts?.prefillUnit ?? "").trim() || unitRaw));
          return u === "ml" ? "100ml" : "100g";
        })())}. Werte sind optional und können später ergänzt werden.</div>
        <div class="row" style="margin-top:10px;">
          <div>
            <label class="small">kcal</label><br/>
            <input id="i-kcal" type="number" min="0" step="0.1" placeholder="z. B. 250" value="${esc((() => {
              const n = isEdit ? ingOrNull?.nutriments : (opts?.prefillNutriments || null);
              return n && Number.isFinite(Number(n.kcalPer100)) ? Number(n.kcalPer100) : "";
            })())}" />
          </div>
          <div>
            <label class="small">Protein (g)</label><br/>
            <input id="i-protein" type="number" min="0" step="0.1" placeholder="z. B. 10" value="${esc((() => {
              const n = isEdit ? ingOrNull?.nutriments : (opts?.prefillNutriments || null);
              return n && Number.isFinite(Number(n.proteinPer100)) ? Number(n.proteinPer100) : "";
            })())}" />
          </div>
          <div>
            <label class="small">Kohlenhydrate (g)</label><br/>
            <input id="i-carbs" type="number" min="0" step="0.1" placeholder="z. B. 5" value="${esc((() => {
              const n = isEdit ? ingOrNull?.nutriments : (opts?.prefillNutriments || null);
              return n && Number.isFinite(Number(n.carbsPer100)) ? Number(n.carbsPer100) : "";
            })())}" />
          </div>
          <div>
            <label class="small">Fett (g)</label><br/>
            <input id="i-fat" type="number" min="0" step="0.1" placeholder="z. B. 20" value="${esc((() => {
              const n = isEdit ? ingOrNull?.nutriments : (opts?.prefillNutriments || null);
              return n && Number.isFinite(Number(n.fatPer100)) ? Number(n.fatPer100) : "";
            })())}" />
          </div>
        </div>
      </details>
<div class="small" id="i-msg" style="margin-top:10px; color: rgba(239,68,68,0.9);"></div>
    `;

    const { modal } = buildModal({
      title: isEdit ? "Zutat bearbeiten" : "Neue Zutat",
      contentHTML: content,
      okText: isEdit ? "Speichern" : "Hinzufügen",
      okClass: "success",
      onConfirm: (m, close) => {
        const msg = m.querySelector("#i-msg");
        if (msg) msg.textContent = "";

        const name = (m.querySelector("#i-name")?.value || "").trim();
        const barcodeRaw = m.querySelector("#i-barcode")?.value || "";
        const barcode = cleanBarcode(barcodeRaw);

        const amount = toNum(m.querySelector("#i-amount")?.value);
        const unit = normalizeUnit(m.querySelector("#i-unit")?.value);
        const price = toNum(m.querySelector("#i-price")?.value);
        const shelf = Math.max(0, Math.round(toNum(m.querySelector("#i-shelf")?.value) || 0));
        const kcal = toNum(m.querySelector("#i-kcal")?.value);
        const protein = toNum(m.querySelector("#i-protein")?.value);
        const carbs = toNum(m.querySelector("#i-carbs")?.value);
        const fat = toNum(m.querySelector("#i-fat")?.value);

        const nutriBase = (unit === "ml") ? "100ml" : "100g";
        const nutriments = (() => {
          const out = {
            base: nutriBase,
            kcalPer100: Number.isFinite(kcal) ? Math.round(kcal * 10) / 10 : null,
            proteinPer100: Number.isFinite(protein) ? Math.round(protein * 10) / 10 : null,
            carbsPer100: Number.isFinite(carbs) ? Math.round(carbs * 10) / 10 : null,
            fatPer100: Number.isFinite(fat) ? Math.round(fat * 10) / 10 : null
          };
          if (out.kcalPer100 === null && out.proteinPer100 === null && out.carbsPer100 === null && out.fatPer100 === null) return null;
          return out;
        })();


        if (!name) return (msg.textContent = "Bitte Name eingeben.");
        if (barcode && !isValidBarcode(barcode)) return (msg.textContent = "Barcode ist ungültig (8–14 Ziffern). Bitte entfernen.");

        const dup = barcode ? (state.ingredients || []).find((x) => cleanBarcode(x?.barcode) === barcode && x.id !== ingOrNull?.id) : null;
        if (dup) return (msg.textContent = `Barcode ist schon bei „${dup.name}“ gespeichert.`);

        if (!Number.isFinite(amount) || amount <= 0) return (msg.textContent = "Bitte Menge pro Packung > 0 eingeben.");
        if (!unit) return (msg.textContent = "Bitte Einheit wählen (Stück / g / ml)." );
        if (!Number.isFinite(price) || price < 0) return (msg.textContent = "Bitte Preis eingeben (0 oder größer)." );

        if (isEdit) {
          const it = state.ingredients.find((x) => x.id === ingOrNull.id);
          if (!it) return (msg.textContent = "Zutat nicht gefunden.");

          it.name = name;
          it.barcode = barcode || "";
          it.amount = amount;
          it.unit = unit;
          it.price = Number((price || 0).toFixed(2));
          it.shelfLifeDays = shelf;
          it.nutriments = nutriments || null;

          persist();
          close();
          window.app.navigate("ingredients");
          return;
        }

        state.ingredients.push({
          id: uid(),
          name,
          barcode: barcode || "",
          amount,
          unit,
          price: Number((price || 0).toFixed(2)),
          shelfLifeDays: shelf,
          nutriments: nutriments || null
        });

        persist();
        close();
        window.app.navigate("ingredients");
      }
    });

    // Barcode entfernen ohne Tastatur
    modal.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-action=clearBarcode]");
      if (!b) return;
      const hidden = modal.querySelector("#i-barcode");
      const view = modal.querySelector("#i-barcode-view");
      if (hidden) hidden.value = "";
      if (view) view.textContent = "—";
      b.remove();
    });

    // Fokus
    setTimeout(() => modal.querySelector("#i-name")?.focus(), 0);
  }


  function openDeleteModal(state, persist, ingredientId) {
    const ing = (state.ingredients || []).find((x) => x.id === ingredientId);
    if (!ing) return;

    const usedInPantry = Array.isArray(state.pantry) && state.pantry.some((x) => x.ingredientId === ingredientId);
    const usedInShopping = Array.isArray(state.shopping) && state.shopping.some((x) => x.ingredientId === ingredientId);
    const usedInRecipes =
      Array.isArray(state.recipes) && state.recipes.some((r) => (r.items || []).some((it) => it.ingredientId === ingredientId));

    const warn = usedInPantry || usedInShopping || usedInRecipes;

    const content = `
      <div class="small" style="opacity:0.95;">Zutat <b>${esc(ing.name)}</b> löschen?</div>
      ${
        warn
          ? `<div class="small" style="margin-top:10px; color: rgba(245,158,11,0.9);">
               Hinweis: Diese Zutat wird noch verwendet (Vorrat / Einkaufsliste / Rezepte).
               Beim Löschen werden die verknüpften Einträge ebenfalls bereinigt.
             </div>`
          : ``
      }
      <div class="small" style="margin-top:10px; opacity:0.85;">Das kann nicht rückgängig gemacht werden.</div>
    `;

    buildModal({
      title: "Löschen bestätigen",
      contentHTML: content,
      okText: "Löschen",
      okClass: "danger",
      onConfirm: (_m, close) => {
        if (window.actions?.deleteIngredientCascade) {
          window.actions.deleteIngredientCascade(ingredientId);
        } else {
          // Fallback (alt)
          state.ingredients = (state.ingredients || []).filter((x) => x.id !== ingredientId);
          if (Array.isArray(state.shopping)) state.shopping = state.shopping.filter((x) => x.ingredientId !== ingredientId);
          if (state.shoppingSession?.checked) delete state.shoppingSession.checked[ingredientId];
          if (Array.isArray(state.pantry)) state.pantry = state.pantry.filter((x) => x.ingredientId !== ingredientId);
          if (Array.isArray(state.recipes)) {
            for (const r of state.recipes) {
              if (!Array.isArray(r.items)) continue;
              r.items = r.items.filter((it) => it.ingredientId !== ingredientId);
            }
          }
          persist();
        }
        close();
        window.app.navigate("ingredients");
      }
    });
  }

  window.renderIngredientsView = function (container, state, persist) {
    if (!Array.isArray(state.ingredients)) state.ingredients = [];
    if (!Array.isArray(state.recipes)) state.recipes = [];
    if (!Array.isArray(state.pantry)) state.pantry = [];

    ensureShoppingSession(state);

    const ings = ingredientsSorted(state);

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <h2 style="margin:0 0 6px 0;">Zutaten</h2>
            <p class="small" style="margin:0;">Grundstein pro Zutat (Packung). Aktionen über „⋯“. Hinzufügen über „+“.</p>
            ${ui.flash ? `<div class="small" style="margin-top:8px; opacity:0.95;">${esc(ui.flash)}</div>` : ``}
          </div>
          <div class="small muted2" style="text-align:right;">${esc(ings.length)} Zutat(en)</div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px 0;">Liste</h3>
        ${ings.length ? ings.map(ingredientCardHTML).join("") : `<p class="small">Noch keine Zutaten. Tippe unten rechts auf „+“.</p>`}
      </div>

      <button class="fab" type="button" data-action="openAdd" title="Neue Zutat">+</button>
    `;

    // Toggle-Tracking: damit Menüs nach Re-Render offen bleiben
    if (!container.__ingToggleBound) {
      container.__ingToggleBound = true;
      container.addEventListener(
        "toggle",
        (e) => {
          const details = e.target;
          if (!(details instanceof HTMLDetailsElement)) return;
          if (!details.classList.contains("ing-actions")) return;
          const id = details.getAttribute("data-ingredient") || "";
          if (!id) return;
          if (details.open) ui.openIngredientMenus.add(id);
          else ui.openIngredientMenus.delete(id);
        },
        true
      );
    }

    if (!container.__ingInputBound) {
      container.__ingInputBound = true;
      container.addEventListener(
        "input",
        (e) => {
          const inp = e.target;
          if (!(inp instanceof HTMLInputElement)) return;
          if (inp.getAttribute("data-action") !== "packs") return;
          const id = inp.getAttribute("data-ingredient-id") || "";
          if (!id) return;
          setPacks(id, inp.value);
        },
        true
      );
    }

    container.onclick = (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");

      if (action === "openAdd") {
        // Plus => zuerst Scanner, darunter Option „Ohne Barcode“
        openBarcodeScannerModal(state, persist);
        return;
      }

      const ingId = btn.getAttribute("data-ingredient-id") || "";
      if (!ingId) return;

      if (action === "addShop") {
        const details = btn.closest("details");
        const inp = details?.querySelector("input[data-action=packs]");
        const packs = inp ? Math.max(1, Math.round(toNum(inp.value) || 1)) : getPacks(ingId);
        addIngredientToShopping(state, ingId, packs);
        persist();
        setFlash("Zur Einkaufsliste hinzugefügt.");
        window.app.navigate("ingredients");
        return;
      }

      if (action === "edit") {
        const ing = (state.ingredients || []).find((x) => x.id === ingId);
        if (!ing) return;
        openIngredientModal(state, persist, ing);
        return;
      }

      if (action === "del") {
        openDeleteModal(state, persist, ingId);
      }
    };
  };
})();
