const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const USER = '10000000-0000-4000-8000-000000000001';
let db;
const query = (sql, params = []) => db.query(sql, params);
const value = async (sql, params = []) => Object.values((await query(sql, params)).rows[0])[0];
async function denied(sql, params = [], pattern = /permission denied/) {
  await db.exec('savepoint expected_denial');
  try { await assert.rejects(query(sql, params), pattern); }
  finally { await db.exec('rollback to savepoint expected_denial; release savepoint expected_denial'); }
}

async function as(role, userId = '') {
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec(`set role ${role}`);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text,display_name text,created_at timestamptz default now(),username text,username_changed_at timestamptz);
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  await db.exec(fs.readFileSync(path.join(root, 'supabase_stripe_billing.sql'), 'utf8'));
});

beforeEach(async () => {
  await db.exec('reset role; begin');
  await query('insert into auth.users(id,email) values($1,$2)', [USER, 'billing@example.test']);
  await query('insert into public.profiles(id,email,display_name,username) values($1,$2,$3,$4)', [USER, 'billing@example.test', 'Billing', 'billing.user']);
});
afterEach(async () => { await db.exec('reset role; rollback'); });
after(async () => { if (db) await db.close(); });

test('browser roles cannot read or write private billing tables', async () => {
  for (const role of ['anon', 'authenticated']) {
    await as(role, role === 'authenticated' ? USER : '');
    await denied('select * from public.billing_subscriptions');
    await denied("insert into public.billing_grants(user_id,plan,ends_at,reason,created_by) values($1,'pro',now()+interval '1 month','test gift','admin@example.test')", [USER]);
    await denied("select public.begin_billing_checkout($1,'plus')", [USER]);
  }
});

test('service role can rate-limit checkout creation without browser access', async () => {
  await as('service_role');
  assert(await value("select public.begin_billing_checkout($1,'plus')", [USER]));
  await denied("select public.begin_billing_checkout($1,'plus')", [USER], /checkout_rate_limited/);
});

test('an active gifted plan is visible through the narrow profile RPC', async () => {
  await as('service_role');
  await query("insert into public.billing_grants(user_id,plan,ends_at,reason,created_by) values($1,'pro',now()+interval '30 days','support gesture','admin@example.test')", [USER]);
  await as('authenticated', USER);
  const result = await query('select username,plan,subscription_started_at from public.get_my_profile()');
  assert.equal(result.rows[0].username, 'billing.user');
  assert.equal(result.rows[0].plan, 'pro');
  assert(result.rows[0].subscription_started_at);
});

test('webhook event claims are idempotent and retry a failed event', async () => {
  await as('service_role');
  assert.equal(await value("select public.claim_stripe_webhook_event('evt_test123','invoice.paid',1700000000,false)"), true);
  assert.equal(await value("select public.claim_stripe_webhook_event('evt_test123','invoice.paid',1700000000,false)"), false);
  await query("select public.complete_stripe_webhook_event('evt_test123','processing_failed')");
  assert.equal(await value("select public.claim_stripe_webhook_event('evt_test123','invoice.paid',1700000000,false)"), true);
});
