"use strict";

(function () {
  let token = "";
  let users = [];
  let pendingConfirmation = null;
  const $ = selector => document.querySelector(selector);
  const views = { overview: $("#overviewView"), users: $("#usersView"), friendships: $("#friendshipsView") };
  const titles = { overview: "Vue d’ensemble", users: "Utilisateurs", friendships: "Amitiés et partages" };

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({ ok: false, error: "Réponse invalide" }));
    if (response.status === 401 && path !== "/api/login") logout();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Action impossible");
    return payload.data !== undefined ? payload.data : payload;
  }

  function message(text, error = false) {
    const el = $("#notice");
    el.textContent = text || "";
    el.classList.toggle("is-error", error);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showView(name) {
    Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("is-active", button.dataset.view === name));
    $("#pageTitle").textContent = titles[name];
    loadView(name);
  }

  async function loadOverview() {
    const data = await api("/api/overview");
    const labels = [["Utilisateurs", data.users], ["Comptes confirmés", data.confirmedUsers], ["Sauvegardes", data.snapshots], ["Relations", data.friendships], ["Autorisations", data.permissions], ["Copies partagées", data.sharedSheets]];
    const metrics = $("#metrics");
    metrics.replaceChildren(...labels.map(([label, value]) => { const card = element("article", "metric"); card.append(element("strong", "", String(value)), element("span", "", label)); return card; }));
  }

  async function loadUsers() {
    users = await api("/api/users?page=1");
    renderUsers();
  }

  function renderUsers() {
    const query = $("#userSearch").value.trim().toLowerCase();
    const body = $("#usersBody");
    body.replaceChildren(...users.filter(user => !query || user.email.toLowerCase().includes(query)).map(user => {
      const row = document.createElement("tr");
      const email = element("td", "", user.email || user.id);
      const statusCell = document.createElement("td");
      statusCell.append(element("span", `badge ${user.bannedUntil ? "bad" : user.confirmedAt ? "ok" : ""}`, user.bannedUntil ? "Suspendu" : user.confirmedAt ? "Confirmé" : "À confirmer"));
      const actionCell = document.createElement("td");
      const view = element("button", "", "Gérer");
      view.type = "button";
      view.addEventListener("click", () => openUser(user.id));
      actionCell.append(view);
      row.append(email, statusCell, element("td", "", formatDate(user.createdAt)), element("td", "", formatDate(user.lastSignInAt)), actionCell);
      return row;
    }));
  }

  async function loadFriendships() {
    const rows = await api("/api/friendships");
    const body = $("#friendshipsBody");
    body.replaceChildren(...rows.map(relation => {
      const row = document.createElement("tr");
      const statusCell = document.createElement("td");
      statusCell.append(element("span", `badge ${relation.status === "accepted" ? "ok" : relation.status === "blocked" ? "bad" : ""}`, relation.status));
      const actionCell = document.createElement("td");
      const remove = element("button", "danger", "Retirer");
      remove.type = "button";
      remove.addEventListener("click", () => confirmAction({ title: "Supprimer cette relation", phrase: "SUPPRIMER LA RELATION", action: () => api("/api/friendship/delete", { method: "POST", body: JSON.stringify({ id: relation.id, confirmation: "SUPPRIMER LA RELATION" }) }).then(loadFriendships) }));
      actionCell.append(remove);
      row.append(element("td", "", relation.ownerEmail), element("td", "", relation.friendEmail), statusCell, element("td", "", formatDate(relation.created_at)), actionCell);
      return row;
    }));
  }

  async function openUser(id) {
    message("Chargement du compte…");
    try {
      const data = await api(`/api/user?id=${encodeURIComponent(id)}`);
      const user = data.user;
      $("#detailTitle").textContent = user.email || user.id;
      const content = $("#detailContent");
      const grid = element("div", "detail-grid");
      const fields = [["Identifiant", user.id], ["État", user.bannedUntil ? "Suspendu" : "Actif"], ["Création", formatDate(user.createdAt)], ["Dernière connexion", formatDate(user.lastSignInAt)], ["Lignes financières", data.rows.length], ["Relations", data.friendships.length], ["Autorisations", data.permissions.length], ["Sauvegarde", data.snapshot ? formatDate(data.snapshot.updated_at) : "Aucune"]];
      fields.forEach(([label, value]) => { const item = element("div", "detail-item"); item.append(element("span", "", label), element("b", "", String(value))); grid.append(item); });
      const json = element("pre", "json-box", JSON.stringify({ profile: data.profile, snapshot: data.snapshot, dashboard: data.dashboard, rows: data.rows, friendships: data.friendships, permissions: data.permissions }, null, 2));
      const actions = element("div", "detail-actions");
      const suspend = element("button", user.bannedUntil ? "" : "danger", user.bannedUntil ? "Réactiver" : "Suspendre");
      suspend.type = "button";
      suspend.addEventListener("click", () => {
        if (user.bannedUntil) runUserAction(user, "unban", "");
        else confirmAction({ title: "Suspendre ce compte", phrase: `SUSPENDRE ${user.email.toLowerCase()}`, action: () => runUserAction(user, "ban", `SUSPENDRE ${user.email.toLowerCase()}`) });
      });
      const clear = element("button", "danger", "Effacer la sauvegarde");
      clear.type = "button";
      clear.addEventListener("click", () => confirmAction({ title: "Effacer les sauvegardes", phrase: "EFFACER LA SAUVEGARDE", action: () => api("/api/snapshot/delete", { method: "POST", body: JSON.stringify({ id: user.id, confirmation: "EFFACER LA SAUVEGARDE" }) }).then(() => openUser(user.id)) }));
      const remove = element("button", "danger", "Supprimer le compte");
      remove.type = "button";
      remove.addEventListener("click", () => confirmAction({ title: "Supprimer définitivement le compte", phrase: `SUPPRIMER ${user.email.toLowerCase()}`, action: () => runUserAction(user, "delete", `SUPPRIMER ${user.email.toLowerCase()}`, true) }));
      actions.append(suspend, clear, remove);
      content.replaceChildren(grid, json, actions);
      $("#detailDialog").showModal();
      message("");
    } catch (error) { message(error.message, true); }
  }

  async function runUserAction(user, action, confirmation, close = false) {
    await api("/api/user/action", { method: "POST", body: JSON.stringify({ id: user.id, action, confirmation }) });
    if (close) $("#detailDialog").close();
    else await openUser(user.id);
    await loadUsers();
    message("Action enregistrée.");
  }

  function confirmAction(options) {
    pendingConfirmation = options;
    $("#confirmTitle").textContent = options.title;
    $("#confirmText").textContent = `Pour confirmer, recopie exactement : ${options.phrase}`;
    $("#confirmation").value = "";
    $("#confirmDialog").showModal();
    $("#confirmation").focus();
  }

  async function loadView(name) {
    message("Chargement…");
    try {
      if (name === "overview") await loadOverview();
      if (name === "users") await loadUsers();
      if (name === "friendships") await loadFriendships();
      message("");
    } catch (error) { message(error.message, true); }
  }

  function logout() {
    token = "";
    $("#adminView").hidden = true;
    $("#loginView").hidden = false;
    $("#password").value = "";
  }

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const status = $("#loginMessage");
    status.textContent = "Vérification…";
    status.classList.remove("is-error");
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ email: $("#email").value, password: $("#password").value }) });
      token = result.accessToken;
      $("#loginView").hidden = true;
      $("#adminView").hidden = false;
      $("#password").value = "";
      showView("overview");
    } catch (error) { status.textContent = error.message; status.classList.add("is-error"); }
  });
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $("#refresh").addEventListener("click", () => loadView(document.querySelector(".nav-item.is-active").dataset.view));
  $("#logout").addEventListener("click", logout);
  $("#userSearch").addEventListener("input", renderUsers);
  $("#detailClose").addEventListener("click", () => $("#detailDialog").close());
  $("#confirmForm").addEventListener("submit", async event => {
    if (event.submitter && event.submitter.value === "cancel") { pendingConfirmation = null; return; }
    event.preventDefault();
    if (!pendingConfirmation || $("#confirmation").value !== pendingConfirmation.phrase) { message("La phrase de confirmation est incorrecte.", true); return; }
    const action = pendingConfirmation.action;
    pendingConfirmation = null;
    $("#confirmDialog").close();
    try { await action(); message("Action terminée."); } catch (error) { message(error.message, true); }
  });
})();

