// Historiques d'imports aléatoires (reproductibles) : après « Repartir de ce relevé » ou « Remplacer », le tableur égale toujours le relevé.
const test = require('node:test');
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const enc = s => Buffer.from(s, 'utf8');
function setup() {
  const mem = {}; let snap = { sheets: [{ id: 'y', name: '2026', cells: {}, rowHeaders: ['Salaire', 'Courses', 'Loyer', 'Abonnements'], rows: 9, cols: 12 }] };
  const c = { window: { safeStore: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } }, FinanceSheet: { getSnapshot: () => snap, loadSnapshot: s => { snap = s; } } }, TextDecoder, Intl, document: {} };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, 'bank-import.js'), 'utf8'), c);
  const B = c.window.GFBankImport;
  const cell = (n, mi) => { const sh = snap.sheets[0]; const r = sh.rowHeaders.indexOf(n); const v = sh.cells[r + ',' + mi]; return v ? Number(v.raw) : 0; };
  return { B, cell };
}
const CSV='Date;Libellé;Montant\n05/09/2026;VIR SEPA SALAIRE ACME;1600,00\n12/09/2026;CARTE CARREFOUR CITY;-45,20\n20/09/2026;CARTE LIDL;-30,00\n20/09/2026;CARTE LIDL;-30,00\n01/09/2026;PRLV AGENCE LOYER;-735,00\n10/09/2026;PRLV SEPA NETFLIX;-13,49\n05/10/2026;VIR SEPA SALAIRE ACME;1600,00\n18/10/2026;CARTE CARREFOUR CITY;-60,00\n';
const EXP={Salaire:{8:1600,9:1600},Courses:{8:105.2,9:60},Loyer:{8:735},Abonnements:{8:13.49}};

let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function parse(B, csv) { return B.parse(B._decode(enc(csv))); }
function step(env, kind) {
  const { B } = env; const ops = () => parse(B, CSV);
  if (kind === 'full-replace') B.write(B.summarize(ops()), 'replace');
  else if (kind === 'full-add') B.write(B.summarize(ops()), 'add');
  else if (kind === 'forced-replace' || kind === 'forced-add') { const s = B.summarize(ops()); const inc = {}; s.rows.forEach(r => { if (r.status === 'dup') inc[r.fp] = true; }); B.write(B.summarize(ops(), {}, { inc }), kind === 'forced-add' ? 'add' : 'replace'); }
  else if (kind === 'fresh') B.write(B.summarize(ops()), 'fresh');
}
const exact = env => { for (const n in EXP) for (const m in EXP[n]) if (Math.abs(env.cell(n, m) - EXP[n][m]) > 0.005) return false; return true; };
test('Après n’importe quel historique d’imports, « Repartir de ce relevé » puis « Remplacer » donnent exactement le relevé', () => {
  const kinds = ['full-replace', 'full-add', 'forced-replace', 'forced-add']; const bad = [];
  for (let i = 0; i < 200; i++) {
    const env = setup(); const hist = []; const L = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < L; k++) { const kd = kinds[Math.floor(rnd() * kinds.length)]; hist.push(kd); step(env, kd); }
    const copy = hist.join('>');
    step(env, 'full-replace'); if (!exact(env)) bad.push('remplacer ' + copy);
    step(env, 'fresh'); if (!exact(env)) bad.push('repartir ' + copy);
    step(env, 'full-replace'); if (!exact(env)) bad.push('remplacer après repartir ' + copy);
  }
  require('node:assert').deepEqual(bad.slice(0, 5), []);
});
