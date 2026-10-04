import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const API_VERSION = "2026-08-26.dahlia";
const STRIPE_API = "https://api.stripe.com/v1";
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const ACCESS_STATUSES = new Set(["active", "trialing"]);
const PLAN_RULES = Object.freeze({
  plus: { amount: 499, env: "STRIPE_PRICE_PLUS_MONTHLY" },
  pro: { amount: 799, env: "STRIPE_PRICE_PRO_MONTHLY" },
});

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function env(name) { return String(process.env[name] || "").trim(); }
function bool(name) { return env(name).toLowerCase() === "true"; }
function isStripeSecret(value) { return /^(?:rk|sk)_(?:test|live)_[A-Za-z0-9]+$/.test(value); }
function keyMode(value) { return /_(live)_/.test(value) ? "live" : /_(test)_/.test(value) ? "test" : "unknown"; }

export function billingConfig() {
  const enabled = bool("BILLING_ENABLED");
  const config = {
    enabled,
    appOrigin: env("APP_ORIGIN").replace(/\/+$/, ""),
    stripeSecret: env("STRIPE_SECRET_KEY"),
    webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
    supabaseUrl: env("SUPABASE_URL").replace(/\/+$/, ""),
    supabaseServiceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    liveMode: bool("STRIPE_LIVE_MODE"),
    portalConfiguration: env("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID"),
    integrationIdentifier: env("STRIPE_INTEGRATION_IDENTIFIER") || "meuniance_hqvntszp",
    legalName: env("BILLING_LEGAL_NAME"),
    legalAddress: env("BILLING_LEGAL_ADDRESS"),
    supportEmail: env("BILLING_SUPPORT_EMAIL"),
    mediatorName: env("BILLING_MEDIATOR_NAME"),
    mediatorUrl: env("BILLING_MEDIATOR_URL"),
    pricesIncludeTax: bool("BILLING_PRICES_INCLUDE_TAX"),
    prices: Object.fromEntries(Object.entries(PLAN_RULES).map(([plan, rule]) => [plan, env(rule.env)])),
  };
  const required = ["appOrigin", "stripeSecret", "webhookSecret", "supabaseUrl", "supabaseServiceRoleKey", "legalName", "legalAddress", "supportEmail", "mediatorName", "mediatorUrl"];
  const missing = required.filter(key => !config[key]);
  for (const plan of Object.keys(PLAN_RULES)) if (!/^price_[A-Za-z0-9]+$/.test(config.prices[plan])) missing.push(PLAN_RULES[plan].env);
  if (!isStripeSecret(config.stripeSecret)) missing.push("STRIPE_SECRET_KEY_FORMAT");
  if (!/^whsec_[A-Za-z0-9]+$/.test(config.webhookSecret)) missing.push("STRIPE_WEBHOOK_SECRET_FORMAT");
  if (!/^https:\/\//.test(config.appOrigin)) missing.push("APP_ORIGIN_HTTPS");
  if (!/^https:\/\//.test(config.supabaseUrl)) missing.push("SUPABASE_URL_HTTPS");
  if (!/^https:\/\//i.test(config.mediatorUrl)) missing.push("BILLING_MEDIATOR_URL_HTTPS");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.supportEmail)) missing.push("BILLING_SUPPORT_EMAIL_FORMAT");
  if (!/^meuniance_[a-z]{8}$/.test(config.integrationIdentifier)) missing.push("STRIPE_INTEGRATION_IDENTIFIER_FORMAT");
  if (!config.pricesIncludeTax) missing.push("BILLING_PRICES_INCLUDE_TAX");
  const mode = keyMode(config.stripeSecret);
  if (mode === "live" && !config.liveMode) missing.push("STRIPE_LIVE_MODE");
  if (mode === "test" && config.liveMode) missing.push("STRIPE_TEST_KEY_IN_LIVE_MODE");
  config.mode = mode;
  config.ready = enabled && missing.length === 0;
  config.missing = [...new Set(missing)];
  return config;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

export function publicBillingState(config = billingConfig()) {
  return {
    enabled: config.ready,
    mode: config.ready ? config.mode : "disabled",
    plans: {
      free: { amount: 0, currency: "eur", interval: null },
      plus: { amount: PLAN_RULES.plus.amount, currency: "eur", interval: "month" },
      pro: { amount: PLAN_RULES.pro.amount, currency: "eur", interval: "month" },
    },
    legal: config.ready ? {
      name: config.legalName,
      address: config.legalAddress,
      supportEmail: config.supportEmail,
      mediatorName: config.mediatorName,
      mediatorUrl: config.mediatorUrl,
      pricesIncludeTax: true,
    } : null,
  };
}

export function requireBillingReady() {
  const config = billingConfig();
  if (!config.ready) throw new HttpError(503, "billing_unavailable");
  return config;
}

export function requireSameOrigin(request, config) {
  const origin = String(request.headers.get("origin") || "").replace(/\/+$/, "");
  if (!origin || origin !== config.appOrigin) throw new HttpError(403, "origin_forbidden");
}

function adminClient(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "meuniance-billing/1.0" } },
  });
}

export async function authenticate(request, config) {
  const authorization = String(request.headers.get("authorization") || "");
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "authentication_required");
  const token = authorization.slice(7).trim();
  if (!token || token.length > 4096) throw new HttpError(401, "authentication_required");
  const admin = adminClient(config);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "authentication_required");
  return { admin, user: data.user };
}

function appendForm(params, prefix, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) { value.forEach((item, index) => appendForm(params, `${prefix}[${index}]`, item)); return; }
  if (typeof value === "object") { Object.entries(value).forEach(([key, item]) => appendForm(params, prefix ? `${prefix}[${key}]` : key, item)); return; }
  params.append(prefix, typeof value === "boolean" ? String(value) : String(value));
}

export async function stripeRequest(config, path, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Authorization: `Bearer ${config.stripeSecret}`,
    "Stripe-Version": API_VERSION,
    "User-Agent": "Meuniance/1.0 (+https://gestion-finance-coral.vercel.app)",
  };
  const init = { method, headers, redirect: "error" };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.body) {
    const params = new URLSearchParams();
    Object.entries(options.body).forEach(([key, value]) => appendForm(params, key, value));
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = params.toString();
  }
  const response = await fetch(`${STRIPE_API}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Stripe request failed", { path, status: response.status, code: payload?.error?.code || "unknown" });
    throw new HttpError(response.status >= 500 ? 502 : 400, "stripe_request_failed");
  }
  return payload;
}

export function planRule(plan, config) {
  const rule = PLAN_RULES[plan];
  if (!rule) throw new HttpError(400, "invalid_plan");
  return { ...rule, id: config.prices[plan] };
}

export async function validateStripePrice(config, plan) {
  const expected = planRule(plan, config);
  const price = await stripeRequest(config, `/prices/${encodeURIComponent(expected.id)}`);
  if (!price.active || price.currency !== "eur" || price.unit_amount !== expected.amount || price.type !== "recurring" || price.recurring?.interval !== "month" || price.tax_behavior !== "inclusive") {
    console.error("Stripe price configuration mismatch", { plan, price: price.id, currency: price.currency, amount: price.unit_amount, interval: price.recurring?.interval, taxBehavior: price.tax_behavior });
    throw new HttpError(503, "price_configuration_invalid");
  }
  return price;
}

async function getStripeBillingRow(admin, userId) {
  const { data, error } = await admin.from("billing_subscriptions").select("plan,status,access_granted,current_period_end,cancel_at_period_end,subscription_started_at,stripe_customer_id,stripe_subscription_id").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(503, "billing_database_unavailable");
  return data || null;
}

export async function getBillingRow(admin, userId) {
  const now = new Date().toISOString();
  const [subscriptionResult, grantResult] = await Promise.all([
    admin.from("billing_subscriptions").select("plan,status,access_granted,current_period_end,cancel_at_period_end,subscription_started_at,stripe_customer_id,stripe_subscription_id").eq("user_id", userId).maybeSingle(),
    admin.from("billing_grants").select("plan,starts_at,ends_at").eq("user_id", userId).is("revoked_at", null).lte("starts_at", now).gt("ends_at", now).order("ends_at", { ascending: false }).limit(20),
  ]);
  if (subscriptionResult.error || grantResult.error) throw new HttpError(503, "billing_database_unavailable");
  const subscription = subscriptionResult.data || null;
  const grants = grantResult.data || [];
  const rank = { free: 0, plus: 1, pro: 2 };
  const gift = grants.sort((a, b) => (rank[b.plan] || 0) - (rank[a.plan] || 0) || String(b.ends_at).localeCompare(String(a.ends_at)))[0];
  const stripeActive = subscription?.access_granted && ACCESS_STATUSES.has(subscription.status);
  if (!gift || (stripeActive && (rank[subscription.plan] || 0) >= (rank[gift.plan] || 0))) return subscription ? { ...subscription, entitlement_source: "stripe" } : null;
  return {
    ...(subscription || {}),
    plan: gift.plan,
    status: "active",
    access_granted: true,
    cancel_at_period_end: false,
    current_period_end: gift.ends_at,
    subscription_started_at: gift.starts_at,
    entitlement_source: "gift",
  };
}

export async function getCustomerId(admin, userId) {
  const { data, error } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(503, "billing_database_unavailable");
  return data?.stripe_customer_id || "";
}

export async function getOrCreateCustomer(config, admin, user) {
  const existing = await getCustomerId(admin, user.id);
  if (existing) return existing;
  const customer = await stripeRequest(config, "/customers", {
    method: "POST",
    idempotencyKey: `customer_${user.id}`,
    body: { email: user.email || undefined, metadata: { user_id: user.id, service: "meuniance" } },
  });
  const { error } = await admin.from("billing_customers").upsert({ user_id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new HttpError(503, "billing_database_unavailable");
  return customer.id;
}

export async function beginCheckout(admin, userId, plan) {
  const { data, error } = await admin.rpc("begin_billing_checkout", { p_user_id: userId, p_plan: plan });
  if (error) {
    if (/checkout_rate_limited/i.test(error.message || "")) throw new HttpError(429, "checkout_rate_limited");
    throw new HttpError(503, "billing_database_unavailable");
  }
  return data;
}

export function checkoutIdempotencyKey(userId, plan) {
  const window = Math.floor(Date.now() / 60000);
  return `checkout_${crypto.createHash("sha256").update(`${userId}:${plan}:${window}`).digest("hex").slice(0, 40)}`;
}

export function safeRedirectUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !(url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))) return "";
    return url.href;
  } catch { return ""; }
}

export function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300) {
  if (!header || !secret) throw new HttpError(400, "invalid_webhook_signature");
  const parts = String(header).split(",").map(part => part.split("=")).filter(part => part.length === 2);
  const timestamp = Number(parts.find(part => part[0] === "t")?.[1]);
  const signatures = parts.filter(part => part[0] === "v1").map(part => part[1]);
  if (!Number.isFinite(timestamp) || signatures.length === 0 || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) throw new HttpError(400, "invalid_webhook_signature");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest();
  const valid = signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
  if (!valid) throw new HttpError(400, "invalid_webhook_signature");
}

function stripeId(value) { return typeof value === "string" ? value : value?.id || ""; }
function periodEnd(subscription) {
  const values = [subscription.current_period_end, ...(subscription.items?.data || []).map(item => item.current_period_end)].filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values) * 1000).toISOString() : null;
}
function planFromSubscription(subscription, config) {
  const priceId = stripeId(subscription.items?.data?.[0]?.price);
  return Object.keys(PLAN_RULES).find(plan => config.prices[plan] === priceId) || "free";
}

async function resolveUserId(admin, object) {
  const metadataId = object?.metadata?.user_id || object?.subscription_details?.metadata?.user_id;
  if (/^[0-9a-f-]{36}$/i.test(metadataId || "")) return metadataId;
  const customerId = stripeId(object?.customer);
  if (!customerId) return "";
  const { data, error } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new HttpError(503, "billing_database_unavailable");
  return data?.user_id || "";
}

export async function syncSubscription(config, admin, subscription, accessDecision) {
  const userId = await resolveUserId(admin, subscription);
  if (!userId) throw new HttpError(400, "billing_user_not_found");
  const customerId = stripeId(subscription.customer);
  if (customerId) {
    const { error } = await admin.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new HttpError(503, "billing_database_unavailable");
  }
  const existing = await getStripeBillingRow(admin, userId);
  const plan = planFromSubscription(subscription, config);
  const status = String(subscription.status || "incomplete");
  const grant = typeof accessDecision === "boolean" ? accessDecision : !!existing?.access_granted && ACCESS_STATUSES.has(status);
  const started = subscription.start_date ? new Date(subscription.start_date * 1000).toISOString() : existing?.subscription_started_at || null;
  const payload = {
    user_id: userId,
    stripe_customer_id: customerId || existing?.stripe_customer_id || "",
    stripe_subscription_id: subscription.id,
    stripe_price_id: stripeId(subscription.items?.data?.[0]?.price) || null,
    plan: grant ? plan : "free",
    status,
    access_granted: grant && plan !== "free",
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    current_period_end: periodEnd(subscription),
    subscription_started_at: started,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("billing_subscriptions").upsert(payload, { onConflict: "user_id" });
  if (error) throw new HttpError(503, "billing_database_unavailable");
}

export async function processStripeEvent(config, admin, event) {
  const object = event?.data?.object || {};
  if (event.livemode !== config.liveMode) throw new HttpError(400, "webhook_mode_mismatch");
  const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_webhook_event", { p_event_id: event.id, p_event_type: event.type, p_event_created: event.created, p_livemode: event.livemode });
  if (claimError) throw new HttpError(503, "billing_database_unavailable");
  if (!claimed) return { duplicate: true };
  try {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(config, admin, object, event.type === "customer.subscription.deleted" ? false : undefined);
    } else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const subscriptionId = stripeId(object.subscription) || stripeId(object.parent?.subscription_details?.subscription);
      if (subscriptionId) {
        const subscription = await stripeRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
        await syncSubscription(config, admin, subscription, event.type === "invoice.paid");
      }
    } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) {
      const subscriptionId = stripeId(object.subscription);
      if (subscriptionId) {
        const subscription = await stripeRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
        const paid = event.type !== "checkout.session.async_payment_failed" && object.payment_status === "paid";
        await syncSubscription(config, admin, subscription, paid ? true : event.type === "checkout.session.async_payment_failed" ? false : undefined);
      }
    } else if (event.type === "customer.deleted") {
      const customerId = object.id;
      const { data } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (data?.user_id) {
        await admin.from("billing_subscriptions").update({ plan: "free", status: "canceled", access_granted: false, updated_at: new Date().toISOString() }).eq("user_id", data.user_id);
        await admin.from("billing_customers").delete().eq("user_id", data.user_id);
      }
    }
    const { error: completionError } = await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_error: null });
    if (completionError) throw new HttpError(503, "billing_database_unavailable");
    return { duplicate: false };
  } catch (error) {
    try { await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_error: "processing_failed" }); } catch {}
    throw error;
  }
}

export function subscriptionPayload(row) {
  if (!row) return { plan: "free", status: "none", accessGranted: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, subscriptionStartedAt: null, canManage: false, source: "free" };
  return {
    plan: row.access_granted ? row.plan : "free",
    status: row.status,
    accessGranted: !!row.access_granted,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
    subscriptionStartedAt: row.subscription_started_at,
    canManage: !!row.stripe_customer_id,
    source: row.entitlement_source || "stripe",
  };
}

export function isActiveSubscription(row) { return !!row?.stripe_subscription_id && ACTIVE_STATUSES.has(row.status); }
