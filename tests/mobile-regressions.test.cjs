const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('iOS fixes never force a size on every button and link', () => {
  // Une règle globale (min-width + padding !important) élargissait la page sur iPhone et faisait dézoomer Safari.
  const ios = read('ios-fix.js');
  assert.doesNotMatch(ios, /min-width:\s*44px/);
  assert.doesNotMatch(ios, /padding:\s*12px\s*!important/);
});

test('the new goal button opens an empty form instead of reading the click as a goal', () => {
  const objectives = read('objectives.js');
  assert.doesNotMatch(objectives, /addEventListener\("click",\s*openForm\)/);
});
