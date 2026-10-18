/* Avatars Meuniance : 12 animaux de la finance en médaille (vert profond, anneau et dessin dorés, comme le logo).
   Des personnages plutôt que des objets : impossible de les confondre avec une icône du site.
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
    ["taureau","Taureau","Bull","<path d=\"M14.5 13.6c.6 4 3.2 6.4 6.6 6.4M33.5 13.6c-.6 4-3.2 6.4-6.6 6.4\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/><path d=\"M18.2 19.6h11.6c1.6 0 2.7 1.4 2.4 2.9l-1.5 8c-.5 2.6-2.7 4.4-5.3 4.4h-2.8c-2.6 0-4.8-1.8-5.3-4.4l-1.5-8c-.3-1.5.8-2.9 2.4-2.9Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M17.4 21.4 13 22.6l3.4 2.4M30.6 21.4l4.4 1.2-3.4 2.4\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\"/><circle cx=\"20.8\" cy=\"24.8\" r=\"1.15\" fill=\"C\"/><circle cx=\"27.2\" cy=\"24.8\" r=\"1.15\" fill=\"C\"/><ellipse cx=\"24\" cy=\"30.6\" rx=\"4.6\" ry=\"2.9\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><circle cx=\"22.4\" cy=\"30.6\" r=\"0.8\" fill=\"C\"/><circle cx=\"25.6\" cy=\"30.6\" r=\"0.8\" fill=\"C\"/>"],
    ["ours","Ours","Bear","<circle cx=\"16.4\" cy=\"16.6\" r=\"3.5\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"31.6\" cy=\"16.6\" r=\"3.5\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"25\" r=\"10.6\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"25\" r=\"10.6\" fill=\"A\" fill-opacity=\".18\"/><circle cx=\"20.2\" cy=\"23.2\" r=\"1.15\" fill=\"C\"/><circle cx=\"27.8\" cy=\"23.2\" r=\"1.15\" fill=\"C\"/><ellipse cx=\"24\" cy=\"29.2\" rx=\"4.8\" ry=\"3.7\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><ellipse cx=\"24\" cy=\"27.7\" rx=\"1.8\" ry=\"1.2\" fill=\"C\"/><path d=\"M24 28.9v1.7\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.4\"/>"],
    ["ecureuil","Écureuil","Squirrel","<path d=\"M26.4 34.6c6.8 0 10.4-5.2 8.8-10.8-1.2-4.4-.4-8.4 2-10.6-5.2-1.4-9.8 1.6-9.6 7.2.1 3.6 2.2 6 .4 9.2\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M16.8 34.6c-2.4-3.8-2-9.2 1.8-11.6 3.6-2.2 7.8.2 7.8 5.2v6.4Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"18.6\" cy=\"18.4\" r=\"4.3\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"18.6\" cy=\"18.4\" r=\"4.3\" fill=\"A\" fill-opacity=\".18\"/><path d=\"M16.6 14.8l.6-3.8 2.6 3\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\"/><circle cx=\"19.8\" cy=\"18\" r=\"0.95\" fill=\"C\"/><circle cx=\"22\" cy=\"26.4\" r=\"1.8\" fill=\"A\"/><path d=\"M20.8 25.1h2.4\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.2\"/><path d=\"M13 34.8h17\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\" opacity=\".55\"/>"],
    ["fourmi","Fourmi","Ant","<circle cx=\"14.8\" cy=\"24\" r=\"3.1\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"21.6\" cy=\"24.6\" rx=\"3.2\" ry=\"2.3\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"30.8\" cy=\"25.4\" rx=\"6\" ry=\"4.3\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M20.2 26.4l-2.6 5.6M21.6 26.9v5.8M23 26.4l2.6 5.6\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><path d=\"M13.6 21.4l-2.2-4.4M16 21.2l.8-4.6\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><circle cx=\"11.3\" cy=\"16.8\" r=\"0.9\" fill=\"C\"/><circle cx=\"16.9\" cy=\"16.4\" r=\"0.9\" fill=\"C\"/><path d=\"M28 23.2c1.6-1 3.6-1 5.2 0\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.2\" opacity=\".7\"/>"],
    ["chouette","Chouette","Owl","<path d=\"M14.6 19c0-3.2 1.5-5.8 3.2-7l3 3.2h6.4l3-3.2c1.7 1.2 3.2 3.8 3.2 7v8.2c0 5.8-4.3 9.8-9.4 9.8s-9.4-4-9.4-9.8Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"20\" cy=\"21.6\" r=\"3.5\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><circle cx=\"28\" cy=\"21.6\" r=\"3.5\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><circle cx=\"20\" cy=\"21.6\" r=\"1.4\" fill=\"C\"/><circle cx=\"28\" cy=\"21.6\" r=\"1.4\" fill=\"C\"/><path d=\"M24 24.4l-1.6 2.3h3.2Z\" fill=\"C\"/><path d=\"M19.6 30.6l1.6 1.3 1.4-1.3 1.4 1.3 1.4-1.3 1.4 1.3 1.6-1.3\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.3\"/>"],
    ["cochon","Cochon","Pig","<path d=\"M16 18.2l-2-5.8 5.8 2.8M32 18.2l2-5.8-5.8 2.8\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"25.2\" r=\"10.6\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"25.2\" r=\"10.6\" fill=\"A\" fill-opacity=\".18\"/><ellipse cx=\"24\" cy=\"28.4\" rx=\"4.9\" ry=\"3.5\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><circle cx=\"22.3\" cy=\"28.4\" r=\"0.9\" fill=\"C\"/><circle cx=\"25.7\" cy=\"28.4\" r=\"0.9\" fill=\"C\"/><circle cx=\"20\" cy=\"22.6\" r=\"1.15\" fill=\"C\"/><circle cx=\"28\" cy=\"22.6\" r=\"1.15\" fill=\"C\"/><path d=\"M21.5 16.4h5\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/>"],
    ["abeille","Abeille","Bee","<ellipse cx=\"17.2\" cy=\"20.6\" rx=\"4.8\" ry=\"3.2\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\" transform=\"rotate(-28 17.2 20.6)\"/><ellipse cx=\"30.8\" cy=\"20.6\" rx=\"4.8\" ry=\"3.2\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\" transform=\"rotate(28 30.8 20.6)\"/><ellipse cx=\"24\" cy=\"27.8\" rx=\"6.2\" ry=\"8\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"24\" cy=\"27.8\" rx=\"6.2\" ry=\"8\" fill=\"A\" fill-opacity=\".18\"/><path d=\"M18.2 25.4h11.6M18.2 30h11.6\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/><circle cx=\"24\" cy=\"16.4\" r=\"3\" fill=\"A\" fill-opacity=\".45\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"/><path d=\"M22.8 13.7l-1.5-2.7M25.2 13.7l1.5-2.7\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.4\"/><path d=\"M24 35.8v1.6\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"],
    ["poule","Poule d’or","Golden hen","<path d=\"M15.4 22.6l-3.4-4.2 4.8.8M14.6 25.6l-3.6-2 4.2-.6\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><ellipse cx=\"22.4\" cy=\"26.8\" rx=\"9\" ry=\"7.4\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"22.4\" cy=\"26.8\" rx=\"9\" ry=\"7.4\" fill=\"A\" fill-opacity=\".18\"/><circle cx=\"28\" cy=\"16.4\" r=\"3.6\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"28\" cy=\"16.4\" r=\"3.6\" fill=\"A\" fill-opacity=\".18\"/><path d=\"M31.4 15.8l2.6.9-2.4 1.3\" fill=\"C\"/><path d=\"M26 13.2c.4-1.6 1.6-1.6 2 0 .4-1.6 1.6-1.6 2 0\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.4\"/><circle cx=\"28.8\" cy=\"16\" r=\"0.85\" fill=\"C\"/><path d=\"M18 26.6c2.4 2.2 5.8 2.2 8.2 0\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><path d=\"M20.4 34v2.6M24.4 34v2.6\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><ellipse cx=\"34.4\" cy=\"32\" rx=\"3\" ry=\"3.8\" fill=\"A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>"],
    ["elephant","Éléphant","Elephant","<path d=\"M18 17.6c-5.4-2.4-8.8 1.8-7.6 7 .9 3.8 4.4 5.2 7.4 3.4M30 17.6c5.4-2.4 8.8 1.8 7.6 7-.9 3.8-4.4 5.2-7.4 3.4\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"22.4\" r=\"7.6\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"22.4\" r=\"7.6\" fill=\"A\" fill-opacity=\".18\"/><circle cx=\"21\" cy=\"21.2\" r=\"1.15\" fill=\"C\"/><circle cx=\"27\" cy=\"21.2\" r=\"1.15\" fill=\"C\"/><path d=\"M21.9 27.8v5.4c0 1.7 1 2.7 2.4 2.7 1.3 0 2.2-.9 2.4-2.1M26.1 27.8v2.8\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M20.6 28.2l-1.8 2.4M27.4 28.2l1.8 2.4\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/>"],
    ["lion","Lion","Lion","<path d=\"M24.00 11.20L27.15 14.90L31.88 13.76L32.25 18.60L36.74 20.46L34.20 24.60L36.74 28.74L32.25 30.60L31.88 35.44L27.15 34.30L24.00 38.00L20.85 34.30L16.12 35.44L15.75 30.60L11.26 28.74L13.80 24.60L11.26 20.46L15.75 18.60L16.12 13.76L20.85 14.90Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\"/><circle cx=\"19.4\" cy=\"19\" r=\"2.1\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><circle cx=\"28.6\" cy=\"19\" r=\"2.1\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.6\"/><circle cx=\"24\" cy=\"25\" r=\"7.6\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"25\" r=\"7.6\" fill=\"A\" fill-opacity=\".18\"/><circle cx=\"21.3\" cy=\"23.6\" r=\"1.15\" fill=\"C\"/><circle cx=\"26.7\" cy=\"23.6\" r=\"1.15\" fill=\"C\"/><path d=\"M22.5 26.4h3L24 28Z\" fill=\"C\"/><path d=\"M24 28v1.3M21.7 30c1.3.9 3.3.9 4.6 0\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.3\"/>"],
    ["renard","Renard","Fox","<path d=\"M12.6 13.8l6.2 4.4h10.4l6.2-4.4-1.4 10.6L24 35.2l-10-10.8Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M14 24.4l6 2.6M34 24.4l-6 2.6\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.4 16.2l2 4.6M32.6 16.2l-2 4.6\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.3\"/><circle cx=\"20.2\" cy=\"23.4\" r=\"1.15\" fill=\"C\"/><circle cx=\"27.8\" cy=\"23.4\" r=\"1.15\" fill=\"C\"/><circle cx=\"24\" cy=\"32.4\" r=\"1.4\" fill=\"C\"/>"],
    ["tortue","Tortue","Tortoise","<path d=\"M12.4 30c0-6.8 5.2-11.8 11.6-11.8S35.6 23.2 35.6 30Z\" fill=\"A\" fill-opacity=\".18\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M17.6 30l2.2-5.6h8.4l2.2 5.6M19.8 24.4l-2.4-3.6M28.2 24.4l2.4-3.6M24 24.4v-6.2\" fill=\"none\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.4\"/><circle cx=\"37\" cy=\"27.4\" r=\"2.9\" fill=\"#13201A\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"37\" cy=\"27.4\" r=\"2.9\" fill=\"A\" fill-opacity=\".18\"/><circle cx=\"37.9\" cy=\"26.9\" r=\"0.75\" fill=\"C\"/><path d=\"M15.4 30v3.6M21 30v3.6M27 30v3.6M32.6 30v3.6\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.2\"/><path d=\"M10.6 34.6h27\" stroke=\"C\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.4\" opacity=\".5\"/>"]
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
