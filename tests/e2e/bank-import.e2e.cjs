// Test de bout en bout de l’assistant d’import de relevé bancaire sur le site construit (dist/).
// Lancement : npm run -s build && node tests/e2e/bank-import.e2e.cjs
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

// Relevés inventés (aucune donnée réelle)
const A = 'Date;Libellé;Montant;Statut\n02/09/2026;CARTE CARREFOUR CITY;-45,20;\n03/09/2026;VIR SEPA SALAIRE ACME;2150,00;\n05/09/2026;PRLV SEPA NETFLIX;-13,49;\n';
const B = 'Date;Libellé;Montant;Statut\n02/09/2026;CARTE CARREFOUR CITY;-45,20;\n03/09/2026;VIR SEPA SALAIRE ACME;2150,00;\n05/09/2026;PRLV SEPA NETFLIX;-13,49;\n09/09/2026;CARTE BOUTIQUE XYZ;-25,00;\n09/09/2026;CARTE BOUTIQUE XYZ;-12,00;\n10/09/2026;VIR M DUPONT;120,00;\n11/09/2026;VIREMENT INTERNE VERS COMPTE EPARGNE;-200,00;\n12/09/2026;TOP-UP BY *1234;100,00;\n13/09/2026;CARTE LIDL;-33,10;EN ATTENTE\n14/09/2026;CARTE LIDL;-27,80;\n';

(async () => {
  await new Promise((ok) => server.listen(0, ok));
  const base = 'http://localhost:' + server.address().port;
  const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const failures = [];
  try {
    for (const [width, scheme, locale] of [[1280, 'light', 'fr-FR'], [375, 'dark', 'fr-FR'], [320, 'light', 'en-GB']]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/tableur');
      await page.waitForFunction(() => window.FinanceSheet && window.GFBankImport, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      if (locale === 'en-GB') await page.evaluate(() => { try { window.GFI18n.setLanguage('en'); } catch (e) {} });
      const dlg = (sel) => page.locator('dialog[open] ' + (sel || ''));
      const primary = () => page.locator('dialog[open] .gfb-actions button[type=submit]');
      const step = () => page.evaluate(() => { const s = document.querySelector('dialog[open] .gfb-pane:not([hidden])'); return s ? s.dataset.step : ''; });
      const noOverflow = async (what) => { const o = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? [d.scrollWidth, d.clientWidth, (d.querySelector('.gfb-body') || {}).scrollWidth, (d.querySelector('.gfb-body') || {}).clientWidth] : null; }); assert(o && o[0] <= o[1] + 1 && o[2] <= o[3] + 1, 'débordement horizontal (' + what + ') ' + JSON.stringify(o)); };
      try {
        // 1er relevé : étapes reconnu → liste → (rien à classer) → résumé ; rien n’est écrit avant « Importer »
        const before = await page.evaluate(() => JSON.stringify(window.FinanceSheet.getSnapshot().sheets.map((s) => [s.name, s.cells])));
        await page.evaluate((c) => { window.__h = window.GFBankImport.handle(new File([c], 'a.csv', { type: 'text/csv' })); }, A);
        await dlg('.gfb-pane:not([hidden])').waitFor();
        assert.equal(await step(), 'found'); await noOverflow('found');
        await primary().click(); assert.equal(await step(), 'list');
        assert.equal(await page.locator('dialog[open] .gfb-op').count(), 3, 'trois opérations dans la liste');
        assert.equal(await page.evaluate(() => JSON.stringify(window.FinanceSheet.getSnapshot().sheets.map((s) => [s.name, s.cells]))), before, 'rien n’est écrit avant la validation');
        await primary().click(); assert.equal(await step(), 'confirm');
        await primary().click(); await page.waitForSelector('dialog[open]', { state: 'detached' });
        assert(await page.locator('#gfhToast .gfh-toast-act').count() === 1, 'bouton Annuler après l’import');
        const filled = await page.evaluate(() => JSON.stringify(window.FinanceSheet.getSnapshot().sheets.map((s) => [s.name, s.cells])));
        assert.notEqual(filled, before);
        // Annuler rend l’état d’avant
        await page.locator('#gfhToast .gfh-toast-act').click(); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => JSON.stringify(window.FinanceSheet.getSnapshot().sheets.map((s) => [s.name, s.cells]))), before, 'annulation de l’import');
        // Même relevé de nouveau, puis le 2e relevé qui le chevauche
        await page.evaluate((c) => { window.__h = window.GFBankImport.handle(new File([c], 'a.csv', { type: 'text/csv' })); }, A);
        for (let i = 0; i < 3; i++) await primary().click();
        await page.waitForSelector('dialog[open]', { state: 'detached' });
        await page.evaluate((c) => { window.__h = window.GFBankImport.handle(new File([c], 'b.csv', { type: 'text/csv' })); }, B);
        await dlg('.gfb-pane:not([hidden])').waitFor();
        await primary().click(); assert.equal(await step(), 'list');
        const statuses = await page.evaluate(() => ({ dup: document.querySelectorAll('dialog[open] .gfb-op.is-dup').length, todo: document.querySelectorAll('dialog[open] .gfb-op.is-todo').length, internal: document.querySelectorAll('dialog[open] .gfb-chip.is-int').length, sw: document.querySelectorAll('dialog[open] .gfb-swi').length }));
        assert.deepEqual(statuses, { dup: 3, todo: 3, internal: 1, sw: 3 });
        const head = await page.locator('dialog[open] .gfb-pane[data-step=list]').innerText();
        assert(/Ne sera pas importé|Will not be imported/.test(head) && /(attente|pending)/i.test(head) && /(Déjà importée|Already imported)/.test(head), 'bloc « Ne sera pas importé » avec les raisons : ' + head);
        await noOverflow('list');
        // Une opération déjà importée peut être forcée
        await page.locator('dialog[open] .gfb-sw').first().click();
        assert.equal(await page.locator('dialog[open] .gfb-swi:checked').count(), 1);
        await page.locator('dialog[open] .gfb-sw').first().click();
        // Changer la catégorie d’une opération (fenêtre de choix), puis Échap la referme sans fermer l’assistant
        await page.locator('dialog[open] .gfb-chip.is-todo').first().click();
        await page.locator('dialog.gfb-pick').waitFor();
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        assert.equal(await page.locator('dialog.gfb-pick').count(), 0); assert.equal(await step(), 'list');
        // À classer, une par une
        await primary().click(); assert.equal(await step(), 'unknown'); await noOverflow('unknown');
        assert.match(await page.locator('dialog[open] .gfb-unk-n').innerText(), /^1\s(sur|of)\s2$/);
        await page.locator('dialog[open] .gfb-choice').first().click(); // 1re carte : répondue
        assert.match(await page.locator('dialog[open] .gfb-unk-n').innerText(), /^2\s(sur|of)\s2$/);
        await primary().click(); // 2e carte : passer
        // Mois déjà remplis : on doit choisir
        assert.equal(await step(), 'months'); await noOverflow('months');
        assert.equal(await page.locator('dialog[open] .gfb-mode input:checked').count(), 0, 'rien de présélectionné');
        assert.equal(await primary().isDisabled(), true, 'Continuer demande un choix');
        await page.locator('dialog[open] .gfb-mode input[value=add]').check();
        assert.equal(await primary().isDisabled(), false);
        await primary().click(); assert.equal(await step(), 'confirm'); await noOverflow('confirm');
        await primary().click(); await page.waitForSelector('dialog[open]', { state: 'detached' });
        // Le tableur est ouvert et le virement interne est dans l’épargne
        const sav = await page.evaluate(() => { const s = window.FinanceSheet.getSnapshot().sheets.find((x) => x.name === '2026'); const r = s.rowHeaders.findIndex((h) => /pargne|savings/i.test(h)); return r < 0 ? null : s.cells[r + ',8'] && s.cells[r + ',8'].raw; });
        assert(sav && Math.abs(Number(sav)) === 200, 'virement interne dans la ligne Épargne : ' + sav);
        // Fichier inconnu : guide de téléchargement
        await page.evaluate(() => { window.__h = window.GFBankImport.handle(new File(['foo;bar\n1;2\n3;4\n'], 'x.csv', { type: 'text/csv' })); });
        await dlg('.gfb-bank').first().waitFor();
        assert(await page.locator('dialog[open] .gfb-bank').count() >= 12);
        assert.match(await page.locator('dialog[open]').innerText(), /(Les intitulés peuvent varier|Labels may vary)/);
        await noOverflow('guide');
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        assert.deepEqual(errors, []);
        console.log('ok', width, scheme, locale);
      } catch (e) { failures.push(width + ' ' + scheme + ' ' + locale + ' : ' + e.message); }
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log('bank-import e2e : tout est bon');
})();
