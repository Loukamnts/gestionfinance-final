/* Avatars Meuniance : 12 médailles finance (vert profond, anneau et pictogramme dorés, comme le logo).
   Pas de photos envoyées : rien d'inapproprié possible, aucune image personnelle stockée.
   La base n'accepte que ces noms (contrainte sur profiles.avatar). */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}

  // [identifiant, nom FR, nom EN, dessin (viewBox 0 0 48 48 ; « C » = trait doré, « A » = remplissage doré)]
  var LIST=[
    ["piece","Pièce","Coin","<circle cx=\"24\" cy=\"24\" r=\"11.2\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"24\" r=\"8.4\" fill=\"none\" stroke=\"C\" stroke-width=\"1\" opacity=\".55\"/><path d=\"M28.4 19.6a5.6 5.6 0 1 0 0 8.8\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M19 22.6h6.6M19 25.4h6.6\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/>"],
    ["tirelire","Tirelire","Piggy bank","<path d=\"M14.6 26.4c0-5 4.4-8.5 10-8.5 3 0 5.5.9 7.3 2.6l2.5-1.3v4.2c.7.9 1.1 1.8 1.3 2.8h1.6v4.1h-2.3c-.8 1.6-2 2.8-3.6 3.6v2.4h-3.6v-1.6c-1 .2-2 .3-3.2.3s-2.1-.1-3.1-.3v1.6h-3.6v-2.5c-2.1-1.7-3.3-4.7-3.3-7.4Z\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M21.6 18.6h5.8\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"30.4\" cy=\"24.4\" r=\"1.25\" fill=\"C\"/><circle cx=\"24.5\" cy=\"11.4\" r=\"2.9\" fill=\"A\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/>"],
    ["croissance","Croissance","Growth","<path d=\"M13 35h22\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M13 13.5V35\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".5\"/><path d=\"m16.6 29.2 5.8-6 4.3 4 8-8.8\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.4\"/><path d=\"M29.4 18.2h5.4v5.4\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.4\"/><path d=\"M16.6 29.2l5.8-6 4.3 4 8-8.8V35H16.6Z\" fill=\"A\" fill-opacity=\".14\"/>"],
    ["coffre","Coffre-fort","Safe","<rect x=\"12.5\" y=\"13\" width=\"23\" height=\"20.5\" rx=\"3.4\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"23.2\" r=\"5.2\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"23.2\" r=\"1.7\" fill=\"C\"/><path d=\"M24 18v1.6M24 26.8v1.6M18.8 23.2h1.6M27.6 23.2h1.6\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><path d=\"M16.2 33.5v2.4M31.8 33.5v2.4\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.4\"/>"],
    ["billet","Billet","Banknote","<rect x=\"10.5\" y=\"16.5\" width=\"27\" height=\"15\" rx=\"2.6\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"13.4\" y=\"19.4\" width=\"21.2\" height=\"9.2\" rx=\"1.4\" fill=\"none\" stroke=\"C\" stroke-width=\"1\" opacity=\".5\"/><circle cx=\"24\" cy=\"24\" r=\"3.4\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"16.3\" cy=\"24\" r=\"1.2\" fill=\"C\"/><circle cx=\"31.7\" cy=\"24\" r=\"1.2\" fill=\"C\"/>"],
    ["portefeuille","Portefeuille","Wallet","<path d=\"M14.2 18.2 29 12.8c1.1-.4 2.3.3 2.6 1.4l1 4\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"12\" y=\"18\" width=\"24\" height=\"17.5\" rx=\"3.2\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M36 23.2h-6a2.8 2.8 0 0 0 0 5.6h6\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"30.2\" cy=\"26\" r=\"1.2\" fill=\"C\"/>"],
    ["carte","Carte","Card","<rect x=\"10.5\" y=\"15\" width=\"27\" height=\"18.5\" rx=\"3\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M10.5 20.6h27\" stroke=\"C\" stroke-width=\"2.6\"/><rect x=\"14.4\" y=\"25\" width=\"6\" height=\"4.4\" rx=\"1.1\" fill=\"A\" stroke=\"C\" stroke-width=\"1.2\"/><path d=\"M26 28.6h7.4\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/>"],
    ["lingots","Lingots","Gold bars","<path d=\"M11 35.5l2.4-6.6h8.2l2.4 6.6Z\" fill=\"A\" fill-opacity=\".3\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24 35.5l2.4-6.6h8.2l2.4 6.6Z\" fill=\"A\" fill-opacity=\".3\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M17.5 26.4l2.4-6.6h8.2l2.4 6.6Z\" fill=\"A\" fill-opacity=\".3\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M30.6 12.8v3M29.1 14.3h3M14.4 15.4v2.2M13.3 16.5h2.2\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>"],
    ["epargne","Épargne","Savings","<ellipse cx=\"24\" cy=\"15.4\" rx=\"9\" ry=\"3.3\" fill=\"A\" fill-opacity=\".3\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M15 15.4v16c0 1.8 4 3.3 9 3.3s9-1.5 9-3.3v-16\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M15 20.8c0 1.8 4 3.3 9 3.3s9-1.5 9-3.3M15 26.2c0 1.8 4 3.3 9 3.3s9-1.5 9-3.3\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".75\"/>"],
    ["diamant","Diamant","Diamond","<path d=\"M16.6 14h14.8l5.1 7.2L24 35.6 11.5 21.2Z\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M11.5 21.2h25M20.6 14l-2.4 7.2L24 35.6l5.8-14.4-2.4-7.2\" fill=\"none\" stroke=\"C\" stroke-width=\"1.4\" stroke-linejoin=\"round\" opacity=\".7\"/>"],
    ["maison","Projet maison","Home project","<path d=\"M12 23.6 24 13.4l12 10.2\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M15.4 21v14h17.2V21\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M21.4 35v-6.4a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2V35\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M30.8 15.6v3.6\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.4\"/>"],
    ["objectif","Objectif","Goal","<circle cx=\"22.5\" cy=\"25.5\" r=\"11\" fill=\"A\" fill-opacity=\".16\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"22.5\" cy=\"25.5\" r=\"6.4\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"22.5\" cy=\"25.5\" r=\"2.2\" fill=\"C\"/><path d=\"M22.5 25.5 34 14M29.6 13.6H34.4v4.8\" fill=\"none\" stroke=\"C\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/>"]
  ];
  var BY={};LIST.forEach(function(a){BY[a[0]]=a;});
  var uid=0;
  /* Médaille : fond vert profond en léger relief, anneau doré, pictogramme en dégradé doré.
     Identifiants de dégradés uniques à chaque dessin (un dégradé partagé disparaît si son SVG est masqué). */
  function svg(id){
    var a=BY[id];if(!a)return "";var k="gfa"+(++uid);
    return '<svg class="gfa-svg" viewBox="0 0 48 48" aria-hidden="true"><defs>'+
      '<radialGradient id="'+k+'b" cx="24" cy="17" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#25402F"/><stop offset="1" stop-color="#101B15"/></radialGradient>'+
      '<linearGradient id="'+k+'g" x1="0" y1="11" x2="0" y2="37" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F7D886"/><stop offset="1" stop-color="#D3962A"/></linearGradient>'+
      '<linearGradient id="'+k+'r" x1="0" y1="2" x2="0" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F2CB6C" stop-opacity=".85"/><stop offset="1" stop-color="#B07A1E" stop-opacity=".5"/></linearGradient></defs>'+
      '<circle cx="24" cy="24" r="24" fill="url(#'+k+'b)"/><circle cx="24" cy="24" r="21.6" fill="none" stroke="url(#'+k+'r)" stroke-width="1.1"/>'+
      a[3].replace(/="C"/g,'="url(#'+k+'g)"').replace(/="A"/g,'="#E3A82B"')+'</svg>';
  }
  function name(id){var a=BY[id];return a?t2(a[1],a[2]):"";}
  /* Affiche un avatar dans un élément ; sans avatar, garde l'initiale (comportement d'origine). */
  function paint(node,id,letter){
    if(!node)return;
    if(BY[id]){node.innerHTML=svg(id);node.classList.add("has-avatar");node.classList.remove("is-guest");}
    else{node.classList.remove("has-avatar");if(letter!=null)node.textContent=letter;}
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
      document.querySelectorAll(".sf-avatar[data-friend-id]").forEach(function(n){var id=friends[n.dataset.friendId];if(id)paint(n,id);});
    }catch(e){/* refus passager : on garde l'affichage actuel */}
  }
  function letterOf(){var u=(byId("identityCurrentUsername")||{}).textContent||"",a=account().user;var t=/^@/.test(u)?u.slice(1):(a&&a.email)||"?";return t.charAt(0).toUpperCase();}
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

  /* ── Page de choix : grande grille rangée, aperçu, Enregistrer / Annuler ── */
  function openPicker(){
    if(byId("gfaDialog"))return;
    var choice=mine;
    var dlg=el("dialog","gfh-dialog gfa-dialog");dlg.id="gfaDialog";dlg.setAttribute("aria-labelledby","gfaTitle");
    var head=el("div","gfa-dhead"),preview=el("span","gfa-preview"),htxt=el("div");
    var h=el("h2","",t2("Choisis ton avatar","Choose your avatar"));h.id="gfaTitle";
    var sub=el("p","",t2("Visible par toi et tes amis.","Seen by you and your friends."));htxt.append(h,sub);head.append(preview,htxt);
    var grid=el("div","gfa-grid");grid.setAttribute("role","radiogroup");grid.setAttribute("aria-label",t2("Avatars","Avatars"));
    function opt(id,label,inner){var b=el("button","gfa-opt");b.type="button";b.setAttribute("role","radio");b.dataset.id=id||"";var pic=el("span","gfa-pic"+(id?"":" gfa-letter"));if(id)pic.innerHTML=svg(id);else pic.textContent=inner;b.append(pic,el("span","gfa-name",label));b.addEventListener("click",function(){choice=id||null;sync();});return b;}
    LIST.forEach(function(a){grid.append(opt(a[0],name(a[0])));});
    // L'initiale reste possible, en lien discret sous la grille (4 × 3 médailles, sans case orpheline).
    var letterBtn=el("button","gfa-use-letter");letterBtn.type="button";letterBtn.addEventListener("click",function(){choice=null;sync();});
    var msg=el("p","gfa-feedback");msg.setAttribute("role","status");
    var row=el("div","gfh-dialog-actions"),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Enregistrer","Save"));cancel.type=ok.type="button";row.append(cancel,ok);
    function sync(){
      [].forEach.call(grid.children,function(b){b.setAttribute("aria-checked",String((b.dataset.id||null)===choice));});
      letterBtn.textContent=choice?t2("Revenir à mon initiale ("+letterOf()+")","Use my initial ("+letterOf()+")"):t2("Initiale sélectionnée ("+letterOf()+")","Initial selected ("+letterOf()+")");letterBtn.disabled=!choice;
      if(choice)preview.innerHTML=svg(choice);else{preview.textContent=letterOf();}
      preview.classList.toggle("gfa-letter",!choice);
      ok.disabled=choice===mine;
    }
    cancel.addEventListener("click",function(){dlg.close();});
    ok.addEventListener("click",async function(){ok.disabled=true;msg.textContent="";try{await save(choice);dlg.close();}catch(e){msg.textContent=t2("Impossible d’enregistrer l’avatar. Réessaie.","Could not save the avatar. Try again.");ok.disabled=false;}});
    dlg.addEventListener("close",function(){dlg.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
    dlg.append(head,grid,letterBtn,msg,row);document.body.append(dlg);sync();dlg.showModal();
    if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
  }

  window.addEventListener("authStateChanged",function(e){var u=e.detail&&e.detail.user;if(!u){mine=null;friends={};loadedFor=null;var b=byId("gfaChange");if(b)b.remove();return;}if(loadedFor!==u.id)setTimeout(load,300);});
  window.addEventListener("gf:languagechange",function(){if(account().user)changeButton();});
  // Le profil (pseudo) peut redessiner l'initiale : on remet l'avatar par-dessus.
  if(window.MutationObserver)document.addEventListener("DOMContentLoaded",function(){["profileAvatar","identityAvatar"].forEach(function(id){var n=byId(id);if(n)new MutationObserver(function(){if(BY[mine]&&!n.querySelector(".gfa-svg")&&account().user)paint(n,mine);}).observe(n,{childList:true,characterData:true,subtree:true});});});
  if(document.readyState!=="loading"&&account().user)load();
  window.GFAvatars={svg:svg,paint:paint,open:openPicker,friend:function(id){return friends[id]||null;},list:LIST.map(function(a){return a[0];}),reload:load,_set:function(m,f){mine=m;friends=f||{};apply();}};
})();
