/* js/shopping.js
   Einkaufsliste (packs-only) + Einkaufen-Modus + Abschluss + Undo
   Passt zu app.js: window.renderShoppingView(container, state, persist)
*/
(() => {
  const esc = (s) => (window.utils?.esc ? window.utils.esc(s) : String(s ?? ""));
  const uid = () => (window.utils?.uid ? window.utils.uid() : window.models.uid());
  const euro = (n) => (window.utils?.euro ? window.utils.euro(Number(n) || 0) : window.models.euro(Number(n) || 0));
  const clone = (obj) => (window.utils?.clone ? window.utils.clone(obj) : JSON.parse(JSON.stringify(obj)));

  // ---- undo (in-memory) ----
  let undoSnapshot = null;
  let undoTimer = null;
  let undoMessage = "";

  function setUndo(snapshot, message) {
    undoSnapshot = snapshot;
    undoMessage = message || "Rückgängig möglich.";

    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      undoSnapshot = null;
      undoMessage = "";
      // UI wird bei nächstem Render aktualisiert
    }, 10_000);
  }

  function clearUndo() {
    undoSnapshot = null;
    undoMessage = "";
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;
  }

  // ---- state helpers ----
  function ensureState(state) {
    if (!Array.isArray(state.ingredients)) state.ingredients = [];
    if (!Array.isArray(state.shopping)) state.shopping = [];
    if (!Array.isArray(state.pantry)) state.pantry = [];
    if (!Array.isArray(state.purchaseLog)) state.purchaseLog = [];
    if (!Array.isArray(state.recipes)) state.recipes = [];
    if (!Array.isArray(state.plannedRecipes)) state.plannedRecipes = [];

    if (!state.shoppingSession || typeof state.shoppingSession !== "object") {
      state.shoppingSession = { active: false, checked: {}, startedAt: null };
    }
    if (!state.shoppingSession.checked || typeof state.shoppingSession.checked !== "object") {
      state.shoppingSession.checked = {};
    }

    normalizeShopping(state);
  }

  function getIng(state, ingredientId) {
    return state.ingredients.find((i) => i.id === ingredientId) || null;
  }

  function normalizeShopping(state) {
    // packs-only + duplicates mergen (planMin bleibt erhalten; max)
    const merged = new Map();

    for (const it of state.shopping || []) {
      if (!it || typeof it !== "object") continue;
      if (!it.ingredientId) continue;

      const ing = getIng(state, it.ingredientId);

      let packs = Number(it.packs);
      if (!Number.isFinite(packs) || packs <= 0) {
        // legacy qty/count
        const q = Number(it.qty ?? it.count);
        if (Number.isFinite(q) && q > 0) packs = q;
      }
      if (!Number.isFinite(packs) || packs <= 0) {
        // legacy amount -> packs
        const amt = Number(it.amount);
        const packSize = Number(ing?.amount || 0);
        if (Number.isFinite(amt) && amt > 0 && Number.isFinite(packSize) && packSize > 0) {
          packs = Math.max(1, Math.ceil(amt / packSize));
        }
      }
      if (!Number.isFinite(packs) || packs <= 0) packs = 1;

      let planMin = Number(it.planMin);
      if (!Number.isFinite(planMin) || planMin < 0) planMin = undefined;
      else planMin = Math.round(planMin);

      const key = String(it.ingredientId);
      const cur = merged.get(key);
      if (!cur) {
        const row = { id: it.id || uid(), ingredientId: key, packs: Math.round(packs) };
        if (typeof planMin !== "undefined") row.planMin = planMin;
        merged.set(key, row);
      } else {
        cur.packs += Math.round(packs);
        if (typeof planMin !== "undefined") {
          cur.planMin = Math.max(Number(cur.planMin) || 0, planMin);
        }
      }
    }

    state.shopping = Array.from(merged.values());

    // Wenn etwas nicht mehr auf der Liste steht, aus checked entfernen
    const existingIds = new Set(state.shopping.map((x) => x.ingredientId));
    for (const k of Object.keys(state.shoppingSession.checked || {})) {
      if (!existingIds.has(k)) delete state.shoppingSession.checked[k];
    }
  }

  function groupShopping(state) {
    const groups = (state.shopping || [])
      .map((it) => ({
        ingredientId: String(it.ingredientId),
        packs: Math.max(1, Math.round(Number(it.packs) || 1)),
        planMin: Math.max(0, Math.round(Number(it.planMin) || 0))
      }))
      .sort((a, b) => {
        const ia = getIng(state, a.ingredientId)?.name || "";
        const ib = getIng(state, b.ingredientId)?.name || "";
        return ia.localeCompare(ib, "de");
      });

    return groups;
  }

  function calcExpiresAt(boughtAtISO, shelfLifeDays) {
    const days = Number(shelfLifeDays || 0);
    if (!Number.isFinite(days) || days <= 0) return null;
    const ms = new Date(boughtAtISO).getTime() + days * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString();
  }

  function startShopping(state) {
    state.shoppingSession.active = true;
    state.shoppingSession.startedAt = state.shoppingSession.startedAt || new Date().toISOString();
  }

  function cancelShopping(state) {
    state.shoppingSession.active = false;
    state.shoppingSession.checked = {};
    state.shoppingSession.startedAt = null;
  }

  function changePacks(state, ingredientId, delta) {
    const it = state.shopping.find((x) => x.ingredientId === ingredientId);

    if (!it) {
      if (delta > 0) state.shopping.push({ id: uid(), ingredientId, packs: 1 });
      return;
    }

    const before = Math.max(1, Math.round(Number(it.packs) || 1));
    const after = before + delta;

    if (after <= 0) {
      state.shopping = state.shopping.filter((x) => x.ingredientId !== ingredientId);
      delete state.shoppingSession.checked[ingredientId];
      return;
    }

    it.packs = after;
  }

  function removeAll(state, ingredientId) {
    state.shopping = state.shopping.filter((x) => x.ingredientId !== ingredientId);
    delete state.shoppingSession.checked[ingredientId];
  }

  function toggleBought(state, ingredientId) {
    const cur = !!state.shoppingSession.checked[ingredientId];
    state.shoppingSession.checked[ingredientId] = !cur;
  }

  function checkout(state) {
    const groups = groupShopping(state);
    const checked = groups.filter((g) => !!state.shoppingSession.checked[g.ingredientId]);
    if (!checked.length) return { ok: false, reason: "none_checked" };

    const snapshot = {
      shopping: clone(state.shopping),
      pantry: clone(state.pantry),
      purchaseLog: clone(state.purchaseLog),
      shoppingSession: clone(state.shoppingSession)
    };

    const nowISO = new Date().toISOString();

    for (const g of checked) {
      const ing = getIng(state, g.ingredientId);
      if (!ing) continue;

      const packs = g.packs;
      const buyAmount = (Number(ing.amount) || 0) * packs;
      const total = (Number(ing.price) || 0) * packs;

      state.purchaseLog.push({
        id: uid(),
        at: nowISO,
        total,
        ingredientId: ing.id,
        packs,
        buyAmount,
        unit: ing.unit
      });

      state.pantry.push({
        id: uid(),
        ingredientId: ing.id,
        amount: buyAmount,
        unit: ing.unit,
        boughtAt: nowISO,
        expiresAt: calcExpiresAt(nowISO, ing.shelfLifeDays),
        cost: total
      });
    }

    // remove checked from shopping
    state.shopping = state.shopping.filter((it) => !state.shoppingSession.checked[it.ingredientId]);

    cancelShopping(state);

    // Pantry hat sich geändert -> Plan ggf. neu anheben (niemals reduzieren)
    window.recipesLogic?.reconcileShoppingWithPlan?.(state, { mode: "raise" });

    return { ok: true, snapshot };
  }

  function undo(state, persist, container) {
    if (!undoSnapshot) return;
    state.shopping = undoSnapshot.shopping;
    state.pantry = undoSnapshot.pantry;
    state.purchaseLog = undoSnapshot.purchaseLog;
    state.shoppingSession = undoSnapshot.shoppingSession;
    clearUndo();
    persist();
    renderShoppingView(container, state, persist);
  }

  // ---- render ----
  function renderShoppingView(container, state, persist) {
    ensureState(state);

    // bind once
    if (!container.__shoppingBound) {
      container.__shoppingBound = true;

      container.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        const ingredientId = btn.getAttribute("data-ingredient-id");
        const recipeId = btn.getAttribute("data-recipe-id");

        // Snapshot for destructive actions (packs change that removes / removeAll)
        const takeSnapshot = () =>
          ({
            shopping: clone(state.shopping),
            pantry: clone(state.pantry),
            purchaseLog: clone(state.purchaseLog),
            shoppingSession: clone(state.shoppingSession)
          });

        if (action === "planRemove" && recipeId) {
          window.recipesLogic?.removePlannedRecipe?.(state, recipeId);
          window.recipesLogic?.reconcileShoppingWithPlan?.(state, { mode: "raise" }); // nicht reduzieren
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "planClean") {
          const ok = window.confirm(
            "Bereinigen reduziert Plan-Zutaten auf den Bedarf der geplanten Rezepte.\n\nManuelle Extras können dabei verschwinden.\n\nFortfahren?"
          );
          if (!ok) return;

          window.recipesLogic?.reconcileShoppingWithPlan?.(state, { mode: "exact" });
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "start") {
          startShopping(state);
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "cancel") {
          cancelShopping(state);
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "toggle" && ingredientId) {
          toggleBought(state, ingredientId);
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "inc" && ingredientId) {
          changePacks(state, ingredientId, +1);
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "dec" && ingredientId) {
          const snap = takeSnapshot();
          const before = state.shopping.find((x) => x.ingredientId === ingredientId);
          const beforePacks = before ? Math.max(1, Math.round(Number(before.packs) || 1)) : 0;

          changePacks(state, ingredientId, -1);

          // Wenn der Eintrag dadurch komplett verschwunden ist -> Undo anbieten
          const stillThere = state.shopping.some((x) => x.ingredientId === ingredientId);
          if (!stillThere && beforePacks === 1) {
            setUndo(snap, "Eintrag entfernt.");
          }

          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "remove" && ingredientId) {
          const snap = takeSnapshot();
          removeAll(state, ingredientId);
          setUndo(snap, "Entfernt.");
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "checkout") {
          const res = checkout(state);
          if (!res.ok) return;

          setUndo(res.snapshot, "Abgeschlossen. In den Vorrat übertragen.");
          persist();
          renderShoppingView(container, state, persist);
          return;
        }

        if (action === "undo") {
          undo(state, persist, container);
          return;
        }

        if (action === "toastClose") {
          clearUndo();
          renderShoppingView(container, state, persist);
          return;
        }
      });
    }

    const groups = groupShopping(state);
    const active = !!state.shoppingSession.active;

    const checkedCount = groups.filter((g) => !!state.shoppingSession.checked[g.ingredientId]).length;

    const checkedTotal = groups.reduce((sum, g) => {
      if (!state.shoppingSession.checked[g.ingredientId]) return sum;
      const ing = getIng(state, g.ingredientId);
      return sum + (Number(ing?.price) || 0) * g.packs;
    }, 0);

    const allTotal = groups.reduce((sum, g) => {
      const ing = getIng(state, g.ingredientId);
      return sum + (Number(ing?.price) || 0) * g.packs;
    }, 0);

    const rows = groups
      .map((g) => {
        const ing = getIng(state, g.ingredientId);
        const name = ing?.name || "(Unbekannte Zutat)";
        const packLabel = ing ? `${ing.amount ?? ""}${ing.unit ? " " + ing.unit : ""}`.trim() : "";
        const isChecked = !!state.shoppingSession.checked[g.ingredientId];

        return `
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 0; border-top:1px solid var(--border);">
            <div style="min-width:0; flex:1;">
              <div style="font-weight:650; line-height:1.2;">${esc(name)}</div>
              <div class="small" style="margin-top:4px; opacity:0.9;">
                ${g.packs}× ${esc(packLabel)} · <b>${esc(euro((Number(ing?.price) || 0) * g.packs))}</b>
                ${g.planMin && g.planMin > 0 ? ` · <span class=\"small\" style=\"opacity:0.85;\">Plan: mind. <b>${g.planMin}×</b></span>` : ""}
              </div>
            </div>

            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
              ${
                active
                  ? `<button class="${isChecked ? "success" : ""}" data-action="toggle" data-ingredient-id="${esc(g.ingredientId)}">
                       ${isChecked ? "Gekauft ✓" : "Gekauft"}
                     </button>`
                  : `
                     <button data-action="dec" data-ingredient-id="${esc(g.ingredientId)}">−</button>
                     <button data-action="inc" data-ingredient-id="${esc(g.ingredientId)}">+</button>
                     <button class="danger" data-action="remove" data-ingredient-id="${esc(g.ingredientId)}">Entfernen</button>
                   `
              }
            </div>
          </div>
        `;
      })
      .join("");

    const headerActions = active
      ? `
        <span class="small" style="border:1px solid var(--border); padding:4px 10px; border-radius:999px;">Im Einkauf</span>
        <button data-action="cancel">Abbrechen</button>
        <button class="success" data-action="checkout" ${checkedCount === 0 ? "disabled" : ""}>
          Abschließen / Bezahlt (${checkedCount}) · ${esc(euro(checkedTotal))}
        </button>
      `
      : `
        <button class="info" data-action="start" ${groups.length === 0 ? "disabled" : ""}>Einkaufen starten</button>
        <span class="small" style="opacity:0.9;">Gesamt: <b>${esc(euro(allTotal))}</b></span>
      `;

    const toast = undoSnapshot
      ? `
        <div class="toast-float" style="position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:9999;">
          <div class="toast-inner" style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:14px; background:rgba(15,17,22,0.95); box-shadow:0 14px 40px rgba(0,0,0,0.55);">
            <div class="small" style="opacity:0.95;">${esc(undoMessage || "Aktion durchgeführt.")}</div>
            <button data-action="undo">Rückgängig</button>
            <button data-action="toastClose" title="Schließen" style="min-width:40px;">✕</button>
          </div>
        </div>
      `
      : "";

    const planned = Array.isArray(state.plannedRecipes) ? state.plannedRecipes : [];
    const recipes = Array.isArray(state.recipes) ? state.recipes : [];

    const planSummary = window.recipesLogic?.computePlanSummary?.(state) || { byIngredient: new Map() };
    const neededCount = Array.from(planSummary.byIngredient.values()).filter((x) => (Number(x.requiredPacks) || 0) > 0).length;

    const plannedChips = planned
      .slice()
      .sort((a, b) => String(a.addedAt || "").localeCompare(String(b.addedAt || "")))
      .map((p) => {
        const r = recipes.find((x) => String(x.id) === String(p.recipeId));
        const name = r?.name || "(Rezept gelöscht)";
        const portions = Math.max(1, Math.round(Number(p.portionsWanted) || 1));
        return `
          <span class="chip">
            <span style="font-weight:700; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(name)}</span>
            <span class="muted2">${portions} Port.</span>
            <button class="danger chip-x" data-action="planRemove" data-recipe-id="${esc(String(p.recipeId))}" title="Entfernen">✕</button>
          </span>
        `;
      })
      .join("");

    const plannedSection = `
      <div style="margin-top:12px; padding:10px; border:1px dashed var(--border); border-radius:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:750;">Geplante Rezepte</div>
            <div class="small" style="opacity:0.88; margin-top:4px;">
              ${planned.length ? `Plan beeinflusst <b>${neededCount}</b> Zutat(en).` : "Noch keine Rezepte geplant."}
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            <button class="warn" data-action="planClean" ${planned.length ? "" : "disabled"}>Bereinigen</button>
          </div>
        </div>

        <div class="chips" style="margin-top:10px;">
          ${planned.length ? plannedChips : ""}
        </div>
      </div>
    `;
    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <h2 style="margin:0;">Einkaufsliste</h2>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            ${headerActions}
          </div>
        </div>

        ${plannedSection}

        <div style="margin-top:10px;">
          ${groups.length ? rows : `<div class="small" style="padding:10px 0;">Noch nichts auf der Einkaufsliste.</div>`}
        </div>
      </div>
      ${toast}
    `;
  }

  window.renderShoppingView = renderShoppingView;
})();
