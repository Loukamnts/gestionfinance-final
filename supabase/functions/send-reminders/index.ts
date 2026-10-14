import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Rappels de saisie : appelée une fois par jour par la tâche planifiée de la base (pg_cron).
// Les clés de notification sont créées ici au premier appel puis rangées dans le coffre de la base :
// elles ne quittent jamais Supabase. Le contenu d'un rappel ne contient aucun montant.

const b64u = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function newVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(fromB64u(jwk.x!), 1);
  pub.set(fromB64u(jwk.y!), 33);
  return { public: b64u(pub), private: jwk.d! };
}

function message(days: number) {
  return {
    title: "Meuniance",
    body: days >= 14
      ? "Ton tableur t’attend depuis un moment. Deux minutes suffisent pour le remettre à jour."
      : "Pense à noter tes dernières dépenses pour garder ton solde juste.",
    url: "/tableur",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) return new Response("Server misconfigured", { status: 500 });
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Les clés existent avant tout envoi (le site en a besoin pour s'abonner) ; les créer est sans risque.
  let { data: keys } = await admin.rpc("reminder_vapid_keys");
  if (!keys?.public || !keys?.private) {
    const fresh = await newVapidKeys();
    await admin.rpc("reminder_vapid_init", { p_public: fresh.public, p_private: fresh.private });
    ({ data: keys } = await admin.rpc("reminder_vapid_keys"));
  }

  const secret = request.headers.get("x-reminder-secret") || "";
  const { data: allowed } = await admin.rpc("reminder_cron_check", { p_secret: secret });
  if (allowed !== true) return new Response(JSON.stringify({ ready: !!keys?.public }), { status: 401 });

  webpush.setVapidDetails("mailto:louka.meunier1@gmail.com", keys.public, keys.private);
  const { data: due, error } = await admin.rpc("due_reminders", { p_limit: 500 });
  if (error) return new Response("Unable to list reminders", { status: 500 });

  const sent: number[] = [];
  const gone: number[] = [];
  for (const row of due || []) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
        JSON.stringify(message(row.every_days)),
        { TTL: 60 * 60 * 24, urgency: "normal" },
      );
      sent.push(row.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(row.id);
    }
  }
  if (sent.length) await admin.rpc("mark_reminders_sent", { p_ids: sent });
  // Abonnement expiré ou révoqué par l'appareil : il est supprimé.
  if (gone.length) await admin.from("reminder_subscriptions").delete().in("id", gone);
  return new Response(JSON.stringify({ due: (due || []).length, sent: sent.length, removed: gone.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
