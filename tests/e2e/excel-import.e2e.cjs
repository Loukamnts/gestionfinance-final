// Test de bout en bout de l’import / export Excel sur le site construit (dist/).
// Lancement : npm run -s build && node tests/e2e/excel-import.e2e.cjs
// (hors de « node --test tests/*.test.cjs » : il lui faut Chromium et Playwright).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.join(__dirname, '..', '..');
const dist = path.join(root, 'dist');
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(p); } catch (e) {} }
  return null;
}
const pw = loadPlaywright();
if (!pw || !fs.existsSync(path.join(dist, 'app.html'))) { console.log('SKIP : Playwright ou dist/ absent'); process.exit(0); }

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = Object.fromEntries((cfg.rewrites || []).map((r) => [r.source, r.destination]));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (rewrites[u]) u = rewrites[u]; if (u === '/') u = '/index.html';
  let f = path.join(dist, path.normalize(u)); if (!f.startsWith(dist)) { r.writeHead(403); return r.end(); }
  if (!path.extname(f)) f += '.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});

const XLSX_SRC = fs.readFileSync(path.join(root, 'third_party/sheetjs/xlsx-0.20.3.full.min.js'), 'utf8');
const FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

(async () => {
  await new Promise((ok) => server.listen(0, ok));
  const base = 'http://localhost:' + server.address().port;
  const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const failures = [];
  try {
    for (const [width, scheme] of [[1280, 'light'], [402, 'dark']]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR', colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/tableur');
      await page.waitForFunction(() => window.FinanceSheet && window.getDashboardSharingSnapshot, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      // Classeurs fabriqués dans la page avec la même version de SheetJS que le site.
      await page.addScriptTag({ content: 'if(!window.XLSX){' + XLSX_SRC + '}' });
      const result = await page.evaluate(async (FR) => {
        const FS = window.FinanceSheet, out = {};
        const make = (aoa, extra) => { const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(aoa); Object.assign(ws, extra || {}); XLSX.utils.book_append_sheet(wb, ws, '2026'); return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'budget.xlsx'); };
        const sync = async () => { window.syncDashboardFromFinanceSheet({ silent: true }); await new Promise((r) => setTimeout(r, 200)); return window.getDashboardSharingSnapshot().months; };
        // 1. Formules : B5 = B2+B3+B4 reste « janvier », pas « février ».
        await FS.importXlsx(make([['', ...FR], ['Salaire', ...Array(12).fill(2500)], ['Loyer', ...Array(12).fill(-800)], ['Courses', ...Array(12).fill(-300)], ['Reste']], { B5: { t: 'n', f: 'B2+B3+B4', v: 1400 }, '!ref': 'A1:M5' }), { mode: 'replace', silent: true });
        const s1 = FS.getSnapshot().sheets[0];
        out.formula = s1.cells['3,0'] && s1.cells['3,0'].raw;
        out.formulaValue = FS.recompute(s1.cells)['3,0'].value;
        out.gridText = (document.querySelector('td.cell[data-r="3"][data-c="0"] .cv') || {}).textContent;
        // 2. Données seulement en janvier : un mois « janvier 2026 », pas « janvier 2001 ».
        await FS.importXlsx(make([['', ...FR], ['Salaire', 2500], ['Loyer', -800]]), { mode: 'replace', silent: true });
        const m2 = await sync();
        out.janOnly = m2.map((m) => m.label + ':' + m.salary + ':' + m.expenses);
        // 3. « Autres » sous Revenus et sous Dépenses : les deux montants comptent.
        await FS.importXlsx(make([['', ...FR], ['Revenus'], ['Salaire', 2500], ['Autres', 200], ['Dépenses'], ['Loyer', -800], ['Autres', -50]]), { mode: 'replace', silent: true });
        const m3 = await sync();
        out.dup = m3[0] && [m3[0].salary, m3[0].expenses];
        // 4. Libellés reconnus par le tableau de bord.
        out.rules = ['Retraite', 'Freelance', 'Loyer perçu', 'Refund', 'Carte Revolut', 'Groceries', 'Mutuelle', 'Freebox', 'UberEats', 'Total Energies', 'Total', 'Rente', 'Parents'].map((l) => l + '=' + (window.GFClassifyRow(l) || '?'));
        // 5. « Remplacer tout » puis Annuler rend l’état d’avant.
        const before = JSON.stringify(FS.getSnapshot().sheets.map((s) => [s.name, s.cells, s.rowHeaders]));
        await FS.importXlsx(make([['', ...FR], ['Nouveau', 1]]), { mode: 'replace' });
        await new Promise((r) => setTimeout(r, 100));
        const undoBtn = document.querySelector('.gfh-toast-act');
        out.undoButton = !!undoBtn;
        if (undoBtn) undoBtn.click();
        out.undoRestored = JSON.stringify(FS.getSnapshot().sheets.map((s) => [s.name, s.cells, s.rowHeaders])) === before;
        // 6. Un fichier vide ne remplace rien.
        out.emptyRefused = (await FS.importXlsx(new File([], 'vide.xlsx'), { mode: 'replace', silent: true })) === false && JSON.stringify(FS.getSnapshot().sheets.map((s) => [s.name, s.cells, s.rowHeaders])) === before;
        // 7. Export puis import : identique.
        const snap = FS.getSnapshot();
        snap.sheets = [{ id: 'a', name: '2026', cells: { '0,0': { raw: '2500,50' }, '1,0': { raw: '=A1-10' }, '2,1': { raw: '007' }, '3,0': { raw: '=SOMME(A1:A2)' } }, rowHeaders: ['Salaire', '', 'Code', 'Total'], rows: 4, cols: 12 }];
        FS.loadSnapshot(snap);
        let wb; const orig = XLSX.writeFile; XLSX.writeFile = (w) => { wb = w; }; FS.exportXlsx(); XLSX.writeFile = orig;
        await FS.importXlsx(new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'tableau-finances.xlsx'), { mode: 'replace', silent: true });
        const back = FS.getSnapshot().sheets[0];
        out.roundTrip = JSON.stringify([back.name, back.cells, back.rowHeaders]) === JSON.stringify(['2026', snap.sheets[0].cells, snap.sheets[0].rowHeaders]);
        return out;
      }, FR);
      try {
        assert.equal(result.formula, '=A1+A2+A3');
        assert.equal(result.formulaValue, 1400);
        assert.match(result.gridText || '', /1\s?400/);
        assert.equal(result.janOnly.length, 1); assert.match(result.janOnly[0], /^janvier 2026:2500:-800$/);
        assert.deepEqual(result.dup, [2700, -850]);
        assert.deepEqual(result.rules, ['Retraite=Salaire', 'Freelance=Salaire', 'Loyer perçu=Salaire', 'Refund=Salaire', 'Carte Revolut=Dépense', 'Groceries=Dépense', 'Mutuelle=Dépense', 'Freebox=Dépense', 'UberEats=Dépense', 'Total Energies=Dépense', 'Total=Ignorer', 'Rente=Salaire', 'Parents=?']);
        assert(result.undoButton && result.undoRestored, 'Annuler après Remplacer tout');
        assert(result.emptyRefused, 'fichier vide refusé');
        assert(result.roundTrip, 'aller-retour sans perte');
        await page.goto(base + '/accueil'); await page.waitForTimeout(2500);
        assert.deepEqual(errors, []);
        console.log('ok', width, scheme);
      } catch (e) { failures.push(width + ' ' + scheme + ': ' + e.message); console.log(JSON.stringify(result, null, 1)); }
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log('excel-import e2e : tout est bon');
})();
