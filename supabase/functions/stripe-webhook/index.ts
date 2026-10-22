import { createClient } from "npm:@supabase/supabase-js@2";

// Événements Stripe → accès Plus / Pro. Complète la fonction « billing » (qui relit l'abonnement à chaque
// ouverture du site) : une résiliation immédiate, un remboursement ou un impayé coupent l'accès tout de suite,
// même si la personne n'ouvre plus le site. Chaque événement est vérifié (signature Stripe, 5 minutes de tolérance),
// n'est traité qu'une fois, puis l'abonnement est relu chez Stripe (jamais cru sur parole).
// Secrets : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET (whsec_…), rangés dans les secrets des fonctions Supabase.

const PLANS: Record<string, number> = { plus: 499, pro: 799 };
const ACCESS = new Set(["active", "trialing"]);
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);
const EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "checkout.session.completed",
  "charge.refunded",
  "charge.dispute.created",
  "customer.deleted",
]);

const enc = new TextEncoder();
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function validSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2);
  const t = Number(parts.find((p) => p[0] === "t")?.[1]);
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  // Comparaison en temps constant
  return sigs.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

async function stripe(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${(Deno.env.get("STRIPE_SECRET_KEY") || "").trim()}` },
    redirect: "error",
  });
  if (!res.ok) throw new Error(`stripe_${res.status}`);
  return await res.json();
}
const idOf = (v: any) => (typeof v === "string" ? v : v?.id || "");

function planOf(sub: any): string {
  const item = sub?.items?.data?.[0];
  const found = Object.entries(PLANS).find(([, amount]) => amount === item?.price?.unit_amount);
  return found && item?.price?.recurring?.interval === "month" && item?.price?.currency === "eur" ? found[0] : "free";
}
function periodEnd(sub: any): string | null {
  const ends = [sub?.current_period_end, ...(sub?.items?.data || []).map((i: any) => i?.current_period_end)].filter((n) => Number.isFinite(n));
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

// Relit les abonnements Stripe du client et met à jour billing_subscriptions (même règle que la fonction « billing »).
async function sync(admin: any, userId: string, customer: string, forceFree = false) {
  const now = new Date().toISOString();
  if (forceFree) {
    await admin.from("billing_subscriptions").update({ plan: "free", status: "canceled", access_granted: false, updated_at: now }).eq("user_id", userId);
    return;
  }
  const list = await stripe(`/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=20`);
  const rank: Record<string, number> = { free: 0, plus: 1, pro: 2 };
  const subs = (list?.data || []).filter((s: any) => !s?.metadata?.user_id || s.metadata.user_id === userId);
  subs.sort((a: any, b: any) =>
    Number(ACCESS.has(b.status)) - Number(ACCESS.has(a.status)) ||
    Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) ||
    (rank[planOf(b)] - rank[planOf(a)]) || (b.created - a.created));
  const sub = subs[0];
  if (!sub) {
    await admin.from("billing_subscriptions").update({ plan: "free", status: "canceled", access_granted: false, updated_at: now }).eq("user_id", userId);
    return;
  }
  const plan = planOf(sub);
  const access = ACCESS.has(sub.status) && plan !== "free";
  const { error } = await admin.from("billing_subscriptions").upsert({
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
  }, { onConflict: "user_id" });
  if (error) throw new Error("database");
}

async function userFor(admin: any, customer: string, metadataUser?: string): Promise<string> {
  if (customer) {
    const { data } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", customer).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return /^[0-9a-f-]{36}$/i.test(metadataUser || "") ? metadataUser! : "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) return new Response("Webhook not configured", { status: 503 });
  const payload = await request.text();
  if (payload.length > 1_000_000) return new Response("Too large", { status: 413 });
  if (!(await validSignature(payload, request.headers.get("Stripe-Signature") || "", secret))) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("Bad request", { status: 400 }); }
  if (!event?.id || !EVENTS.has(event.type)) return new Response(JSON.stringify({ ignored: true }), { status: 200 });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return new Response("Server misconfigured", { status: 500 });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // Un événement n'est traité qu'une fois (Stripe peut le renvoyer) ; en cas d'échec il est marqué « failed » et rejoué par Stripe.
  const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id, p_event_type: event.type, p_event_created: event.created, p_livemode: !!event.livemode,
  });
  if (claimError) return new Response("Database unavailable", { status: 503 });
  if (!claimed) return new Response(JSON.stringify({ duplicate: true }), { status: 200 });

  try {
    const obj = event.data?.object || {};
    let customer = "";
    let metadataUser = obj?.metadata?.user_id as string | undefined;
    if (event.type === "customer.deleted") customer = obj.id;
    else if (event.type.startsWith("charge.")) customer = idOf(obj.customer);
    else customer = idOf(obj.customer);
    const userId = await userFor(admin, customer, metadataUser);
    if (userId && customer) {
      if (event.type === "customer.deleted") {
        await sync(admin, userId, customer, true);
        await admin.from("billing_customers").delete().eq("user_id", userId);
      } else if (event.type === "charge.dispute.created") {
        // Contestation de paiement : accès coupé tout de suite.
        await sync(admin, userId, customer, true);
      } else {
        await sync(admin, userId, customer);
      }
    }
    await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_error: null });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("stripe-webhook", event.type, (e as Error)?.message || "");
    await admin.rpc("complete_stripe_webhook_event", { p_event_id: event.id, p_error: "processing_failed" });
    return new Response("Processing failed", { status: 500 });
  }
});
