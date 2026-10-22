const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const themes = read('theme-directions.css');
const finishing = read('finishing.css');
const home = read('home.js');

test('one shared « selected » token pair, defined for light and dark', () => {
  const light = themes.match(/body\[data-theme="moulin"\]\[data-mode="light"\]\[data-palette\] \{[\s\S]*?\n\}/)[0];
  const dark = themes.match(/body\[data-theme="moulin"\]\[data-mode="dark"\]\[data-palette\] \{[\s\S]*?\n\}/)[0];
  for (const block of [light, dark]) {
    assert.match(block, /--sel-bg:var\(--accent-fill\)/);
    assert.match(block, /--sel-fg:var\(--on-accent-fill\)/);
  }
});

test('every tab / segment / pill takes its selected colours from the shared tokens', () => {
  const rule = finishing.match(/body\[data-theme\] :is\(([\s\S]*?)\)\{\s*background:var\(--sel-bg\)!important;border-color:var\(--sel-bg\)!important;color:var\(--sel-fg\)!important/);
  assert.ok(rule, 'shared selected rule missing');
  for (const sel of ['.settings-hub-item[aria-current="true"]', '.desktop-nav-link.is-active', '.personal-workspace-link.is-active', '.objectives-tabs button.is-active', '.gfc-views button[aria-pressed="true"]', '.bottom-nav-btn.is-active', '.mobile-finance-summary-tabs button[aria-selected="true"]']) {
    assert.ok(rule[1].includes(sel), sel + ' missing from the shared list');
  }
  assert.doesNotMatch(finishing, /\.gfc-views button\[aria-pressed="true"\]\{background/);
});

test('settings page never highlights a main-navigation entry and has a phone title', () => {
  assert.match(read('finishing.js'), /function navPage\(x\)\{var page=document\.body\.dataset\.page;if\(page==="settings"\)return false;/);
  assert.match(html, /<h2 class="settings-mobile-title">Paramètres<\/h2>/);
  assert.match(finishing, /\.settings-mobile-title\{display:block/);
});

test('spreadsheet formula bar and new-rule field have accessible names (translated)', () => {
  assert.match(html, /id="fxInput" type="text" aria-label="Barre de formule"/);
  assert.match(html, /id="customRuleName" aria-label="Nom de la nouvelle règle"/);
  const i18n = read('i18n.js');
  assert.match(i18n, /"Barre de formule": "Formula bar"/);
  assert.match(i18n, /"Nom de la nouvelle règle": "New rule name"/);
});

test('« Ajouter » dialog ties its error to the amount field', () => {
  assert.match(home, /form\.append\(h,typeRow,amtL,err,lineBox/);
  assert.match(home, /err\.id="gfhQuickErr"/);
  assert.match(home, /setAttribute\("aria-describedby","gfhQuickErr"\)/);
  assert.match(home, /setAttribute\("aria-invalid","true"\)/);
  assert.match(home, /fail\(t2\("Indique un montant positif\.","Enter a positive amount\."\),amtL,amt\)/);
});

test('main navigation uses real links that match the page router', () => {
  const paths = JSON.parse(html.match(/const PAGE_PATHS=(\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":'));
  const links = [...html.matchAll(/<a [^>]*href="(\/[a-z]+)"[^>]*data-page="(\w+)"/g)];
  assert.ok(links.length >= 12, 'expected sidebar, top nav, bottom bar and gear links');
  for (const [, href, page] of links) assert.equal(paths[page], href, page);
  assert.match(html, /event\.metaKey\|\|event\.ctrlKey/);
  assert.match(read('finishing.js'), /e\.metaKey\|\|e\.ctrlKey/);
});
