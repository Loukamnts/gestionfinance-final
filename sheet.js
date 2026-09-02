/* ═══════════════════════════════════════════════════════════════
   FinanceSheet v4 — tableur multi-feuilles intégré
   Multi-feuilles (créer/supprimer/renommer/switcher) · en-têtes de
   colonnes ET lignes éditables · import/export multi-feuilles ·
   interactions fluides (pointer events) · sélection par diff (rAF) ·
   barre de formule (fx) · copier/coller · formules · calculatrice
   modale · sauvegarde locale · offline-first. 100% statique.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const DEFAULT_ROWS = 40;
  const DEFAULT_COLS = 12; // A..L
  const MONTH_HEADERS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  // Force les en-têtes de colonnes à être les 12 mois sur toutes les feuilles
  function enforceMonthHeaders(sheet) {
    if (!sheet) return;
    sheet.cols = Math.max(12, sheet.cols || 12);
    sheet.headers = MONTH_HEADERS.slice();
  }
  const STORAGE_KEY = "finance_sheet_v3";
  const LEGACY_KEY = "finance_sheet_v2";
  const VERSION = "v4-20260831";

  function colToLetter(n) {
    let s = ""; n = n + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function letterToCol(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function cellKey(r, c) { return r + "," + c; }
  function refToRC(ref) {
    const m = String(ref).toUpperCase().replace(/\$/g, "").match(/^([A-Z]+)([0-9]+)$/);
    if (!m) return null;
    return { r: parseInt(m[2], 10) - 1, c: letterToCol(m[1]) };
  }
  function sheetId() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  const Store = {
    getItem: (k) => { try { return safeStore.getItem(k); } catch (e) { return null; } },
    setItem: (k, v) => { try { safeStore.setItem(k, v); } catch (e) {} },
    removeItem: (k) => { try { safeStore.removeItem(k); } catch (e) {} },
  };

  // ═══════════════════════════ État multi-feuilles ═══════════════
  const state = {
    sheets: [],
    activeSheetId: null,
    active: { r: 0, c: 0 },
    range: { r0: 0, c0: 0, r1: 0, c1: 0 },
    editing: false, dirty: false,
  };

  function activeSheet() {
    return state.sheets.find((s) => s.id === state.activeSheetId) || state.sheets[0];
  }
  function newSheet(name) {
    const sheet = {
      id: sheetId(),
      name: name || ("Feuille " + (state.sheets.length + 1)),
      cells: {},
      headers: [],
      rowHeaders: [],
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
    };
    enforceMonthHeaders(sheet);
    state.sheets.push(sheet);
    return sheet;
  }
  // Getters/setters deleguant vers la feuille active : le code existant
  // (formules, rendu, copier/coller) continue d'utiliser state.cells etc.
  Object.defineProperties(state, {
    cells: { get() { return activeSheet().cells; }, set(v) { activeSheet().cells = v; } },
    headers: { get() { return activeSheet().headers; }, set(v) { activeSheet().headers = v; } },
    rowHeaders: { get() { return activeSheet().rowHeaders; }, set(v) { activeSheet().rowHeaders = v; } },
    rows: { get() { return activeSheet().rows; }, set(v) { activeSheet().rows = v; } },
    cols: { get() { return activeSheet().cols; }, set(v) { activeSheet().cols = v; } },
  });

  function getCell(r, c) { return state.cells[cellKey(r, c)] || { raw: "" }; }
  function setRaw(r, c, raw) {
    const k = cellKey(r, c);
    if (raw === "" || raw == null) delete state.cells[k];
    else state.cells[k] = { raw: String(raw) };
  }
  function headerLabel(c) { return state.headers[c] || colToLetter(c); }
  function rowLabel(r) { return state.rowHeaders[r] || String(r + 1); }

  // ═══════════════════════ Moteur de formules ═════════════════════
  function tokenize(formula) {
    const s = formula.replace(/^\s*=\s*/, "");
    const tokens = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === " " || ch === "\t") { i++; continue; }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1]))) {
        let num = ""; while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
        tokens.push({ t: "num", v: parseFloat(num) }); continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let word = ""; while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) { word += s[i]; i++; }
        const up = word.toUpperCase();
        if (up === "TRUE" || up === "FAUX" || up === "VRAI") tokens.push({ t: "bool", v: up === "TRUE" || up === "VRAI" });
        else if (/^[A-Za-z]+$/.test(word) && s[i] === "(") tokens.push({ t: "func", v: up });
        else tokens.push({ t: "ref", v: up });
        continue;
      }
      if ("+-*/(),:".indexOf(ch) >= 0) { tokens.push({ t: "op", v: ch }); i++; continue; }
      throw new Error("Caractère inattendu: " + ch);
    }
    return tokens;
  }
  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos], next = () => tokens[pos++];
    function parseExpr() {
      let node = parseTerm();
      while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
        const op = next().v; node = { type: "bin", op, left: node, right: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      let node = parseFactor();
      while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) {
        const op = next().v; node = { type: "bin", op, left: node, right: parseFactor() };
      }
      return node;
    }
    function parseFactor() {
      const tok = peek(); if (!tok) throw new Error("Formule incomplète");
      if (tok.t === "op" && tok.v === "-") { next(); return { type: "unary", op: "-", expr: parseFactor() }; }
      if (tok.t === "op" && tok.v === "+") { next(); return parseFactor(); }
      if (tok.t === "op" && tok.v === "(") { next(); const e = parseExpr(); if (!peek() || peek().v !== ")") throw new Error(") manquante"); next(); return e; }
      if (tok.t === "num") { next(); return { type: "num", v: tok.v }; }
      if (tok.t === "bool") { next(); return { type: "num", v: tok.v ? 1 : 0 }; }
      if (tok.t === "ref") {
        next();
        if (peek() && peek().t === "op" && peek().v === ":") {
          next(); const end = next(); if (!end || end.t !== "ref") throw new Error("Plage invalide");
          return { type: "range", start: tok.v, end: end.v };
        }
        return { type: "ref", v: tok.v };
      }
      if (tok.t === "func") {
        next();
        if (!peek() || peek().v !== "(") throw new Error("( attendue");
        next(); const args = [];
        if (!(peek() && peek().v === ")")) { args.push(parseExpr()); while (peek() && peek().v === ",") { next(); args.push(parseExpr()); } }
        if (!peek() || peek().v !== ")") throw new Error(") manquante"); next();
        return { type: "func", name: tok.v, args };
      }
      throw new Error("Token inattendu");
    }
    const ast = parseExpr(); if (pos < tokens.length) throw new Error("Syntaxe invalide");
    return ast;
  }
  function evalNode(node, getCellValue) {
    switch (node.type) {
      case "num": return node.v;
      case "ref": { const rc = refToRC(node.v); if (!rc) throw new Error("Réf invalide: " + node.v); return getCellValue(rc.r, rc.c); }
      case "range": throw new Error("Plage hors fonction");
      case "unary": { const v = num0(evalNode(node.expr, getCellValue)); return node.op === "-" ? -v : v; }
      case "bin": {
        const l = num0(evalNode(node.left, getCellValue)), r = num0(evalNode(node.right, getCellValue));
        if (node.op === "+") return l + r; if (node.op === "-") return l - r;
        if (node.op === "*") return l * r; if (r === 0) throw new Error("Division par zéro"); return l / r;
      }
      case "func": return evalFunc(node, getCellValue);
    }
  }
  function collectRangeValues(start, end, getCellValue) {
    const a = refToRC(start), b = refToRC(end); if (!a || !b) throw new Error("Plage invalide");
    const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r), c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    const vals = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) vals.push(getCellValue(r, c));
    return vals;
  }
  function evalFunc(node, getCellValue) {
    const collect = () => {
      const nums = [];
      for (const arg of node.args) {
        if (arg.type === "range") { for (const v of collectRangeValues(arg.start, arg.end, getCellValue)) nums.push(v); }
        else { const rc = arg.type === "ref" ? refToRC(arg.v) : null; nums.push(rc ? getCellValue(rc.r, rc.c) : evalNode(arg, getCellValue)); }
      }
      return nums.map(toNum).filter((n) => !isNaN(n));
    };
    switch (node.name) {
      case "SUM": case "SOMME": return collect().reduce((a, b) => a + b, 0);
      case "AVERAGE": case "MOYENNE": { const a = collect(); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
      case "MIN": { const a = collect(); return a.length ? Math.min(...a) : 0; }
      case "MAX": { const a = collect(); return a.length ? Math.max(...a) : 0; }
      case "COUNT": case "NB": return collect().length;
      default: throw new Error("Fonction inconnue: " + node.name);
    }
  }
  function toNum(v) { if (typeof v === "number") return v; const n = parseFloat(String(v).replace(",", ".").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? NaN : n; }
  function num0(v) { const n = toNum(v); return isNaN(n) ? 0 : n; }

  // recompute accepte un objet cells (defaut: feuille active) pour pouvoir
  // exporter les formules de toutes les feuilles.
  function recompute(cells) {
    cells = cells || state.cells;
    const cache = {}; const computing = {};
    function evalCell(r, c) {
      const k = cellKey(r, c);
      if (k in cache) return cache[k];
      if (computing[k]) { cache[k] = { error: "#CYCLE!" }; return cache[k]; }
      const cell = cells[k];
      if (!cell || cell.raw === "") { cache[k] = { value: "" }; return cache[k]; }
      const raw = cell.raw;
      if (raw[0] !== "=") {
        const cleaned = String(raw).replace(/\s/g, "");
        const num = parseFloat(cleaned.replace(",", ".").replace(/[^0-9.\-]/g, ""));
        if (!isNaN(num) && cleaned !== "" && /^-?[0-9.,]+%?$/.test(cleaned)) cache[k] = { value: num };
        else cache[k] = { value: raw };
        return cache[k];
      }
      computing[k] = true;
      try {
        const ast = parse(tokenize(raw));
        const val = evalNode(ast, (rr, cc) => { const res = evalCell(rr, cc); if (res.error) throw new Error(res.error); return res.value; });
        if (typeof val === "number" && !Number.isFinite(val)) cache[k] = { error: "#ERR!" };
        else cache[k] = { value: val };
      } catch (e) { cache[k] = { error: e.message || "#ERR!" }; }
      finally { computing[k] = false; }
      return cache[k];
    }
    const result = {};
    for (const k in cells) { const [r, c] = k.split(",").map(Number); result[k] = evalCell(r, c); }
    return result;
  }

  // ═════════════════════════ Rendu ════════════════════════════════
  let tbody, thead, container, tabsEl, sheetScroll, fillHandle;
  let lastComputed = {};
  const cellMap = new Map();
  let rowHeadEls = [];
  let colHeadEls = [];

  function buildTable() {
    container.innerHTML = "";
    cellMap.clear(); rowHeadEls = []; colHeadEls = [];
    const scroll = document.createElement("div"); scroll.className = "sheet-scroll"; sheetScroll = scroll;
    const table = document.createElement("table"); table.className = "sheet-table";
    const lettersRow = document.createElement("tr");
    const hRow = document.createElement("tr");
    const corner = document.createElement("th"); corner.className = "corner-head"; corner.rowSpan = 2; corner.title = "Intitulés des lignes"; lettersRow.appendChild(corner);
    for (let c = 0; c < state.cols; c++) {
      const letter = document.createElement("th"); letter.className = "col-letter"; letter.dataset.c = c; letter.textContent = colToLetter(c); letter.title = "Colonne " + colToLetter(c);
      letter.addEventListener("click", () => selectCol(c));
      lettersRow.appendChild(letter); colHeadEls.push(letter);
    }
    for (let c = 0; c < state.cols; c++) {
      const th = document.createElement("th"); th.className = "col-head"; th.dataset.c = c;
      const sp = document.createElement("span"); sp.className = "h-label"; sp.textContent = headerLabel(c);
      th.appendChild(sp);
      th.addEventListener("click", () => selectCol(c));
      // Pas de dblclick sur les en-têtes de colonnes : les mois ne sont pas renommables
      hRow.appendChild(th); colHeadEls.push(th);
    }
    thead = document.createElement("thead"); thead.appendChild(lettersRow); thead.appendChild(hRow); table.appendChild(thead);
    tbody = document.createElement("tbody");
    for (let r = 0; r < state.rows; r++) {
      const tr = document.createElement("tr");
      const rh = document.createElement("th"); rh.className = "row-head"; rh.dataset.r = r;
      const rhNumber = document.createElement("span"); rhNumber.className = "rh-number"; rhNumber.textContent = String(r + 1); rhNumber.title = "Ligne " + (r + 1);
      const rhLabel = document.createElement("span"); rhLabel.className = "rh-label"; rhLabel.textContent = state.rowHeaders[r] || "";
      rh.append(rhNumber, rhLabel);
      const rhEdit = document.createElement("button"); rhEdit.className = "rh-edit-btn"; rhEdit.type = "button"; rhEdit.textContent = "✎"; rhEdit.title = "Renommer la ligne"; rhEdit.setAttribute("aria-label", "Renommer la ligne " + (r + 1));
      rhEdit.addEventListener("click", function(e) { e.stopPropagation(); editRowHeader(r); });
      rh.appendChild(rhEdit);
      rh.addEventListener("click", () => selectRow(r));
      rh.addEventListener("dblclick", () => editRowHeader(r));
      tr.appendChild(rh); rowHeadEls.push(rh);
      for (let c = 0; c < state.cols; c++) {
        const td = document.createElement("td"); td.className = "cell"; td.dataset.r = r; td.dataset.c = c;
        const cv = document.createElement("span"); cv.className = "cv"; td.appendChild(cv);
        td.addEventListener("pointerdown", onCellPointerDown);
        td.addEventListener("pointermove", onCellPointerMove);
        td.addEventListener("pointerup", onCellPointerUp);
        td.addEventListener("pointercancel", onCellPointerUp);
        tr.appendChild(td);
        cellMap.set(cellKey(r, c), { td, cv });
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody); scroll.appendChild(table);
    fillHandle = document.createElement("button"); fillHandle.type = "button"; fillHandle.className = "sheet-fill-handle"; fillHandle.title = "Faire glisser pour recopier"; fillHandle.setAttribute("aria-label", "Faire glisser pour recopier la sélection");
    fillHandle.addEventListener("pointerdown", beginFillDrag); scroll.appendChild(fillHandle);
    const addBar = document.createElement("div"); addBar.className = "sheet-addrows";
    const addBtn = document.createElement("button"); addBtn.className = "button button-ghost"; addBtn.textContent = "+ 1 ligne";
    addBtn.title = "Ajouter une ligne";
    addBtn.addEventListener("click", () => { state.rows += 1; buildTable(); renderValues(); scheduleSave(); });
    addBar.appendChild(addBtn);
    container.appendChild(scroll); container.appendChild(addBar);
    applySelectionStyle();
  }

  function renderValues() {
    lastComputed = recompute();
    cellMap.forEach((entry, k) => {
      const res = lastComputed[k];
      const td = entry.td, cv = entry.cv;
      td.classList.remove("num", "error");
      if (!res) { cv.textContent = ""; return; }
      if (res.error) { cv.textContent = res.error; td.classList.add("error"); return; }
      const v = res.value;
      if (typeof v === "number" && Number.isFinite(v)) { cv.textContent = formatNumber(v); td.classList.add("num"); }
      else if (typeof v === "number") { cv.textContent = "#ERR!"; td.classList.add("error"); }
      else cv.textContent = String(v);
    });
    syncFormulaBar();
    applySelectionStyle();
    updateSheetBalanceCards();
  }
  function formatNumber(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "#ERR!";
    if (Number.isInteger(v)) return v.toLocaleString("fr-FR");
    return (Math.round(v * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }

  // ═════════════════ Barre de formule (fx) ════════════════════════════════
  let fxRef, fxInput, fxPreview;
  function syncFormulaBar() {
    if (!fxInput) return;
    const { r, c } = state.active;
    fxRef.textContent = colToLetter(c) + (r + 1);
    const cell = getCell(r, c);
    if (document.activeElement !== fxInput) fxInput.value = cell.raw;
    const res = lastComputed[cellKey(r, c)];
    if (res && res.error) fxPreview.textContent = res.error;
    else if (res && typeof res.value === "number" && Number.isFinite(res.value) && cell.raw && cell.raw[0] === "=") fxPreview.textContent = "= " + formatNumber(res.value);
    else if (res && typeof res.value === "number" && Number.isFinite(res.value)) fxPreview.textContent = formatNumber(res.value);
    else fxPreview.textContent = "";
  }
  function wireFormulaBar() {
    fxRef = document.getElementById("fxRef");
    fxInput = document.getElementById("fxInput");
    fxPreview = document.getElementById("fxPreview");
    if (!fxInput) return;
    let fxTimer = null;
    fxInput.addEventListener("input", () => {
      if (fxTimer) clearTimeout(fxTimer);
      fxTimer = setTimeout(() => { fxPreview.textContent = previewEval(fxInput.value); }, 60);
    });
    fxInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitFormulaBar(e.shiftKey ? "up" : "down"); }
      else if (e.key === "Escape") { e.preventDefault(); syncFormulaBar(); fxInput.blur(); }
    });
  }
  function previewEval(raw) {
    if (!raw) return "";
    if (raw[0] !== "=") return "";
    try { const ast = parse(tokenize(raw)); const v = evalNode(ast, (r, c) => { const res = lastComputed[cellKey(r, c)]; return res ? res.value : 0; }); return Number.isFinite(v) ? "= " + formatNumber(v) : "#ERR!"; }
    catch (e) { return "#ERR!"; }
  }
  function commitFormulaBar(move) {
    const { r, c } = state.active;
    setRaw(r, c, fxInput.value);
    renderValues(); scheduleSave();
    if (move) { state.active = moveCell(r, c, move); setRange(state.active.r, state.active.c, state.active.r, state.active.c); syncFormulaBar(); }
    fxInput.focus();
  }

  // ═════════ Sélection & édition (pointer events, diff + rAF) ═════
  const ptr = { active: false, startX: 0, startY: 0, moved: false, r0: 0, c0: 0, startCell: { r: 0, c: 0 } };
  let lastTapKey = null;
  let rafSelection = null; let pendingRange = null;
  let prevInRange = new Set(); let prevActiveKey = null;

  function onCellPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const td = e.currentTarget; const r = +td.dataset.r, c = +td.dataset.c;
    if (state.editing && (state.active.r !== r || state.active.c !== c)) { commitActiveEdit(); }
    if (e.shiftKey) { setRange(state.range.r0, state.range.c0, r, c); syncFormulaBar(); return; }
    ptr.active = true; ptr.moved = false;
    ptr.startX = e.clientX; ptr.startY = e.clientY;
    ptr.r0 = r; ptr.c0 = c; ptr.startCell = { r, c };
    ptr.willEdit = !state.editing && (lastTapKey === cellKey(r, c));
    try { td.setPointerCapture(e.pointerId); } catch (_) {}
    setActive(r, c);
  }
  function onCellPointerMove(e) {
    if (!ptr.active) return;
    if (!ptr.moved) {
      const dx = e.clientX - ptr.startX, dy = e.clientY - ptr.startY;
      if (dx * dx + dy * dy < 36) return;
      ptr.moved = true;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const td2 = el && el.closest ? el.closest("td.cell") : null;
    if (td2) { const rr = +td2.dataset.r, cc = +td2.dataset.c; scheduleRange(ptr.r0, ptr.c0, rr, cc); }
  }
  function onCellPointerUp(e) {
    if (!ptr.active) return;
    ptr.active = false;
    const sc = ptr.startCell;
    if (!ptr.moved && !state.editing) {
      if (ptr.willEdit) { lastTapKey = null; startEdit(sc.r, sc.c); }
      else { lastTapKey = cellKey(sc.r, sc.c); }
    }
  }
  function scheduleRange(r0, c0, r1, c1) {
    pendingRange = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
    if (rafSelection) return;
    rafSelection = requestAnimationFrame(() => { rafSelection = null; if (pendingRange) { const p = pendingRange; pendingRange = null; setRange(p.r0, p.c0, p.r1, p.c1); } });
  }
  function setActive(r, c) {
    state.active = { r, c };
    setRange(r, c, r, c);
    syncFormulaBar();
  }
  function setRange(r0, c0, r1, c1) {
    state.range = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
    applySelectionStyle();
  }
  function selectRow(r) { setRange(r, 0, r, state.cols - 1); state.active = { r, c: state.range.c0 }; syncFormulaBar(); }
  function selectCol(c) { setRange(0, c, state.rows - 1, c); state.active = { r: state.range.r0, c }; syncFormulaBar(); }

  function applySelectionStyle() {
    const r0 = state.range.r0, c0 = state.range.c0, r1 = state.range.r1, c1 = state.range.c1;
    const activeKey = cellKey(state.active.r, state.active.c);
    const nextInRange = new Set();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) nextInRange.add(cellKey(r, c));

    for (const k of prevInRange) {
      if (!nextInRange.has(k) && k !== activeKey) {
        const entry = cellMap.get(k); if (entry) entry.td.classList.remove("in-range");
      }
    }
    for (const k of nextInRange) {
      if (!prevInRange.has(k)) {
        const entry = cellMap.get(k); if (entry) entry.td.classList.add("in-range");
      }
    }
    if (prevActiveKey !== activeKey) {
      const oldEntry = cellMap.get(prevActiveKey); if (oldEntry) oldEntry.td.classList.remove("selected");
      const newEntry = cellMap.get(activeKey); if (newEntry) newEntry.td.classList.add("selected");
    }
    rowHeadEls.forEach((th) => { const r = +th.dataset.r; th.classList.toggle("row-sel", r >= r0 && r <= r1); });
    if (colHeadEls.length) colHeadEls.forEach((th) => { const c = +th.dataset.c; th.classList.toggle("col-sel", c >= c0 && c <= c1); });

    prevInRange = nextInRange;
    prevActiveKey = activeKey;
    positionFillHandle();
  }

  // Poignée de recopie : même geste qu'Excel, avec décalage des références
  // relatives dans les formules (A1 devient A2 en descendant d'une ligne).
  let fillDrag = null;
  function positionFillHandle() {
    if (!fillHandle || !sheetScroll || state.editing) return;
    const target = cellEl(state.range.r1, state.range.c1);
    if (!target) { fillHandle.style.display = "none"; return; }
    fillHandle.style.display = "block";
    fillHandle.style.left = (target.offsetLeft + target.offsetWidth - 6) + "px";
    fillHandle.style.top = (target.offsetTop + target.offsetHeight - 6) + "px";
  }
  function beginFillDrag(e) {
    if (e.button !== 0 || state.editing) return;
    e.preventDefault(); e.stopPropagation();
    fillDrag = { source: { r0: state.range.r0, c0: state.range.c0, r1: state.range.r1, c1: state.range.c1 } };
    document.addEventListener("pointermove", onFillDragMove);
    document.addEventListener("pointerup", endFillDrag, { once: true });
    document.addEventListener("pointercancel", endFillDrag, { once: true });
  }
  function onFillDragMove(e) {
    if (!fillDrag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const td = el && el.closest ? el.closest("td.cell") : null;
    if (!td) return;
    fillDrag.target = { r: +td.dataset.r, c: +td.dataset.c };
  }
  function endFillDrag() {
    document.removeEventListener("pointermove", onFillDragMove);
    const drag = fillDrag; fillDrag = null;
    if (!drag || !drag.target) return;
    fillSelectionTo(drag.source, drag.target);
  }
  function shiftFormulaForFill(raw, deltaR, deltaC) {
    if (typeof raw !== "string" || raw.charAt(0) !== "=") return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, function(match, absCol, letters, absRow, number) {
      const nextCol = absCol ? letterToCol(letters) : Math.max(0, letterToCol(letters) + deltaC);
      const nextRow = absRow ? Number(number) : Math.max(1, Number(number) + deltaR);
      return (absCol || "") + colToLetter(nextCol) + (absRow || "") + nextRow;
    });
  }
  function fillSelectionTo(source, target) {
    let destination = null;
    if (target.r > source.r1) destination = { r0: source.r1 + 1, c0: source.c0, r1: target.r, c1: source.c1 };
    else if (target.r < source.r0) destination = { r0: target.r, c0: source.c0, r1: source.r0 - 1, c1: source.c1 };
    else if (target.c > source.c1) destination = { r0: source.r0, c0: source.c1 + 1, r1: source.r1, c1: target.c };
    else if (target.c < source.c0) destination = { r0: source.r0, c0: target.c, r1: source.r1, c1: source.c0 - 1 };
    if (!destination) return;
    const sourceRows = source.r1 - source.r0 + 1, sourceCols = source.c1 - source.c0 + 1;
    for (let r = destination.r0; r <= destination.r1; r++) {
      for (let c = destination.c0; c <= destination.c1; c++) {
        const sourceR = source.r0 + ((r - source.r0) % sourceRows + sourceRows) % sourceRows;
        const sourceC = source.c0 + ((c - source.c0) % sourceCols + sourceCols) % sourceCols;
        const raw = getCell(sourceR, sourceC).raw;
        setRaw(r, c, shiftFormulaForFill(raw, r - sourceR, c - sourceC));
      }
    }
    state.active = { r: destination.r0, c: destination.c0 };
    setRange(Math.min(source.r0, destination.r0), Math.min(source.c0, destination.c0), Math.max(source.r1, destination.r1), Math.max(source.c1, destination.c1));
    renderValues(); scheduleSave();
  }

  let activeEdit = null;
  function commitActiveEdit() { if (activeEdit) { const fn = activeEdit.commit; activeEdit = null; fn(null); } }
  function startEdit(r, c, initial) {
    if (state.editing) return; state.editing = true;
    const td = cellEl(r, c); if (!td) { state.editing = false; return; }
    const cell = getCell(r, c);
    const input = document.createElement("input"); input.className = "cell-edit";
    input.value = initial != null ? initial : cell.raw;
    td.innerHTML = ""; td.appendChild(input); input.focus();
    td.classList.add("editing");
    if (initial == null) input.select();
    let done = false;
    const commit = (move) => {
      if (done) return; done = true;
      setRaw(r, c, input.value); state.editing = false; activeEdit = null;
      rebuildCell(td, r, c); td.classList.remove("editing"); renderValues(); scheduleSave();
      if (move) { state.active = moveCell(r, c, move); setRange(state.active.r, state.active.c, state.active.r, state.active.c); }
      syncFormulaBar();
    };
    activeEdit = { r, c, commit };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit("down"); }
      else if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? "left" : "right"); }
      else if (e.key === "Escape") { e.preventDefault(); done = true; state.editing = false; activeEdit = null; rebuildCell(td, r, c); td.classList.remove("editing"); renderValues(); syncFormulaBar(); }
    });
    input.addEventListener("blur", () => { if (!done) commit(null); });
  }
  function moveCell(r, c, dir) {
    const m = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] }[dir] || [0, 0];
    return { r: Math.max(0, Math.min(r + m[0], state.rows - 1)), c: Math.max(0, Math.min(c + m[1], state.cols - 1)) };
  }
  function cellEl(r, c) { const entry = cellMap.get(cellKey(r, c)); return entry ? entry.td : null; }
  function rebuildCell(td, r, c) { td.innerHTML = ""; const cv = document.createElement("span"); cv.className = "cv"; td.appendChild(cv); cellMap.set(cellKey(r, c), { td, cv }); }

  // ═════════ En-têtes éditables (colonnes ET lignes) ═══════════════
  function editHeader(c) {
    const th = thead.querySelector('th.col-head[data-c="' + c + '"]'); if (!th) return;
    const input = document.createElement("input"); input.className = "h-edit"; input.value = headerLabel(c);
    th.innerHTML = ""; th.appendChild(input); input.focus(); input.select();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const v = input.value.trim(); state.headers[c] = v || colToLetter(c);
      th.innerHTML = ""; const sp = document.createElement("span"); sp.className = "h-label"; sp.textContent = headerLabel(c); th.appendChild(sp);
      scheduleSave();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); finish(); } else if (e.key === "Escape") { e.preventDefault(); done = true; th.innerHTML = ""; const sp = document.createElement("span"); sp.className = "h-label"; sp.textContent = headerLabel(c); th.appendChild(sp); } });
    input.addEventListener("blur", finish);
  }
  function rebuildRowHeader(th, r) {
    th.innerHTML = "";
    const lbl = document.createElement("span"); lbl.className = "rh-label"; lbl.textContent = rowLabel(r);
    th.appendChild(lbl);
    const btn = document.createElement("button"); btn.className = "rh-edit-btn"; btn.type = "button"; btn.textContent = "✎"; btn.title = "Renommer la ligne";
    btn.setAttribute("aria-label", "Renommer la ligne " + (r + 1));
    btn.addEventListener("click", function(e) { e.stopPropagation(); editRowHeader(r); });
    th.appendChild(btn);
  }
  function editRowHeader(r) {
    const th = rowHeadEls[r]; if (!th) return;
    const input = document.createElement("input"); input.className = "h-edit"; input.value = rowLabel(r);
    th.innerHTML = ""; th.appendChild(input); input.focus(); input.select();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const v = input.value.trim(); state.rowHeaders[r] = v || String(r + 1);
      rebuildRowHeader(th, r);
      scheduleSave();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); finish(); } else if (e.key === "Escape") { e.preventDefault(); done = true; rebuildRowHeader(th, r); } });
    input.addEventListener("blur", finish);
  }

  function onKeydown(e) {
    if (state.editing) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.target.closest && e.target.closest(".sheet-modal-overlay")) return;
    const { r, c } = state.active; let nr = r, nc = c;
    switch (e.key) {
      case "ArrowDown": nr = Math.min(r + 1, state.rows - 1); break;
      case "ArrowUp": nr = Math.max(r - 1, 0); break;
      case "ArrowRight": nc = Math.min(c + 1, state.cols - 1); break;
      case "ArrowLeft": nc = Math.max(c - 1, 0); break;
      case "Enter": case "F2": e.preventDefault(); startEdit(r, c); return;
      case "Delete": case "Backspace": e.preventDefault(); clearSelection(); return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(r, c, e.key); }
        return;
    }
    e.preventDefault(); state.active = { r: nr, c: nc };
    if (!e.shiftKey) setRange(nr, nc, nr, nc); else setRange(state.range.r0, state.range.c0, nr, nc);
    syncFormulaBar();
  }
  function clearSelection() {
    for (let r = state.range.r0; r <= state.range.r1; r++) for (let c = state.range.c0; c <= state.range.c1; c++) setRaw(r, c, "");
    renderValues(); scheduleSave();
  }

  // ═══════════════════════ Copier / Coller ═══════════════════════
  function copySelection() {
    const { r0, c0, r1, c1 } = state.range; const lines = [];
    for (let r = r0; r <= r1; r++) { const cells = []; for (let c = c0; c <= c1; c++) { const res = lastComputed[cellKey(r, c)]; let v = res ? res.value : ""; if (typeof v === "number" && !Number.isFinite(v)) v = ""; cells.push(v != null ? String(v) : ""); } lines.push(cells.join("\t")); }
    return lines.join("\n");
  }
  function paste(text) {
    const { r: sr, c: sc } = state.active;
    text.replace(/\r$/, "").split("\n").forEach((row, ri) => {
      row.split("\t").forEach((val, ci) => {
        const r = sr + ri, c = sc + ci;
        if (r >= state.rows) state.rows = r + 1; if (c >= state.cols) state.cols = c + 1;
        setRaw(r, c, val);
      });
    });
    if (sc + 1 > state.headers.length) state.headers.length = state.cols;
    buildTable(); renderValues(); scheduleSave();
  }

  // ═════════════════════ Onglets de feuilles (type Excel) ════════
  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = "";
    // Bouton "+" avant le premier onglet pour ajouter une année avant
    const addBeforeBtn = document.createElement("button"); addBeforeBtn.type = "button"; addBeforeBtn.className = "sheet-tab add add-before"; addBeforeBtn.textContent = "+";
    addBeforeBtn.title = "Ajouter une feuille avant";
    addBeforeBtn.addEventListener("click", () => {
      const s = newSheet();
      const idx = state.sheets.indexOf(s);
      // Déplace la nouvelle feuille au début
      state.sheets.splice(idx, 1);
      state.sheets.unshift(s);
      state.activeSheetId = s.id; state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
      buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
    });
    tabsEl.appendChild(addBeforeBtn);
    state.sheets.forEach((sheet) => {
      const tab = document.createElement("div"); tab.className = "sheet-tab" + (sheet.id === state.activeSheetId ? " active" : ""); tab.dataset.sheetId = sheet.id;
      const label = document.createElement("button"); label.type = "button"; label.className = "sheet-tab-name";
      label.textContent = sheet.name; label.title = "Sélectionner · double-clic pour renommer";
      label.addEventListener("click", () => switchSheet(sheet.id));
      label.addEventListener("dblclick", () => renameSheet(sheet.id));
      tab.appendChild(label);
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "sheet-tab-rename"; edit.textContent = "✎"; edit.title = "Renommer la feuille"; edit.setAttribute("aria-label", "Renommer la feuille " + sheet.name);
      edit.addEventListener("click", (e) => { e.stopPropagation(); renameSheet(sheet.id); });
      tab.appendChild(edit);
      if (state.sheets.length > 1) {
        const x = document.createElement("button"); x.type = "button"; x.className = "sheet-tab-x"; x.textContent = "×";
        x.title = "Supprimer la feuille";
        x.addEventListener("click", (e) => { e.stopPropagation(); deleteSheet(sheet.id); });
        tab.appendChild(x);
      }
      tabsEl.appendChild(tab);
    });
    const addBtn = document.createElement("button"); addBtn.type = "button"; addBtn.className = "sheet-tab add"; addBtn.textContent = "+";
    addBtn.title = "Nouvelle feuille";
    addBtn.addEventListener("click", () => {
      const s = newSheet(); state.activeSheetId = s.id; state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
      buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
    });
    tabsEl.appendChild(addBtn);
  }
  function switchSheet(id) {
    if (state.editing) commitActiveEdit();
    if (id === state.activeSheetId) return;
    state.activeSheetId = id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    lastTapKey = null;
    buildTable(); renderValues();
    tabsEl.querySelectorAll(".sheet-tab").forEach((t) => t.classList.toggle("active", t.dataset.sheetId === id));
    syncFormulaBar();
  }
  function renameSheet(id) {
    const sheet = state.sheets.find((s) => s.id === id); if (!sheet) return;
    const tab = tabsEl.querySelector('.sheet-tab[data-sheet-id="' + id + '"]');
    const btn = tab ? tab.querySelector(".sheet-tab-name") : null;
    if (!btn) return;
    const input = document.createElement("input"); input.className = "h-edit"; input.value = sheet.name;
    const parent = btn.parentNode; parent.replaceChild(input, btn); input.focus(); input.select();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const v = input.value.trim().replace(/[:\\/?*[\]]/g, "").slice(0, 28);
      sheet.name = v || ("Feuille " + (state.sheets.indexOf(sheet) + 1));
      renderTabs(); scheduleSave();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); finish(); } else if (e.key === "Escape") { e.preventDefault(); done = true; renderTabs(); } });
    input.addEventListener("blur", finish);
  }
  async function deleteSheet(id) {
    if (state.sheets.length <= 1) { toast("Impossible de supprimer la dernière feuille."); return; }
    if (!await confirmDialog("Supprimer cette feuille et son contenu ?")) return;
    const idx = state.sheets.findIndex((s) => s.id === id); if (idx < 0) return;
    state.sheets.splice(idx, 1);
    if (state.activeSheetId === id) state.activeSheetId = state.sheets[0].id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave();
  }

  // ═════════════════════ Import / Export .xlsx (multi-feuilles) ════
  function sanitizeSheetName(name, idx, wb) {
    let n = String(name || ("Feuille " + (idx + 1))).replace(/[:\\/?*[\]]/g, "").slice(0, 28).trim() || ("Feuille " + (idx + 1));
    let base = n, i = 1;
    while (wb.SheetNames.indexOf(n) >= 0) { i++; n = base.slice(0, 25) + " (" + i + ")"; }
    return n;
  }
  function shiftFormulaRows(formula, delta) {
    // Décale les numéros de ligne des références de cellules (ex: B2 -> B1).
    // Évite de corrompre les notations scientifiques en ignorant les chiffres
    // non précédés d'une lettre. Ne touche pas aux noms de fonctions.
    return String(formula).replace(/([A-Z]+)(\d+)/g, (m, col, row) => {
      const r = parseInt(row, 10) + delta;
      return col + (r < 1 ? 1 : r);
    });
  }
  // Normalise un nom de mois vers la forme canonique (capitalisé)
  function normalizeMonthHeader(label) {
    if (!label) return null;
    var s = String(label).trim().toLowerCase();
    // Correspondance partielle : "janv", "jan", "janvier", etc.
    var map = {
      "janvier":"Janvier","janv":"Janvier","jan":"Janvier","fevrier":"Février","février":"Février","fev":"Février","fév":"Février",
      "mars":"Mars","mar":"Mars","avril":"Avril","avr":"Avril","mai":"Mai","juin":"Juin","juil":"Juillet",
      "juillet":"Juillet","aout":"Août","août":"Août","septembre":"Septembre","sept":"Septembre","sep":"Septembre",
      "octobre":"Octobre","oct":"Octobre","novembre":"Novembre","nov":"Novembre","decembre":"Décembre","décembre":"Décembre","dec":"Décembre","déc":"Décembre"
    };
    return map[s] || null;
  }

  // Détecte si la première colonne contient des titres de lignes (labels textuels)
  function hasRowTitleColumn(aoa) {
    if (!aoa || aoa.length < 2) return false;
    // Vérifie si la première colonne a des valeurs textuelles dans la plupart des lignes
    var textCount = 0, dataRows = 0;
    for (var ri = 1; ri < aoa.length; ri++) {
      var row = aoa[ri] || [];
      var val = row[0];
      if (val != null && String(val).trim() !== "") {
        dataRows++;
        if (typeof val === "string" || (typeof val === "number" && isNaN(val))) textCount++;
        else if (typeof val === "number") {
          // Les nombres dans la première colonne indiquent qu'il n'y a pas de titres de lignes
          return false;
        }
      }
    }
    // Si au moins 60% des lignes ont du texte en première colonne, c'est probablement des titres
    return dataRows > 0 && textCount / dataRows >= 0.6;
  }

  function isMonthHeaderRow(row) {
    if (!Array.isArray(row) || row.length < 2) return false;
    var first = String(row[0] || "").trim().toLowerCase();
    if (!/^(mois|month|periode|p[ée]riode)$/.test(first)) return false;
    return row.slice(1).some(function (v) { return !!normalizeMonthHeader(v); });
  }

  function fillSheetFromAoa(sheet, aoa, ws) {
    sheet.cells = {}; sheet.headers = []; sheet.rowHeaders = [];
    let maxR = 0, maxC = 0;

    var hasRowTitles = hasRowTitleColumn(aoa);
    var dataStartCol = hasRowTitles ? 1 : 0;

    // Ligne d'en-tête par défaut = première ligne. Mais si une ligne "Mois"
    // (cellule "Mois" + noms de mois) existe ailleurs, on la promeut comme
    // source des en-têtes de colonnes et on l'ignore des données.
    var headerRow = aoa[0] || [];
    var monthHeaderRowIndex = -1;
    for (var hri = 0; hri < aoa.length; hri++) {
      if (isMonthHeaderRow(aoa[hri])) { headerRow = aoa[hri]; monthHeaderRowIndex = hri; break; }
    }

    // Construit la map colonne source -> colonne mois cible (0-11)
    // Si l'en-tête est un mois reconnu (ex: "Août" -> 7, "Novembre" -> 10),
    // les données de cette colonne seront placées dans la colonne du mois correspondant.
    var monthMap = {};
    var MONTH_ORDER = {"Janvier":0,"Février":1,"Mars":2,"Avril":3,"Mai":4,"Juin":5,"Juillet":6,"Août":7,"Septembre":8,"Octobre":9,"Novembre":10,"Décembre":11};
    headerRow.forEach(function(val, ci) {
      if (ci < dataStartCol) return;
      var normalized = normalizeMonthHeader(val);
      if (normalized && MONTH_ORDER.hasOwnProperty(normalized)) {
        monthMap[ci] = MONTH_ORDER[normalized];
      }
    });
    var hasMonthMapping = Object.keys(monthMap).length > 0;

    // Construit les en-têtes de colonnes en normalisant les mois
    headerRow.forEach((val, ci) => {
      if (ci < dataStartCol) return; // Ignore la colonne des titres de lignes
      var normalized = normalizeMonthHeader(val);
      sheet.headers[ci - dataStartCol] = normalized || (val == null || val === "" ? colToLetter(ci - dataStartCol) : String(val));
      maxC = Math.max(maxC, ci - dataStartCol);
    });

    // Importe les titres de lignes et les données en sautant la ligne "Mois"
    // et en compactant l'index (les données remontent d'une case).
    var dataRowIndex = 0;
    for (let ri = 1; ri < aoa.length; ri++) {
      const row = aoa[ri];
      if (!row) continue;
      if (ri === monthHeaderRowIndex || isMonthHeaderRow(row)) continue;
      if (hasRowTitles) {
        var label = row[0];
        if (label != null && String(label).trim() !== "") {
          sheet.rowHeaders[dataRowIndex] = String(label).trim();
          maxR = Math.max(maxR, dataRowIndex);
        }
      }
      row.forEach((val, ci) => {
        if (ci < dataStartCol) return;
        if (val == null || val === "") return;
        // Si on a une map mois, placer la donnée dans la colonne du mois correspondant
        var targetC;
        if (hasMonthMapping && monthMap[ci] !== undefined) {
          targetC = monthMap[ci];
        } else {
          targetC = ci - dataStartCol;
        }
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci }); const cellObj = ws ? ws[addr] : null;
        let raw;
        if (cellObj && cellObj.f) raw = "=" + shiftFormulaRows(cellObj.f, -1);
        else if (typeof val === "number") raw = String(val);
        else raw = String(val);
        sheet.cells[cellKey(dataRowIndex, targetC)] = { raw };
        maxR = Math.max(maxR, dataRowIndex); maxC = Math.max(maxC, targetC);
      });
      dataRowIndex++;
    }
    sheet.cols = Math.max(DEFAULT_COLS, maxC + 1);
    // Un import ne doit pas créer quarante lignes vides : on garde seulement
    // une petite marge de saisie après la dernière ligne importée.
    sheet.rows = Math.max(8, maxR + 3);
    for (let c = 0; c < sheet.cols; c++) if (!sheet.headers[c]) sheet.headers[c] = colToLetter(c);
    enforceMonthHeaders(sheet);
  }
  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => { try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array" })); } catch (err) { reject(err); } };
      reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
      reader.readAsArrayBuffer(file);
    });
  }
  function importChoiceDialog(sheetCount) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div"); overlay.className = "sheet-modal-overlay";
      const modal = document.createElement("div"); modal.className = "sheet-modal sheet-modal-choice";
      modal.appendChild(document.createElement("h3")).textContent = "Importer " + sheetCount + " feuille" + (sheetCount > 1 ? "s" : "");
      const p = document.createElement("p"); p.textContent = "Comment importer ces feuilles ?";
      p.style.cssText = "margin:0 0 16px;line-height:1.5"; modal.appendChild(p);
      const actions = document.createElement("div"); actions.className = "sheet-modal-actions";
      const close = (v) => { overlay.remove(); resolve(v); };
      const rep = document.createElement("button"); rep.className = "button button-primary"; rep.textContent = "Remplacer tout";
      const add = document.createElement("button"); add.className = "button button-ghost"; add.textContent = "Ajouter à l'existant";
      const cancel = document.createElement("button"); cancel.className = "button button-ghost"; cancel.textContent = "Annuler";
      rep.addEventListener("click", () => close("replace"));
      add.addEventListener("click", () => close("add"));
      cancel.addEventListener("click", () => close(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
      actions.appendChild(rep); actions.appendChild(add); actions.appendChild(cancel);
      modal.appendChild(actions); overlay.appendChild(modal);
      document.body.appendChild(overlay); rep.focus();
    });
  }
  // Fusionne les lignes importées dans une feuille existante :
  // si une ligne avec le même label existe déjà, elle est remplacée.
  function mergeSheetData(targetSheet, importedSheet) {
    if (!targetSheet || !importedSheet) return;
    // Fusionne les en-têtes de colonnes (les mois sont forcés par enforceMonthHeaders)
    // Fusionne les titres de lignes : remplace ou ajoute
    var targetRowHeaders = targetSheet.rowHeaders || [];
    var importedRowHeaders = importedSheet.rowHeaders || [];
    var importedCells = importedSheet.cells || {};

    for (var ir = 0; ir < importedRowHeaders.length; ir++) {
      var label = importedRowHeaders[ir];
      if (!label) continue;
      // Cherche une ligne existante avec le même label
      var foundIdx = -1;
      for (var tr = 0; tr < targetRowHeaders.length; tr++) {
        if (targetRowHeaders[tr] && targetRowHeaders[tr].trim().toLowerCase() === label.trim().toLowerCase()) {
          foundIdx = tr;
          break;
        }
      }
      if (foundIdx >= 0) {
        // Remplace les cellules de cette ligne
        for (var c = 0; c < (importedSheet.cols || 0); c++) {
          var importKey = ir + "," + c;
          var targetKey = foundIdx + "," + c;
          if (importedCells[importKey]) {
            targetSheet.cells[targetKey] = { raw: importedCells[importKey].raw };
          } else {
            delete targetSheet.cells[targetKey];
          }
        }
      } else {
        // Ajoute une nouvelle ligne à la fin
        var newRowIdx = targetRowHeaders.length;
        targetRowHeaders[newRowIdx] = label;
        for (var c2 = 0; c2 < (importedSheet.cols || 0); c2++) {
          var importKey2 = ir + "," + c2;
          var targetKey2 = newRowIdx + "," + c2;
          if (importedCells[importKey2]) {
            targetSheet.cells[targetKey2] = { raw: importedCells[importKey2].raw };
          }
        }
        targetSheet.rows = Math.max(targetSheet.rows || 0, newRowIdx + 3);
      }
    }
  }

  async function importXlsx(file, options) {
    options = options || {};
    if (typeof XLSX === "undefined") { toast("Bibliothèque Excel non chargée."); return false; }
    let wb;
    try { wb = await readWorkbook(file); }
    catch (err) { toast("Import impossible : " + (err && err.message ? err.message : "erreur")); return false; }
    const sheetsData = (wb.SheetNames || []).map((name) => {
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      return { name, aoa, ws };
    }).filter((s) => s.aoa && s.aoa.length);
    if (!sheetsData.length) { toast("Aucune feuille exploitable dans ce fichier."); return false; }
    const mode = options.mode || await importChoiceDialog(sheetsData.length);
    if (!mode) return false;
    if (mode === "replace") {
      state.sheets = [];
      const created = sheetsData.map((s) => {
        const sheet = newSheet(s.name);
        fillSheetFromAoa(sheet, s.aoa, s.ws);
        return sheet;
      });
      if (created.length) state.activeSheetId = created[0].id;
    } else {
      // Mode "ajouter" : fusionne les feuilles importées avec les feuilles existantes
      const created = sheetsData.map((s) => {
        // Cherche une feuille existante avec un nom similaire
        var existing = state.sheets.find(function(sh) {
          return sh.name.trim().toLowerCase() === s.name.trim().toLowerCase();
        });
        if (existing) {
          // Fusionne les données dans la feuille existante
          var tempSheet = { cells: {}, headers: [], rowHeaders: [], rows: DEFAULT_ROWS, cols: DEFAULT_COLS };
          fillSheetFromAoa(tempSheet, s.aoa, s.ws);
          mergeSheetData(existing, tempSheet);
          return existing;
        } else {
          var sheet = newSheet(s.name);
          fillSheetFromAoa(sheet, s.aoa, s.ws);
          return sheet;
        }
      });
      if (created.length) state.activeSheetId = created[0].id;
    }
    buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
    if (typeof window.populateYearSelect === "function") { try { window.populateYearSelect(); } catch(e){} }
    if (!options.silent) toast(sheetsData.length + " feuille(s) importée(s).");
    return true;
  }
  function exportXlsx() {
    if (typeof XLSX === "undefined") { toast("Bibliothèque Excel non chargée."); return; }
    try {
      const wb = buildExportWorkbook();
      XLSX.writeFile(wb, "tableau-finances.xlsx");
      toast(state.sheets.length + " feuille(s) exportée(s).");
    } catch (err) { toast("Export impossible : " + (err && err.message ? err.message : "erreur")); }
  }
  // Workbook complet pour l'export : preserve toutes les colonnes (en-tetes personnalises
  // OU lettres par defaut), les libelles de lignes, et les formules.
  function buildExportWorkbook() {
    if (typeof XLSX === "undefined") return null;
    const wb = XLSX.utils.book_new();
    state.sheets.forEach((sheet, idx) => {
      const cache = recompute(sheet.cells);
      const hasRowLabels = sheet.rowHeaders && sheet.rowHeaders.some(h => h);
      const aoa = [];
      const headerRow = hasRowLabels ? [""] : [];
      for (let c = 0; c < sheet.cols; c++) headerRow[c + (hasRowLabels ? 1 : 0)] = sheet.headers[c] || colToLetter(c);
      aoa[0] = headerRow;
      for (let r = 0; r < sheet.rows; r++) {
        const row = hasRowLabels ? [sheet.rowHeaders[r] || String(r + 1)] : [];
        for (let c = 0; c < sheet.cols; c++) {
          const k = cellKey(r, c);
          const cell = sheet.cells[k] || { raw: "" };
          const res = cache[k];
          const ci = c + (hasRowLabels ? 1 : 0);
          if (cell.raw && cell.raw[0] === "=") {
            const o = { f: cell.raw.slice(1) };
            if (res && typeof res.value === "number" && Number.isFinite(res.value)) { o.v = res.value; o.t = "n"; }
            row[ci] = o;
          } else if (res && typeof res.value === "number" && Number.isFinite(res.value)) row[ci] = res.value;
          else row[ci] = cell.raw || "";
        }
        aoa[r + 1] = row;
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, idx, wb));
    });
    return wb;
  }
  // Construit un workbook XLSX (une feuille par tableur) réutilisable par le dashboard.
  function buildWorkbook() {
    if (typeof XLSX === "undefined") return null;
    const wb = XLSX.utils.book_new();
    state.sheets.forEach((sheet, idx) => {
      const cache = recompute(sheet.cells);
      const hasRowLabels = sheet.rowHeaders && sheet.rowHeaders.some(h => h);
      // Colonnes et lignes contenant reellement des donnees (ignore les en-tetes par defaut vides).
      const dataCols = new Set(); let maxR = -1;
      for (const k in sheet.cells) {
        const raw = sheet.cells[k].raw;
        if (raw === undefined || raw === null || raw === "") continue;
        const parts = k.split(","); const r = +parts[0], c = +parts[1];
        dataCols.add(c); if (r > maxR) maxR = r;
      }
      const cols = dataCols.size ? Math.max(...dataCols) + 1 : 0;
      const rows = maxR + 1;
      if (rows <= 0 || cols <= 0) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), sanitizeSheetName(sheet.name, idx, wb)); return; }
      const aoa = [];
      const headerRow = hasRowLabels ? [""] : [];
      for (let c = 0; c < cols; c++) headerRow[c + (hasRowLabels ? 1 : 0)] = sheet.headers[c] || (c < 12 ? MONTH_HEADERS[c] : colToLetter(c));
      aoa[0] = headerRow;
      for (let r = 0; r < rows; r++) {
        const row = hasRowLabels ? [sheet.rowHeaders[r] || String(r + 1)] : [];
        for (let c = 0; c < cols; c++) {
          const k = cellKey(r, c);
          const cell = sheet.cells[k] || { raw: "" };
          const res = cache[k];
          const ci = c + (hasRowLabels ? 1 : 0);
          if (cell.raw && cell.raw[0] === "=") {
            const o = { f: cell.raw.slice(1) };
            if (res && typeof res.value === "number" && Number.isFinite(res.value)) { o.v = res.value; o.t = "n"; }
            row[ci] = o;
          } else if (res && typeof res.value === "number" && Number.isFinite(res.value)) row[ci] = res.value;
          else row[ci] = cell.raw || "";
        }
        aoa[r + 1] = row;
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name, idx, wb));
    });
    return wb;
  }

  // ═════════════════════ Calculatrice modale ═════════════════════
  function openCalculator() {
    if (document.querySelector(".sheet-modal-overlay")) return;
    const overlay = document.createElement("div"); overlay.className = "sheet-modal-overlay";
    const modal = document.createElement("div"); modal.className = "sheet-modal";
    const display = document.createElement("div"); display.className = "sheet-calc-display"; display.textContent = "0";
    const grid = document.createElement("div"); grid.className = "sheet-calc-grid";
    const keys = [
      { l: "C", op: true, fn: "clear" }, { l: "⌫", op: true, fn: "back" }, { l: "(", op: true }, { l: ")", op: true },
      { l: "7" }, { l: "8" }, { l: "9" }, { l: "÷", op: true, v: "/" },
      { l: "4" }, { l: "5" }, { l: "6" }, { l: "×", op: true, v: "*" },
      { l: "1" }, { l: "2" }, { l: "3" }, { l: "−", op: true, v: "-" },
      { l: "0" }, { l: "." }, { l: "=", eq: true }, { l: "+", op: true },
    ];
    let expr = "";
    const update = () => { display.textContent = expr || "0"; };
    const calc = () => {
      if (!expr) return;
      try { const ast = parse(tokenize(expr)); const v = evalNode(ast, () => 0); expr = Number.isFinite(v) ? formatNumber(v) : "Erreur"; update(); }
      catch (e) { display.textContent = "Erreur"; expr = ""; }
    };
    keys.forEach((k) => {
      const btn = document.createElement("button"); btn.className = "sheet-calc-btn" + (k.op ? " op" : "") + (k.eq ? " eq" : "");
      btn.textContent = k.l;
      btn.addEventListener("click", () => {
        if (k.eq) { calc(); return; }
        if (k.fn === "clear") { expr = ""; update(); return; }
        if (k.fn === "back") { expr = expr.slice(0, -1); update(); return; }
        expr += k.v || k.l; update();
      });
      grid.appendChild(btn);
    });
    const actions = document.createElement("div"); actions.className = "sheet-calc-actions";
    const insertBtn = document.createElement("button"); insertBtn.className = "button button-ghost"; insertBtn.textContent = "Insérer dans la cellule";
    insertBtn.addEventListener("click", () => {
      const { r, c } = state.active; setRaw(r, c, expr); renderValues(); scheduleSave(); close();
      toast("Inséré en " + colToLetter(c) + (r + 1));
    });
    const closeBtn = document.createElement("button"); closeBtn.className = "button button-ghost"; closeBtn.textContent = "Fermer";
    closeBtn.addEventListener("click", close);
    actions.appendChild(insertBtn); actions.appendChild(closeBtn);
    modal.appendChild(document.createElement("h3")).textContent = "Calculatrice";
    modal.appendChild(display); modal.appendChild(grid); modal.appendChild(actions);
    overlay.appendChild(modal); overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    function close() { overlay.remove(); }
    document.body.appendChild(overlay);
  }

  // ═══════════════ Boîtes de dialogue (toast / confirm) ══════════
  function toast(msg) {
    const old = document.querySelector(".sheet-toast"); if (old) old.remove();
    const t = document.createElement("div"); t.className = "sheet-toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  function confirmDialog(msg) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div"); overlay.className = "sheet-modal-overlay";
      const modal = document.createElement("div"); modal.className = "sheet-modal";
      modal.appendChild(document.createElement("h3")).textContent = "Confirmation";
      const p = document.createElement("p"); p.textContent = msg; p.style.cssText = "margin:0 0 16px;line-height:1.5"; modal.appendChild(p);
      const actions = document.createElement("div"); actions.className = "sheet-modal-actions";
      const no = document.createElement("button"); no.className = "button button-ghost"; no.textContent = "Annuler";
      const yes = document.createElement("button"); yes.className = "button button-primary"; yes.textContent = "Confirmer";
      const close = (v) => { overlay.remove(); resolve(v); };
      no.addEventListener("click", () => close(false)); yes.addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      actions.appendChild(no); actions.appendChild(yes); modal.appendChild(actions); overlay.appendChild(modal);
      document.body.appendChild(overlay); yes.focus();
    });
  }

  // ═════════════════════════ Sauvegarde ═══════════════════════════
  let saveTimer = null;
  let undoHistory = [], redoHistory = [], restoringHistory = false;
  const HISTORY_LIMIT = 80;
  function historySnapshot() { return JSON.stringify({ sheets: serializeSheets(), activeSheetId: state.activeSheetId }); }
  function updateHistoryControls() {
    const undo = document.getElementById("btnSheetUndo"), redo = document.getElementById("btnSheetRedo");
    if (undo) undo.disabled = undoHistory.length < 2;
    if (redo) redo.disabled = redoHistory.length === 0;
  }
  function recordHistory() {
    if (restoringHistory) return;
    const snapshot = historySnapshot();
    if (undoHistory[undoHistory.length - 1] === snapshot) return;
    undoHistory.push(snapshot);
    if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
    redoHistory = [];
    updateHistoryControls();
  }
  function restoreHistory(snapshot) {
    try {
      const data = JSON.parse(snapshot);
      if (!data || !Array.isArray(data.sheets) || !data.sheets.length) return false;
      restoringHistory = true;
      state.sheets = data.sheets.map((s) => ({
        id: s.id || sheetId(), name: s.name || "Feuille", cells: s.cells || {}, headers: s.headers || [],
        rowHeaders: s.rowHeaders || [], rows: s.rows || DEFAULT_ROWS, cols: s.cols || DEFAULT_COLS,
      }));
      for (const sheet of state.sheets) enforceMonthHeaders(sheet);
      state.activeSheetId = data.activeSheetId || state.sheets[0].id;
      state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
      buildTable(); renderValues(); renderTabs();
      return true;
    } catch (e) { return false; }
    finally { restoringHistory = false; }
  }
  function undo() {
    if (undoHistory.length < 2) { toast("Aucune modification à annuler."); return; }
    const current = undoHistory.pop(); redoHistory.push(current);
    if (restoreHistory(undoHistory[undoHistory.length - 1])) { scheduleSave(); toast("Modification annulée."); }
    updateHistoryControls();
  }
  function redo() {
    if (!redoHistory.length) { toast("Aucune modification à rétablir."); return; }
    const next = redoHistory.pop(); undoHistory.push(next);
    if (restoreHistory(next)) { scheduleSave(); toast("Modification rétablie."); }
    updateHistoryControls();
  }
  function scheduleSave() { recordHistory(); state.dirty = true; updateStatus(); if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); notifyDashboard(); }
  function serializeSheets() {
    return state.sheets.map((s) => ({ id: s.id, name: s.name, cells: s.cells, headers: s.headers, rowHeaders: s.rowHeaders, rows: s.rows, cols: s.cols }));
  }
  function saveNow() {
    try {
      Store.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, sheets: serializeSheets(), activeSheetId: state.activeSheetId }));
      state.dirty = false; updateStatus();
    } catch (e) {}
    // Notifier le module de sync cloud (si chargé et si on n'est pas en train de pull)
    try { if (window.__gfSync && !window.__gfSuppressSync) window.__gfSync.markDirty(); } catch(e) {}
  }
  function load() {
    try {
      const raw = Store.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.sheets) && data.sheets.length) {
          state.sheets = data.sheets.map((s) => ({
            id: s.id || sheetId(), name: s.name || "Feuille",
            cells: s.cells || {}, headers: s.headers || [], rowHeaders: s.rowHeaders || [],
            rows: s.rows || DEFAULT_ROWS, cols: s.cols || DEFAULT_COLS,
          }));
          for (const s of state.sheets) enforceMonthHeaders(s);
          state.activeSheetId = data.activeSheetId || state.sheets[0].id;
          return true;
        }
      }
      // Migration depuis l'ancien format mono-feuille v2
      const legacy = Store.getItem(LEGACY_KEY);
      if (legacy) {
        const d = JSON.parse(legacy);
        const sheet = newSheet("Feuille 1");
        sheet.cells = d.cells || {}; sheet.headers = d.headers || []; sheet.rows = d.rows || DEFAULT_ROWS; sheet.cols = d.cols || DEFAULT_COLS;
        enforceMonthHeaders(sheet);
        state.sheets = [sheet]; state.activeSheetId = sheet.id;
        return true;
      }
      return false;
    } catch (e) { return false; }
  }
  function updateStatus() {
    const el = document.getElementById("sheetStatus"); if (!el) return;
    el.classList.remove("online", "offline", "dirty"); const txt = document.getElementById("sheetStatusText");
    if (!navigator.onLine) { el.classList.add("offline"); if (txt) txt.textContent = "Hors ligne — sauvegarde locale"; }
    else if (state.dirty) { el.classList.add("dirty"); if (txt) txt.textContent = "Sauvegarde locale…"; }
    else { el.classList.add("online"); if (txt) txt.textContent = "Sauvegardé localement"; }
  }

  // ═════════ Snapshot pour la synchronisation de compte ═══════════
  function getSnapshot() {
    return { v: VERSION, sheets: serializeSheets(), activeSheetId: state.activeSheetId };
  }
  function loadSnapshot(data) {
    if (!data || !Array.isArray(data.sheets) || !data.sheets.length) return false;
    state.sheets = data.sheets.map((s) => ({
      id: s.id || sheetId(), name: s.name || "Feuille",
      cells: s.cells || {}, headers: s.headers || [], rowHeaders: s.rowHeaders || [],
      rows: s.rows || DEFAULT_ROWS, cols: s.cols || DEFAULT_COLS,
    }));
    for (const s of state.sheets) enforceMonthHeaders(s);
    state.activeSheetId = data.activeSheetId || state.sheets[0].id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave();
    return true;
  }

  // ═══════════════════════════ Init ═══════════════════════════════
  function init() {
    container = document.getElementById("sheetApp"); if (!container) return;
    load();
    if (!state.sheets.length) { resetToDefaultSheets(); }
    // Migration : supprime les anciennes lignes de template si présentes
    migrateOldTemplate();
    const wrap = container.parentElement;
    if (wrap && !wrap.querySelector(".sheet-tabs")) {
      tabsEl = document.createElement("div"); tabsEl.className = "sheet-tabs";
      wrap.appendChild(tabsEl);
    } else { tabsEl = wrap && wrap.querySelector(".sheet-tabs"); }
    buildTable(); renderValues(); renderTabs(); recordHistory(); updateStatus();
    updateSheetBalanceCards();
    wireFormulaBar();
    window.addEventListener("online", updateStatus); window.addEventListener("offline", updateStatus);
    document.addEventListener("keydown", (e) => {
      if (document.body.getAttribute("data-page") !== "sheet") return;
      if (e.ctrlKey || e.metaKey) {
        if ((e.key === "z" || e.key === "Z") && !state.editing && !(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if ((e.key === "y" || e.key === "Y") && !state.editing && !(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) { e.preventDefault(); redo(); return; }
        if (e.key === "c" || e.key === "C") { e.preventDefault(); if (navigator.clipboard) navigator.clipboard.writeText(copySelection()); }
        else if (e.key === "v" || e.key === "V") { e.preventDefault(); if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(paste).catch(() => {}); }
        return;
      }
      onKeydown(e);
    });
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    bind("btnSheetExport", exportXlsx);
    bind("btnSheetImport", () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xls,.xlsm,.csv"; inp.addEventListener("change", () => { const f = inp.files[0]; if (!f) return; importXlsx(f); }); inp.click(); });
    bind("btnSheetClear", async () => { if (await confirmDialog("Vider la feuille active ?")) { const sheet = activeSheet(); sheet.cells = {}; sheet.rowHeaders = []; sheet.rows = DEFAULT_ROWS; enforceMonthHeaders(sheet); buildTable(); renderValues(); scheduleSave(); } });
    bind("btnSheetCalc", openCalculator);
    bind("btnSheetUndo", undo);
    bind("btnSheetRedo", redo);
    bind("sheetBackBtn", () => { const b = document.getElementById("backDashboardButton"); if (b) b.click(); });
    container.addEventListener("paste", (e) => { if (state.editing) return; const text = (e.clipboardData || window.clipboardData).getData("text"); if (text) { e.preventDefault(); paste(text); } });
    container.addEventListener("copy", (e) => { if (state.editing) return; e.clipboardData.setData("text/plain", copySelection()); e.preventDefault(); });
    notifyDashboard();
  }

  // === Charge des données démo sans persister (pour le tutoriel) ===
  function loadDemoData(demoData) {
    var sheet = activeSheet();
    if (!sheet) return;
    sheet.cells = {};
    sheet.headers = demoData.headers.slice();
    sheet.rowHeaders = demoData.rowHeaders.slice();
    sheet.rows = Math.max(sheet.rows || 30, demoData.rowHeaders.length + 2);
    sheet.cols = Math.max(sheet.cols || 8, demoData.headers.length + 1);
    for (var r = 0; r < demoData.values.length; r++) {
      for (var c = 0; c < demoData.values[r].length; c++) {
        var key = r + "," + c;
        sheet.cells[key] = { raw: String(demoData.values[r][c]) };
      }
    }
    buildTable();
    renderValues();
    renderTabs();
    // NE PAS appeler notifyDashboard — les données démo ne doivent pas entrer dans le dashboard
  }

  // === Crée les feuilles par défaut avec les années ===
  function getDefaultYearNames() {
    var currentYear = new Date().getFullYear();
    var prevYear = currentYear - 1;
    return [String(prevYear), String(currentYear)];
  }
  function resetToDefaultSheets() {
    state.sheets = [];
    var yearNames = getDefaultYearNames();
    yearNames.forEach(function(name) {
      var sheet = newSheet(name);
    });
    if (state.sheets.length) state.activeSheetId = state.sheets[0].id;
    state.active = { r: 0, c: 0 };
    state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
  }

  // Vide les données démo
  function clearDemoDataFS(opts) {
    opts = opts || {};
    var sheet = activeSheet();
    if (!sheet) return;
    sheet.cells = {};
    sheet.rowHeaders = [];
    sheet.rows = DEFAULT_ROWS;
    enforceMonthHeaders(sheet);
    buildTable();
    renderValues();
    renderTabs();
    if (opts.notify !== false) notifyDashboard();
  }

  // === Met à jour les cartes de solde au-dessus du tableur ===
  function updateSheetBalanceCards() {
    var balStart = document.getElementById("balStart");
    var balRemaining = document.getElementById("balRemaining");
    if (!balStart) return; // les cartes n'existent pas encore

    // Le solde est un calcul de flux : les soldes des comptes (Livret, PEA,
    // Revolut...) ne sont jamais assimilés à des revenus.
    var startingCash = 0;
    var refDate = null;
    var hasStartingCash = false;
    try {
      var profile = JSON.parse(safeStore.getItem("personalFinanceDashboard.setupProfile") || "null");
      if (profile && profile.startingCash !== "" && profile.startingCash !== null && profile.startingCash !== undefined) {
        startingCash = parseFloat(profile.startingCash) || 0;
        hasStartingCash = true;
      }
      if (profile && profile.currentCashDate) {
        var parsed = new Date(profile.currentCashDate + "T00:00:00");
        if (!isNaN(parsed.getTime())) refDate = parsed;
      }
      if (!refDate && profile && /^\d{4}-\d{2}$/.test(String(profile.startingMonth || ""))) {
        refDate = new Date(profile.startingMonth + "-01T00:00:00");
      }
    } catch(e) {}

    function rowKind(label) {
      var key = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (/solde|depart|restant|reste|disponible|compte|livret|epargne|pea|bourse|placement|wallet|revolut|boursobank|bourso|banque/.test(key)) return "ignore";
      if (/salaire|revenu|prime|allocation|apl|caf|rsa|remuneration|paie|paye|indemnite|remboursement/.test(key)) return "income";
      if (/depense|loyer|charge|carte|facture|abonnement|frais|impot|taxe|assurance|transport|course|restaurant|achat|credit/.test(key)) return "expense";
      return "ignore";
    }

    // Parcourt toutes les feuilles, en ne retenant que les lignes classées
    // comme revenus ou dépenses. Sans montant de départ, tous les mois importés
    // sont pris en compte ; sinon, seulement ceux postérieurs au mois choisi.
    var totalIncome = 0, totalExpense = 0;
    var refMonthStart = refDate ? new Date(refDate.getFullYear(), refDate.getMonth(), 1) : null;
    (state.sheets || []).forEach(function(sheet) {
      if (!sheet || !sheet.cells) return;
      // Année de la feuille (le nom de feuille est généralement l'année)
      var yearMatch = String(sheet.name || "").match(/^(19|20|21)\d{2}$/);
      var sheetYear = yearMatch ? parseInt(yearMatch[0], 10) : null;
      var computed = recompute(sheet.cells);
      for (var r = 0; r < (sheet.rowHeaders || []).length; r++) {
        var rowLabel = (sheet.rowHeaders[r] || "").trim();
        var kind = rowKind(rowLabel);
        if (kind === "ignore") continue;
        for (var c = 0; c < (sheet.headers || []).length; c++) {
          // Ignore les mois antérieurs à la date de référence si un montant de
          // départ a été saisi. On n'utilise jamais la date système par défaut.
          if (hasStartingCash && refMonthStart && sheetYear !== null && new Date(sheetYear, c, 1) < refMonthStart) continue;
          var key = r + "," + c;
          var res = computed[key];
          if (!res || res.error) continue;
          var v = res.value;
          if (typeof v !== "number" || !Number.isFinite(v)) continue;
          if (kind === "income") totalIncome += v;
          else if (kind === "expense") totalExpense += Math.abs(v);
        }
      }
    });

    var remaining = startingCash + totalIncome - totalExpense;

    function fmt(v) {
      if (typeof v !== "number" || !Number.isFinite(v)) return "—";
      return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " \u20ac";
    }

    balStart.textContent = fmt(startingCash);
    if (balRemaining) balRemaining.textContent = fmt(remaining);
  }

  // === Migration : supprime les anciennes lignes de template (Solde départ, etc.) ===
  function migrateOldTemplate() {
    var sheet = activeSheet();
    if (!sheet || !sheet.rowHeaders) return;
    var templateLabels = ["Solde départ", "Revenus", "Dépenses", "Épargne", "Solde restant"];
    if (sheet.rowHeaders.length >= 5 &&
        sheet.rowHeaders[0] === templateLabels[0] &&
        sheet.rowHeaders[1] === templateLabels[1] &&
        sheet.rowHeaders[2] === templateLabels[2] &&
        sheet.rowHeaders[3] === templateLabels[3] &&
        sheet.rowHeaders[4] === templateLabels[4]) {
      // Vérifie qu'il n'y a que les cellules auto-générées
      var cellCount = sheet.cells ? Object.keys(sheet.cells).length : 0;
      if (cellCount <= 13) { // 1 solde + 12 formules = 13 cellules max
        sheet.cells = {};
        sheet.rowHeaders = [];
        enforceMonthHeaders(sheet);
        buildTable();
        renderValues();
        renderTabs();
        scheduleSave();
      }
    }
  }

  window.FinanceSheet = { init, recompute, saveNow, openCalculator, getSnapshot, loadSnapshot, buildWorkbook, importXlsx, exportXlsx, loadDemoData, clearDemoDataFS, updateSheetBalanceCards, migrateOldTemplate, resetToDefaultSheets, VERSION };
  // Hook appelé après import / édition / création de feuille pour rafraîchir le dashboard.
  let dashTimer = null;
  function notifyDashboard() {
    if (dashTimer) clearTimeout(dashTimer);
    dashTimer = setTimeout(() => { try { if (typeof window.syncDashboardFromFinanceSheet === "function") window.syncDashboardFromFinanceSheet({silent:true}); } catch (e) {} }, 350);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

