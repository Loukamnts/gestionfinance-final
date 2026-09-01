/* ═══════════════════════════════════════════════════════════════
   friends.js — Système d'amis avec Supabase (invitation par e-mail)
   - Invitation par e-mail au lieu de code ami
   - Demande/acceptation d'amis
   - Permissions par ami (dashboard, tableur, catégories)
   - Visualisation du tableur des amis selon leurs autorisations
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function getSupabase(){ try{ return window.__account && window.__account.client ? window.__account.client : null; }catch(e){ return null; } }
  function getUser(){ try{ return window.__account && window.__account.user ? window.__account.user : null; }catch(e){ return null; } }

  var friendsList = [];
  var pendingRequests = [];
  var sentRequests = [];

  // === Récupérer l'e-mail de l'utilisateur connecté ===
  async function getMyEmail(){
    var user = getUser();
    if(!user) return null;
    return user.email || null;
  }

  // === Récupérer la liste d'amis ===
  async function loadFriends(){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { friends: [], pending: [], sent: [] };
    try{
      // Lecture via RPC : elle ne renvoie que les relations de l'utilisateur
      // connecté et reste fiable même avec des RLS strictes.
      var res = await sb.rpc("get_my_friendships");
      if(res.error || !res.data) return { friends: [], pending: [], sent: [] };

      var friends = [];
      var pending = [];
      var sent = [];

      for(var i = 0; i < res.data.length; i++){
        var f = res.data[i];
        var otherId = f.owner_id === user.id ? f.friend_id : f.owner_id;
        var isRequester = f.owner_id === user.id;

        var friendObj = {
          friendshipId: f.friendship_id,
          friendId: otherId,
          displayName: f.other_display_name || (f.other_email ? f.other_email.split("@")[0] : "Ami"),
          email: f.other_email || "",
          status: f.status,
          isRequester: isRequester
        };

        if(f.status === "accepted"){
          // Chaque personne est propriétaire de ses propres données, peu importe
          // qui a envoyé l'invitation. Les deux amis peuvent donc partager dans
          // les deux sens avec leurs réglages respectifs.
          var ownPermRes = await sb.from("share_permissions")
            .select("can_view_dashboard,can_view_sheet,can_view_categories")
            .eq("owner_id", user.id)
            .eq("friend_id", otherId)
            .is("year", null).is("month", null).is("row_key", null)
            .maybeSingle();
          var receivedPermRes = await sb.from("share_permissions")
            .select("can_view_dashboard,can_view_sheet,can_view_categories")
            .eq("owner_id", otherId)
            .eq("friend_id", user.id)
            .is("year", null).is("month", null).is("row_key", null)
            .maybeSingle();
          friendObj.permissions = (ownPermRes.data && !ownPermRes.error) ? ownPermRes.data : { can_view_dashboard: false, can_view_sheet: false, can_view_categories: false };
          friendObj.receivedPermissions = (receivedPermRes.data && !receivedPermRes.error) ? receivedPermRes.data : { can_view_dashboard: false, can_view_sheet: false, can_view_categories: false };
          friends.push(friendObj);
        } else if(f.status === "pending"){
          if(isRequester) sent.push(friendObj);
          else pending.push(friendObj);
        }
      }

      friendsList = friends;
      pendingRequests = pending;
      sentRequests = sent;
      return { friends: friends, pending: pending, sent: sent };
    }catch(e){
      console.warn("loadFriends error:", e);
      return { friends: [], pending: [], sent: [] };
    }
  }

  // === Envoyer une invitation par e-mail ===
  function translateFriendRequestError(error){
    var message = String((error && error.message) || error || "").toLowerCase();
    if(/user_not_found/.test(message)) return "Aucun utilisateur trouvé avec cet e-mail";
    if(/cannot_add_self/.test(message)) return "Tu ne peux pas t'ajouter toi-même";
    if(/request_already_sent/.test(message)) return "Demande déjà envoyée";
    if(/request_already_received/.test(message)) return "Cette personne t'a déjà envoyé une demande";
    if(/already_friends/.test(message)) return "Déjà amis";
    if(/friend_request_blocked/.test(message)) return "Cette demande ne peut pas être envoyée";
    if(/send_friend_request_by_email/.test(message)) return "Le système d'amis est en cours de mise à jour. Réessaie dans un instant.";
    return "Impossible d'envoyer la demande d'ami. Réessaie dans un instant.";
  }

  async function sendFriendRequestByEmail(email){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    if(!email || email.length < 5 || email.indexOf("@") === -1) return { error: "E-mail invalide" };

    try{
      // La recherche et l'insertion sont faites par une RPC securisee : les
      // RLS ne doivent pas exposer les profils de tous les utilisateurs.
      var res = await sb.rpc("send_friend_request_by_email", { p_email: email.trim().toLowerCase() });
      if(res.error) return { error: translateFriendRequestError(res.error) };
      return { success: true };
    }catch(e){
      return { error: translateFriendRequestError(e) };
    }
  }

  // === Accepter une demande ===
  async function acceptFriend(friendshipId){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var res = await sb.rpc("respond_to_friend_request", { p_friendship_id: friendshipId, p_accept: true });
      if(res.error) return { error: "Impossible d'accepter cette demande. Réessaie dans un instant." };
      return { success: true };
    }catch(e){ return { error: e.message }; }
  }

  // === Refuser une demande ===
  async function declineFriend(friendshipId){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var res = await sb.rpc("respond_to_friend_request", { p_friendship_id: friendshipId, p_accept: false });
      if(res.error) return { error: "Impossible de refuser cette demande. Réessaie dans un instant." };
      return { success: true };
    }catch(e){ return { error: e.message }; }
  }

  // === Supprimer un ami ===
  async function removeFriend(friendshipId){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var relation = friendsList.concat(pendingRequests, sentRequests).find(function(item){ return item.friendshipId === friendshipId; });
      if(!relation) return { error: "Relation introuvable" };
      var deleteFriendship = await sb.from("friendships").delete().eq("id", friendshipId);
      if(deleteFriendship.error) return { error: deleteFriendship.error.message };
      var deletePermissions = await sb.from("share_permissions")
        .delete()
        .or("and(owner_id.eq." + user.id + ",friend_id.eq." + relation.friendId + "),and(owner_id.eq." + relation.friendId + ",friend_id.eq." + user.id + ")");
      if(deletePermissions.error) return { error: deletePermissions.error.message };
      return { success: true };
    }catch(e){ return { error: e.message }; }
  }

  // === Mettre à jour les permissions ===
  async function updatePermissions(friendId, permissions){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var record = {
        owner_id: user.id,
        friend_id: friendId,
        can_view_dashboard: permissions.can_view_dashboard || false,
        can_view_sheet: permissions.can_view_sheet || false,
        can_view_categories: permissions.can_view_categories || false,
        year: null,
        month: null,
        row_key: null
      };
      var existing = await sb.from("share_permissions")
        .select("id")
        .eq("owner_id", user.id).eq("friend_id", friendId)
        .is("year", null).is("month", null).is("row_key", null)
        .limit(1)
        .maybeSingle();
      if(existing.error) return { error: existing.error.message };
      var res = existing.data
        ? await sb.from("share_permissions").update(record).eq("id", existing.data.id)
        : await sb.from("share_permissions").insert(record);
      if(res.error) return { error: res.error.message };
      return { success: true };
    }catch(e){ return { error: e.message }; }
  }

  // === Voir le tableur d'un ami ===
  async function loadFriendSnapshot(friendId){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var res = await sb.from("finance_snapshots").select("payload").eq("owner_id", friendId).single();
      if(res.error || !res.data || !res.data.payload) return { error: "Données non disponibles" };
      var snap = typeof res.data.payload === "string" ? JSON.parse(res.data.payload) : res.data.payload;
      return { success: true, snapshot: snap };
    }catch(e){ return { error: e.message }; }
  }
  async function loadFriendDashboard(friendId){
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user) return { error: "Non connecté" };
    try{
      var res = await sb.from("finance_dashboard_snapshots").select("payload").eq("owner_id", friendId).single();
      if(res.error || !res.data || !res.data.payload) return { error: "Dashboard non disponible" };
      return { success: true, dashboard: typeof res.data.payload === "string" ? JSON.parse(res.data.payload) : res.data.payload };
    }catch(e){ return { error: e.message }; }
  }

  // === Rendu UI ===
  function escapeHtml(str){
    if(!str) return "";
    return String(str).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }

  async function renderFriends(container){
    if(!container) return;
    var sb = getSupabase(); var user = getUser();
    if(!sb || !user){
      container.innerHTML = '<div class="friends-locked">Connecte-toi pour utiliser le système d\'amis.</div>';
      return;
    }

    var data = await loadFriends();
    var myEmail = await getMyEmail();

    var html = '';

    // Mon e-mail (pour partager)
    if(myEmail){
      html += '<div class="friends-code-box">';
      html += '<div class="friends-code-label">Ton e-mail</div>';
      html += '<div class="friends-code-value">' + escapeHtml(myEmail) + '</div>';
      html += '<button class="friends-copy-btn" onclick="window.FriendsSystem.copyCode(\'' + escapeHtml(myEmail) + '\')">Copier</button>';
      html += '</div>';
    }

    // Inviter par e-mail
    html += '<div class="friends-add-box">';
    html += '<input type="email" id="friendCodeInput" placeholder="E-mail de la personne" />';
    html += '<button class="friends-add-btn" onclick="window.FriendsSystem.addFriend()">Inviter</button>';
    html += '</div>';

    // Demandes reçues
    if(data.pending.length > 0){
      html += '<div class="friends-section-title">Demandes reçues</div>';
      for(var i = 0; i < data.pending.length; i++){
        var p = data.pending[i];
        html += '<div class="friends-request-item">';
        html += '<div class="friends-avatar">' + escapeHtml(p.displayName.charAt(0).toUpperCase()) + '</div>';
        html += '<div class="friends-name">' + escapeHtml(p.displayName) + '</div>';
        html += '<button class="friends-accept-btn" onclick="window.FriendsSystem.accept(\'' + p.friendshipId + '\')">Accepter</button>';
        html += '<button class="friends-reject-btn" onclick="window.FriendsSystem.decline(\'' + p.friendshipId + '\')">Refuser</button>';
        html += '</div>';
      }
    }

    // Demandes envoyées
    if(data.sent.length > 0){
      html += '<div class="friends-section-title">Invitations envoyées</div>';
      for(var k = 0; k < data.sent.length; k++){
        var s = data.sent[k];
        html += '<div class="friends-request-item">';
        html += '<div class="friends-avatar">' + escapeHtml(s.displayName.charAt(0).toUpperCase()) + '</div>';
        html += '<div class="friends-name">' + escapeHtml(s.displayName) + '</div>';
        html += '<span class="friends-pending-badge">En attente</span>';
        html += '</div>';
      }
    }

    // Mes amis
    if(data.friends.length > 0){
      html += '<div class="friends-section-title">Mes amis</div>';
      for(var j = 0; j < data.friends.length; j++){
        var f = data.friends[j];
        html += '<div class="friends-list-item">';
        html += '<div class="friends-avatar">' + escapeHtml(f.displayName.charAt(0).toUpperCase()) + '</div>';
        html += '<div class="friends-name">' + escapeHtml(f.displayName) + '</div>';
        html += '<div class="friends-perms">';

        // Les autorisations sont toujours celles de mes propres données.
        html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_sheet ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_sheet\',this.checked)" /> Mon tableur</label>';
        html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_dashboard ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_dashboard\',this.checked)" /> Mon dashboard</label>';
        html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_categories ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_categories\',this.checked)" /> Mes catégories</label>';

        html += '</div>';
        html += '<button class="friends-reject-btn" onclick="window.FriendsSystem.remove(\'' + f.friendshipId + '\')">Supprimer</button>';
        html += '</div>';
      }
    } else if(data.pending.length === 0 && data.sent.length === 0){
      html += '<div class="friends-empty">Tu n\'as pas encore d\'amis. Invite un proche par e-mail pour commencer.</div>';
    }

    container.innerHTML = html;
  }

  function el(tag, className, text){
    var node = document.createElement(tag);
    if(className) node.className = className;
    if(text !== undefined) node.textContent = text;
    return node;
  }
  function permissionToggle(friend, label, key, onChanged){
    var labelEl = el("label", "sharing-permission");
    var input = document.createElement("input"); input.type = "checkbox"; input.checked = !!friend.permissions[key];
    input.addEventListener("change", async function(){
      var next = Object.assign({}, friend.permissions, {}); next[key] = input.checked;
      input.disabled = true;
      var res = await updatePermissions(friend.friendId, next);
      input.disabled = false;
      if(res.error){ input.checked = !input.checked; alert("Impossible d’enregistrer l’autorisation. Réessaie dans un instant."); return; }
      friend.permissions = next;
      if(onChanged) onChanged();
    });
    labelEl.append(input, document.createTextNode(label));
    return labelEl;
  }
  function friendlyValue(raw){
    var value = String(raw == null ? "" : raw).trim();
    if(value.charAt(0) === "=") return "Formule";
    return value || "—";
  }
  function snapshotSheet(snapshot){
    return snapshot && snapshot.sheets && snapshot.sheets.length ? snapshot.sheets[0] : null;
  }
  function renderSharedTable(container, snapshot, friend){
    var sheet = snapshotSheet(snapshot);
    container.replaceChildren();
    if(!sheet){ container.hidden = false; container.append(el("p", "", "Aucune donnée de tableur n’est disponible pour le moment.")); return; }
    container.hidden = false;
    container.append(el("h3", "", "Tableur partagé — " + friend.displayName));
    container.append(el("p", "", "Consultation seule : tes propres données ne sont jamais modifiées."));
    var wrap = el("div", "shared-table-wrap"), table = el("table", "shared-table"), head = document.createElement("thead"), row = document.createElement("tr");
    row.append(el("th", "", "Ligne"));
    var cols = Math.min(Number(sheet.cols) || 0, 10);
    for(var c = 0; c < cols; c++) row.append(el("th", "", (sheet.headers && sheet.headers[c]) || String.fromCharCode(65 + c)));
    head.append(row); table.append(head);
    var body = document.createElement("tbody"), rows = Math.min(Number(sheet.rows) || 0, 18);
    for(var r = 0; r < rows; r++){
      var tr = document.createElement("tr"); tr.append(el("th", "", (sheet.rowHeaders && sheet.rowHeaders[r]) || String(r + 1)));
      for(var c2 = 0; c2 < cols; c2++){
        var cell = sheet.cells && sheet.cells[r + "," + c2]; tr.append(el("td", "", friendlyValue(cell && cell.raw)));
      }
      body.append(tr);
    }
    table.append(body); wrap.append(table); container.append(wrap);
  }
  function renderSharedDashboard(container, dashboard, friend){
    container.replaceChildren(); container.hidden = false;
    container.append(el("h3", "", "Dashboard partagé — " + friend.displayName));
    container.append(el("p", "", "Aperçu en lecture seule : aucun contenu de cellule ou formule n’est transmis."));
    var months = (dashboard && dashboard.months) || [];
    if(!months.length){ container.append(el("div", "sharing-empty", "Aucune donnée de dashboard n’est disponible pour le moment.")); return; }
    var totalSalary = months.reduce(function(sum, month){ return sum + Number(month.salary || 0); }, 0);
    var totalSavings = months.reduce(function(sum, month){ return sum + Number(month.savingsTotal || 0); }, 0);
    var totalExpenses = months.reduce(function(sum, month){ return sum + Math.abs(Number(month.expenses || 0)); }, 0);
    var latest = months[months.length - 1] || {};
    var grid = el("div", "chart-detail-grid");
    [["Mois analysés", String(months.length)], ["Revenus", totalSalary.toLocaleString("fr-FR", {style:"currency",currency:"EUR"})], ["Dépenses", totalExpenses.toLocaleString("fr-FR", {style:"currency",currency:"EUR"})], ["Épargne", totalSavings.toLocaleString("fr-FR", {style:"currency",currency:"EUR"})]].forEach(function(item){ var card=el("div"), label=el("span", "", item[0]), value=el("strong", "", item[1]); card.append(label,value); grid.append(card); });
    container.append(grid);
    var note = el("p", "", "Dernier mois : " + (latest.label || "—") + "."); note.style.marginTop = "14px"; container.append(note);
  }
  async function viewShared(friend, mode){
    var target = document.getElementById("sharedView");
    if(!target) return;
    target.hidden = false; target.replaceChildren(el("p", "", "Chargement du contenu partagé…"));
    var result = mode === "dashboard" ? await loadFriendDashboard(friend.friendId) : await loadFriendSnapshot(friend.friendId);
    if(result.error){ target.replaceChildren(el("p", "", "Le contenu n’est pas disponible : " + result.error)); return; }
    if(mode === "dashboard") renderSharedDashboard(target, result.dashboard, friend);
    else renderSharedTable(target, result.snapshot, friend);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function renderSharing(container){
    if(!container) return;
    var user = getUser();
    if(!user){ container.replaceChildren(el("div", "sharing-empty", "Connecte-toi pour gérer les partages.")); return; }
    container.replaceChildren(el("div", "sharing-empty", "Chargement des partages…"));
    var data = await loadFriends();
    var layout = el("div", "sharing-layout");
    var invite = el("section", "sharing-card"); invite.append(el("h3", "", "Inviter un proche"), el("p", "", "Une invitation est envoyée par e-mail. Chaque personne garde le contrôle de ses données."));
    var email = document.createElement("input"); email.type = "email"; email.placeholder = "nom@exemple.com"; email.autocomplete = "email";
    var inviteButton = el("button", "sharing-action", "Envoyer l’invitation"); inviteButton.type = "button";
    inviteButton.addEventListener("click", async function(){ var result = await sendFriendRequestByEmail(email.value.trim()); if(result.error){ alert(result.error); return; } email.value=""; renderSharing(container); });
    var inputRow = el("div", "sharing-email"); inputRow.append(email, inviteButton); invite.append(inputRow); layout.append(invite);
    var received = el("section", "sharing-card"); received.append(el("h3", "", "Demandes reçues"), el("p", "", "Accepte une demande avant de définir les accès."));
    if(!data.pending.length) received.append(el("div", "sharing-empty", "Aucune demande en attente."));
    data.pending.forEach(function(request){ var item=el("div", "sharing-person"), info=el("div"); info.append(el("h4", "", request.displayName),el("p", "", request.email)); var actions=el("div", "sharing-actions"), accept=el("button", "sharing-action", "Accepter"), decline=el("button", "sharing-action", "Refuser"); accept.type=decline.type="button"; accept.addEventListener("click",async function(){ var result=await acceptFriend(request.friendshipId); if(result.error){alert(result.error);return;} renderSharing(container); tryRenderFriends(); }); decline.addEventListener("click",async function(){ var result=await declineFriend(request.friendshipId); if(result.error){alert(result.error);return;} renderSharing(container); tryRenderFriends(); }); actions.append(accept,decline); item.append(info,actions); received.append(item); }); layout.append(received);
    var manage = el("section", "sharing-card wide"); manage.append(el("h3", "", "Ce que tu partages"), el("p", "", "Active uniquement les accès que tu souhaites donner. Les autorisations sont séparées dans chaque sens."));
    if(!data.friends.length) manage.append(el("div", "sharing-empty", "Ajoute un ami pour définir des autorisations."));
    data.friends.forEach(function(friend){ var item=el("div", "sharing-person"), info=el("div"); info.append(el("h4", "", friend.displayName),el("p", "", friend.email || "Ami")); var perms=el("div", "sharing-permissions"); perms.append(permissionToggle(friend,"Dashboard","can_view_dashboard"),permissionToggle(friend,"Tableur","can_view_sheet"),permissionToggle(friend,"Catégories","can_view_categories")); item.append(info,perms); manage.append(item); }); layout.append(manage);
    var access = el("section", "sharing-card wide"); access.append(el("h3", "", "Partagé avec moi"), el("p", "", "Ouvre le dashboard ou le tableur d’un ami sans mélanger ses données aux tiennes."));
    var hasAccess = false;
    data.friends.forEach(function(friend){ var perms=friend.receivedPermissions || {}; if(!perms.can_view_dashboard && !perms.can_view_sheet) return; hasAccess=true; var item=el("div", "sharing-person"),info=el("div"); info.append(el("h4", "", friend.displayName),el("p", "", "Accès accordés par cet ami")); var actions=el("div", "sharing-actions"); if(perms.can_view_dashboard){var dashboard=el("button", "sharing-action", "Voir son dashboard"); dashboard.type="button"; dashboard.addEventListener("click",function(){viewShared(friend,"dashboard");}); actions.append(dashboard);} if(perms.can_view_sheet){var sheet=el("button", "sharing-action", "Voir son tableur"); sheet.type="button"; sheet.addEventListener("click",function(){viewShared(friend,"sheet");}); actions.append(sheet);} item.append(info,actions); access.append(item); });
    if(!hasAccess) access.append(el("div", "sharing-empty", "Aucun contenu partagé avec toi pour le moment.")); layout.append(access);
    container.replaceChildren(layout);
  }

  // === API publique ===
  window.FriendsSystem = {
    loadFriends: loadFriends,
    renderFriends: renderFriends,
    renderSharing: renderSharing,
    sendFriendRequest: sendFriendRequestByEmail,
    acceptFriend: acceptFriend,
    declineFriend: declineFriend,
    removeFriend: removeFriend,
    updatePermissions: updatePermissions,
    loadFriendSnapshot: loadFriendSnapshot,
    getMyEmail: getMyEmail,
    copyCode: function(code){
      try{ navigator.clipboard.writeText(code); }catch(e){}
    },
    addFriend: async function(){
      var input = document.getElementById("friendCodeInput");
      if(!input) return;
      var email = input.value.trim();
      if(!email || email.length < 5 || email.indexOf("@") === -1){ alert("E-mail invalide"); return; }
      var res = await sendFriendRequestByEmail(email);
      if(res.error){ alert(res.error); }
      else {
        alert("Invitation envoyée !");
        var container = document.getElementById("friendsContainer");
        if(container) renderFriends(container);
        var sharing = document.getElementById("sharingContainer");
        if(sharing) renderSharing(sharing);
      }
    },
    accept: async function(friendshipId){
      var res = await acceptFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); var sharing = document.getElementById("sharingContainer"); if(sharing) renderSharing(sharing); }
    },
    decline: async function(friendshipId){
      var res = await declineFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); var sharing = document.getElementById("sharingContainer"); if(sharing) renderSharing(sharing); }
    },
    remove: async function(friendshipId){
      var res = await removeFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); var sharing = document.getElementById("sharingContainer"); if(sharing) renderSharing(sharing); }
    },
    togglePerm: async function(friendId, perm, value){
      var data = await loadFriends();
      var friend = data.friends.find(function(f){ return f.friendId === friendId; });
      if(!friend) return;
      var perms = friend.permissions || {};
      perms[perm] = value;
      await updatePermissions(friendId, perms);
    }
  };

  // Re-render quand l'utilisateur se connecte (via événement authStateChanged)
  function tryRenderFriends(){
    var container = document.getElementById("friendsContainer");
    if(container && getUser()){
      renderFriends(container);
    } else if(container && !getUser()){
      container.innerHTML = '<div class="friends-locked">Connecte-toi pour utiliser le système d\'amis.</div>';
    }
  }
  window.addEventListener("authStateChanged", tryRenderFriends);
  // Au chargement, vérifie périodiquement pendant 30s
  var checkInterval = setInterval(function(){
    var container = document.getElementById("friendsContainer");
    if(container && getUser()){
      clearInterval(checkInterval);
      renderFriends(container);
    }
  }, 1000);
  setTimeout(function(){ clearInterval(checkInterval); }, 30000);
  // Re-render aussi quand on arrive sur la page settings
  var settingsBtn = document.getElementById("settingsButton");
  if(settingsBtn){ settingsBtn.addEventListener("click", function(){ setTimeout(tryRenderFriends, 200); }); }
})();
