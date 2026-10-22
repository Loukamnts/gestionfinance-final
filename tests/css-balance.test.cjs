// Une accolade oubliée dans une feuille de style fait tomber toutes les règles qui suivent : chaque feuille doit être équilibrée.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('chaque feuille de style a autant d’accolades ouvrantes que fermantes', () => {
  const bad = [];
  for (const f of fs.readdirSync(root).filter(n => n.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(root, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"[^"\n]*"|'[^'\n]*'/g, '');
    let depth = 0, neg = false;
    for (const c of css) { if (c === '{') depth++; else if (c === '}') { depth--; if (depth < 0) neg = true; } }
    if (depth !== 0 || neg) bad.push(`${f} (${depth})`);
  }
  assert.deepEqual(bad, []);
});
