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

  // Une feuille réellement vide garde neuf lignes pour remplir la
  // grille sur ordinateur sans la surcharger. Dès qu'elle contient des
  // données (saisie ou import), sa hauteur suit exactement ses lignes utiles.
  const DEFAULT_ROWS = 9;
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
  let modalScrollY = 0;
  let modalLockStyles = null;

  // iOS peut continuer à faire défiler la page sous une fenêtre créée en JS.
  // Ce verrou conserve exactement la position de lecture puis la restaure à la fermeture.
  function lockModalBackground() {
    if (document.documentElement.dataset.sheetModalOpen === "true") return;
    modalScrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body, root = document.documentElement;
    modalLockStyles = {
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      height: body.style.height,
      overflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
      touchAction: body.style.touchAction,
      scrollOffset: body.style.getPropertyValue("--sheet-modal-scroll-y")
    };
    root.dataset.sheetModalOpen = "true";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    document.body.style.setProperty("--sheet-modal-scroll-y", "-" + modalScrollY + "px");
    document.body.classList.add("sheet-modal-open");
    body.style.position = "fixed";
    body.style.top = "-" + modalScrollY + "px";
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";
  }
  function unlockModalBackground() {
    if (document.querySelector(".sheet-modal-overlay")) return;
    if (document.documentElement.dataset.sheetModalOpen !== "true") return;
    const body = document.body, root = document.documentElement, styles = modalLockStyles || {};
    delete root.dataset.sheetModalOpen;
    root.style.overflow = styles.rootOverflow || "";
    root.style.overscrollBehavior = styles.rootOverscroll || "";
    body.classList.remove("sheet-modal-open");
    body.style.position = styles.position || "";
    body.style.top = styles.top || "";
    body.style.left = styles.left || "";
    body.style.right = styles.right || "";
    body.style.width = styles.width || "";
    body.style.height = styles.height || "";
    body.style.overflow = styles.overflow || "";
    body.style.overscrollBehavior = styles.overscroll || "";
    body.style.touchAction = styles.touchAction || "";
    if (styles.scrollOffset) body.style.setProperty("--sheet-modal-scroll-y", styles.scrollOffset);
    else body.style.removeProperty("--sheet-modal-scroll-y");
    modalLockStyles = null;
    requestAnimationFrame(() => window.scrollTo(0, modalScrollY));
  }

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
  function contentRowCount(sheet) {
    let last = -1;
    (sheet.rowHeaders || []).forEach((label, index) => { if (String(label || "").trim()) last = Math.max(last, index); });
    Object.keys(sheet.cells || {}).forEach((key) => {
      const row = Number(key.split(",")[0]);
      const cell = sheet.cells[key];
      if (Number.isInteger(row) && cell && String(cell.raw || "").trim() !== "") last = Math.max(last, row);
    });
    return last + 1;
  }
  function compactRows(sheet) {
    if (!sheet) return;
    const usefulRows = contentRowCount(sheet);
    sheet.rows = usefulRows > 0 ? usefulRows : DEFAULT_ROWS;
  }
  function shiftFormulaAfterRowDelete(raw, deletedRow) {
    if (typeof raw !== "string" || raw.charAt(0) !== "=") return raw;
    return raw.replace(/\b([A-Z]+)(\d+)\b/gi, function(match, column, rowText) {
      const row = Number(rowText) - 1;
      return row > deletedRow ? String(column).toUpperCase() + row : match;
    });
  }
  async function deleteSelectedRow() {
    const row = Math.max(0, Math.min(state.active.r, state.rows - 1));
    if (!(await confirmDialog("Supprimer la ligne " + (row + 1) + " ?"))) return;
    const sheet = activeSheet(), nextCells = {};
    Object.entries(sheet.cells || {}).forEach(function(entry) {
      const parts = entry[0].split(","), currentRow = Number(parts[0]), column = Number(parts[1]);
      if (currentRow === row) return;
      const targetRow = currentRow > row ? currentRow - 1 : currentRow;
      nextCells[cellKey(targetRow, column)] = { raw: shiftFormulaAfterRowDelete(entry[1]?.raw || "", row) };
    });
    sheet.cells = nextCells;
    sheet.rowHeaders = (sheet.rowHeaders || []).filter(function(_, index) { return index !== row; });
    sheet.rows = Math.max(1, sheet.rows - 1);
    state.active = { r: Math.min(row, sheet.rows - 1), c: state.active.c };
    state.range = { r0: state.active.r, c0: state.active.c, r1: state.active.r, c1: state.active.c };
    buildTable(); renderValues(); scheduleSave();
    toast(tr("Ligne supprimée.", "Row deleted."), 7000, { label: tr("Annuler", "Undo"), run: undo });
  }
  function rowHeaderWidth(sheet) {
    const longest = Math.max(0, ...(sheet.rowHeaders || []).map((label) => String(label || "").trim().length));
    return Math.max(188, Math.min(348, 86 + longest * 8.1));
  }

  // ═══════════════════════ Moteur de formules ═════════════════════
  // Erreur de syntaxe : un seul message, clair, au lieu de détails techniques (jeton, parenthèse…).
  const ERR_SYNTAX = "Formule incomplète ou incorrecte";
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
      throw new Error(ERR_SYNTAX);
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
      const tok = peek(); if (!tok) throw new Error(ERR_SYNTAX);
      if (tok.t === "op" && tok.v === "-") { next(); return { type: "unary", op: "-", expr: parseFactor() }; }
      if (tok.t === "op" && tok.v === "+") { next(); return parseFactor(); }
      if (tok.t === "op" && tok.v === "(") { next(); const e = parseExpr(); if (!peek() || peek().v !== ")") throw new Error(ERR_SYNTAX); next(); return e; }
      if (tok.t === "num") { next(); return { type: "num", v: tok.v }; }
      if (tok.t === "bool") { next(); return { type: "num", v: tok.v ? 1 : 0 }; }
      if (tok.t === "ref") {
        next();
        if (peek() && peek().t === "op" && peek().v === ":") {
          next(); const end = next(); if (!end || end.t !== "ref") throw new Error(ERR_SYNTAX);
          return { type: "range", start: tok.v, end: end.v };
        }
        return { type: "ref", v: tok.v };
      }
      if (tok.t === "func") {
        next();
        if (!peek() || peek().v !== "(") throw new Error(ERR_SYNTAX);
        next(); const args = [];
        if (!(peek() && peek().v === ")")) { args.push(parseExpr()); while (peek() && peek().v === ",") { next(); args.push(parseExpr()); } }
        if (!peek() || peek().v !== ")") throw new Error(ERR_SYNTAX); next();
        return { type: "func", name: tok.v, args };
      }
      throw new Error(ERR_SYNTAX);
    }
    const ast = parseExpr(); if (pos < tokens.length) throw new Error(ERR_SYNTAX);
    return ast;
  }
  function evalNode(node, getCellValue) {
    switch (node.type) {
      case "num": return node.v;
      case "ref": { const rc = refToRC(node.v); if (!rc) throw new Error("Cellule introuvable"); return getCellValue(rc.r, rc.c); }
      case "range": throw new Error(ERR_SYNTAX);
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
    const a = refToRC(start), b = refToRC(end); if (!a || !b) throw new Error(ERR_SYNTAX);
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
      default: throw new Error("Fonction inconnue : " + node.name);
    }
  }
  // Montant tapé → nombre, NaN si ce n'est pas un nombre. « 1 234,56 », « 1.234,56 » et « 1,234.56 »
  // donnent 1234.56 ; un séparateur seul est la virgule décimale (« 12,5 ») ou le point décimal des
  // valeurs écrites par le code (« 12.345 » = String(12.345)). « 12 % » vaut 0,12 comme dans un tableur.
  function parseAmount(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    let s = String(v == null ? "" : v).replace(/[\s  ']/g, "").replace(/[−–—]/g, "-");
    let neg = false, pct = false;
    const paren = s.match(/^\((.*)\)$/); if (paren) { neg = true; s = paren[1]; }
    if (s.endsWith("%")) { pct = true; s = s.slice(0, -1); }
    s = s.replace(/^([+-]?)€/, "$1").replace(/€$/, "");
    const m = s.match(/^([+-]?)([0-9.,]*[0-9][0-9.,]*)$/);
    if (!m) return NaN;
    if (m[1] === "-") neg = !neg;
    let body = m[2];
    const dot = body.lastIndexOf("."), comma = body.lastIndexOf(",");
    const groups = (txt, sep) => txt.split(sep).every((g, i) => i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g));
    if (dot >= 0 && comma >= 0) {
      const dec = dot > comma ? "." : ",", th = dec === "." ? "," : ".";
      const at = body.lastIndexOf(dec), int = body.slice(0, at), frac = body.slice(at + 1);
      if (int.indexOf(dec) >= 0 || frac.indexOf(th) >= 0 || !groups(int, th)) return NaN;
      body = int.split(th).join("") + "." + frac;
    } else {
      const sep = dot >= 0 ? "." : comma >= 0 ? "," : "";
      const count = sep ? body.split(sep).length - 1 : 0;
      if (count > 1) { if (!groups(body, sep)) return NaN; body = body.split(sep).join(""); }
      else if (count === 1) body = body.replace(",", ".");
    }
    const n = Number(body);
    if (!Number.isFinite(n)) return NaN;
    const out = (neg ? -n : n) / (pct ? 100 : 1);
    return out === 0 ? 0 : out;
  }
  function toNum(v) { return parseAmount(v); }
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
        const num = parseAmount(raw);
        if (!isNaN(num)) cache[k] = { value: num };
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
  let tbody, thead, container, tabsEl, sheetScroll, fillHandle, mobileMonthLabel;
  let mobileMonth = Math.max(0, Math.min(11, new Date().getMonth()));
  let lastComputed = {};
  const cellMap = new Map();
  let rowHeadEls = [];
  let colHeadEls = [];

  // Le numéro de ligne est une référence visuelle, jamais le titre éditable.
  // Construire les trois éléments ensemble évite que l'alignement change après
  // un renommage et garde le crayon hors du texte long.
  function buildRowHeaderContents(th, r) {
    th.replaceChildren();
    const content = document.createElement("div"); content.className = "row-head-content";
    const number = document.createElement("span"); number.className = "rh-number"; number.textContent = String(r + 1); number.title = "Ligne " + (r + 1);
    const label = document.createElement("span"); label.className = "rh-label"; label.textContent = state.rowHeaders[r] || ""; label.title = state.rowHeaders[r] || "Intitulé de la ligne";
    label.addEventListener("dblclick", function(e) { e.stopPropagation(); editRowHeader(r); });
    const edit = document.createElement("button"); edit.className = "rh-edit-btn"; edit.type = "button"; edit.textContent = "✎"; edit.title = "Renommer l’intitulé"; edit.setAttribute("aria-label", "Renommer l’intitulé de la ligne " + (r + 1));
    edit.addEventListener("click", function(e) { e.stopPropagation(); editRowHeader(r); });
    content.append(number, label, edit); th.appendChild(content);
  }

  function buildTable() {
    container.innerHTML = "";
    // Les éléments DOM viennent d'être recréés : l'état de peinture précédent
    // ne doit jamais empêcher la sélection de se redessiner sur la nouvelle grille.
    cellMap.clear(); rowHeadEls = []; colHeadEls = [];
    prevInRange = new Set(); prevActiveKey = null;
    const monthNav = document.createElement("div"); monthNav.className = "sheet-mobile-month"; monthNav.setAttribute("aria-label", tr("Mois affiché", "Month shown"));
    const previousMonth = document.createElement("button"); previousMonth.type = "button"; previousMonth.className = "sheet-mobile-month-button"; previousMonth.textContent = "‹"; previousMonth.setAttribute("aria-label", tr("Mois précédent", "Previous month"));
    mobileMonthLabel = document.createElement("strong"); mobileMonthLabel.className = "sheet-mobile-month-label";
    const nextMonth = document.createElement("button"); nextMonth.type = "button"; nextMonth.className = "sheet-mobile-month-button"; nextMonth.textContent = "›"; nextMonth.setAttribute("aria-label", "Mois suivant");
    previousMonth.addEventListener("click", () => setMobileMonth(mobileMonth - 1));
    nextMonth.addEventListener("click", () => setMobileMonth(mobileMonth + 1));
    monthNav.append(previousMonth, mobileMonthLabel, nextMonth);
    const scroll = document.createElement("div"); scroll.className = "sheet-scroll"; sheetScroll = scroll;
    const table = document.createElement("table"); table.className = "sheet-table";
    table.style.setProperty("--sheet-row-header-width", Math.round(rowHeaderWidth(activeSheet())) + "px");
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
      buildRowHeaderContents(rh, r);
      rh.addEventListener("click", () => selectRow(r));
      tr.appendChild(rh); rowHeadEls.push(rh);
      for (let c = 0; c < state.cols; c++) {
        const td = document.createElement("td"); td.className = "cell"; td.dataset.r = r; td.dataset.c = c;
        const cv = document.createElement("span"); cv.className = "cv"; td.appendChild(cv);
        td.addEventListener("pointerdown", onCellPointerDown);
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
    container.appendChild(monthNav); container.appendChild(scroll); container.appendChild(addBar);
    applyMobileMonth();
    applySelectionStyle();
  }

  function setMobileMonth(index) {
    mobileMonth = (index + 12) % 12;
    state.active = { r: Math.max(0, Math.min(state.active.r, state.rows - 1)), c: mobileMonth };
    setRange(state.active.r, mobileMonth, state.active.r, mobileMonth);
    applyMobileMonth();
    syncFormulaBar();
  }
  function applyMobileMonth() {
    if (mobileMonthLabel) mobileMonthLabel.textContent = headerLabel(mobileMonth);
    if (!container) return;
    container.querySelectorAll("[data-c]").forEach((element) => {
      element.classList.toggle("mobile-month-active", Number(element.dataset.c) === mobileMonth);
    });
  }

  function renderValues() {
    lastComputed = recompute();
    cellMap.forEach((entry, k) => {
      const res = lastComputed[k];
      const td = entry.td, cv = entry.cv;
      td.classList.remove("num", "error");
      if (!res) { cv.textContent = ""; return; }
      if (res.error) { cv.textContent = window.GFI18n?window.GFI18n.t(res.error):res.error; td.classList.add("error"); return; }
      const v = res.value;
      if (typeof v === "number" && Number.isFinite(v)) { cv.textContent = formatMoney(v); td.classList.add("num"); }
      else if (typeof v === "number") { cv.textContent = "#ERR!"; td.classList.add("error"); }
      else cv.textContent = String(v);
    });
    syncFormulaBar();
    applySelectionStyle();
    updateSheetBalanceCards();
  }
  // L'espace fine des milliers (U+202F) est invisible avec certaines polices : on prend l'espace insécable classique.
  function formatNumber(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "#ERR!";
    const out = Number.isInteger(v) ? v.toLocaleString("fr-FR") : (Math.round(v * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return out.replace(/\u202f/g, "\u00a0");
  }
  // Cellules du tableur : présentées comme des montants (« −1 450 € », « 2 102,50 € »).
  function formatMoney(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "#ERR!";
    const abs = Math.abs(v), whole = Math.abs(Math.round(abs * 100) - Math.round(abs) * 100) < 0.5;
    const txt = abs.toLocaleString("fr-FR", whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f/g, "\u00a0");
    return (v < 0 && abs >= 0.005 ? "\u2212" : "") + txt + "\u00a0\u20ac";
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
    if (res && res.error) fxPreview.textContent = window.GFI18n?window.GFI18n.t(res.error):res.error;
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
  const ptr = { active: false, pointerId: null, startX: 0, startY: 0, moved: false, touchSelecting: false, r0: 0, c0: 0, startCell: { r: 0, c: 0 } };
  let lastTapKey = null;
  let rafSelection = null; let pendingRange = null;
  let prevInRange = new Set(); let prevActiveKey = null;

  function onCellPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const td = e.currentTarget; const r = +td.dataset.r, c = +td.dataset.c;
    if (state.editing && (state.active.r !== r || state.active.c !== c)) { commitActiveEdit(); }
    if (e.shiftKey) { setRange(state.range.r0, state.range.c0, r, c); syncFormulaBar(); return; }
    ptr.active = true; ptr.moved = false;
    // Un seul geste suffit, y compris au doigt : le premier glissement étend
    // immédiatement la sélection au lieu d'exiger un second passage.
    ptr.touchSelecting = true;
    ptr.pointerId = e.pointerId;
    ptr.startX = e.clientX; ptr.startY = e.clientY;
    ptr.r0 = r; ptr.c0 = c; ptr.startCell = { r, c };
    ptr.willEdit = !state.editing && (lastTapKey === cellKey(r, c));
    // Les écouteurs documentaires conservent le glissé même quand le pointeur
    // passe rapidement d'une cellule à l'autre ou sort brièvement du tableau.
    document.addEventListener("pointermove", onCellPointerMove, true);
    document.addEventListener("pointerup", onCellPointerUp, true);
    document.addEventListener("pointercancel", onCellPointerUp, true);
    setActive(r, c);
  }
  function onCellPointerMove(e) {
    if (!ptr.active || e.pointerId !== ptr.pointerId) return;
    if (!ptr.moved) {
      const dx = e.clientX - ptr.startX, dy = e.clientY - ptr.startY;
      if (dx * dx + dy * dy < 36) return;
      ptr.moved = true;
    }
    e.preventDefault();
    if (e.pointerType === "touch" && sheetScroll) {
      const rect = sheetScroll.getBoundingClientRect(), edge = 36, step = 14;
      if (e.clientX > rect.right - edge) sheetScroll.scrollLeft += step;
      else if (e.clientX < rect.left + edge) sheetScroll.scrollLeft -= step;
      if (e.clientY > rect.bottom - edge) sheetScroll.scrollTop += step;
      else if (e.clientY < rect.top + edge) sheetScroll.scrollTop -= step;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const td2 = el && el.closest ? el.closest("td.cell") : null;
    if (td2) { const rr = +td2.dataset.r, cc = +td2.dataset.c; scheduleRange(ptr.r0, ptr.c0, rr, cc); }
  }
  function onCellPointerUp(e) {
    if (!ptr.active || e.pointerId !== ptr.pointerId) return;
    document.removeEventListener("pointermove", onCellPointerMove, true);
    document.removeEventListener("pointerup", onCellPointerUp, true);
    document.removeEventListener("pointercancel", onCellPointerUp, true);
    ptr.active = false;
    ptr.pointerId = null;
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
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches && c !== mobileMonth) {
      mobileMonth = c;
      applyMobileMonth();
    }
    setRange(r, c, r, c);
    syncFormulaBar();
  }
  let selectionKind = "cell";
  function setRange(r0, c0, r1, c1, kind = "cell") {
    selectionKind = kind;
    state.range = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
    applySelectionStyle();
  }
  function selectRow(r) { state.active = { r, c: 0 }; setRange(r, 0, r, state.cols - 1, "row"); syncFormulaBar(); }
  function selectCol(c) { state.active = { r: 0, c }; setRange(0, c, state.rows - 1, c, "col"); syncFormulaBar(); }

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
    rowHeadEls.forEach((th) => { const r = +th.dataset.r; th.classList.toggle("row-sel", selectionKind === "row" && r >= r0 && r <= r1); });
    if (colHeadEls.length) colHeadEls.forEach((th) => { const c = +th.dataset.c; th.classList.toggle("col-sel", selectionKind === "col" && c >= c0 && c <= c1); });

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
  function rebuildRowHeader(th, r) {
    buildRowHeaderContents(th, r);
  }
  function editRowHeader(r) {
    const th = rowHeadEls[r]; if (!th) return;
    const input = document.createElement("input"); input.className = "h-edit"; input.value = String(state.rowHeaders[r] || ""); input.placeholder = "Intitulé de la ligne"; input.setAttribute("aria-label", "Intitulé de la ligne " + (r + 1));
    th.replaceChildren(input); input.focus(); input.select();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const v = input.value.trim(), before = String(state.rowHeaders[r] || ""); state.rowHeaders[r] = v;
      // Les opérations importées d'un relevé suivent la ligne renommée.
      if (before && v && before !== v) { try { window.GFBankImport && window.GFBankImport.renameRow && window.GFBankImport.renameRow(before, v, activeSheet() && activeSheet().name); } catch (e) {} }
      rebuildRowHeader(th, r);
      const table = th.closest(".sheet-table");
      if (table) table.style.setProperty("--sheet-row-header-width", Math.round(rowHeaderWidth(activeSheet())) + "px");
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
  // Feuilles = années : une feuille par année, rangées dans l'ordre, ajout de l'année précédente ou suivante.
  function sheetYear(sheet) { const m = String(sheet && sheet.name || "").trim().match(/^(19|20|21)\d{2}$/); return m ? Number(m[0]) : null; }
  function sortSheetsByYear() {
    state.sheets.sort(function (a, b) { const ya = sheetYear(a), yb = sheetYear(b); if (ya === null && yb === null) return 0; if (ya === null) return 1; if (yb === null) return -1; return ya - yb; });
  }
  function addYearSheet(year) {
    const existing = state.sheets.find(function (s) { return sheetYear(s) === year; });
    const s = existing || newSheet(String(year));
    sortSheetsByYear();
    state.activeSheetId = s.id; state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
  }
  function renderTabs() {
    if (!tabsEl) return;
    sortSheetsByYear();
    tabsEl.innerHTML = "";
    tabsEl.setAttribute("role", "tablist"); tabsEl.setAttribute("aria-label", tr("Années du tableur", "Spreadsheet years"));
    const years = state.sheets.map(sheetYear).filter(function (y) { return y !== null; });
    const first = years.length ? Math.min.apply(null, years) : new Date().getFullYear();
    const last = years.length ? Math.max.apply(null, years) : new Date().getFullYear();
    const lbl = document.createElement("span"); lbl.className = "sheet-years-label"; lbl.textContent = "Année";
    tabsEl.appendChild(lbl);
    const before = document.createElement("button"); before.type = "button"; before.className = "sheet-year-add";
    before.textContent = "+ " + (first - 1); before.title = tr("Ajouter l’année ", "Add year ") + (first - 1);
    before.addEventListener("click", function () { addYearSheet(first - 1); });
    tabsEl.appendChild(before);
    state.sheets.forEach(function (sheet) {
      const active = sheet.id === state.activeSheetId;
      const tab = document.createElement("div"); tab.className = "sheet-tab sheet-year" + (active ? " active" : ""); tab.dataset.sheetId = sheet.id;
      const label = document.createElement("button"); label.type = "button"; label.className = "sheet-tab-name";
      label.setAttribute("role", "tab"); label.setAttribute("aria-selected", String(active));
      label.textContent = sheet.name; label.title = sheetYear(sheet) === null ? tr("Double-clic pour donner une année à cette feuille", "Double-click to give this sheet a year") : tr("Afficher ", "Show ") + sheet.name;
      label.addEventListener("click", function () { switchSheet(sheet.id); });
      label.addEventListener("dblclick", function () { renameSheet(sheet.id); });
      tab.appendChild(label);
      if (active && state.sheets.length > 1) {
        const x = document.createElement("button"); x.type = "button"; x.className = "sheet-tab-x"; x.textContent = "×";
        x.title = tr("Supprimer l’année ", "Delete year ") + sheet.name; x.setAttribute("aria-label", tr("Supprimer l’année ", "Delete year ") + sheet.name);
        x.addEventListener("click", function (e) { e.stopPropagation(); deleteSheet(sheet.id); });
        tab.appendChild(x);
      }
      tabsEl.appendChild(tab);
    });
    const after = document.createElement("button"); after.type = "button"; after.className = "sheet-year-add";
    after.textContent = "+ " + (last + 1); after.title = tr("Ajouter l’année ", "Add year ") + (last + 1);
    after.addEventListener("click", function () { addYearSheet(last + 1); });
    tabsEl.appendChild(after);
  }
  // À la première ouverture du tableur dans la session, on se place sur l'année en cours
  // (et non sur la dernière feuille consultée, qui peut être une ancienne année).
  let currentYearShown = false;
  function showCurrentYearOnce() {
    if (currentYearShown || document.body.dataset.page !== "sheet" || !state.sheets.length) return;
    currentYearShown = true;
    const year = String(new Date().getFullYear());
    const sheet = state.sheets.find((x) => String(x.name).trim() === year);
    if (sheet && sheet.id !== state.activeSheetId) switchSheet(sheet.id);
  }
  if (window.MutationObserver) new MutationObserver(showCurrentYearOnce).observe(document.body, { attributes: true, attributeFilter: ["data-page"] });

  function switchSheet(id) {
    if (state.editing) commitActiveEdit();
    if (id === state.activeSheetId) return;
    state.activeSheetId = id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    lastTapKey = null;
    buildTable(); renderValues();
    tabsEl.querySelectorAll(".sheet-tab").forEach((t) => { const on = t.dataset.sheetId === id; t.classList.toggle("active", on); const n = t.querySelector(".sheet-tab-name"); if (n) n.setAttribute("aria-selected", String(on)); });
    renderTabs(); notifyDashboard();
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
      const v = input.value.trim();
      if (!/^(19|20|21)\d{2}$/.test(v)) { toast(tr("Une feuille correspond à une année : écris par exemple ", "A sheet matches a year: type for example ") + new Date().getFullYear() + ".");  renderTabs(); return; }
      if (state.sheets.some(function (o) { return o !== sheet && String(o.name).trim() === v; })) { toast(tr("L’année " + v + " existe déjà.", "Year " + v + " already exists.")); renderTabs(); return; }
      sheet.name = v;
      renderTabs(); scheduleSave(); notifyDashboard();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); finish(); } else if (e.key === "Escape") { e.preventDefault(); done = true; renderTabs(); } });
    input.addEventListener("blur", finish);
  }
  async function deleteSheet(id) {
    if (state.sheets.length <= 1) { toast(tr("Impossible de supprimer la dernière feuille.", "The last sheet can’t be deleted.")); return; }
    const yearName = ((state.sheets.find(function (o) { return o.id === id; }) || {}).name || "");
    if (!await confirmDialog(tr("Supprimer l’année " + yearName + " et tout son contenu ?", "Delete year " + yearName + " and everything in it?"))) return;
    const idx = state.sheets.findIndex((s) => s.id === id); if (idx < 0) return;
    state.sheets.splice(idx, 1);
    if (state.activeSheetId === id) state.activeSheetId = state.sheets[0].id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
    toast(tr("Année " + yearName + " supprimée.", "Year " + yearName + " deleted."), 7000, { label: tr("Annuler", "Undo"), run: undo });
  }

  // ═════════════════════ Import / Export .xlsx (multi-feuilles) ════
  // Textes de l’import et de l’export : français, anglais si l’interface l’est.
  function tr(fr, en) {
    try { return window.GFI18n && typeof window.GFI18n.getLanguage === "function" && window.GFI18n.getLanguage() === "en" ? en : fr; } catch (e) { return fr; }
  }
  // Le modèle tient en 12 mois et quelques colonnes : un fichier creux (une cellule
  // perdue en XFD5000) ou énorme gèlerait l’onglet sans rien apporter.
  const IMPORT_MAX_BYTES = 15 * 1024 * 1024;
  const IMPORT_MAX_ROWS = 2000;      // lignes gardées par année
  const IMPORT_SRC_ROWS = 6000;      // lignes lues dans une feuille source
  const IMPORT_SRC_COLS = 80;        // colonnes lues dans une feuille source
  const NATIVE_MAX_COLS = 26;        // colonnes rendues pour un fichier exporté par l’app
  // Feuille très masquée écrite à l’export : elle permet de relire le fichier sans perte
  // (noms d’années, lignes vides, montants tapés « 2 500,50 »).
  const META_SHEET = "_meuniance", META_TAG = "meuniance-export-1";
  // Seules les fonctions que le tableur sait calculer restent des formules : le reste
  // (HYPERLINK, WEBSERVICE, liens DDE…) est remplacé par sa valeur, jamais réexporté vivant.
  const SAFE_FUNCS = new Set(["SUM", "SOMME", "AVERAGE", "MOYENNE", "MIN", "MAX", "COUNT", "NB"]);

  function sanitizeSheetName(name, idx, wb) {
    // Excel refuse : \ / ? * [ ], plus de 31 caractères et une apostrophe au bord.
    let n = String(name || "").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31).trim();
    if (!n || n.toLowerCase() === "history" || n === META_SHEET) n = "Feuille " + (idx + 1);
    const taken = (x) => wb.SheetNames.some((s) => s.toLowerCase() === x.toLowerCase());
    let base = n, i = 1;
    while (taken(n)) { i++; n = base.slice(0, 26).trim() + " (" + i + ")"; }
    return n;
  }

  // ── Mois ──
  const MONTH_WORDS = (function () {
    const out = {};
    [["janvier", "janv", "jan", "january"], ["fevrier", "fevr", "fev", "feb", "febr", "february"], ["mars", "mar", "march"],
     ["avril", "avr", "apr", "april"], ["mai", "may"], ["juin", "jun", "june"], ["juillet", "juil", "jul", "july"],
     ["aout", "aou", "aug", "august"], ["septembre", "sept", "sep", "september"], ["octobre", "oct", "october"],
     ["novembre", "nov", "november"], ["decembre", "dec", "december"]]
      .forEach((list, i) => list.forEach((w) => { out[w] = i; }));
    return out;
  })();
  function plainText(v) { return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function isYearNumber(y) { return Number.isInteger(y) && y >= 1990 && y <= 2100; }
  // En-tête de mois → { m: 0-11, y: année ou null }. « Janvier », « janv. », « févr », « Sept »,
  // « January », « Jan 2026 », « janv.-26 », « 01/2026 », « 2026-01 » ou une vraie date Excel.
  function parseMonthHeader(v) {
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      // +12 h : une date « 1er du mois » lue en UTC ne bascule pas au mois précédent.
      const d = new Date(v.getTime() + 12 * 3600 * 1000);
      return { m: d.getMonth(), y: d.getFullYear() };
    }
    if (typeof v !== "string") return null;
    const s = plainText(v).replace(/\./g, " ").replace(/\s+/g, " ").trim();
    if (!s || s.length > 24) return null;
    let x = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (x) return +x[1] >= 1 && +x[1] <= 12 ? { m: +x[1] - 1, y: +x[2] } : null;
    x = s.match(/^(\d{4})[\/\-](\d{1,2})(?:[\/\-]\d{1,2})?(?:t[\d:.z+\-]*)?$/);
    if (x) return +x[2] >= 1 && +x[2] <= 12 ? { m: +x[2] - 1, y: +x[1] } : null;
    x = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (x) return +x[2] >= 1 && +x[2] <= 12 && +x[1] >= 1 && +x[1] <= 31 ? { m: +x[2] - 1, y: +x[3] } : null;
    x = s.match(/^([a-z]+)(?:[ \-']+(\d{4}|\d{2}))?$/);
    if (x && Object.prototype.hasOwnProperty.call(MONTH_WORDS, x[1])) {
      let y = x[2] ? +x[2] : null;
      if (y !== null && y < 100) y += 2000;
      return { m: MONTH_WORDS[x[1]], y: isYearNumber(y) ? y : null };
    }
    return null;
  }

  // ── Grille source : cellules { v, f } aux coordonnées exactes du fichier ──
  function importCellValue(cell) {
    if (!cell || cell.t === "e" || cell.v == null) return null;
    const v = cell.v;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "boolean") return v ? "VRAI" : "FAUX";
    const s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
    return s === "" ? null : s.slice(0, 2000);
  }
  function emptyGrid() { return { rows: [], nRows: 0, nCols: 0, dropped: 0, truncated: false, transposed: false }; }
  function gridPut(g, r, c, v, f) {
    if (r >= IMPORT_SRC_ROWS || c >= IMPORT_SRC_COLS) { g.dropped++; return; }
    (g.rows[r] || (g.rows[r] = []))[c] = { v, f: f || null };
    if (r + 1 > g.nRows) g.nRows = r + 1;
    if (c + 1 > g.nCols) g.nCols = c + 1;
  }
  function gridCell(g, r, c) { const row = g.rows[r]; return row ? row[c] || null : null; }
  function gridFromWorksheet(ws) {
    const g = emptyGrid();
    if (!ws) return g;
    g.truncated = !!(ws["!fullref"] && ws["!ref"] && ws["!fullref"] !== ws["!ref"]);
    for (const addr in ws) {
      if (addr.charAt(0) === "!") continue;
      const rc = refToRC(addr), cell = ws[addr];
      if (!rc || !cell) continue;
      const v = importCellValue(cell);
      if (v === null && !cell.f) continue;
      gridPut(g, rc.r, rc.c, v, cell.f ? String(cell.f) : null);
    }
    return g;
  }
  function gridFromAoa(aoa) {
    const g = emptyGrid();
    (aoa || []).forEach((row, r) => (row || []).forEach((val, c) => {
      const v = importCellValue({ v: val });
      if (v !== null) gridPut(g, r, c, v, null);
    }));
    return g;
  }
  function transposeGrid(g) {
    const t = emptyGrid();
    for (let r = 0; r < g.nRows; r++) {
      const row = g.rows[r]; if (!row) continue;
      for (let c = 0; c < row.length; c++) if (row[c]) gridPut(t, c, r, row[c].v, row[c].f);
    }
    t.dropped += g.dropped; t.truncated = g.truncated; t.transposed = !g.transposed;
    return t;
  }
  function isLeadingZeroCode(s) { return typeof s === "string" && /^[+-]?0\d/.test(s.trim()); }
  function isNumericValue(v) {
    if (typeof v === "number" || v instanceof Date) return true;
    return typeof v === "string" && !isLeadingZeroCode(v) && Number.isFinite(parseAmount(v));
  }
  // Une cellule « compte » dans un SOMME Excel : nombre, date ou formule.
  function cellCounts(cell) { return !!cell && (!!cell.f || typeof cell.v === "number" || cell.v instanceof Date); }
  function labelText(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return String(v.getDate()).padStart(2, "0") + "/" + String(v.getMonth() + 1).padStart(2, "0") + "/" + v.getFullYear();
    return String(v).replace(/\s+/g, " ").trim().slice(0, 200);
  }
  // Valeur → contenu brut de cellule. Les montants écrits en texte (« 1.234,56 », « (45.00) »,
  // « 2 500,00 € ») deviennent des nombres, comme le tableur et l’accueil les lisent.
  function valueToRaw(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v === 0 ? 0 : v) : "";
    if (v instanceof Date) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
    const s = String(v);
    if (!isLeadingZeroCode(s)) { const n = parseAmount(s); if (Number.isFinite(n)) return String(n); }
    // Un texte « =… » deviendrait une formule : l’apostrophe le garde en texte, comme dans Excel.
    return s.charAt(0) === "=" ? "'" + s : s;
  }

  // ── En-têtes ──
  const LABEL_HEADER = /^(categories?|postes?|libelles?|intitules?|items?|labels?|descriptions?|designations?|rubriques?|lignes?|noms?|names?|mois|months?|budget|nature|depenses?|revenus?)$/;
  const SIDE_HEADER = /^(types?|kinds?|sens|groupes?|groups?|sections?|notes?|commentaires?|comments?|remarques?|frequences?|frequency|comptes?|accounts?|total|totaux|moyenne|average|sum|somme)$/;
  // Ligne d’en-tête : au moins un mois, aucun montant (une année en tête est permise).
  function analyzeHeaderRow(g, r) {
    const row = g.rows[r]; if (!row) return null;
    const months = []; let nums = 0, texts = 0, year = null, yearCol = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]; if (!cell || cell.v === null) continue;
      const v = cell.v, mh = parseMonthHeader(v);
      if (mh) { months.push({ c, m: mh.m, y: mh.y }); continue; }
      const asYear = typeof v === "number" ? v : (typeof v === "string" && /^\d{4}$/.test(v) ? +v : NaN);
      if (year === null && !months.length && isYearNumber(asYear)) { year = asYear; yearCol = c; continue; }
      if (isNumericValue(v)) nums++; else texts++;
    }
    if (nums > 0 || !months.length) return null;
    // Un seul mois : il doit être dans une colonne de données, pas un intitulé « Mai » isolé.
    if (months.length === 1 && (months[0].c === 0 || texts > 3)) return null;
    return { r, months, year, yearCol };
  }
  // Mois écrits en lignes (« Mois | Salaire | Loyer » puis « Janvier | 2500 | -800 ») : colonne de mois.
  function findMonthColumn(g) {
    for (let c = 0; c < Math.min(g.nCols, 4); c++) {
      let hits = 0, dup = false;
      const seen = new Set();
      for (let r = 0; r < g.nRows; r++) {
        const cell = gridCell(g, r, c), mh = cell && parseMonthHeader(cell.v); if (!mh) continue;
        const row = g.rows[r];
        if (!row.some((x, k) => k !== c && x && (x.f || isNumericValue(x.v)))) continue;
        // Deux fois le même mois : ce sont des dates d’opérations, pas une ligne par mois.
        const id = mh.y + ":" + mh.m; if (seen.has(id)) dup = true; seen.add(id);
        hits++;
      }
      if (hits >= 2 && !dup) return c;
    }
    return -1;
  }
  // Liste d’opérations (Date | Libellé | Montant) : elle relève de l’import de relevé.
  function looksLikeTransactions(g) {
    let dateRows = 0, dupMonth = false;
    const seen = new Set();
    for (let r = 0; r < Math.min(g.nRows, 40); r++) {
      const row = g.rows[r]; if (!row) continue;
      const texts = row.filter((x) => x && typeof x.v === "string").map((x) => plainText(x.v));
      if (texts.some((t) => /^date/.test(t)) && texts.some((t) => /montant|amount|debit|credit|libelle|description|operation/.test(t))) return true;
      const d = row.find((x) => x && (x.v instanceof Date || (typeof x.v === "string" && /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(x.v))));
      if (d && row.some((x) => x && typeof x.v === "number")) {
        dateRows++;
        const mh = parseMonthHeader(d.v), id = mh ? mh.y + ":" + mh.m : "?";
        if (seen.has(id)) dupMonth = true; seen.add(id);
      }
    }
    // Plusieurs dates dans un même mois : des opérations, pas un tableau mensuel.
    return dateRows >= 3 && dupMonth;
  }
  function yearFromText(s) { const m = String(s || "").match(/(?:^|\D)((?:19|20|21)\d{2})(?!\d)/); return m && isYearNumber(+m[1]) ? +m[1] : null; }

  // ── Analyse d’une feuille → blocs { lignes source → année, colonnes source → mois } ──
  function analyzeSheet(g, sheetName, ctx) {
    let headers = [];
    for (let r = 0; r < g.nRows; r++) { const h = analyzeHeaderRow(g, r); if (h) headers.push(h); }
    if (!headers.length) {
      if (looksLikeTransactions(g)) return { g, blocks: [], reason: "transactions" };
      const mc = findMonthColumn(g);
      if (mc >= 0) {
        g = transposeGrid(g);
        for (let r = 0; r < g.nRows; r++) { const h = analyzeHeaderRow(g, r); if (h) headers.push(h); }
      }
    }
    if (!headers.length) return { g, blocks: [], reason: looksLikeTransactions(g) ? "transactions" : (g.nRows ? "nomonths" : "empty") };
    const nameYear = yearFromText(sheetName);
    const blocks = [];
    headers.forEach((h, i) => {
      const r1 = i + 1 < headers.length ? headers[i + 1].r - 1 : g.nRows - 1;
      let year = h.year;
      if (year === null) {
        const ys = h.months.map((x) => x.y).filter((y) => y !== null);
        if (!ys.length) year = nameYear;
        if (year === null && !ys.length && i === 0) {
          // Titre au-dessus du tableau (« Mon budget 2026 »).
          for (let r = 0; r < h.r && year === null; r++) (g.rows[r] || []).forEach((x) => { if (year === null && x && typeof x.v === "string") year = yearFromText(x.v); });
        }
      }
      const block = { id: blocks.length, header: h, r0: h.r + 1, r1, colMap: {}, labelCol: -1, rows: [], keys: [], ignored: [] };
      const seen = new Set();
      h.months.forEach((x) => {
        const y = x.y !== null ? x.y : year;
        const key = y !== null ? String(y) : "name:" + sheetName;
        if (seen.has(key + ":" + x.m)) { ctx.dupMonths++; return; }
        seen.add(key + ":" + x.m);
        block.colMap[x.c] = { key, m: x.m, year: y };
        if (block.keys.indexOf(key) < 0) block.keys.push(key);
      });
      const firstMonthCol = Math.min.apply(null, Object.keys(block.colMap).map(Number));
      // Colonne des intitulés : vote majoritaire (une ligne « 2026 » ou un n° de compte ne la
      // disqualifie pas), l’en-tête départage « Catégorie » et « Type ».
      let best = -1, bestScore = -Infinity;
      for (let c = 0; c < firstMonthCol; c++) {
        let filled = 0, text = 0;
        for (let r = block.r0; r <= r1; r++) {
          const cell = gridCell(g, r, c); if (!cell || cell.v === null) continue;
          filled++; if (!isNumericValue(cell.v)) text++;
        }
        if (!filled || text * 2 < filled) continue;
        const hc = gridCell(g, h.r, c), ht = hc && c !== h.yearCol ? plainText(hc.v) : "";
        const score = (LABEL_HEADER.test(ht) ? 3 : 0) + (ht ? 0 : 2) + (SIDE_HEADER.test(ht) ? -4 : 0) + text / filled - c * 0.01;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      block.labelCol = best;
      for (let r = block.r0; r <= r1; r++) {
        const row = g.rows[r]; if (!row) continue;
        const label = best >= 0 ? labelText(gridCell(g, r, best) && gridCell(g, r, best).v) : "";
        const hasData = Object.keys(block.colMap).some((c) => { const x = row[c]; return x && (x.v !== null || x.f); });
        if (!label && !hasData) continue;
        block.rows.push({ r, label });
      }
      // Colonnes en plus (Total, Type, notes…) : ignorées, mais citées dans le résumé.
      for (let c = 0; c < g.nCols; c++) {
        if (c === best || block.colMap[c]) continue;
        let used = false;
        for (let k = 0; k < block.rows.length && !used; k++) { const x = gridCell(g, block.rows[k].r, c); used = !!(x && x.v !== null); }
        if (!used) continue;
        const hc = gridCell(g, h.r, c);
        block.ignored.push(hc && hc.v !== null ? labelText(hc.v) : colToLetter(c));
      }
      if (block.keys.length) blocks.push(block);
    });
    return { g, blocks, reason: blocks.length ? "" : "nomonths" };
  }

  // Lignes et colonnes d’une feuille exportée par l’app : correspondance directe (A1 = Janvier, ligne 1).
  function nativeHeadersIntact(g) {
    for (let c = 1; c <= 12; c++) { const x = gridCell(g, 0, c), m = x ? parseMonthHeader(x.v) : null; if (!m || m.m !== c - 1) return false; }
    return true;
  }
  function nativeSheetBlocks(g, key, meta) {
    const cols = Math.min(NATIVE_MAX_COLS, Math.max(12, (meta && meta.cols) || 12, g.nCols - 1));
    const block = { id: 0, header: { r: 0, months: [] }, r0: 1, r1: g.nRows - 1, colMap: {}, labelCol: 0, rows: [], keys: [key], ignored: [], native: true };
    for (let c = 1; c <= cols; c++) block.colMap[c] = { key, m: c - 1, year: yearFromText(key) };
    const rows = Math.max(g.nRows - 1, (meta && meta.rows) || 0);
    for (let r = 1; r <= rows; r++) { const x = gridCell(g, r, 0); block.rows.push({ r, label: x ? labelText(x.v) : "" }); }
    if (g.nCols - 1 > cols) block.ignored.push(colToLetter(cols) + "…");
    return { g, blocks: [block], reason: "" };
  }

  // ── Formules : chaque référence suit la vraie correspondance source → tableur ──
  // Retourne « =… » ou null (formule non prise en charge : on garde alors sa valeur).
  // Excel n’enregistre que les noms anglais : SOMME, MOYENNE et NB sont écrits SUM, AVERAGE et COUNT.
  const EXCEL_NAMES = { SOMME: "SUM", MOYENNE: "AVERAGE", NB: "COUNT" };
  function convertFormula(f, mapRef, mapRange, rename) {
    let s = String(f || "").trim();
    if (s.charAt(0) === "=") s = s.slice(1);
    if (!s || s.length > 2000) return null;
    let out = "", i = 0, m;
    while (i < s.length) {
      const ch = s[i], rest = s.slice(i);
      if (/\s/.test(ch)) { out += " "; i++; continue; }
      if ("+-*/(),".indexOf(ch) >= 0) { out += ch; i++; continue; }
      if ((m = rest.match(/^[0-9]+(?:\.[0-9]+)?(?![0-9A-Za-z_.%:])/))) { out += m[0]; i += m[0].length; continue; }
      if ((m = rest.match(/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}:\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(?![A-Za-z0-9_(.!:])/))) {
        const ends = m[0].split(":"), a = refToRC(ends[0]), b = refToRC(ends[1]);
        const t = a && b ? mapRange(Math.min(a.r, b.r), Math.min(a.c, b.c), Math.max(a.r, b.r), Math.max(a.c, b.c)) : null;
        if (!t) return null;
        out += colToLetter(t.c0) + (t.r0 + 1) + ":" + colToLetter(t.c1) + (t.r1 + 1); i += m[0].length; continue;
      }
      if ((m = rest.match(/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(?![A-Za-z0-9_(.!:])/))) {
        const rc = refToRC(m[0]), t = rc ? mapRef(rc.r, rc.c) : null;
        if (!t) return null;
        out += colToLetter(t.c) + (t.r + 1); i += m[0].length; continue;
      }
      if ((m = rest.match(/^(?:_xlfn\.)?([A-Za-z][A-Za-z0-9_.]*)\s*\(/))) {
        const name = m[1].toUpperCase();
        if (!SAFE_FUNCS.has(name)) return null;
        out += ((rename && rename[name]) || name) + "("; i += m[0].length; continue;
      }
      if ((m = rest.match(/^(TRUE|FALSE|VRAI|FAUX)(?![A-Za-z0-9_(.!])/i))) { out += m[1].toUpperCase(); i += m[0].length; continue; }
      return null;
    }
    try { parse(tokenize("=" + out)); } catch (e) { return null; }
    return "=" + out.trim();
  }
  // Une plage reste valable si ses lignes et colonnes gardées restent contiguës et si ce
  // qu’on laisse de côté (en-tête, intitulés, lignes vides) ne contient aucun montant.
  function contiguous(list) {
    if (!list.length) return null;
    const sorted = list.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return null;
    return { lo: sorted[0], hi: sorted[sorted.length - 1] };
  }
  function makeMapper(state) {
    // state : { g, rowBlock[], rowTarget: Map("r|key" → ligne), key }
    const g = state.g;
    const toGrid = (r, c) => (g.transposed ? { r: c, c: r } : { r, c });
    function rowIn(r, key) { const t = state.rowTarget.get(r + "|" + key); return t === undefined ? null : t; }
    function mapRef(r0, c0) {
      const p = toGrid(r0, c0), block = state.rowBlock[p.r], info = block && block.colMap[p.c];
      if (!info || info.key !== state.key) return null;
      const tr0 = rowIn(p.r, state.key);
      return tr0 === null ? null : { r: tr0, c: info.m };
    }
    function mapRange(ar0, ac0, ar1, ac1) {
      let a = toGrid(ar0, ac0), b = toGrid(ar1, ac1);
      const r0 = Math.min(a.r, b.r), r1 = Math.min(Math.max(a.r, b.r), g.nRows - 1), c0 = Math.min(a.c, b.c), c1 = Math.min(Math.max(a.c, b.c), g.nCols - 1);
      if ((r1 - r0 + 1) * (c1 - c0 + 1) > 400000) return null;
      const rows = [], blocks = [];
      for (let r = r0; r <= r1; r++) {
        const t = rowIn(r, state.key);
        if (t === null) { for (let c = c0; c <= c1; c++) if (cellCounts(gridCell(g, r, c))) return null; continue; }
        rows.push(t);
        const bl = state.rowBlock[r]; if (blocks.indexOf(bl) < 0) blocks.push(bl);
      }
      const rr = contiguous(rows); if (!rr) return null;
      const cols = [];
      for (let c = c0; c <= c1; c++) {
        const infos = blocks.map((bl) => bl.colMap[c]);
        const ok = infos.every((x) => x && x.key === state.key && x.m === infos[0].m);
        if (!ok) {
          if (infos.some((x) => x && x.key === state.key)) return null; // mois différents selon les blocs
          for (let r = r0; r <= r1; r++) if (cellCounts(gridCell(g, r, c))) return null;
          continue;
        }
        cols.push(infos[0].m);
      }
      const cc = contiguous(cols); if (!cc) return null;
      return { r0: rr.lo, r1: rr.hi, c0: cc.lo, c1: cc.hi };
    }
    return { mapRef, mapRange };
  }
  // Forme comparable d’une formule (casse, espaces, noms français) : « =somme(a1:a2) » = « =SUM(A1:A2) ».
  function canonFormula(f) {
    return convertFormula(f, (r, c) => ({ r, c }), (r0, c0, r1, c1) => ({ r0, c0, r1, c1 }), EXCEL_NAMES);
  }

  // ── Lecture du fichier ──
  function decodeText(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    const start = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF ? 3 : 0;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start)); }
    catch (e) { return new TextDecoder("windows-1252").decode(bytes.subarray(start)); }
  }
  function splitDelimited(text, sep) {
    const rows = []; let row = [], field = "", quoted = false, i = 0;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += ch;
      } else if (ch === '"' && field === "") quoted = true;
      else if (ch === sep) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; if (rows.length > IMPORT_SRC_ROWS) break; }
      else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  // Séparateur le plus régulier parmi ; tabulation , | (le « ; » d’abord : en français la virgule est décimale).
  function guessSeparator(text) {
    const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30).join("\n");
    let best = ";", bestScore = -1;
    [";", "\t", ",", "|"].forEach((sep) => {
      const rows = splitDelimited(sample, sep).filter((r) => r.length > 1);
      if (!rows.length) return;
      const counts = {}; rows.forEach((r) => { counts[r.length] = (counts[r.length] || 0) + 1; });
      const mode = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const score = counts[mode] * 100 + Number(mode);
      if (score > bestScore) { bestScore = score; best = sep; }
    });
    return best;
  }
  function gridFromText(text) {
    const rows = splitDelimited(text, guessSeparator(text)).map((r) => r.map((x) => x.trim()));
    return gridFromAoa(rows);
  }
  function sniffKind(bytes) {
    if (!bytes || !bytes.length) return "empty";
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) return "zip";
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return "cfb";
    const n = Math.min(bytes.length, 4096);
    if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) return "text";
    for (let i = 0; i < n; i++) { const b = bytes[i]; if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) return "binary"; }
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, Math.min(n, 512))).trim().toLowerCase();
    if (/^<\?xml|^<html|^<table|^<!doctype html/.test(head)) return "markup";
    return "text";
  }
  function readErrorMessage(err) {
    const msg = String(err && err.message || err || "");
    if (/password|encrypt|protected/i.test(msg)) return tr("Ce fichier est protégé par un mot de passe. Ouvre-le dans Excel, retire la protection, enregistre-le, puis réessaie.", "This file is password-protected. Open it in Excel, remove the protection, save it, then try again.");
    return tr("Ce fichier n’est pas un tableur lisible. Choisis un fichier .xlsx, .xls, .ods ou .csv.", "This file isn’t a readable spreadsheet. Choose an .xlsx, .xls, .ods or .csv file.");
  }

  // Lit la feuille cachée d’un export Meuniance (noms, dimensions, contenus tapés).
  function readExportMeta(wb) {
    const ws = wb && wb.Sheets && wb.Sheets[META_SHEET];
    if (!ws) return null;
    const g = gridFromWorksheet(ws), first = gridCell(g, 0, 0);
    if (!first || first.v !== META_TAG) return null;
    const meta = { sheets: {}, raws: {} };
    for (let r = 1; r < g.nRows; r++) {
      const cell = (c) => { const x = gridCell(g, r, c); return x ? x.v : null; };
      const kind = cell(0), sheet = String(cell(1) == null ? "" : cell(1));
      if (kind === "sheet") meta.sheets[sheet] = { name: String(cell(2) == null ? sheet : cell(2)), rows: Number(cell(3)) || 0, cols: Number(cell(4)) || 12 };
      else if (kind === "raw") meta.raws[sheet + "!" + cell(2)] = String(cell(3) == null ? "" : cell(3));
    }
    return meta;
  }

  // Analyse complète, sans toucher au tableur : { sheets, summary, error }.
  function planImport(bytes, fileName) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const kind = sniffKind(bytes);
    if (kind === "empty") return { error: tr("Ce fichier est vide : rien n’a été importé.", "This file is empty: nothing was imported.") };
    const sources = []; let meta = null;
    if (kind === "text" || (kind === "binary" && /\.(csv|txt|tsv)$/i.test(fileName || ""))) {
      if (kind === "binary") return { error: readErrorMessage("") };
      sources.push({ name: String(fileName || "").replace(/\.[^.]+$/, "") || "Feuille 1", g: gridFromText(decodeText(bytes)) });
    } else {
      if (kind === "binary") return { error: readErrorMessage("") };
      if (typeof XLSX === "undefined") return { error: tr("L’import Excel n’a pas pu démarrer. Vérifie ta connexion, puis réessaie.", "Excel import couldn’t start. Check your connection, then try again.") };
      let wb;
      try { wb = XLSX.read(bytes, { type: "array", cellDates: true, cellNF: false, cellHTML: false, sheetRows: IMPORT_SRC_ROWS }); }
      catch (err) { return { error: readErrorMessage(err) }; }
      meta = readExportMeta(wb);
      const info = (wb.Workbook && wb.Workbook.Sheets) || [];
      (wb.SheetNames || []).forEach((name, i) => {
        if (name === META_SHEET) return;
        if (info[i] && info[i].Hidden) return; // feuille masquée : calculs internes, pas des données
        sources.push({ name, g: gridFromWorksheet(wb.Sheets[name]), meta: meta && meta.sheets[name] ? meta.sheets[name] : null });
      });
    }
    const ctx = { dupMonths: 0 };
    const targets = new Map(), order = [];
    const summary = { sheets: [], months: 0, rows: 0, ignoredCols: [], skippedSheets: [], formulasAsValues: 0, droppedRows: 0, droppedCells: 0, native: !!meta, reasons: [] };
    const target = (key, name) => {
      if (!targets.has(key)) { targets.set(key, { key, name, rowHeaders: [], cells: {}, rows: 0, cols: 12, months: new Set(), numeric: 0 }); order.push(key); }
      return targets.get(key);
    };
    const analyses = sources.map((src) => {
      // Export Meuniance relu tel quel seulement si ses en-têtes de mois sont encore à leur place
      // (une colonne insérée dans Excel décalerait tous les mois) ; sinon lecture normale.
      const a = src.meta && nativeHeadersIntact(src.g) ? nativeSheetBlocks(src.g, "native:" + src.name, src.meta) : analyzeSheet(src.g, src.name, ctx);
      a.src = src;
      summary.droppedCells += src.g.dropped;
      if (src.g.truncated) summary.droppedRows++;
      if (!a.blocks.length) { if (src.g.nRows) { summary.skippedSheets.push(src.name); summary.reasons.push(a.reason); } return a; }
      // Lignes source → lignes du tableur, année par année.
      a.rowBlock = []; a.rowTarget = new Map();
      a.blocks.forEach((bl) => {
        for (let r = bl.r0; r <= bl.r1; r++) a.rowBlock[r] = bl;
        bl.keys.forEach((key) => {
          const name = src.meta ? src.meta.name : (key.indexOf("name:") === 0 ? src.name : key);
          const t = target(key, name);
          bl.rows.forEach((row) => {
            if (t.rows >= IMPORT_MAX_ROWS) { summary.droppedRows++; return; }
            a.rowTarget.set(row.r + "|" + key, t.rows);
            t.rowHeaders[t.rows] = row.label; t.rows++;
          });
        });
        bl.ignored.forEach((x) => { if (summary.ignoredCols.indexOf(x) < 0) summary.ignoredCols.push(x); });
      });
      return a;
    });
    // Cellules (après toutes les lignes, pour que chaque formule connaisse sa correspondance).
    analyses.forEach((a) => {
      if (!a.blocks.length) return;
      const src = a.src, g = a.g;
      a.blocks.forEach((bl) => bl.rows.forEach((row) => Object.keys(bl.colMap).forEach((cs) => {
        const c = Number(cs), info = bl.colMap[c], t = targets.get(info.key);
        const tRow = a.rowTarget.get(row.r + "|" + info.key);
        if (tRow === undefined) return;
        const cell = gridCell(g, row.r, c); if (!cell) return;
        let raw = "";
        if (cell.f) {
          const mapper = makeMapper({ g, rowBlock: a.rowBlock, rowTarget: a.rowTarget, key: info.key });
          raw = convertFormula(cell.f, mapper.mapRef, mapper.mapRange) || "";
          if (!raw) { summary.formulasAsValues++; raw = valueToRaw(cell.v); }
        } else raw = valueToRaw(cell.v);
        if (src.meta && meta) {
          // Contenu tapé dans l’app (« 2 500,50 », « 007 ») : repris s’il vaut toujours la même chose.
          const typed = meta.raws[src.name + "!" + tRow + "," + info.m];
          if (typed !== undefined && typed !== raw) {
            const fa = typed.charAt(0) === "=", fb = raw.charAt(0) === "=";
            const same = fa && fb ? canonFormula(typed) !== null && canonFormula(typed) === canonFormula(raw)
              : (!fa && !fb && parseAmount(typed) === parseAmount(raw)) || typed === String(cell.v);
            if (same) raw = typed;
          }
        }
        if (raw === "") return;
        t.cells[tRow + "," + info.m] = { raw };
        t.cols = Math.max(t.cols, info.m + 1);
        t.months.add(info.m);
        if (raw.charAt(0) === "=" || Number.isFinite(parseAmount(raw))) t.numeric++;
      })));
    });
    const sheets = order.map((k) => targets.get(k)).filter((t) => t.rows > 0 || Object.keys(t.cells).length);
    const numeric = sheets.reduce((n, t) => n + t.numeric, 0);
    if (!sheets.length || !numeric) {
      let error;
      if (summary.reasons.indexOf("transactions") >= 0) error = tr("Ce fichier ressemble à une liste d’opérations (date, libellé, montant). Importe-le comme relevé bancaire : Meuniance regroupera les montants par mois. Rien n’a été modifié.", "This file looks like a list of transactions (date, description, amount). Import it as a bank statement: Meuniance will group the amounts by month. Nothing was changed.");
      else if (sheets.length) error = tr("Je n’ai trouvé aucun montant sous les mois de ce fichier. Rien n’a été modifié.", "No amounts were found under the months in this file. Nothing was changed.");
      else if (!sources.some((s) => s.g.nRows)) error = tr("Ce fichier ne contient aucune donnée. Rien n’a été modifié.", "This file contains no data. Nothing was changed.");
      else error = tr("Je ne trouve pas les mois dans ce fichier. Mets les mois (Janvier à Décembre) en en-tête de colonnes, tes intitulés dans la première colonne, puis réessaie. Rien n’a été modifié.", "The months weren’t found in this file. Put the months (January to December) as column headers and your row names in the first column, then try again. Nothing was changed.");
      return { error, summary };
    }
    summary.dupMonths = ctx.dupMonths;
    // Aucune année dans le fichier (ni feuille, ni en-tête, ni titre) : l’année en cours, dite dans le résumé.
    const yearless = sheets.filter((t) => t.key.indexOf("name:") === 0), thisYear = String(new Date().getFullYear());
    if (yearless.length === 1 && !sheets.some((t) => t.key === thisYear)) { yearless[0].name = thisYear; summary.assumedYear = thisYear; }
    sheets.forEach((t) => {
      summary.sheets.push(t.name);
      summary.months = Math.max(summary.months, t.months.size);
      summary.rows += t.rowHeaders.filter(Boolean).length;
      t.cols = Math.min(Math.max(12, t.cols), NATIVE_MAX_COLS);
    });
    return {
      sheets: sheets.map((t) => ({ name: t.name, cells: t.cells, rowHeaders: t.rowHeaders.slice(0, t.rows), rows: t.rows, cols: t.cols })),
      summary
    };
  }
  function importSummaryText(summary, mode) {
    const parts = [];
    const n = summary.sheets.length;
    parts.push((mode === "add" ? tr("Ajouté : ", "Added: ") : tr("Importé : ", "Imported: ")) + summary.sheets.join(", ") + " · " + summary.months + tr(" mois", summary.months > 1 ? " months" : " month") + " · " + summary.rows + tr(" ligne" + (summary.rows > 1 ? "s" : ""), " row" + (summary.rows > 1 ? "s" : "")) + ".");
    if (n === 0) parts.length = 0;
    if (summary.assumedYear) parts.push(tr("Aucune année dans le fichier : rangé dans " + summary.assumedYear + ".", "No year in the file: placed in " + summary.assumedYear + "."));
    if (summary.ignoredCols.length) parts.push(tr("Colonnes ignorées : ", "Ignored columns: ") + summary.ignoredCols.slice(0, 4).join(", ") + (summary.ignoredCols.length > 4 ? "…" : "") + ".");
    if (summary.skippedSheets.length) parts.push(tr("Feuilles sans mois ignorées : ", "Sheets without months skipped: ") + summary.skippedSheets.slice(0, 3).join(", ") + (summary.skippedSheets.length > 3 ? "…" : "") + ".");
    if (summary.formulasAsValues) parts.push(summary.formulasAsValues === 1 ? tr("1 formule remplacée par sa valeur.", "1 formula replaced by its value.") : summary.formulasAsValues + tr(" formules remplacées par leur valeur.", " formulas replaced by their value."));
    if (summary.droppedRows || summary.droppedCells) parts.push(tr("Le fichier dépassait la taille gérée (2 000 lignes, 80 colonnes) : le surplus n’a pas été importé.", "The file exceeded the supported size (2,000 rows, 80 columns): the extra part wasn’t imported."));
    return parts.join(" ");
  }

  function readFileBytes(file) {
    if (file && typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("read"));
      reader.readAsArrayBuffer(file);
    });
  }
  // « Ajouter » est le choix par défaut : « Remplacer tout » efface toutes les années.
  function importChoiceDialog(plan) {
    return new Promise((resolve) => {
      const s = plan.summary;
      const overlay = document.createElement("div"); overlay.className = "sheet-modal-overlay";
      const modal = document.createElement("div"); modal.className = "sheet-modal sheet-modal-choice";
      modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
      const title = document.createElement("h3"); title.textContent = tr("Importer ce fichier", "Import this file"); modal.appendChild(title);
      const found = document.createElement("p"); found.className = "sheet-import-found";
      found.textContent = tr("Trouvé : ", "Found: ") + s.sheets.join(", ") + " · " + s.months + tr(" mois", s.months > 1 ? " months" : " month") + " · " + s.rows + tr(" ligne" + (s.rows > 1 ? "s" : ""), " row" + (s.rows > 1 ? "s" : "")) + "." +
        (s.ignoredCols.length ? " " + tr("Colonnes ignorées : ", "Ignored columns: ") + s.ignoredCols.slice(0, 4).join(", ") + "." : "");
      modal.appendChild(found);
      const current = state.sheets.map((x) => x.name);
      const p = document.createElement("p"); p.className = "sheet-import-help";
      p.textContent = tr("« Ajouter » complète tes années : les lignes du même nom sont mises à jour, les autres sont ajoutées. « Remplacer tout » efface tes années actuelles (" + current.join(", ") + ") ; tu pourras annuler juste après.",
        "“Add” completes your years: rows with the same name are updated, others are added. “Replace all” erases your current years (" + current.join(", ") + "); you can undo right after.");
      modal.appendChild(p);
      const actions = document.createElement("div"); actions.className = "sheet-modal-actions";
      const close = (v) => { document.removeEventListener("keydown", onKey, true); overlay.remove(); unlockModalBackground(); resolve(v); };
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(null); } }
      const add = document.createElement("button"); add.type = "button"; add.className = "button button-primary"; add.textContent = tr("Ajouter à l’existant", "Add to my data");
      const rep = document.createElement("button"); rep.type = "button"; rep.className = "button button-ghost sheet-import-replace"; rep.textContent = tr("Remplacer tout", "Replace all");
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "button button-ghost"; cancel.textContent = tr("Annuler", "Cancel");
      add.addEventListener("click", () => close("add"));
      rep.addEventListener("click", () => close("replace"));
      cancel.addEventListener("click", () => close(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
      document.addEventListener("keydown", onKey, true);
      actions.append(add, rep, cancel);
      modal.appendChild(actions); overlay.appendChild(modal);
      document.body.appendChild(overlay); lockModalBackground(); add.focus();
    });
  }
  // Fusionne une année importée dans une année existante : la ligne du même nom est mise à
  // jour (les mois absents du fichier sont gardés), les autres lignes sont ajoutées à la suite.
  // Les formules suivent le déplacement de leurs lignes.
  function mergeSheetData(targetSheet, importedSheet) {
    if (!targetSheet || !importedSheet) return;
    const norm = (s) => String(s || "").trim().toLocaleLowerCase("fr");
    targetSheet.rowHeaders = targetSheet.rowHeaders || [];
    const used = new Set(), rowMap = [];
    let next = contentRowCount(targetSheet);
    const hasCells = (r) => { for (let c = 0; c < (importedSheet.cols || 12); c++) if (importedSheet.cells[r + "," + c]) return true; return false; };
    for (let ir = 0; ir < (importedSheet.rows || 0); ir++) {
      const label = importedSheet.rowHeaders[ir] || "";
      let found = -1;
      if (label.trim()) found = targetSheet.rowHeaders.findIndex((h, i) => !used.has(i) && norm(h) === norm(label));
      if (found < 0) {
        if (!label.trim() && !hasCells(ir)) { rowMap[ir] = null; continue; }
        found = next++;
        targetSheet.rowHeaders[found] = label;
      }
      used.add(found); rowMap[ir] = found;
    }
    const cache = recompute(importedSheet.cells);
    const mapRef = (r, c) => (rowMap[r] === null || rowMap[r] === undefined ? null : { r: rowMap[r], c });
    const mapRange = (r0, c0, r1, c1) => {
      const rows = [];
      for (let r = r0; r <= Math.min(r1, importedSheet.rows - 1); r++) if (rowMap[r] !== null && rowMap[r] !== undefined) rows.push(rowMap[r]);
      const rr = contiguous(rows);
      return rr ? { r0: rr.lo, r1: rr.hi, c0, c1 } : null;
    };
    Object.keys(importedSheet.cells).forEach((k) => {
      const parts = k.split(","), ir = Number(parts[0]), c = Number(parts[1]);
      if (rowMap[ir] === null || rowMap[ir] === undefined) return;
      let raw = importedSheet.cells[k].raw;
      if (String(raw).charAt(0) === "=") {
        const moved = convertFormula(raw, mapRef, mapRange);
        if (moved) raw = moved;
        else { const res = cache[k]; raw = res && typeof res.value === "number" && Number.isFinite(res.value) ? String(res.value) : ""; }
      }
      if (raw === "") return;
      targetSheet.cells[rowMap[ir] + "," + c] = { raw };
      targetSheet.cols = Math.max(targetSheet.cols || 12, c + 1);
    });
    targetSheet.rows = Math.max(targetSheet.rows || 0, next);
    compactRows(targetSheet);
  }
  function sheetKeyYear(name) { return yearFromText(name); }

  async function importXlsx(file, options) {
    options = options || {};
    if (!file) return false;
    if (file.size > IMPORT_MAX_BYTES) { toast(tr("Ce fichier est trop lourd (15 Mo au plus). Enregistre seulement tes feuilles de budget, puis réessaie.", "This file is too large (15 MB max). Save only your budget sheets, then try again.")); return false; }
    if (!file.size) { toast(tr("Ce fichier est vide : rien n’a été importé.", "This file is empty: nothing was imported.")); return false; }
    let bytes;
    try { bytes = new Uint8Array(await readFileBytes(file)); }
    catch (err) { toast(tr("Lecture du fichier impossible. Réessaie.", "Couldn’t read the file. Try again.")); return false; }
    const kind = sniffKind(bytes);
    if ((kind === "zip" || kind === "cfb" || kind === "markup") && typeof XLSX === "undefined" && window.GFVendors) { try { await window.GFVendors.xlsx(); } catch (e) {} }
    let plan;
    try { plan = planImport(bytes, file.name); }
    catch (err) { plan = { error: readErrorMessage(err) }; }
    if (plan.error) { toast(plan.error, 9000); return false; }
    const mode = options.mode || await importChoiceDialog(plan);
    if (!mode) return false;
    try { if (!options.silent && window.MeuniLoader) window.MeuniLoader.start(tr("J’importe ton fichier…", "Importing your file…")); } catch (e) {}
    if (state.editing) commitActiveEdit();
    recordHistory(); // état d’avant l’import, pour « Annuler »
    const created = [];
    if (mode === "replace") {
      state.sheets = [];
      plan.sheets.forEach((s) => {
        const sheet = newSheet(s.name);
        Object.assign(sheet, { cells: s.cells, rowHeaders: s.rowHeaders, rows: s.rows, cols: s.cols });
        enforceMonthHeaders(sheet); compactRows(sheet);
        created.push(sheet);
      });
    } else {
      plan.sheets.forEach((s) => {
        const y = sheetKeyYear(s.name);
        const existing = state.sheets.find((sh) => (y !== null ? sheetKeyYear(sh.name) === y : String(sh.name).trim().toLowerCase() === String(s.name).trim().toLowerCase()));
        if (existing) { mergeSheetData(existing, s); created.push(existing); }
        else {
          const sheet = newSheet(y !== null ? String(y) : s.name);
          Object.assign(sheet, { cells: s.cells, rowHeaders: s.rowHeaders, rows: s.rows, cols: s.cols });
          enforceMonthHeaders(sheet); compactRows(sheet);
          created.push(sheet);
        }
      });
    }
    // On ouvre l’année en cours si elle a été importée, sinon la plus récente.
    const thisYear = new Date().getFullYear();
    const pick = created.find((x) => sheetYear(x) === thisYear) || created.slice().sort((a, b) => (sheetYear(b) || 0) - (sheetYear(a) || 0))[0];
    if (pick) state.activeSheetId = pick.id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave(); notifyDashboard();
    if (typeof window.populateYearSelect === "function") { try { window.populateYearSelect(); } catch (e) {} }
    if (!options.silent) toast(importSummaryText(plan.summary, mode), 9000, mode === "replace" ? { label: tr("Annuler", "Undo"), run: undo } : null);
    return true;
  }
  function exportXlsx() {
    if (typeof XLSX === "undefined") {
      if (window.GFVendors) {
        toast(tr("Préparation de l’export…", "Preparing the export…"));
        window.GFVendors.xlsx().then(exportXlsx).catch(function(){ toast(tr("L’export Excel n’a pas pu démarrer. Vérifie ta connexion, puis réessaie.", "Excel export couldn’t start. Check your connection, then try again.")); });
        return;
      }
      toast(tr("L’export Excel n’a pas pu démarrer. Vérifie ta connexion, puis réessaie.", "Excel export couldn’t start. Check your connection, then try again.")); return;
    }
    try {
      const wb = buildExportWorkbook();
      XLSX.writeFile(wb, "tableau-finances.xlsx");
      toast(state.sheets.length === 1 ? tr("1 feuille exportée.", "1 sheet exported.") : state.sheets.length + tr(" feuilles exportées.", " sheets exported."));
    } catch (err) { console.warn("Meuniance : export impossible", err); toast(tr("L’export n’a pas pu être créé. Réessaie dans un instant.", "The export couldn’t be created. Try again in a moment.")); }
  }
  // Classeur d’export lisible par Excel : intitulés en colonne A, mois en ligne 1, donc chaque
  // référence de formule est décalée d’une ligne et d’une colonne (A1 du tableur = B2 d’Excel).
  function buildExportWorkbook(sheets) {
    sheets = sheets || state.sheets;
    const wb = { SheetNames: [], Sheets: {}, Workbook: { Sheets: [] }, Props: { Title: "Meuniance" } };
    const metaRows = [[META_TAG]];
    const shift = (r, c) => ({ r: r + 1, c: c + 1 });
    const shiftRange = (r0, c0, r1, c1) => ({ r0: r0 + 1, c0: c0 + 1, r1: r1 + 1, c1: c1 + 1 });
    sheets.forEach((sheet, idx) => {
      const name = sanitizeSheetName(sheet.name, idx, wb);
      const cache = recompute(sheet.cells || {});
      const rows = Math.max(contentRowCount(sheet), 0), cols = Math.max(12, sheet.cols || 12);
      const ws = {};
      ws[colToLetter(0) + "1"] = { t: "s", v: "" };
      for (let c = 0; c < cols; c++) ws[colToLetter(c + 1) + "1"] = { t: "s", v: c < 12 ? MONTH_HEADERS[c] : colToLetter(c) };
      for (let r = 0; r < rows; r++) {
        const label = (sheet.rowHeaders || [])[r];
        if (label) ws["A" + (r + 2)] = { t: "s", v: String(label) };
        for (let c = 0; c < cols; c++) {
          const k = cellKey(r, c), cell = sheet.cells[k];
          if (!cell || cell.raw === "" || cell.raw == null) continue;
          const raw = String(cell.raw), res = cache[k], addr = colToLetter(c + 1) + (r + 2);
          const num = res && typeof res.value === "number" && Number.isFinite(res.value) ? res.value : null;
          if (raw.charAt(0) === "=") {
            const f = convertFormula(raw, shift, shiftRange, EXCEL_NAMES);
            if (f) ws[addr] = num !== null ? { t: "n", v: num, f: f.slice(1) } : { t: "n", v: 0, f: f.slice(1) };
            else ws[addr] = num !== null ? { t: "n", v: num } : { t: "s", v: raw };
            metaRows.push(["raw", name, r + "," + c, raw]);
          } else if (num !== null && !isLeadingZeroCode(raw)) {
            ws[addr] = { t: "n", v: num };
            if (String(num) !== raw) metaRows.push(["raw", name, r + "," + c, raw]);
          } else ws[addr] = { t: "s", v: raw };
        }
      }
      ws["!ref"] = "A1:" + colToLetter(cols) + Math.max(1, rows + 1);
      wb.SheetNames.push(name); wb.Sheets[name] = ws; wb.Workbook.Sheets.push({ Hidden: 0 });
      metaRows.push(["sheet", name, String(sheet.name), rows, cols]);
    });
    const meta = {};
    metaRows.forEach((row, r) => row.forEach((v, c) => {
      meta[colToLetter(c) + (r + 1)] = typeof v === "number" ? { t: "n", v } : { t: "s", v: String(v) };
    }));
    meta["!ref"] = "A1:D" + metaRows.length;
    wb.SheetNames.push(META_SHEET); wb.Sheets[META_SHEET] = meta; wb.Workbook.Sheets.push({ Hidden: 2 });
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

  // Mêmes tableaux que buildWorkbook() relu par XLSX.utils.sheet_to_json(header:1, raw:true), mais sans
  // la bibliothèque Excel : l'accueil s'affiche sans attendre son téléchargement (930 Ko).
  function buildTables() {
    return state.sheets.map((sheet) => {
      const cache = recompute(sheet.cells);
      const dataCols = new Set(); let maxR = -1;
      for (const k in sheet.cells) {
        const raw = sheet.cells[k].raw;
        if (raw === undefined || raw === null || raw === "") continue;
        const parts = k.split(","); const r = +parts[0], c = +parts[1];
        dataCols.add(c); if (r > maxR) maxR = r;
      }
      // Toujours les 12 mois en en-tête : une année saisie seulement en janvier reste lue par mois.
      const cols = dataCols.size ? Math.max(12, Math.max(...dataCols) + 1) : 0;
      const rows = maxR + 1;
      if (rows <= 0 || cols <= 0) return { name: sheet.name, aoa: [] };
      // Colonne des intitulés toujours présente : l’accueil y lit le nom de chaque ligne.
      const off = 1, aoa = [];
      const headerRow = [""];
      for (let c = 0; c < cols; c++) headerRow[c + off] = sheet.headers[c] || (c < 12 ? MONTH_HEADERS[c] : colToLetter(c));
      aoa.push(headerRow);
      for (let r = 0; r < rows; r++) {
        const label = sheet.rowHeaders && sheet.rowHeaders[r];
        const row = [label || String(r + 1)];
        let filled = !!label;
        for (let c = 0; c < cols; c++) {
          const k = cellKey(r, c), cell = sheet.cells[k] || { raw: "" }, res = cache[k];
          let v;
          if (res && typeof res.value === "number" && Number.isFinite(res.value)) v = res.value;
          else if (cell.raw && cell.raw[0] === "=") v = undefined;
          else v = cell.raw || "";
          row[c + off] = v;
          if (v !== undefined && v !== "") filled = true;
        }
        if (filled) aoa.push(row);
      }
      return { name: sheet.name, aoa };
    });
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
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    function close() { document.removeEventListener("keydown", onKey, true); overlay.remove(); unlockModalBackground(); }
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay); lockModalBackground();
  }

  // ═══════════════ Boîtes de dialogue (toast / confirm) ══════════
  // Message bref ; un import long reste lisible plus longtemps et peut proposer « Annuler ».
  function toast(msg, ms, action) {
    // Même confirmation brève que dans tout le site (notifications.js) ; « Annuler » reste proposé après un import.
    if (window.GFNotify) window.GFNotify.toast(msg, { ms: ms, undo: action });
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
      const close = (v) => { overlay.remove(); unlockModalBackground(); resolve(v); };
      no.addEventListener("click", () => close(false)); yes.addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      actions.appendChild(no); actions.appendChild(yes); modal.appendChild(actions); overlay.appendChild(modal);
      document.body.appendChild(overlay); lockModalBackground(); yes.focus();
    });
  }

  // ═════════════════════ Montant de départ ══════════════════════
  // Réglage volontairement situé dans le tableur : il peut être corrigé à tout
  // moment sans repasser par un questionnaire ni effacer le reste des données.
  function openStartingBalance() {
    if (document.querySelector(".sheet-modal-overlay")) return;
    let profile = {};
    try { profile = JSON.parse(safeStore.getItem("personalFinanceDashboard.setupProfile") || "{}") || {}; } catch (_) { profile = {}; }
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentAmount = profile.startingCash !== undefined && profile.startingCash !== "" ? profile.startingCash : (profile.currentAmount || "");

    const overlay = document.createElement("div"); overlay.className = "sheet-modal-overlay";
    const modal = document.createElement("div"); modal.className = "sheet-modal sheet-starting-balance-modal";
    const title = document.createElement("h3"); title.textContent = "Configurer le solde de départ";
    const intro = document.createElement("p"); intro.className = "sheet-modal-intro";
    intro.textContent = "Le montant disponible au début du mois choisi. Il sert de base au solde restant, sans compter comme un revenu.";

    const amountLabel = document.createElement("label"); amountLabel.className = "sheet-field";
    amountLabel.append("Montant disponible (€)");
    const amount = document.createElement("input"); amount.type = "text"; amount.inputMode = "decimal"; amount.placeholder = "Ex. 1 250"; amount.value = String(currentAmount);
    amountLabel.appendChild(amount);

    const monthLabel = document.createElement("label"); monthLabel.className = "sheet-field";
    monthLabel.append("Mois de départ");
    const month = document.createElement("input"); month.type = "month"; month.value = /^\d{4}-\d{2}$/.test(String(profile.startingMonth || "")) ? profile.startingMonth : currentMonth;
    monthLabel.appendChild(month);

    const helper = document.createElement("p"); helper.className = "sheet-modal-helper";
    helper.textContent = "Laisse le montant vide puis enregistre pour retirer ce réglage.";
    const actions = document.createElement("div"); actions.className = "sheet-modal-actions sheet-modal-actions-row";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "button button-ghost"; cancel.textContent = "Annuler";
    const save = document.createElement("button"); save.type = "button"; save.className = "button button-primary"; save.textContent = "Enregistrer";
    const close = () => { overlay.remove(); unlockModalBackground(); };

    cancel.addEventListener("click", close);
    save.addEventListener("click", () => {
      const rawAmount = amount.value.trim();
      // Toujours enregistré au format « 1234.56 » : les lecteurs du profil utilisent parseFloat.
      const parsedAmount = rawAmount && !/%/.test(rawAmount) ? parseAmount(rawAmount) : NaN;
      const normalizedAmount = rawAmount ? String(parsedAmount) : "";
      const rawMonth = month.value;
      if (rawAmount && !Number.isFinite(parsedAmount)) { amount.focus(); return; }
      if (rawAmount && !/^\d{4}-\d{2}$/.test(rawMonth)) { month.focus(); return; }
      profile.startingCash = normalizedAmount;
      profile.currentAmount = normalizedAmount;
      profile.startingMonth = rawAmount ? rawMonth : "";
      profile.currentCashDate = rawAmount ? rawMonth + "-01" : "";
      try { safeStore.setItem("personalFinanceDashboard.setupProfile", JSON.stringify(profile)); } catch (_) {}
      clearInitialBalanceCells();
      if (rawAmount) applySetupProfile(profile);
      else { buildTable(); renderValues(); renderTabs(); scheduleSave(); }
      try { window.dispatchEvent(new Event("gfprofilechange")); } catch (_) {}
      try { if (window.__gfSync) window.__gfSync.markDirty(); } catch (_) {}
      notifyDashboard();
      close();
      toast(rawAmount ? tr("Solde de départ enregistré", "Starting balance saved") : tr("Solde de départ retiré", "Starting balance removed"));
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    actions.append(cancel, save);
    modal.append(title, intro, amountLabel, monthLabel, helper, actions);
    overlay.appendChild(modal); document.body.appendChild(overlay); lockModalBackground(); amount.focus();
  }

  function clearInitialBalanceCells() {
    const isInitialBalance = (value) => String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "solde initial";
    (state.sheets || []).forEach((sheet) => {
      if (!sheet || !sheet.cells) return;
      (sheet.rowHeaders || []).forEach((label, row) => {
        if (!isInitialBalance(label)) return;
        Object.keys(sheet.cells).forEach((key) => { if (+key.split(",")[0] === row) delete sheet.cells[key]; });
      });
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
      for (const sheet of state.sheets) { enforceMonthHeaders(sheet); compactRows(sheet); }
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
          for (const s of state.sheets) { enforceMonthHeaders(s); compactRows(s); }
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
    for (const s of state.sheets) { enforceMonthHeaders(s); compactRows(s); }
    state.activeSheetId = data.activeSheetId || state.sheets[0].id;
    state.active = { r: 0, c: 0 }; state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); scheduleSave();
    return true;
  }

  // Change de coffre local avant toute lecture ou écriture liée au compte.
  // Une sauvegarde en attente reste dans le coffre de son propriétaire initial.
  function switchFinancialOwner(ownerId, options) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!(options && options.discardCurrent) && state.sheets.length) {
      Store.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, sheets: serializeSheets(), activeSheetId: state.activeSheetId, savedAt: Date.now() }));
    }
    safeStore.setFinancialOwner(ownerId);
    state.sheets = [];
    state.activeSheetId = null;
    undoHistory.length = 0;
    redoHistory.length = 0;
    if (!load()) resetToDefaultSheets({ silent: true });
    state.active = { r: 0, c: 0 };
    state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    if (typeof window.clearDashboardForAccountSwitch === "function") window.clearDashboardForAccountSwitch();
    buildTable(); renderValues(); renderTabs(); recordHistory(); updateStatus();
    notifyDashboard();
    window.dispatchEvent(new CustomEvent("gfprofilechange"));
  }

  // ═══════════════════════════ Init ═══════════════════════════════
  function init() {
    container = document.getElementById("sheetApp"); if (!container) return;
    load();
    if (!state.sheets.length) { resetToDefaultSheets(); }
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      state.active.c = mobileMonth;
      state.range = { r0: state.active.r, c0: mobileMonth, r1: state.active.r, c1: mobileMonth };
    }
    // Migration : supprime les anciennes lignes de template si présentes
    migrateOldTemplate();
    const wrap = container.parentElement;
    const host = wrap && wrap.parentNode;
    if (host && !host.querySelector(".sheet-tabs.sheet-years")) {
      tabsEl = document.createElement("div"); tabsEl.className = "sheet-tabs sheet-years";
      host.insertBefore(tabsEl, wrap);
    } else { tabsEl = host && host.querySelector(".sheet-tabs.sheet-years"); }
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
    bind("btnSheetImport", () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt"; inp.addEventListener("change", () => { const f = inp.files[0]; if (!f) return;
      // CSV gratuit (relevé ou tableau) ; un classeur Excel / ODS, relevé compris, demande l’offre Plus quand l’abonnement est actif.
      const plans = window.GFSubscriptions; if (plans && typeof plans.requiresFile === "function" && !plans.requiresFile(f)) return;
      // Un relevé bancaire CSV est lu à part (regroupement par catégorie et par mois) ; sinon import Excel classique.
      const bank = window.GFBankImport ? window.GFBankImport.handle(f).catch(() => false) : Promise.resolve(false);
      bank.then((handled) => { if (handled) return; Promise.resolve(importXlsx(f)).then((ok) => { try { window.MeuniLoader && window.MeuniLoader.done(ok ? "Fichier importé." : undefined); } catch (e) {} }); }); }); inp.click(); });
    bind("btnSheetClear", async () => { if (await confirmDialog(tr("Vider la feuille ?", "Clear this sheet?"))) { const sheet = activeSheet(); sheet.cells = {}; sheet.rowHeaders = []; sheet.rows = DEFAULT_ROWS; enforceMonthHeaders(sheet); buildTable(); renderValues(); scheduleSave(); toast(tr("Feuille vidée.", "Sheet cleared."), 7000, { label: tr("Annuler", "Undo"), run: undo }); } });
    bind("btnSheetDeleteRow", deleteSelectedRow);
    bind("btnSheetCalc", openCalculator);
    bind("btnSheetUndo", undo);
    bind("btnSheetRedo", redo);
    container.addEventListener("paste", (e) => { if (state.editing) return; const text = (e.clipboardData || window.clipboardData).getData("text"); if (text) { e.preventDefault(); paste(text); } });
    container.addEventListener("copy", (e) => { if (state.editing) return; e.clipboardData.setData("text/plain", copySelection()); e.preventDefault(); });
    // À l'ouverture, l'accueil lit le tableur tout de suite (pas d'attente groupée : rien n'est en cours de saisie).
    notifyDashboard(0);
    showCurrentYearOnce();
  }

  // === Crée les feuilles par défaut avec les années ===
  function getDefaultYearNames() {
    var currentYear = new Date().getFullYear();
    var prevYear = currentYear - 1;
    return [String(prevYear), String(currentYear)];
  }
  function resetToDefaultSheets(options) {
    state.sheets = [];
    var yearNames = getDefaultYearNames();
    yearNames.forEach(function(name) {
      var sheet = newSheet(name);
    });
    if (state.sheets.length) state.activeSheetId = state.sheets[0].id;
    state.active = { r: 0, c: 0 };
    state.range = { r0: 0, c0: 0, r1: 0, c1: 0 };
    buildTable(); renderValues(); renderTabs(); if (!(options && options.silent)) scheduleSave(); notifyDashboard();
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

  // Les choix faits pendant la configuration deviennent des lignes concrètes
  // du tableur, afin que « Comptes utilisés » et le montant de départ ne se
  // perdent pas après la fin du tutoriel.
  function applySetupProfile(profile) {
    profile = profile || {};
    var startMonth = String(profile.startingMonth || "");
    var yearMatch = startMonth.match(/^(19\d{2}|20\d{2}|21\d{2})-(\d{2})$/);
    var target = yearMatch && state.sheets.find(function(sheet) { return String(sheet.name || "") === yearMatch[1]; });
    target = target || activeSheet();
    if (!target) return false;

    function sameLabel(a, b) { return String(a || "").trim().toLocaleLowerCase("fr") === String(b || "").trim().toLocaleLowerCase("fr"); }
    function ensureRow(label) {
      var found = (target.rowHeaders || []).findIndex(function(value) { return sameLabel(value, label); });
      if (found >= 0) return found;
      var row = contentRowCount(target);
      target.rowHeaders[row] = label;
      target.rows = row + 1;
      return row;
    }

    var changed = false;
    var amount = profile.currentAmount;
    if (amount === "" || amount === undefined || amount === null) amount = profile.startingCash;
    if (amount !== "" && amount !== undefined && amount !== null && Number.isFinite(parseAmount(amount))) {
      var initialRow = ensureRow("Solde initial");
      var monthIndex = yearMatch ? Math.max(0, Math.min(11, Number(yearMatch[2]) - 1)) : 0;
      target.cells[cellKey(initialRow, monthIndex)] = { raw: String(amount) };
      changed = true;
    }

    String(profile.accounts || "").split(/[;,\n]+/).map(function(value) { return value.trim(); }).filter(Boolean).forEach(function(account) {
      var label = "Compte — " + account;
      var exists = (target.rowHeaders || []).some(function(value) { return sameLabel(value, label); });
      if (!exists) { ensureRow(label); changed = true; }
    });

    if (!changed) return false;
    state.activeSheetId = target.id;
    compactRows(target);
    buildTable(); renderValues(); renderTabs(); scheduleSave();
    return true;
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
      if (/solde|depart|restant|reste|disponible|compte|livret|pea|bourse|placement|wallet|revolut|boursobank|bourso|banque/.test(key)) return "ignore";
      if (/salaire|revenu|prime|allocation|apl|caf|rsa|remuneration|paie|paye|indemnite|remboursement/.test(key)) return "income";
      if (/depense|epargne|economie|loyer|charge|carte|facture|abonnement|frais|impot|taxe|assurance|transport|course|restaurant|achat|credit/.test(key)) return "expense";
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
    try { if (window.GFHome && typeof window.GFHome.totalBalance === "function") { var hb = window.GFHome.totalBalance(); if (typeof hb === "number" && isFinite(hb)) remaining = hb; } } catch (e) {}

    function fmt(v) {
      if (typeof v !== "number" || !Number.isFinite(v)) return "—";
      return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " \u20ac";
    }

    balStart.textContent = hasStartingCash ? fmt(startingCash) : "Facultatif";
    if (balRemaining) balRemaining.textContent = fmt(remaining);
    try { var cardS = document.getElementById("balCardStart"), noteS = cardS && cardS.querySelector(".balance-note"), editS = document.getElementById("startingBalanceEdit"), noteR = document.querySelector("#balCardRemaining .balance-note"), labR = document.querySelector("#balCardRemaining .balance-label"); if (cardS) cardS.classList.toggle("is-empty", !hasStartingCash); if (noteS) noteS.textContent = hasStartingCash ? "Avant revenus, dépenses et épargne" : "Ajoute-le pour connaître ton vrai solde disponible."; if (editS) editS.textContent = hasStartingCash ? "Modifier" : "Ajouter"; if (labR) { var lastM = ""; try { lastM = window.GFHome && window.GFHome.totalBalanceMonth ? window.GFHome.totalBalanceMonth() : ""; } catch (e) {} labR.textContent = (hasStartingCash ? tr("Solde disponible", "Available balance") : tr("Solde calculé", "Calculated balance")) + (lastM ? tr(" à fin ", ", end of ") + lastM : ""); } if (noteR) noteR.textContent = hasStartingCash ? "Départ + revenus − dépenses − épargne" : "Revenus − dépenses − épargne des mois saisis"; } catch (e) {}
  }

  // Sources proposées aux objectifs : chaque ligne chiffrée peut alimenter
  // automatiquement un objectif, tout en gardant la liaison facultative.
  function getObjectiveSources() {
    var sources = [];
    (state.sheets || []).forEach(function(sheet) {
      if (!sheet || !sheet.cells) return;
      var computed = recompute(sheet.cells);
      (sheet.rowHeaders || []).forEach(function(label, row) {
        label = String(label || "").trim();
        if (!label) return;
        var total = 0, hasValue = false;
        for (var col = 0; col < Math.max(12, sheet.cols || 0); col++) {
          var result = computed[row + "," + col];
          if (result && !result.error && typeof result.value === "number" && Number.isFinite(result.value)) {
            total += Math.abs(result.value); hasValue = true;
          }
        }
        if (hasValue) {
          sources.push({ id: sheet.id + ":" + row, label: label + " — " + sheet.name, value: total, line: label, year: sheet.name, month: -1 });
          // Liaison à un mois précis : la valeur de la cellule de ce mois.
          for (var mc = 0; mc < 12; mc++) {
            var mr = computed[row + "," + mc];
            if (mr && !mr.error && typeof mr.value === "number" && Number.isFinite(mr.value) && mr.value !== 0) {
              var mname = (sheet.headers && sheet.headers[mc]) || ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][mc];
              sources.push({ id: sheet.id + ":" + row + ":" + mc, label: label + " — " + mname + " " + sheet.name, value: Math.abs(mr.value), line: label, year: sheet.name, month: mc, monthName: mname });
            }
          }
        }
      });
    });
    return sources;
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

  window.FinanceSheet = { init, recompute, saveNow, openCalculator, openStartingBalance, getSnapshot, loadSnapshot, switchFinancialOwner, buildWorkbook, buildTables, importXlsx, exportXlsx, clearDemoDataFS, parseAmount, updateSheetBalanceCards, getObjectiveSources, applySetupProfile, migrateOldTemplate, resetToDefaultSheets, VERSION,
    // Outils d’import exposés pour les tests (aucun effet sur le tableur).
    _import: { planImport, parseMonthHeader, convertFormula, buildExportWorkbook, mergeSheetData, sanitizeSheetName, guessSeparator, decodeText } };
  // Hook appelé après import / édition / création de feuille pour rafraîchir le dashboard.
  let dashTimer = null;
  function notifyDashboard(delay) {
    if (dashTimer) clearTimeout(dashTimer);
    dashTimer = setTimeout(() => { try { if (typeof window.syncDashboardFromFinanceSheet === "function") window.syncDashboardFromFinanceSheet({silent:true}); } catch (e) {} }, typeof delay === "number" ? delay : 350);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

