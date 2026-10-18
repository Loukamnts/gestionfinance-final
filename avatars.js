/* Avatars Meuniance : ton initiale dans un rond plat, avec une couleur (8) et un style de lettre (5) au choix.
   Les 5 styles utilisent les polices déjà chargées par le site. Pas de photos envoyées : aucune image stockée.
   Valeur enregistrée : « couleur.style » (ex. « seigle.moderne ») ; la base n'accepte que ces combinaisons. */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function esc(v){return String(v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}

  // Couleurs : [id, FR, EN, fond, lettre]
  var COLORS=[
    ["seigle","Seigle","Rye","#17261F","#F3EEE2"],["ble","Blé","Wheat","#E3A82B","#17261F"],
    ["creme","Crème","Cream","#F3EEE2","#17261F"],["sauge","Sauge","Sage","#A9BDA6","#17261F"],
    ["terre","Terre cuite","Terracotta","#B9553E","#FBF6EC"],["encre","Encre","Ink","#22304A","#F3EEE2"],
    ["sable","Sable","Sand","#D9C6A5","#17261F"],["prune","Prune","Plum","#5E4566","#F3EEE2"]
  ];
  // Styles : [id, FR, EN, police, graisse, italique, taille (part du rond), échelle horizontale, échelle verticale]
  var STYLES=[
    ["moderne","Moderne","Modern","'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif",700,false,.46,1,1],
    ["classique","Classique","Classic","'Playfair Display',Georgia,serif",400,false,.48,1,1],
    ["italique","Italique","Italic","'Playfair Display',Georgia,serif",400,true,.48,1,1],
    // Identifiants « affirmee » et « technique » gardés (valeurs déjà enregistrées) : les styles ont changé de police.
    ["affirmee","Douce","Soft","Fraunces,'Playfair Display',Georgia,serif",600,false,.48,1,1],
    ["technique","Prestige","Prestige","'Bodoni Moda','Playfair Display',Georgia,serif",600,false,.5,1,1]
  ];
  // Réservés aux abonnés (le reste est gratuit). Le blocage ne s'applique que si l'abonnement est activé (GFSubscriptions).
  var TIER={c:{encre:"plus",prune:"plus",terre:"pro",sable:"pro"},s:{classique:"plus",italique:"plus",affirmee:"pro",technique:"pro"}};
  var TRANK={plus:1,pro:2};
  function tierOf(id){var p=String(id||"").split("."),a=TIER.c[p[0]],b=TIER.s[p[1]];return (TRANK[b]||0)>(TRANK[a]||0)?b:(a||b||null);}
  function badge(t){var b=document.createElement("span");b.className="gfa-tier is-"+t;b.textContent=t==="pro"?"Pro":"Plus";b.setAttribute("aria-hidden","true");return b;}
  var CBY={},SBY={};COLORS.forEach(function(c){CBY[c[0]]=c;});STYLES.forEach(function(f){SBY[f[0]]=f;});
  function parts(id){var p=String(id||"").split(".");return CBY[p[0]]&&SBY[p[1]]?{c:CBY[p[0]],f:SBY[p[1]]}:null;}
  function valid(id){return !!parts(id);}
  function initial(v){var c=String(v||"").trim().replace(/^@/,"").charAt(0).toUpperCase();return c||"?";}
  /* Rond plat, fin contour (visible sur les deux thèmes), initiale centrée dans le style choisi. */
  function svg(id,letter){
    var p=parts(id);if(!p)return "";var f=p.f,sx=f[7],sy=f[8];
    return '<svg class="gfa-svg" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="'+p.c[3]+'"/>'+
      '<circle class="gfa-edge" cx="24" cy="24" r="23.5" fill="none" stroke-width="1"/>'+
      '<text x="24" y="24.8" text-anchor="middle" dominant-baseline="central" font-size="'+(48*f[6]).toFixed(1)+'" font-weight="'+f[4]+'"'+(f[5]?' font-style="italic"':'')+' fill="'+p.c[4]+'" style="font-family:'+f[3].replace(/"/g,"'")+'"'+(sx!==1||sy!==1?' transform="translate(24 24.8) scale('+sx+' '+sy+') translate(-24 -24.8)"':'')+'>'+esc(initial(letter))+'</text></svg>';
  }
  /* Met à jour un rond déjà affiché (couleur, police) sans le reconstruire : pas de clignotement sur iPhone. */
  function restyle(node,id,letter){
    var p=parts(id),el2=node&&node.querySelector("svg.gfa-svg");if(!p)return;
    if(!el2){node.insertAdjacentHTML("afterbegin",svg(id,letter));return;}
    var f=p.f,sx=f[7],sy=f[8],c=el2.querySelector("circle"),t=el2.querySelector("text");
    c.setAttribute("fill",p.c[3]);t.setAttribute("fill",p.c[4]);t.setAttribute("font-size",(48*f[6]).toFixed(1));t.setAttribute("font-weight",String(f[4]));
    if(f[5])t.setAttribute("font-style","italic");else t.removeAttribute("font-style");
    t.style.fontFamily=f[3];
    if(sx!==1||sy!==1)t.setAttribute("transform","translate(24 24.8) scale("+sx+" "+sy+") translate(-24 -24.8)");else t.removeAttribute("transform");
    var l=initial(letter);if(t.textContent!==l)t.textContent=l;
  }
  /* Affiche l'avatar dans un élément ; sans choix, garde l'initiale classique. */
  function paint(node,id,letter){
    if(!node)return;
    if(valid(id)){node.innerHTML=svg(id,letter);node.classList.add("has-avatar");node.classList.remove("is-guest");}
    else{node.classList.remove("has-avatar");if(letter!=null)node.textContent=initial(letter);}
  }

  /* ── Données : mon avatar et ceux de mes amis acceptés ── */
  var mine=null,friends={},loadedFor=null;
  function account(){return window.__account||{};}
  async function load(){
    var a=account();if(!a.client||!a.user){mine=null;friends={};loadedFor=null;return;}
    try{
      var r=await a.client.rpc("get_avatars");if(r.error)throw r.error;
      friends={};mine=null;(r.data||[]).forEach(function(x){if(x.user_id===a.user.id)mine=valid(x.avatar)?x.avatar:null;else friends[x.user_id]=valid(x.avatar)?x.avatar:null;});
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

  /* ── Changer l'avatar : un petit crayon posé sur l'avatar du profil (l'avatar lui-même est aussi cliquable) ── */
  var PENCIL='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="2"/></svg>';
  function changeButton(){
    var av=byId("identityAvatar");if(!av||!account().user)return;
    var wrap=av.parentNode;
    if(!wrap.classList.contains("gfa-wrap")){wrap=el("span","gfa-wrap");av.parentNode.insertBefore(wrap,av);wrap.append(av);av.addEventListener("click",openPicker);}
    var b=byId("gfaChange");
    if(!b){b=el("button","gfa-badge");b.id="gfaChange";b.type="button";b.innerHTML=PENCIL;b.addEventListener("click",openPicker);wrap.append(b);}
    b.setAttribute("aria-label",t2("Changer mon avatar","Change my avatar"));b.title=t2("Changer mon avatar","Change my avatar");
  }

  /* ── Page de choix : aperçu en direct, couleur puis style de lettre, Enregistrer / Annuler ── */
  function openPicker(){
    if(byId("gfaDialog"))return;
    var L=letterOf(),cur=parts(mine),color=cur?cur.c[0]:"seigle",style=cur?cur.f[0]:"moderne",classic=!cur;
    var dlg=el("dialog","gfh-dialog gfa-dialog");dlg.id="gfaDialog";dlg.setAttribute("aria-labelledby","gfaTitle");
    var head=el("div","gfa-dhead"),preview=el("span","gfa-preview"),htxt=el("div");
    var h=el("h2","",t2("Ton avatar","Your avatar"));h.id="gfaTitle";
    var sub=el("p","",t2("Ton initiale, dans la couleur et le style de ton choix.","Your initial, in the colour and style you like."));htxt.append(h,sub);head.append(preview,htxt);
    function section(title){var w=el("div","gfa-section"),lab=el("p","gfa-label",title),cur=el("span","gfa-current");lab.append(cur);w.append(lab);var g=el("div","gfa-row");g.setAttribute("role","radiogroup");g.setAttribute("aria-label",title);w.append(g);return{w:w,g:g,cur:cur};}
    var cs=section(t2("Couleur","Colour")),ss=section(t2("Style de lettre","Letter style"));ss.g.classList.add("is-styles");
    COLORS.forEach(function(c){var b=el("button","gfa-opt");b.type="button";b.setAttribute("role","radio");b.dataset.id=c[0];var tc=TIER.c[c[0]];b.setAttribute("aria-label",t2(c[1],c[2])+(tc?" ("+(tc==="pro"?"Pro":"Plus")+")":""));b.title=t2(c[1],c[2]);var pic=el("span","gfa-pic");b.append(pic);if(tc)pic.append(badge(tc));b.addEventListener("click",function(){color=c[0];classic=false;sync();});cs.g.append(b);});
    STYLES.forEach(function(f){var b=el("button","gfa-opt gfa-style");b.type="button";b.setAttribute("role","radio");b.dataset.id=f[0];var ts=TIER.s[f[0]];if(ts)b.setAttribute("aria-label",t2(f[1],f[2])+" ("+(ts==="pro"?"Pro":"Plus")+")");var pic=el("span","gfa-pic");b.append(pic,el("span","gfa-name",t2(f[1],f[2])));if(ts)pic.append(badge(ts));b.addEventListener("click",function(){style=f[0];classic=false;sync();});ss.g.append(b);});
    var legend=el("p","gfa-legend");legend.append(badge("plus"),badge("pro"),document.createTextNode(t2(" : inclus dans les abonnements Plus et Pro."," : included with Plus and Pro.")));
    var back=el("button","gfa-use-letter");back.type="button";back.addEventListener("click",function(){classic=true;sync();});
    var msg=el("p","gfa-feedback");msg.setAttribute("role","status");
    var row=el("div","gfh-dialog-actions"),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Enregistrer","Save"));cancel.type=ok.type="button";row.append(cancel,ok);
    function value(){return classic?null:color+"."+style;}
    function sync(){
      [].forEach.call(cs.g.children,function(b){b.setAttribute("aria-checked",String(!classic&&b.dataset.id===color));restyle(b.firstChild,b.dataset.id+"."+style,L);});
      [].forEach.call(ss.g.children,function(b){b.setAttribute("aria-checked",String(!classic&&b.dataset.id===style));restyle(b.firstChild,color+"."+b.dataset.id,L);});
      var cn=CBY[color],sn=SBY[style];cs.cur.textContent=classic?"":" · "+t2(cn[1],cn[2]);ss.cur.textContent=classic?"":" · "+t2(sn[1],sn[2]);
      if(classic){preview.textContent=L;preview.classList.add("gfa-classic");}else{if(preview.classList.contains("gfa-classic"))preview.textContent="";restyle(preview,value(),L);preview.classList.remove("gfa-classic");}
      back.textContent=classic?t2("Style classique sélectionné","Classic style selected"):t2("Revenir au style classique","Back to the classic style");back.disabled=classic;
      ok.disabled=value()===mine;
    }
    cancel.addEventListener("click",function(){dlg.close();});
    ok.addEventListener("click",async function(){var need=classic?null:tierOf(value()),api=window.GFSubscriptions;if(need&&api&&typeof api.requires==="function"&&!api.requires("avatar_"+need))return;ok.disabled=true;msg.textContent="";try{await save(value());dlg.close();}catch(e){msg.textContent=t2("Impossible d’enregistrer. Réessaie.","Could not save. Try again.");ok.disabled=false;}});
    dlg.addEventListener("close",function(){dlg.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
    dlg.append(head,cs.w,ss.w,legend,back,msg,row);document.body.append(dlg);sync();dlg.showModal();
    // Safari entoure le premier bouton qui reçoit le focus à l’ouverture : on le donne à la fenêtre elle-même.
    dlg.tabIndex=-1;try{dlg.focus({preventScroll:true});}catch(e){}
    if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
  }

  window.addEventListener("authStateChanged",function(e){var u=e.detail&&e.detail.user;if(!u){mine=null;friends={};loadedFor=null;var b=byId("gfaChange");if(b)b.remove();["profileAvatar","identityAvatar"].forEach(function(id){var n=byId(id);if(n)n.classList.remove("has-avatar");});return;}if(loadedFor!==u.id)setTimeout(load,300);});
  window.addEventListener("gf:languagechange",function(){if(account().user)changeButton();});
  // Le profil (pseudo) peut redessiner l'initiale : on remet l'avatar par-dessus.
  if(window.MutationObserver)document.addEventListener("DOMContentLoaded",function(){["profileAvatar","identityAvatar"].forEach(function(id){var n=byId(id);if(n)new MutationObserver(function(){if(valid(mine)&&!n.querySelector(".gfa-svg")&&account().user)paint(n,mine,letterOf());}).observe(n,{childList:true,characterData:true,subtree:true});});});
  if(document.readyState!=="loading"&&account().user)load();
  window.GFAvatars={svg:svg,paint:paint,initial:initial,open:openPicker,friend:function(id){return friends[id]||null;},colors:COLORS.map(function(c){return c[0];}),styles:STYLES.map(function(f){return f[0];}),valid:valid,reload:load,_set:function(m,f){mine=m;friends=f||{};apply();}};
})();
