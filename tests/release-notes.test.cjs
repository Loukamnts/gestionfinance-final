const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dictionary = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
const discover = fs.readFileSync(path.join(root, 'discover.js'), 'utf8');

function releaseNotes() {
  const start = html.indexOf('const RELEASE_NOTES=[');
  const end = html.indexOf('];', start);
  return Function('"use strict";return ' + html.slice(start + 'const RELEASE_NOTES='.length, end + 1))();
}

test('every release note shown on the Updates page has an English translation', () => {
  const missing = [];
  for (const note of releaseNotes()) {
    for (const text of [note.date, note.title, note.text, ...(note.highlights || []), ...(note.sections || []).map(s => s.text)]) {
      if (text && !dictionary.includes(JSON.stringify(text))) missing.push(text);
    }
  }
  assert.deepEqual(missing, []);
});

test('the current release has a discovery tour on the home screen', () => {
  const version = html.match(/const RELEASE_NOTES_VERSION="([^"]+)"/)[1];
  assert.ok(discover.includes(JSON.stringify(version) + ':['), 'discover.js has no tour for ' + version);
});
