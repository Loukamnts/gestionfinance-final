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
          // Récupérer les permissions que j'ai accordées (si je suis owner) ou reçues
          var permissionOwnerId = isRequester ? user.id : otherId;
          var permissionFriendId = isRequester ? otherId : user.id;
          var permRes = await sb.from("share_permissions")
            .select("can_view_dashboard,can_view_sheet,can_view_categories")
            .eq("owner_id", permissionOwnerId)
            .eq("friend_id", permissionFriendId)
            .is("year", null).is("month", null).is("row_key", null)
            .maybeSingle();
          friendObj.permissions = (permRes.data && !permRes.error) ? permRes.data : { can_view_dashboard: false, can_view_sheet: false, can_view_categories: false };
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

        // Toggle permissions (seulement si je suis le requester)
        if(f.isRequester){
          html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_sheet ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_sheet\',this.checked)" /> Tableur</label>';
          html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_dashboard ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_dashboard\',this.checked)" /> Dashboard</label>';
          html += '<label class="friends-perm-toggle"><input type="checkbox" ' + (f.permissions.can_view_categories ? "checked" : "") + ' onchange="window.FriendsSystem.togglePerm(\'' + f.friendId + '\',\'can_view_categories\',this.checked)" /> Catégories</label>';
        } else {
          // Je suis l'ami, je peux voir ce qu'il m'a autorisé
          html += '<span class="friends-perm-badge ' + (f.permissions.can_view_sheet ? "active" : "") + '">Tableur</span>';
          html += '<span class="friends-perm-badge ' + (f.permissions.can_view_dashboard ? "active" : "") + '">Dashboard</span>';
          html += '<span class="friends-perm-badge ' + (f.permissions.can_view_categories ? "active" : "") + '">Catégories</span>';
        }

        html += '</div>';
        html += '<button class="friends-reject-btn" onclick="window.FriendsSystem.remove(\'' + f.friendshipId + '\')">Supprimer</button>';
        html += '</div>';
      }
    } else if(data.pending.length === 0 && data.sent.length === 0){
      html += '<div class="friends-empty">Tu n\'as pas encore d\'amis. Invite un proche par e-mail pour commencer.</div>';
    }

    container.innerHTML = html;
  }

  // === API publique ===
  window.FriendsSystem = {
    loadFriends: loadFriends,
    renderFriends: renderFriends,
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
      }
    },
    accept: async function(friendshipId){
      var res = await acceptFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); }
    },
    decline: async function(friendshipId){
      var res = await declineFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); }
    },
    remove: async function(friendshipId){
      var res = await removeFriend(friendshipId);
      if(res.error) alert(res.error);
      else { var container = document.getElementById("friendsContainer"); if(container) renderFriends(container); }
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
