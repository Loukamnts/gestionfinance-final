const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'theme-directions.css'), 'utf8');

test('navigation clicks are bound only to buttons, never the page body', () => {
  assert.match(html, /document\.querySelectorAll\("button\[data-page\]"\).*addEventListener\("click"/);
  assert.doesNotMatch(html, /document\.querySelectorAll\("\[data-page\]"\).*addEventListener\("click"/);
});

test('theme and accent palette are separate persisted choices', () => {
  assert.match(html, /palette: "personalFinanceDashboard\.palette"/);
  for (const palette of ['violet', 'bordeaux', 'gold']) {
    assert.match(html, new RegExp(`data-palette-option="${palette}"`));
    assert.match(styles, new RegExp(`data-palette="${palette}"`));
  }
  assert.match(html, /document\.body\.dataset\.palette=state\.appearance\.palette/);
});
