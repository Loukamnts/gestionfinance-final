const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envNames = [
  'BILLING_ENABLED','APP_ORIGIN','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','STRIPE_LIVE_MODE',
  'STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID','STRIPE_INTEGRATION_IDENTIFIER',
  'BILLING_LEGAL_NAME','BILLING_LEGAL_ADDRESS','BILLING_SUPPORT_EMAIL',
  'BILLING_MEDIATOR_NAME','BILLING_MEDIATOR_URL','BILLING_PRICES_INCLUDE_TAX',
  'STRIPE_PRICE_PLUS_MONTHLY','STRIPE_PRICE_PRO_MONTHLY'
];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

function restoreEnv() {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
}

function configuredEnv() {
  Object.assign(process.env, {
    BILLING_ENABLED: 'true',
    APP_ORIGIN: 'https://gestion-finance-coral.vercel.app',
    STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnopqrstuvwxyz',
    STRIPE_WEBHOOK_SECRET: 'whsec_abcdefghijklmnopqrstuvwxyz',
    SUPABASE_URL: 'https://agbogjpwnzkwrnsjfpkc.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    STRIPE_LIVE_MODE: 'false',
    STRIPE_INTEGRATION_IDENTIFIER: 'meuniance_hqvntszp',
    BILLING_LEGAL_NAME: 'Test seller',
    BILLING_LEGAL_ADDRESS: 'Test address',
    BILLING_SUPPORT_EMAIL: 'support@example.test',
    BILLING_MEDIATOR_NAME: 'Test mediator',
    BILLING_MEDIATOR_URL: 'https://mediator.example.test',
    BILLING_PRICES_INCLUDE_TAX: 'true',
    STRIPE_PRICE_PLUS_MONTHLY: 'price_plus123',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro123'
  });
}

test.afterEach(restoreEnv);

test('billing stays fail-closed until every Stripe and legal setting is valid', async () => {
  const billing = await import('../server/billing.mjs');
  for (const name of envNames) delete process.env[name];
  process.env.BILLING_ENABLED = 'true';
  const blocked = billing.billingConfig();
  assert.equal(blocked.ready, false);
  assert(blocked.missing.includes('STRIPE_SECRET_KEY_FORMAT'));
  assert(blocked.missing.includes('BILLING_PRICES_INCLUDE_TAX'));
  configuredEnv();
  assert.equal(billing.billingConfig().ready, true);
});

test('a valid webhook signature is required and old signatures expire', async () => {
  const { verifyStripeSignature } = await import('../server/billing.mjs');
  const payload = JSON.stringify({ id: 'evt_test123', type: 'invoice.paid' });
  const secret = 'whsec_testsecret';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  assert.doesNotThrow(() => verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret));
  assert.throws(() => verifyStripeSignature(payload + ' ', `t=${timestamp},v1=${signature}`, secret), /invalid_webhook_signature/);
  assert.throws(() => verifyStripeSignature(payload, `t=${timestamp - 600},v1=${signature}`, secret), /invalid_webhook_signature/);
});

test('billing redirects accept only HTTPS Stripe hosts', async () => {
  const { safeRedirectUrl } = await import('../server/billing.mjs');
  assert.equal(safeRedirectUrl('https://checkout.stripe.com/c/pay/test'), 'https://checkout.stripe.com/c/pay/test');
  assert.equal(safeRedirectUrl('https://stripe.com.example.org/steal'), '');
  assert.equal(safeRedirectUrl('javascript:alert(1)'), '');
  assert.equal(safeRedirectUrl('http://checkout.stripe.com/c/pay/test'), '');
});

test('checkout uses server prices, hosted dynamic payment methods and verified webhooks', () => {
  const checkout = fs.readFileSync(path.join(root, 'api/billing/checkout.mjs'), 'utf8');
  const webhook = fs.readFileSync(path.join(root, 'api/stripe/webhook.mjs'), 'utf8');
  assert.match(checkout, /planRule\(plan, config\)/);
  assert.match(checkout, /validateStripePrice\(config, plan\)/);
  assert.doesNotMatch(checkout, /payment_method_types/);
  assert.doesNotMatch(checkout, /billing_mode/);
  assert.match(checkout, /integration_identifier/);
  assert.match(checkout, /gift_plan_active/);
  assert.match(webhook, /await request\.text\(\)/);
  assert.match(webhook, /verifyStripeSignature/);
});

test('billing tables are private and browser roles cannot execute billing RPCs', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase_stripe_billing.sql'), 'utf8');
  for (const table of ['billing_customers','billing_subscriptions','billing_checkout_limits','billing_webhook_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /revoke all on public\.billing_customers[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.begin_billing_checkout[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_my_profile\(\) to authenticated/i);
});
