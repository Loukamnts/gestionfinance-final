// Revue Apple HIG : texte qui suit la taille du texte de l’iPhone, mode « Automatique », cibles tactiles, langue de la page publique.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const cssFiles = fs.readdirSync(root).filter(f => f.endsWith('.css'));
const htmlFiles = ['index.html', 'presentation.html', 'conditions.html', 'confidentialite.html', 'mentions-legales.html', '404.html'];

function styleBlocks(file) {
  const s = read(file);
  return file.endsWith('.css') ? [s] : [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
}

test('aucune taille de texte en px dans les feuilles de style (tout suit la taille du texte), sauf liste blanche', () => {
  const offenders = [];
  // Liste blanche : champs de saisie (16 px minimum pour que Safari ne zoome pas), écrit max(16px, 1rem).
  const allowed = /max\(\s*16px\s*,\s*1rem\s*\)/g;
  for (const file of [...cssFiles, ...htmlFiles]) {
    for (const block of styleBlocks(file)) {
      const css = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(allowed, '');
      for (const m of css.matchAll(/(?<![\w-])(font-size|font|line-height)\s*:\s*([^;}]*\d(?:\.\d+)?px[^;}]*)/g)) offenders.push(`${file}: ${m[1]}:${m[2].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('la racine reprend la taille de texte système d’iOS (Dynamic Type) dans l’app et les pages publiques', () => {
  assert.match(read('index.html'), /@supports\s*\(font:\s*-apple-system-body\)\s*\{\s*html\s*\{\s*font:\s*-apple-system-body\s*\}\s*\}/);
  assert.match(read('public.css'), /@supports\s*\(font:\s*-apple-system-body\)\s*\{\s*html\s*\{\s*font:\s*-apple-system-body\s*\}\s*\}/);
  assert.match(read('ios-fix.js'), /max\(16px, 1rem\)/);
});

function runBootScript(stored, systemDark) {
  const html = read('index.html');
  const script = html.match(/<script>\s*\/\* Mode clair\/sombre[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
  const metas = [{ name: 'theme-color', content: '', removeAttribute() {} }, { name: 'color-scheme', content: '', removeAttribute() {} }];
  const root = { dataset: {} };
  const win = {
    localStorage: { getItem: k => (k === 'personalFinanceDashboard.mode' ? stored : null) },
    matchMedia: () => ({ matches: systemDark }),
  };
  const doc = { documentElement: root, body: { dataset: {} }, querySelectorAll: () => metas };
  vm.runInNewContext(script, { window: win, document: doc, MutationObserver: undefined });
  return { mode: root.dataset.mode, body: doc.body.dataset.mode, scheme: metas[1].content, theme: metas[0].content };
}

test('mode « auto » : suit le téléphone ; un choix clair/sombre enregistré est conservé', () => {
  assert.equal(runBootScript(null, true).mode, 'dark');
  assert.equal(runBootScript(null, false).mode, 'light');
  assert.equal(runBootScript('auto', true).mode, 'dark');
  assert.equal(runBootScript('auto', false).mode, 'light');
  assert.equal(runBootScript('light', true).mode, 'light');
  assert.equal(runBootScript('dark', false).mode, 'dark');
  assert.equal(runBootScript('dark', false).scheme, 'dark');
});

test('l’app enregistre « auto », réagit au changement du téléphone et propose trois choix', () => {
  const html = read('index.html');
  assert.match(html, /setMode\(mode\)\{ if\(!\["dark","light","auto"\]\.includes\(mode\)\) return;/);
  assert.match(html, /STORAGE_KEYS\.mode,state\.appearance\.modePref/);
  assert.match(html, /matchMedia\("\(prefers-color-scheme: dark\)"\)[\s\S]{0,200}addEventListener\("change",onChange\)/);
  assert.match(html, /data-mode-option="auto"/);
  assert.match(read('menus.js'), /Automatique/);
  assert.match(read('menus.css'), /\.gfa-layout\{display:none\}/);
});

test('page de présentation : un seul dictionnaire téléchargé, emplacement du sélecteur de langue réservé, polices préchargées', () => {
  const manager = read('i18n-manager.js');
  assert.doesNotMatch(manager, /Promise\.all\(AVAILABLE_LANGS/);
  assert.match(manager, /await loadDictionary\(currentLang\)/);
  const page = read('presentation.html');
  assert.match(page, /id="language-selector"/);
  assert.match(page, /rel="preload"[^>]*bricolage-grotesque-latin-700-normal\.woff2/);
  assert.match(page, /rel="preload"[^>]*instrument-sans-latin-400-normal\.woff2/);
});

test('cibles tactiles : la croix de l’année est un bouton à part, la pastille « Plus » est un coin', () => {
  assert.match(read('sheet.js'), /tabsEl\.appendChild\(delX\)/);
  const css = read('finishing.css');
  assert.match(css, /#btnSheetExport \.gfs-lock\{position:absolute;top:-6px;right:-6px/);
  assert.match(css, /\.sheet-tab-x\{[^}]*width:44px!important;height:44px!important/);
});
