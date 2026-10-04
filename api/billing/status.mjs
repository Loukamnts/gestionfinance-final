import { authenticate, billingConfig, getBillingRow, json, publicBillingState, subscriptionPayload } from "../../server/billing.mjs";

export async function GET(request) {
  const config = billingConfig();
  const publicState = publicBillingState(config);
  const authorization = request.headers.get("authorization");
  if (!authorization || !config.ready) return json({ ...publicState, authenticated: false, subscription: subscriptionPayload(null) });
  try {
    const { admin, user } = await authenticate(request, config);
    const row = await getBillingRow(admin, user.id);
    return json({ ...publicState, authenticated: true, subscription: subscriptionPayload(row) });
  } catch (error) {
    const status = error?.status || 500;
    return json({ error: error?.code || "billing_status_failed", ...publicState }, status);
  }
}

