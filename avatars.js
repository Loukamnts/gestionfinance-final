/* Avatars Meuniance : ton initiale gravée en doré dans une médaille, avec 8 teintes au choix.
   Sobre, aux couleurs du site, et lisible même en tout petit. Pas de photos envoyées :
   rien d'inapproprié possible, aucune image stockée. La base n'accepte que ces noms de teintes. */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function esc(v){return String(v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}

  // [identifiant, nom FR, nom EN, fond centre, fond bord, lettre haut, lettre bas, anneau]
  var LIST=[
    ["seigle","Seigle","Rye","#2A4535","#0F1A14","#F7D886","#D3962A","#E3A82B"],
    ["foret","Forêt","Forest","#2F7553","#16402C","#F7D886","#D3962A","#E3A82B"],
    ["nuit","Nuit","Night","#2C4366","#121D30","#F7D886","#D3962A","#E3A82B"],
    ["bordeaux","Bordeaux","Burgundy","#7A2E40","#3A111D","#F7D886","#D3962A","#E3A82B"],
    ["terre","Terre cuite","Terracotta","#A5523A","#5A2516","#FBE3A6","#E3A82B","#F2C66B"],
    ["prune","Prune","Plum","#5A3E6E","#271932","#F7D886","#D3962A","#E3A82B"],
    ["ardoise","Ardoise","Slate","#4A535E","#1F252C","#F7D886","#D3962A","#E3A82B"],
    ["or","Or","Gold","#F4CF72","#C98D1F","#2A4535","#0F1A14","#8A5E12"]
  ];
  var BY={};LIST.forEach(function(a){BY[a[0]]=a;});
  var uid=0;
  function initial(v){var c=String(v||"").trim().replace(/^@/,"").charAt(0).toUpperCase();return c||"?";}
  /* Médaille : fond en léger relief, anneau doré, initiale gravée (dégradé doré).
     Identifiants de dégradés uniques à chaque dessin (un dégradé partagé disparaît si son SVG est masqué). */
  function svg(id,letter){
    var a=BY[id];if(!a)return "";var k="gfa"+(++uid);
    return '<svg class="gfa-svg" viewBox="0 0 48 48" aria-hidden="true"><defs>'+
      '<radialGradient id="'+k+'b" cx="24" cy="16" r="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="'+a[3]+'"/><stop offset="1" stop-color="'+a[4]+'"/></radialGradient>'+
      '<linearGradient id="'+k+'l" x1="0" y1="13" x2="0" y2="35" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="'+a[5]+'"/><stop offset="1" stop-color="'+a[6]+'"/></linearGradient></defs>'+
      '<circle cx="24" cy="24" r="24" fill="url(#'+k+'b)"/><circle cx="24" cy="24" r="21.4" fill="none" stroke="'+a[7]+'" stroke-opacity=".55" stroke-width="1"/>'+
      '<text x="24" y="24.6" text-anchor="middle" dominant-baseline="central" font-family="Georgia, \'Times New Roman\', serif" font-size="23" font-weight="600" fill="url(#'+k+'l)">'+esc(initial(letter))+'</text></svg>';
  }
  function name(id){var a=BY[id];return a?t2(a[1],a[2]):"";}
  /* Affiche la médaille dans un élément ; sans teinte choisie, garde l'initiale classique. */
  function paint(node,id,letter){
    if(!node)return;
    if(BY[id]){node.innerHTML=svg(id,letter);node.classList.add("has-avatar");node.classList.remove("is-guest");}
    else{node.classList.remove("has-avatar");if(letter!=null)node.textContent=initial(letter);}
  }

  /* ── Données : mon avatar et ceux de mes amis acceptés ── */
  var mine=null,friends={},loadedFor=null;
  function account(){return window.__account||{};}
  async function load(){
    var a=account();if(!a.client||!a.user){mine=null;friends={};loadedFor=null;return;}
    try{
      var r=await a.client.rpc("get_avatars");if(r.error)throw r.error;
      friends={};mine=null;(r.data||[]).forEach(function(x){if(x.user_id===a.user.id)mine=BY[x.avatar]?x.avatar:null;else friends[x.user_id]=BY[x.avatar]?x.avatar:null;});
      loadedFor=a.user.id;apply();
      document.querySelectorAll(".sf-avatar[data-friend-id]").forEach(function(n){var id=friends[n.dataset.friendId];if(id)paint(n,id,n.dataset.letter);});
    }catch(e){/* refus passager : on garde l'affichage actuel */}
  }
  function letterOf(){var u=(byId("identityCurrentUsername")||{}).textContent||"",a=account().user;return initial(/^@/.test(u)?u.slice(1):(a&&a.email)||"?");}
  function apply(){
    if(!account().user)return;
    paint(byId("profileAvatar"),mine,letterOf());
    paint(byId("identityAvatar"),mine,letterOf());
    changeButton();
  }
  async function save(id){
    var a=account();if(!a.client||!a.user)return false;
    var r=await a.client.rpc("set_my_avatar",{p_avatar:id||null});if(r.error)throw r.error;
    mine=id||null;apply();return true;
  }

  /* ── Bouton « Changer mon avatar » sous la carte du profil ── */
  function changeButton(){
    var copy=document.querySelector("#identityDetails .identity-summary-copy");if(!copy||!account().user)return;
    var b=byId("gfaChange");
    if(!b){b=el("button","gfa-change");b.id="gfaChange";b.type="button";b.addEventListener("click",openPicker);copy.append(b);}
    b.textContent=t2("Changer mon avatar","Change my avatar");
  }

  /* ── Page de choix : aperçu, 8 teintes, Enregistrer / Annuler ── */
  function openPicker(){
    if(byId("gfaDialog"))return;
    var choice=mine,L=letterOf();
    var dlg=el("dialog","gfh-dialog gfa-dialog");dlg.id="gfaDialog";dlg.setAttribute("aria-labelledby","gfaTitle");
    var head=el("div","gfa-dhead"),preview=el("span","gfa-preview"),htxt=el("div");
    var h=el("h2","",t2("Ton avatar","Your avatar"));h.id="gfaTitle";
    var sub=el("p","",t2("Ton initiale, gravée dans une médaille. Choisis sa teinte.","Your initial, engraved in a medal. Pick its colour."));htxt.append(h,sub);head.append(preview,htxt);
    var grid=el("div","gfa-grid");grid.setAttribute("role","radiogroup");grid.setAttribute("aria-label",t2("Teinte","Colour"));
    LIST.forEach(function(a){var b=el("button","gfa-opt");b.type="button";b.setAttribute("role","radio");b.dataset.id=a[0];var pic=el("span","gfa-pic");pic.innerHTML=svg(a[0],L);b.append(pic,el("span","gfa-name",name(a[0])));b.addEventListener("click",function(){choice=a[0];sync();});grid.append(b);});
    var classic=el("button","gfa-use-letter");classic.type="button";classic.addEventListener("click",function(){choice=null;sync();});
    var msg=el("p","gfa-feedback");msg.setAttribute("role","status");
    var row=el("div","gfh-dialog-actions"),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Enregistrer","Save"));cancel.type=ok.type="button";row.append(cancel,ok);
    function sync(){
      [].forEach.call(grid.children,function(b){b.setAttribute("aria-checked",String(b.dataset.id===choice));});
      if(choice){preview.innerHTML=svg(choice,L);preview.classList.remove("gfa-classic");}else{preview.textContent=L;preview.classList.add("gfa-classic");}
      classic.textContent=choice?t2("Revenir au style classique","Back to the classic style"):t2("Style classique sélectionné","Classic style selected");classic.disabled=!choice;
      ok.disabled=choice===mine;
    }
    cancel.addEventListener("click",function(){dlg.close();});
    ok.addEventListener("click",async function(){ok.disabled=true;msg.textContent="";try{await save(choice);dlg.close();}catch(e){msg.textContent=t2("Impossible d’enregistrer. Réessaie.","Could not save. Try again.");ok.disabled=false;}});
    dlg.addEventListener("close",function(){dlg.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
    dlg.append(head,grid,classic,msg,row);document.body.append(dlg);sync();dlg.showModal();
    if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
  }

  window.addEventListener("authStateChanged",function(e){var u=e.detail&&e.detail.user;if(!u){mine=null;friends={};loadedFor=null;var b=byId("gfaChange");if(b)b.remove();return;}if(loadedFor!==u.id)setTimeout(load,300);});
  window.addEventListener("gf:languagechange",function(){if(account().user)changeButton();});
  // Le profil (pseudo) peut redessiner l'initiale : on remet l'avatar par-dessus.
  if(window.MutationObserver)document.addEventListener("DOMContentLoaded",function(){["profileAvatar","identityAvatar"].forEach(function(id){var n=byId(id);if(n)new MutationObserver(function(){if(BY[mine]&&!n.querySelector(".gfa-svg")&&account().user)paint(n,mine,letterOf());}).observe(n,{childList:true,characterData:true,subtree:true});});});
  if(document.readyState!=="loading"&&account().user)load();
  window.GFAvatars={svg:svg,paint:paint,initial:initial,open:openPicker,friend:function(id){return friends[id]||null;},list:LIST.map(function(a){return a[0];}),reload:load,_set:function(m,f){mine=m;friends=f||{};apply();}};
})();
