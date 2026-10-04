const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile.js'), 'utf8');

test('A recovery email returns to the app and opens a password form', () => {
  assert.match(html, /resetPasswordForEmail\(email,\s*\{\s*redirectTo:\s*window\.location\.origin\s*\+\s*window\.location\.pathname/);
  assert.match(html, /evt === "PASSWORD_RECOVERY"\) openPasswordRecovery\(\)/);
  assert.match(html, /<dialog class="password-recovery-dialog"[^>]+id="passwordRecoveryDialog"/);
  assert.match(html, /id="passwordRecoveryNew"[^>]+autocomplete="new-password"[^>]+required/);
  assert.match(html, /id="passwordRecoveryConfirm"[^>]+autocomplete="new-password"[^>]+required/);
});

test('A new password is validated, updated through Supabase, then the local session ends', () => {
  assert.match(html, /password\.length<8/);
  assert.match(html, /password!==confirm/);
  assert.match(html, /sb\.client\.auth\.updateUser\(\{ password:password \}\)/);
  assert.match(html, /sb\.client\.auth\.signOut\(\{ scope:"local" \}\)/);
  assert.doesNotMatch(html, /passwordRecoveryMessage[^\n]*innerHTML/);
});

test('The first-login welcome dialog cannot cover a recovery dialog', () => {
  assert.match(profile, /if\(!user\|\|!profile\|\|account\(\)\.recoveryPending\)return/);
});
