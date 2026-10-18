/* Avatars Meuniance : 12 dessins aux couleurs du site, choisis dans Paramètres › Profil.
   Pas de photos envoyées : rien d'inapproprié possible, aucune image personnelle stockée.
   La base n'accepte que ces noms (contrainte sur profiles.avatar). */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}

  // [identifiant, nom FR, nom EN, fond, dessin, contenu SVG (viewBox 0 0 48 48, « C » = couleur du dessin, « B » = fond)]
  var LIST=[
    ["ble","Épi de blé","Wheat","#E3A82B","#17261F",
      '<path d="M24 39V15" stroke="C" stroke-width="2.4" stroke-linecap="round"/>'+
      '<ellipse cx="24" cy="12.5" rx="2.8" ry="4.6" fill="C"/>'+
      [17.5,23.5,29.5].map(function(y){return '<ellipse cx="19.6" cy="'+y+'" rx="2.9" ry="4.8" fill="C" transform="rotate(-38 19.6 '+y+')"/><ellipse cx="28.4" cy="'+y+'" rx="2.9" ry="4.8" fill="C" transform="rotate(38 28.4 '+y+')"/>';}).join("")],
    ["moulin","Moulin","Windmill","#17261F","#E3A82B",
      '<path d="M20.2 39 22 25h4l1.8 14Z" fill="C"/>'+
      [45,135,225,315].map(function(a){return '<g transform="rotate('+a+' 24 21)"><path d="M26.4 21h10.4" stroke="C" stroke-width="1.6" stroke-linecap="round"/><rect x="28" y="17.4" width="8.8" height="3.6" rx=".8" fill="C"/></g>';}).join("")+
      '<circle cx="24" cy="21" r="2.6" fill="C"/>'],
    ["tirelire","Tirelire","Piggy bank","#F2CDBD","#8A3B26",
      '<ellipse cx="23" cy="27" rx="11.5" ry="8.6" fill="C"/><ellipse cx="34.6" cy="26.4" rx="2.6" ry="3.3" fill="C"/>'+
      '<ellipse cx="17.6" cy="19.6" rx="2.6" ry="3.4" fill="C" transform="rotate(-28 17.6 19.6)"/><rect x="16" y="32" width="3.6" height="6.5" rx="1.6" fill="C"/><rect x="25.6" y="32" width="3.6" height="6.5" rx="1.6" fill="C"/>'+
      '<path d="M20.5 21.4h6" stroke="B" stroke-width="2" stroke-linecap="round"/><circle cx="29.8" cy="24.4" r="1.3" fill="B"/>'+
      '<circle cx="23.5" cy="11.5" r="3.6" fill="C"/><path d="M23.5 9.8v3.4" stroke="B" stroke-width="1.5" stroke-linecap="round"/>'],
    ["pieces","Pièces","Coins","#2F6B4F","#F3EEE2",
      '<rect x="10.5" y="32" width="18" height="5.2" rx="2.6" fill="C"/><rect x="13" y="25.6" width="18" height="5.2" rx="2.6" fill="C"/><rect x="10.5" y="19.2" width="18" height="5.2" rx="2.6" fill="C"/>'+
      '<circle cx="35" cy="15" r="5.4" fill="none" stroke="C" stroke-width="2.4"/><path d="M35 12.6v4.8" stroke="C" stroke-width="2.2" stroke-linecap="round"/>'],
    ["feuille","Feuille","Leaf","#DCE8D5","#2F6B4F",
      '<path d="M13 35c0-13 8.5-21.5 22-22 0 13.6-8.6 22-22 22Z" fill="C"/><path d="M15.5 32.5 29 19" stroke="B" stroke-width="2.2" stroke-linecap="round"/>'],
    ["cible","Objectif","Goal","#C2553F","#FFF4EA",
      '<circle cx="22" cy="26" r="12" fill="none" stroke="C" stroke-width="2.6"/><circle cx="22" cy="26" r="6.6" fill="none" stroke="C" stroke-width="2.6"/><circle cx="22" cy="26" r="2.4" fill="C"/>'+
      '<path d="m22 26 13-13M30.5 12.5H35v4.5" stroke="C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'],
    ["pousse","Pousse","Sprout","#F3E6C4","#2F6B4F",
      '<path d="M24 37V24" stroke="C" stroke-width="2.6" stroke-linecap="round"/>'+
      '<path d="M24 26.5c-7 0-10.5-4.6-10.5-10.5 6.3 0 10.5 3.8 10.5 10.5Z" fill="C"/><path d="M24 23c0-6.8 3.8-10.5 10.5-10.5 0 6.6-3.8 10.5-10.5 10.5Z" fill="C"/>'+
      '<path d="M15 37.5h18" stroke="C" stroke-width="2.6" stroke-linecap="round"/>'],
    ["soleil","Soleil","Sun","#F6D57A","#A35B12",
      '<circle cx="24" cy="24" r="6.8" fill="C"/>'+[0,45,90,135,180,225,270,315].map(function(a){var r=Math.PI*a/180,x1=24+Math.cos(r)*10.5,y1=24+Math.sin(r)*10.5,x2=24+Math.cos(r)*14.5,y2=24+Math.sin(r)*14.5;return '<path d="M'+x1.toFixed(1)+' '+y1.toFixed(1)+'L'+x2.toFixed(1)+' '+y2.toFixed(1)+'" stroke="C" stroke-width="2.6" stroke-linecap="round"/>';}).join("")],
    ["maison","Maison","Home","#D9E3EC","#23415C",
      '<path d="M11.5 24.5 24 13l12.5 11.5Z" fill="C"/><rect x="15.5" y="23" width="17" height="14" rx="1.6" fill="C"/><rect x="21.5" y="28.5" width="5" height="8.5" rx="1" fill="B"/>'],
    ["avion","Voyage","Travel","#23415C","#F3EEE2",
      '<path d="M24 9.5c1.6 0 2.2 2 2.2 4v7.3l11 6.2v3.2l-11-3.6v6.5l3.6 2.6v2.8L24 37l-5.8 1.5v-2.8l3.6-2.6v-6.5l-11 3.6V27l11-6.2v-7.3c0-2 .6-4 2.2-4Z" fill="C"/>'],
    ["montagne","Sommet","Summit","#E6DDF0","#4B3B6B",
      '<path d="M9.5 37 20 20l6 9 4-6 8.5 14Z" fill="C"/><path d="M20 20v-9.5" stroke="C" stroke-width="2.2" stroke-linecap="round"/><path d="M20 10.5 27.5 13 20 15.6Z" fill="C"/>'],
    ["etoile","Étoile","Star","#3B2E22","#E3A82B",
      (function(){var pts=[];for(var i=0;i<10;i++){var r=i%2?6.2:14,a=Math.PI/180*(-90+i*36);pts.push((24+Math.cos(a)*r).toFixed(1)+" "+(25+Math.sin(a)*r).toFixed(1));}return '<path d="M'+pts.join("L")+'Z" fill="C" stroke="C" stroke-width="1.6" stroke-linejoin="round"/>';})()]
  ];
  var BY={};LIST.forEach(function(a){BY[a[0]]=a;});
  function svg(id){var a=BY[id];if(!a)return "";return '<svg class="gfa-svg" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="'+a[3]+'"/>'+a[5].replace(/="C"/g,'="'+a[4]+'"').replace(/="B"/g,'="'+a[3]+'"')+'</svg>';}
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
      friends={};mine=null;(r.data||[]).forEach(function(x){if(x.user_id===a.user.id)mine=x.avatar||null;else friends[x.user_id]=x.avatar||null;});
      loadedFor=a.user.id;apply();
      // Amis déjà affichés : leur avatar remplace les initiales.
      document.querySelectorAll(".sf-avatar[data-friend-id]").forEach(function(n){var id=friends[n.dataset.friendId];if(id)paint(n,id);});
    }catch(e){/* refus passager : on garde l'affichage actuel */}
  }
  function letterOf(){var u=(byId("identityCurrentUsername")||{}).textContent||"",a=account().user;var t=/^@/.test(u)?u.slice(1):(a&&a.email)||"?";return t.charAt(0).toUpperCase();}
  function apply(){
    if(!account().user)return;
    paint(byId("profileAvatar"),mine,letterOf());
    paint(byId("identityAvatar"),mine,letterOf());
    renderPicker();
  }
  async function choose(id){
    var a=account();if(!a.client||!a.user)return;
    var prev=mine;mine=id||null;apply();
    try{var r=await a.client.rpc("set_my_avatar",{p_avatar:mine});if(r.error)throw r.error;}
    catch(e){mine=prev;apply();var f=byId("gfaFeedback");if(f)f.textContent=t2("Impossible d’enregistrer l’avatar. Réessaie.","Could not save the avatar. Try again.");}
  }

  /* ── Choix dans Paramètres › Profil ── */
  function renderPicker(){
    var details=byId("identityDetails");if(!details||!account().user)return;
    var box=byId("gfaPicker");
    if(!box){box=el("div","gfa-picker");box.id="gfaPicker";var facts=details.querySelector(".identity-facts");if(facts)details.insertBefore(box,facts);else details.append(box);}
    var head=el("div","gfa-head");head.append(el("strong","",t2("Ton avatar","Your avatar")),el("small","",t2("Visible par toi et tes amis.","Seen by you and your friends.")));
    var grid=el("div","gfa-grid");grid.setAttribute("role","radiogroup");grid.setAttribute("aria-label",t2("Ton avatar","Your avatar"));
    var none=el("button","gfa-opt gfa-letter");none.type="button";none.setAttribute("role","radio");none.setAttribute("aria-checked",String(!mine));none.setAttribute("aria-label",t2("Initiale","Initial"));none.title=t2("Initiale","Initial");none.append(el("span","",letterOf()));
    none.addEventListener("click",function(){choose(null);});grid.append(none);
    LIST.forEach(function(a){var b=el("button","gfa-opt");b.type="button";b.setAttribute("role","radio");b.setAttribute("aria-checked",String(mine===a[0]));b.setAttribute("aria-label",name(a[0]));b.title=name(a[0]);b.innerHTML=svg(a[0]);b.addEventListener("click",function(){choose(a[0]);});grid.append(b);});
    var fb=el("p","gfa-feedback");fb.id="gfaFeedback";fb.setAttribute("role","status");
    box.replaceChildren(head,grid,fb);
  }

  window.addEventListener("authStateChanged",function(e){var u=e.detail&&e.detail.user;if(!u){mine=null;friends={};loadedFor=null;var b=byId("gfaPicker");if(b)b.remove();return;}if(loadedFor!==u.id)setTimeout(load,300);});
  window.addEventListener("gf:languagechange",function(){if(account().user)renderPicker();});
  // Le profil (pseudo) peut redessiner l'initiale : on remet l'avatar par-dessus.
  if(window.MutationObserver)document.addEventListener("DOMContentLoaded",function(){["profileAvatar","identityAvatar"].forEach(function(id){var n=byId(id);if(n)new MutationObserver(function(){if(BY[mine]&&!n.querySelector(".gfa-svg")&&account().user)paint(n,mine);}).observe(n,{childList:true,characterData:true,subtree:true});});});
  if(document.readyState!=="loading"&&account().user)load();
  window.GFAvatars={svg:svg,paint:paint,friend:function(id){return friends[id]||null;},list:LIST.map(function(a){return a[0];}),reload:load,_set:function(m,f){mine=m;friends=f||{};apply();}};
})();
