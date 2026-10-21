import { createClient } from "npm:@supabase/supabase-js@2";

// Seul le site Meuniance peut demander une suppression (adresse actuelle, ancienne adresse redirigée,
// ou une adresse ajoutée par la variable ALLOWED_ORIGIN).
const allowedOrigins = [
  "https://meuniance.vercel.app",
  "https://gestion-finance-coral.vercel.app",
  ...(Deno.env.get("ALLOWED_ORIGIN") || "").split(",").map((o) => o.trim()).filter(Boolean),
];
const isAllowed = (origin: string | null) => !!origin && allowedOrigins.includes(origin);

function corsHeaders(origin: string | null) {
  return {
  "Access-Control-Allow-Origin": isAllowed(origin) ? origin! : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (!isAllowed(origin)) return new Response("Forbidden", { status: 403, headers });
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return new Response("Unauthorized", { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) return new Response("Server misconfigured", { status: 500, headers });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: userError } = await admin.auth.getUser(token);
  if (userError || !data.user) return new Response("Unauthorized", { status: 401, headers });

  // Abonnement Plus / Pro : arrêté chez Stripe avant la suppression, pour qu'aucun prélèvement ne continue.
  const stripeKey = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
  if (stripeKey) {
    const { data: customer } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", data.user.id).maybeSingle();
    if (customer?.stripe_customer_id) {
      const auth = { Authorization: `Bearer ${stripeKey}` };
      const res = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer.stripe_customer_id)}&status=all&limit=20`, { headers: auth });
      if (!res.ok) return new Response("Unable to stop subscription", { status: 502, headers });
      const list = await res.json();
      for (const s of list?.data || []) {
        if (!["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status)) continue;
        const stop = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(s.id)}`, { method: "DELETE", headers: auth });
        if (!stop.ok) return new Response("Unable to stop subscription", { status: 502, headers });
      }
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return new Response("Unable to delete account", { status: 500, headers });

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
