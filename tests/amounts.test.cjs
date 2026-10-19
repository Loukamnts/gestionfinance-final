const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

// Extrait parseAmount de sheet.js pour le tester sans navigateur.
function loadParseAmount() {
  const source = read('sheet.js');
  const start = source.indexOf('  function parseAmount(v) {');
  const end = source.indexOf('  function toNum(v)');
  assert(start > 0 && end > start, 'parseAmount introuvable dans sheet.js');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + ';this.parseAmount=parseAmount;', context);
  return context.parseAmount;
}

test('the spreadsheet reads French and English amounts', () => {
  const parse = loadParseAmount();
  const cases = [
    ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1 234,56', 1234.56], ['1 234,56 €', 1234.56],
    ['1.234.567', 1234567], ['1,234,567', 1234567], ['12,5', 12.5], ['12.50', 12.5], ['-45,90', -45.9],
    ['−45', -45], ['(12,30)', -12.3], ['+8', 8], ['€12', 12], ['-€12', -12], ['12 €', 12],
    ['2025', 2025], ['0', 0], ['12 %', 0.12], ['12%', 0.12], ["1'234.5", 1234.5],
    // Valeurs écrites par le code (String(nombre)) : un point seul reste décimal.
    ['-60.467', -60.467], ['36296.284500000005', 36296.284500000005], [String(-612.4), -612.4]
  ];
  for (const [text, expected] of cases) assert.equal(parse(text), expected, text);
  assert.equal(parse(1234.5), 1234.5);
});

test('the spreadsheet keeps text that only looks like a number as text', () => {
  const parse = loadParseAmount();
  for (const text of ['', ' ', '-', 'abc', 'Loyer 12', '12/03', '1.2.3', '1,23,4', '1.234,5.6', '12 €€', 'Total', '€', '%'])
    assert(Number.isNaN(parse(text)), text);
});

test('quick add and budget amounts use the spreadsheet parser', () => {
  const home = read('home.js');
  assert.match(home, /function amountOf\(text\)/);
  assert.match(home, /FS\.parseAmount\(text\)/);
  assert.doesNotMatch(home, /parseFloat\(String\((amt|inp)\.value\)/);
});

test('quick add classifies lines like the dashboard, by whole words', () => {
  // « Café », « Anniversaire », « Prime Video » ne sont pas des revenus ; « Péage » n'est pas de l'épargne.
  const home = read('home.js');
  const body = home.slice(home.indexOf('  function lineKind(label){'), home.indexOf('  function quickAdd(ctx){'));
  assert.match(body, /GFClassifyRow/);
  assert.doesNotMatch(body, /caf\|apl\|rsa|pea\|placement/);
});
