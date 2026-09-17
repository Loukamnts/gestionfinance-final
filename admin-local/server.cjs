"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const envFile = path.join(__dirname, "admin.env");
if (fs.existsSync(envFile)) {
  for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

const publicConfig = JSON.parse(fs.readFileSync(path.join(root, "supabase_config.json"), "utf8"));
const SUPABASE_URL = publicConfig.url;
const ANON_KEY = publicConfig.anonKey;
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const PORT = Math.max(1024, Math.min(65535, Number(process.env.ADMIN_PORT) || 4175));
const HOST = "127.0.0.1";

if (!SERVICE_KEY || SERVICE_KEY === ANON_KEY || /^sb_publishable_/i.test(SERVICE_KEY)) {
  console.error("Clé Supabase secrète absente. Configure admin-local/admin.env avant de démarrer.");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
  console.error("Adresse administrateur absente. Configure ADMIN_EMAIL dans admin-local/admin.env.");
  process.exit(1);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const publicClient = createClient(SUPABASE_URL, ANON_KEY, clientOptions);
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions);
const attempts = new Map();

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
  ["/admin.css", ["admin.css", "text/css; charset=utf-8"]]
]);

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
  };
}

function json(res, status, payload) {
  res.writeHead(status, securityHeaders("application/json; charset=utf-8"));
  res.end(JSON.stringify(payload));
}

function fail(res, status, message) { json(res, status, { ok: false, error: message }); }

async function body(req) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 32768) throw new Error("Requête trop volumineuse");
  }
  return value ? JSON.parse(value) : {};
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}

function rateLimit(req, limit = 60) {
  const key = req.socket.remoteAddress || "local";
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < 60000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length <= limit;
}

async function authenticatedUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data.user) return null;
  const email = String(data.user.email || "").toLowerCase();
  if (email !== ADMIN_EMAIL || !data.user.email_confirmed_at) return null;
  return data.user;
}

async function allUsers(max = 5000) {
  const users = [];
  for (let page = 1; page <= 50 && users.length < max; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users.slice(0, max);
}

async function exactCount(table) {
  const { count, error } = await adminClient.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    confirmedAt: user.email_confirmed_at || null,
    bannedUntil: user.banned_until || null,
    providers: (user.app_metadata && user.app_metadata.providers) || []
  };
}

async function overview(res) {
  const users = await allUsers();
  const [snapshots, friendships, permissions, sharedSheets] = await Promise.all([
    exactCount("finance_snapshots"), exactCount("friendships"), exactCount("share_permissions"), exactCount("finance_shared_sheet_snapshots")
  ]);
  json(res, 200, { ok: true, data: { users: users.length, confirmedUsers: users.filter(u => u.email_confirmed_at).length, snapshots, friendships, permissions, sharedSheets } });
}

async function usersList(url, res) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 50 });
  if (error) throw error;
  json(res, 200, { ok: true, data: (data.users || []).map(publicUser), page });
}

async function friendships(res) {
  const [{ data: rows, error }, users] = await Promise.all([
    adminClient.from("friendships").select("id,owner_id,friend_id,status,created_at").order("created_at", { ascending: false }).limit(1000),
    allUsers()
  ]);
  if (error) throw error;
  const emails = new Map(users.map(user => [user.id, user.email || user.id]));
  json(res, 200, { ok: true, data: (rows || []).map(row => ({ ...row, ownerEmail: emails.get(row.owner_id) || row.owner_id, friendEmail: emails.get(row.friend_id) || row.friend_id })) });
}

async function userDetails(url, res) {
  const id = String(url.searchParams.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 400, "Identifiant invalide");
  const [{ data: authData, error: authError }, profile, snapshot, dashboard, rows, links, permissions] = await Promise.all([
    adminClient.auth.admin.getUserById(id),
    adminClient.from("profiles").select("id,email,display_name,created_at").eq("id", id).maybeSingle(),
    adminClient.from("finance_snapshots").select("payload,updated_at").eq("owner_id", id).maybeSingle(),
    adminClient.from("finance_dashboard_snapshots").select("payload,updated_at").eq("owner_id", id).maybeSingle(),
    adminClient.from("finance_rows").select("id,year,row_key,row_label,row_order,rule,created_at").eq("owner_id", id).order("year").order("row_order").limit(2000),
    adminClient.from("friendships").select("id,owner_id,friend_id,status,created_at").or(`owner_id.eq.${id},friend_id.eq.${id}`).limit(1000),
    adminClient.from("share_permissions").select("*").or(`owner_id.eq.${id},friend_id.eq.${id}`).limit(2000)
  ]);
  if (authError) throw authError;
  for (const result of [profile, snapshot, dashboard, rows, links, permissions]) if (result.error) throw result.error;
  json(res, 200, { ok: true, data: { user: publicUser(authData.user), profile: profile.data, snapshot: snapshot.data, dashboard: dashboard.data, rows: rows.data || [], friendships: links.data || [], permissions: permissions.data || [] } });
}

async function userAction(req, res) {
  const input = await body(req);
  const id = String(input.id || "");
  const action = String(input.action || "");
  const { data, error } = await adminClient.auth.admin.getUserById(id);
  if (error || !data.user) return fail(res, 404, "Utilisateur introuvable");
  const email = String(data.user.email || "").toLowerCase();
  if (email === ADMIN_EMAIL && action === "delete") return fail(res, 403, "Le compte administrateur est protégé");
  if (action === "ban") {
    if (input.confirmation !== `SUSPENDRE ${email}`) return fail(res, 400, "Confirmation incorrecte");
    const result = await adminClient.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (result.error) throw result.error;
  } else if (action === "unban") {
    const result = await adminClient.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (result.error) throw result.error;
  } else if (action === "delete") {
    if (input.confirmation !== `SUPPRIMER ${email}`) return fail(res, 400, "Confirmation incorrecte");
    const result = await adminClient.auth.admin.deleteUser(id, false);
    if (result.error) throw result.error;
  } else return fail(res, 400, "Action inconnue");
  json(res, 200, { ok: true });
}

async function deleteFriendship(req, res) {
  const input = await body(req);
  const id = String(input.id || "");
  if (input.confirmation !== "SUPPRIMER LA RELATION") return fail(res, 400, "Confirmation incorrecte");
  const { data: relation, error: readError } = await adminClient.from("friendships").select("owner_id,friend_id").eq("id", id).maybeSingle();
  if (readError || !relation) return fail(res, 404, "Relation introuvable");
  const pair = `and(owner_id.eq.${relation.owner_id},friend_id.eq.${relation.friend_id}),and(owner_id.eq.${relation.friend_id},friend_id.eq.${relation.owner_id})`;
  const cleanup = await adminClient.from("share_permissions").delete().or(pair);
  if (cleanup.error) throw cleanup.error;
  const removed = await adminClient.from("friendships").delete().eq("id", id);
  if (removed.error) throw removed.error;
  json(res, 200, { ok: true });
}

async function deleteSnapshot(req, res) {
  const input = await body(req);
  const id = String(input.id || "");
  if (input.confirmation !== "EFFACER LA SAUVEGARDE") return fail(res, 400, "Confirmation incorrecte");
  const [full, dashboard] = await Promise.all([
    adminClient.from("finance_snapshots").delete().eq("owner_id", id),
    adminClient.from("finance_dashboard_snapshots").delete().eq("owner_id", id)
  ]);
  if (full.error) throw full.error;
  if (dashboard.error) throw dashboard.error;
  json(res, 200, { ok: true });
}

async function route(req, res) {
  if (!sameOrigin(req)) return fail(res, 403, "Origine refusée");
  if (!rateLimit(req, req.url === "/api/login" ? 10 : 120)) return fail(res, 429, "Trop de requêtes");
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === "GET" && staticFiles.has(url.pathname)) {
    const [file, type] = staticFiles.get(url.pathname);
    res.writeHead(200, securityHeaders(type));
    return res.end(fs.readFileSync(path.join(__dirname, file)));
  }
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, localOnly: true });
  if (req.method === "POST" && url.pathname === "/api/login") {
    const input = await body(req);
    if (String(input.email || "").trim().toLowerCase() !== ADMIN_EMAIL) return fail(res, 403, "Compte non autorisé");
    const { data, error } = await publicClient.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.session || String(data.user.email || "").toLowerCase() !== ADMIN_EMAIL) return fail(res, 401, "Connexion refusée");
    return json(res, 200, { ok: true, accessToken: data.session.access_token, expiresAt: data.session.expires_at, user: publicUser(data.user) });
  }
  const user = await authenticatedUser(req);
  if (!user) return fail(res, 401, "Session administrateur requise");
  if (req.method === "GET" && url.pathname === "/api/overview") return overview(res);
  if (req.method === "GET" && url.pathname === "/api/users") return usersList(url, res);
  if (req.method === "GET" && url.pathname === "/api/friendships") return friendships(res);
  if (req.method === "GET" && url.pathname === "/api/user") return userDetails(url, res);
  if (req.method === "POST" && url.pathname === "/api/user/action") return userAction(req, res);
  if (req.method === "POST" && url.pathname === "/api/friendship/delete") return deleteFriendship(req, res);
  if (req.method === "POST" && url.pathname === "/api/snapshot/delete") return deleteSnapshot(req, res);
  fail(res, 404, "Route inconnue");
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    console.error("Erreur administrateur:", error && error.message ? error.message : "erreur inconnue");
    if (!res.headersSent) fail(res, 500, "Action impossible");
    else res.end();
  });
});
server.listen(PORT, HOST, () => console.log(`Console locale : http://${HOST}:${PORT}`));

