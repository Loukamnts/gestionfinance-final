import { billingConfig, json, processStripeEvent, verifyStripeSignature } from "../../server/billing.mjs";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const config = billingConfig();
  if (!config.ready) return json({ error: "billing_unavailable" }, 503);
  const payload = await request.text();
  if (!payload || payload.length > 2_000_000) return json({ error: "invalid_payload" }, 400);
  try {
    verifyStripeSignature(payload, request.headers.get("stripe-signature"), config.webhookSecret);
    const event = JSON.parse(payload);
    const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await processStripeEvent(config, admin, event);
    return json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Stripe webhook rejected", { code: error?.code || "processing_failed" });
    return json({ error: error?.code || "webhook_failed" }, error?.status || 500);
  }
}

