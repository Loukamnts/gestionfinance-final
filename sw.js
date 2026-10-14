/* Service worker de Meuniance : affiche les rappels de saisie. Aucun cache, aucune requête interceptée. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  var url = typeof data.url === "string" && data.url.charAt(0) === "/" ? data.url : "/tableur";
  event.waitUntil(self.registration.showNotification(String(data.title || "Meuniance"), {
    body: String(data.body || "Pense à mettre ton tableur à jour."),
    icon: "/app-icon-180.png",
    badge: "/app-icon-180.png",
    tag: "meuniance-rappel",
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
