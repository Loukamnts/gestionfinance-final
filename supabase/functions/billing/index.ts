import { createClient } from "npm:@supabase/supabase-js@2";

// Abonnements Plus / Pro avec Stripe Checkout (page de paiement hébergée par Stripe) et le portail client Stripe.
// Aucun webhook : l'abonnement est relu chez Stripe à chaque ouverture du site (action « status ») et juste
// après le paiement. Sans relecture, l'accès s'arrête de lui-même à la fin de la période payée (get_my_profile).
// Seule clé nécessaire : STRIPE_SECRET_KEY, rangée dans les secrets des fonctions Supabase (jamais dans le site).

const allowedOrigins = [
  "https://meuniance.vercel.app",
  "https://gestion-finance-coral.vercel.app",
  ...(Deno.env.get("ALLOWED_ORIGIN") || "").split(",").map((o) => o.trim()).filter(Boolean),
];
const APP = "https://meuniance.vercel.app";
// Prix TTC en centimes. Le prix est fixé ici, côté serveur : le navigateur ne choisit que la formule.
const PLANS: Record<string, { amount: number; name: string }> = {
  plus: { amount: 499, name: "Meuniance Plus" },
  pro: { amount: 799, name: "Meuniance Pro" },
};
const ACCESS = new Set(["active", "trialing"]);
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

const isAllowed = (origin: string | null) => !!origin && allowedOrigins.includes(origin);
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": isAllowed(origin) ? origin! : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const stripeKey = () => (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
const keyOk = (k: string) => /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(k);

class Fail extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function form(params: URLSearchParams, prefix: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) { value.forEach((v, i) => form(params, `${prefix}[${i}]`, v)); return; }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) form(params, prefix ? `${prefix}[${k}]` : k, v);
    return;
  }
  params.append(prefix, String(value));
}
async function stripe(path: string, opts: { method?: string; body?: Record<string, unknown>; idem?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeKey()}` };
  let body: string | undefined;
  if (opts.body) {
    const p = new URLSearchParams();
    form(p, "", opts.body);
    body = p.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (opts.idem) headers["Idempotency-Key"] = opts.idem;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method: opts.method || "GET", headers, body, redirect: "error" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Jamais la clé ni les données de carte dans les journaux : seulement le code d'erreur Stripe.
    console.error("stripe", path.split("?")[0].replace(/\/(cus|sub|cs)_[A-Za-z0-9]+/, "/…"), res.status, data?.error?.code || "");
    throw new Fail(res.status >= 500 ? 502 : 400, "stripe_error");
  }
  return data;
}

// Formule d'un abonnement : par son montant (fixé par ce serveur), pas par une donnée modifiable.
function planOf(sub: any): string {
  const item = sub?.items?.data?.[0];
  const amount = item?.price?.unit_amount;
  const month = item?.price?.recurring?.interval === "month";
  const found = Object.entries(PLANS).find(([, p]) => p.amount === amount);
  return found && month && item?.price?.currency === "eur" ? found[0] : "free";
}
function periodEnd(sub: any): string | null {
  const ends = [sub?.current_period_end, ...(sub?.items?.data || []).map((i: any) => i?.current_period_end)].filter((n) => Number.isFinite(n));
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

async function customerOf(admin: any, userId: string): Promise<string> {
  const { data, error } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Fail(503, "database");
  return data?.stripe_customer_id || "";
}

// Relit les abonnements Stripe de ce compte et met à jour billing_subscriptions.
async function sync(admin: any, userId: string) {
  const customer = await customerOf(admin, userId);
  if (!customer) return null;
  const list = await stripe(`/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`);
  const rank: Record<string, number> = { free: 0, plus: 1, pro: 2 };
  const subs = (list?.data || []).filter((s: any) => s?.metadata?.user_id === userId || !s?.metadata?.user_id);
  // L'abonnement qui donne le plus d'accès ; sinon le plus récent (pour garder son état : annulé, impayé…).
  subs.sort((a: any, b: any) =>
    Number(ACCESS.has(b.status)) - Number(ACCESS.has(a.status)) ||
    Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) ||
    (rank[planOf(b)] - rank[planOf(a)]) || (b.created - a.created));
  const sub = subs[0];
  const now = new Date().toISOString();
  if (!sub) {
    await admin.from("billing_subscriptions").update({ plan: "free", status: "canceled", access_granted: false, updated_at: now }).eq("user_id", userId);
    return null;
  }
  const plan = planOf(sub);
  const access = ACCESS.has(sub.status) && plan !== "free";
  const row = {
    user_id: userId,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    stripe_price_id: sub.items?.data?.[0]?.price?.id || null,
    plan: access ? plan : "free",
    status: String(sub.status || "incomplete"),
    access_granted: access,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: periodEnd(sub),
    subscription_started_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : null,
    updated_at: now,
  };
  const { error } = await admin.from("billing_subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) throw new Fail(503, "database");
  return row;
}

async function getOrCreateCustomer(admin: any, user: any): Promise<string> {
  const existing = await customerOf(admin, user.id);
  if (existing) return existing;
  const c = await stripe("/customers", {
    method: "POST",
    idem: `meuniance_customer_${user.id}`,
    body: { email: user.email || undefined, metadata: { user_id: user.id, service: "meuniance" } },
  });
  const { error } = await admin.from("billing_customers").upsert({ user_id: user.id, stripe_customer_id: c.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Fail(503, "database");
  return c.id;
}

const stripeUrl = (u: string) => {
  try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "stripe.com" || x.hostname.endsWith(".stripe.com")) ? x.href : ""; } catch { return ""; }
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (!isAllowed(origin)) return reply({ error: "forbidden" }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "method" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !service) throw new Fail(500, "misconfigured");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token.length > 4096) throw new Fail(401, "auth");
    const { data: who, error: authError } = await admin.auth.getUser(token);
    if (authError || !who?.user) throw new Fail(401, "auth");
    const user = who.user;

    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "status");
    const ready = keyOk(stripeKey());

    if (action === "status") {
      // Limites de partage côté serveur : actives seulement quand les ventes sont ouvertes (clé Stripe présente).
      await admin.rpc("set_billing_live", { p_live: ready });
      if (!ready) return reply({ ready: false });
      const row = await sync(admin, user.id);
      return reply({ ready: true, plan: row?.access_granted ? row.plan : "free", status: row?.status || "none", cancelAtPeriodEnd: !!row?.cancel_at_period_end, periodEnd: row?.current_period_end || null, canManage: !!row });
    }
    if (!ready) throw new Fail(503, "billing_unavailable");

    if (action === "checkout") {
      const plan = String(body?.plan || "");
      if (!PLANS[plan]) throw new Fail(400, "invalid_plan");
      // Déjà abonné : on passe par le portail pour changer de formule, pas par un deuxième abonnement.
      const current = await sync(admin, user.id);
      if (current && LIVE.has(current.status)) return reply({ manage: true });
      const { error: limitError } = await admin.rpc("begin_billing_checkout", { p_user_id: user.id, p_plan: plan });
      if (limitError) throw new Fail(/rate_limited/.test(limitError.message || "") ? 429 : 503, /rate_limited/.test(limitError.message || "") ? "rate_limited" : "database");
      const customer = await getOrCreateCustomer(admin, user);
      const lang = body?.lang === "en" ? "en" : "fr";
      const session = await stripe("/checkout/sessions", {
        method: "POST",
        idem: `meuniance_checkout_${user.id}_${plan}_${Math.floor(Date.now() / 60000)}`,
        body: {
          mode: "subscription",
          customer,
          client_reference_id: user.id,
          locale: lang,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: PLANS[plan].amount,
              tax_behavior: "inclusive",
              recurring: { interval: "month" },
              product_data: { name: PLANS[plan].name, metadata: { meuniance_plan: plan } },
            },
          }],
          subscription_data: { metadata: { user_id: user.id, plan } },
          metadata: { user_id: user.id, plan },
          allow_promotion_codes: true,
          success_url: `${APP}/?abonnement=merci`,
          cancel_url: `${APP}/?abonnement=annule`,
          custom_text: {
            submit: {
              message: lang === "en"
                ? "Your plan starts right away. You can cancel anytime from Meuniance: it stops at the end of the paid month."
                : "Ta formule démarre tout de suite et tu demandes donc à en profiter avant la fin du délai de rétractation de 14 jours. Tu peux résilier quand tu veux depuis Meuniance : elle s’arrête à la fin du mois payé.",
            },
          },
        },
      });
      const link = stripeUrl(session?.url || "");
      if (!link) throw new Fail(502, "stripe_error");
      return reply({ url: link });
    }

    if (action === "portal") {
      const customer = await customerOf(admin, user.id);
      if (!customer) throw new Fail(404, "no_customer");
      const session = await stripe("/billing_portal/sessions", { method: "POST", body: { customer, return_url: `${APP}/?abonnement=retour`, locale: body?.lang === "en" ? "en" : "fr" } });
      const link = stripeUrl(session?.url || "");
      if (!link) throw new Fail(502, "stripe_error");
      return reply({ url: link });
    }

    throw new Fail(400, "invalid_action");
  } catch (e) {
    const f = e instanceof Fail ? e : new Fail(500, "server");
    if (!(e instanceof Fail)) console.error("billing", (e as Error)?.message || "");
    return reply({ error: f.code }, f.status);
  }
});
