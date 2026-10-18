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

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return new Response("Unable to delete account", { status: 500, headers });

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
