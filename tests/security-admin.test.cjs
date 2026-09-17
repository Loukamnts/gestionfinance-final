const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Local admin console cannot be published by the production allowlist', () => {
  const build = fs.readFileSync(path.join(root, 'scripts/build.cjs'), 'utf8');
  assert.doesNotMatch(build, /admin-local/);
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(vercel.outputDirectory, 'dist');
});

test('Admin secret file is ignored and example contains no secret', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /admin-local\/admin\.env/);
  const example = fs.readFileSync(path.join(root, 'admin-local/admin.env.example'), 'utf8');
  assert.match(example, /SUPABASE_SERVICE_ROLE_KEY=\s*$/m);
});

test('Admin server is loopback-only and validates an authenticated allowlisted user', () => {
  const server = fs.readFileSync(path.join(root, 'admin-local/server.cjs'), 'utf8');
  assert.match(server, /const HOST = "127\.0\.0\.1"/);
  assert.match(server, /publicClient\.auth\.getUser\(token\)/);
  assert.match(server, /email !== ADMIN_EMAIL/);
  assert.match(server, /!data\.user\.email_confirmed_at/);
  assert.match(server, /ADMIN_EMAIL = String\(process\.env\.ADMIN_EMAIL \|\| ""\)/);
  assert.doesNotMatch(server, /0\.0\.0\.0/);
});

test('Destructive admin routes require explicit phrases and protect the admin account', () => {
  const server = fs.readFileSync(path.join(root, 'admin-local/server.cjs'), 'utf8');
  assert.match(server, /SUPPRIMER \$\{email\}/);
  assert.match(server, /EFFACER LA SAUVEGARDE/);
  assert.match(server, /SUPPRIMER LA RELATION/);
  assert.match(server, /Le compte administrateur est protégé/);
});

