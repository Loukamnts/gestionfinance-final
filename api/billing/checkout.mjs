import { authenticate, beginCheckout, checkoutIdempotencyKey, getBillingRow, getOrCreateCustomer, isActiveSubscription, json, planRule, requireBillingReady, requireSameOrigin, safeRedirectUrl, stripeRequest, validateStripePrice } from "../../server/billing.mjs";

export async function POST(request) {
  try {
    const config = requireBillingReady();
    requireSameOrigin(request, config);
    const { admin, user } = await authenticate(request, config);
    const body = await request.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase();
    const rule = planRule(plan, config);
    const current = await getBillingRow(admin, user.id);
    if (isActiveSubscription(current)) return json({ error: "subscription_already_active", action: "portal" }, 409);
    if (current?.entitlement_source === "gift" && current?.access_granted) {
      return json({ error: "gift_plan_active", currentPeriodEnd: current.current_period_end }, 409);
    }
    await beginCheckout(admin, user.id, plan);
    await validateStripePrice(config, plan);
    const customer = await getOrCreateCustomer(config, admin, user);
    const session = await stripeRequest(config, "/checkout/sessions", {
      method: "POST",
      idempotencyKey: checkoutIdempotencyKey(user.id, plan),
      body: {
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price: rule.id, quantity: 1 }],
        success_url: `${config.appOrigin}/abonnement?checkout=success`,
        cancel_url: `${config.appOrigin}/abonnement?checkout=cancelled`,
        locale: "auto",
        integration_identifier: config.integrationIdentifier,
        metadata: { user_id: user.id, plan },
        subscription_data: { metadata: { user_id: user.id, plan } },
      },
    });
    const url = safeRedirectUrl(session.url);
    if (!url) throw new Error("unsafe_checkout_url");
    return json({ url }, 201);
  } catch (error) {
    return json({ error: error?.code || "checkout_failed" }, error?.status || 500);
  }
}
