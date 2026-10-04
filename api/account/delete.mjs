import { authenticate, billingConfig, getCustomerId, json, requireSameOrigin, stripeRequest } from "../../server/billing.mjs";

export async function DELETE(request) {
  try {
    const config = billingConfig();
    if (!config.appOrigin || !config.supabaseUrl || !config.supabaseServiceRoleKey) return json({ error: "account_deletion_unavailable" }, 503);
    requireSameOrigin(request, config);
    const { admin, user } = await authenticate(request, config);
    let customer = "";
    try { customer = await getCustomerId(admin, user.id); }
    catch (error) {
      // Une panne de la base ne doit jamais laisser un abonnement actif après
      // la suppression du compte. La tolérance n'existe qu'avant activation.
      if (config.enabled || error?.code !== "billing_database_unavailable") throw error;
    }
    if (customer) {
      if (!config.ready) return json({ error: "billing_cleanup_unavailable" }, 503);
      await stripeRequest(config, `/customers/${encodeURIComponent(customer)}`, { method: "DELETE" });
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("supabase_delete_failed");
    return json({ deleted: true });
  } catch (error) {
    return json({ error: error?.code || "account_delete_failed" }, error?.status || 500);
  }
}
