import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Rappels de saisie (une fois par jour) et file de notifications (chaque minute), appelés par pg_cron.
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
    // Court : une notification n'affiche que deux lignes sur un téléphone.
    body: days >= 14 ? "Ton tableur t’attend. 2 minutes suffisent." : "Pense à noter tes dernières dépenses.",
    url: "/tableur",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) return new Response("Server misconfigured", { status: 500 });
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Seule la tâche planifiée (secret partagé) peut déclencher un envoi ; un appel inconnu s'arrête ici, sans rien lire.
  const secret = request.headers.get("x-reminder-secret") || "";
  if (secret.length < 32 || secret.length > 256) return new Response("Unauthorized", { status: 401 });
  const { data: allowed } = await admin.rpc("reminder_cron_check", { p_secret: secret });
  if (allowed !== true) return new Response("Unauthorized", { status: 401 });

  // Les clés existent avant tout envoi (le site en a besoin pour s'abonner) ; les créer est sans risque.
  let { data: keys } = await admin.rpc("reminder_vapid_keys");
  if (!keys?.public || !keys?.private) {
    const fresh = await newVapidKeys();
    await admin.rpc("reminder_vapid_init", { p_public: fresh.public, p_private: fresh.private });
    ({ data: keys } = await admin.rpc("reminder_vapid_keys"));
  }

  webpush.setVapidDetails("mailto:louka.meunier1@gmail.com", keys.public, keys.private);

  // File de notifications (plafonds, amis, bilans, objectifs) : appelée chaque minute s'il y a des messages.
  let mode = "";
  try { mode = String((await request.json())?.mode || ""); } catch (_e) { mode = ""; }
  if (mode === "queue") {
    const { data: rows, error: qerr } = await admin.rpc("due_notifications", { p_limit: 300 });
    if (qerr) return new Response("Unable to list notifications", { status: 500 });
    const done = new Set<number>();
    const goneSubs = new Set<number>();
    for (const row of rows || []) {
      done.add(row.qid);
      if (!row.endpoint) continue; // plus aucun appareil : le message est simplement retiré
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) goneSubs.add(row.sub_id);
      }
    }
    if (done.size) await admin.rpc("mark_notifications_sent", { p_ids: [...done] });
    if (goneSubs.size) await admin.from("reminder_subscriptions").delete().in("id", [...goneSubs]);
    return new Response(JSON.stringify({ messages: done.size, removed: goneSubs.size }), {
      headers: { "Content-Type": "application/json" },
    });
  }

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
