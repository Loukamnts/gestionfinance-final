// Relevés synthétiques de banques / pays / encodages variés : le total par catégorie doit rester exact.
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const ctx = { window: {}, TextDecoder, Intl, document: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'bank-import.js'), 'utf8'), ctx);
const B = ctx.window.GFBankImport;
const { cases: cases1, bytes } = require('./corpus/banks.cjs');
const { cases: cases2 } = require('./corpus/banks2.cjs');
const cases = cases1.concat(cases2);
for (const c of cases) {
  test('Corpus : ' + c.name, () => {
    const b = bytes(c);
    const ops = B.parse(B._decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
    assert(ops, 'relevé non reconnu');
    const s = B.summarize(ops); const got = {};
    s.groups.forEach((g) => { got[g.name] = Math.round(g.total * 100) / 100; });
    assert.deepEqual(JSON.parse(JSON.stringify(got)), c.expect, 'ops: ' + ops.map((o) => o.date.d + '/' + (o.date.m + 1) + ' ' + o.amount + ' ' + o.label).join(' || '));
  });
}
