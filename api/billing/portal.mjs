import { authenticate, getCustomerId, json, requireBillingReady, requireSameOrigin, safeRedirectUrl, stripeRequest } from "../../server/billing.mjs";

export async function POST(request) {
  try {
    const config = requireBillingReady();
    requireSameOrigin(request, config);
    const { admin, user } = await authenticate(request, config);
    const customer = await getCustomerId(admin, user.id);
    if (!customer) return json({ error: "billing_customer_not_found" }, 404);
    const body = { customer, return_url: `${config.appOrigin}/abonnement` };
    if (config.portalConfiguration) body.configuration = config.portalConfiguration;
    const session = await stripeRequest(config, "/billing_portal/sessions", { method: "POST", body });
    const url = safeRedirectUrl(session.url);
    if (!url) throw new Error("unsafe_portal_url");
    return json({ url }, 201);
  } catch (error) {
    return json({ error: error?.code || "portal_failed" }, error?.status || 500);
  }
}

