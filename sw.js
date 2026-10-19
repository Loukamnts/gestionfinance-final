/* Service worker de Meuniance : rappels de saisie et ouverture sans connexion.
   Sûr par construction :
   - réseau d'abord : avec du réseau, on reçoit toujours la dernière version ; la copie ne sert que hors ligne ;
   - seuls les fichiers publics du site (même origine, requêtes GET) sont copiés : jamais tes données,
     jamais Supabase ni aucun autre site, jamais une réponse en erreur ;
   - une seule copie par version : l'ancienne est supprimée à chaque mise en ligne.
   La version et la liste des fichiers sont écrites par scripts/build.cjs. */
var VERSION = "__BUILD_VERSION__";
var CACHE = "meuniance-" + VERSION;
var PRECACHE = __PRECACHE_LIST__;
var APP_ROUTES = ["/accueil", "/tableur", "/objectifs", "/partage", "/nouveautes", "/parametres", "/app"];
var KNOWN = new Set(PRECACHE);

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    // Fichier par fichier : un fichier manquant n'empêche pas l'installation.
    return Promise.all(PRECACHE.map(function (url) {
      return fetch(url, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
        if (res.ok && res.type === "basic") return cache.put(url, res);
      }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("meuniance-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function cacheable(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/sw.js") return false;
  // Pages de l'app (copie « /app ») et pages publiques précopiées (mentions légales…).
  if (request.mode === "navigate") return APP_ROUTES.indexOf(url.pathname) >= 0 || KNOWN.has(url.pathname);
  return KNOWN.has(url.pathname + url.search) || url.pathname.indexOf("/vendor/") === 0;
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  var url = new URL(request.url);
  if (!cacheable(url, request)) return;
  var navigate = request.mode === "navigate";
  // Toutes les routes de l'app partagent la même page ; une page publique garde sa propre copie.
  var key = navigate ? (APP_ROUTES.indexOf(url.pathname) >= 0 ? "/app" : url.pathname) : url.pathname + url.search;
  event.respondWith(fetch(request).then(function (res) {
    if (res.ok && res.type === "basic") {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) { return cache.put(key, copy); }).catch(function () {});
    }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(key).then(function (hit) {
        return hit || (navigate ? new Response("<!doctype html><meta charset=utf-8><title>Meuniance</title><p style=\"font:16px system-ui;padding:24px\">Pas de connexion. Ouvre Meuniance une fois avec du réseau pour l’utiliser hors ligne.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }) : Response.error());
      });
    });
  }));
});

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  var url = typeof data.url === "string" && data.url.charAt(0) === "/" ? data.url : "/tableur";
  event.waitUntil(self.registration.showNotification(String(data.title || "Meuniance"), {
    body: String(data.body || "Pense à noter tes dépenses."),
    icon: "/app-icon-180.png",
    badge: "/app-icon-180.png",
    // Chaque type a son tag : une nouvelle notification du même sujet remplace l'ancienne, sans effacer les autres.
    tag: typeof data.tag === "string" && data.tag.length > 0 && data.tag.length <= 90 ? data.tag : "meuniance-rappel",
    data: { url: url }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = new URL((event.notification.data && event.notification.data.url) || "/tableur", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var client = list[i];
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        return client.focus().then(function (c) { return c && "navigate" in c ? c.navigate(url) : c; });
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
