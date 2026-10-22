/* Messages dans le site : un seul modèle, un seul affichage.
   - Chaque module (plafonds, bilan du mois, abonnements, installation, rappels, nouveautés) déclare ses messages
     avec register(source, fn) ou push(message). Les identifiants sont stables (« recap:2026-09 », « budget:loyer:2026-10:80 »…) :
     un message fermé ne revient jamais.
   - Un seul message en haut de l'accueil, le plus important d'abord (« 1 sur 3 » pour parcourir les autres).
   - La cloche de l'en-tête liste tous les messages en cours (feuille sur téléphone, volet sur ordinateur).
   - Les confirmations brèves (« Ajouté », « Annuler ») restent des toasts : GFNotify.toast(texte, {undo}).
   L'état (messages fermés, lus, date de première apparition, réglages) est un état d'interface rangé par compte et par appareil. */
(function(){
  "use strict";
  var KEY="personalFinanceDashboard.notifications";
  var KEEP_MS=400*864e5;
  // Deux familles de réglages : « Mes finances » et « Nouveautés et conseils ».
  var FAMILY={budget:"finance",recap:"finance",subs:"finance",install:"tips",reminders:"tips",news:"tips"};
  // Ordre d'affichage en haut de l'accueil : plafond atteint (100) > plafond à 80 % (90) > bilan (80) > abonnements (70) > installer (60) > rappels (50) > nouveautés (40).
  var PRIORITY={budget:90,recap:80,subs:70,install:60,reminders:50,news:40};
  var TONE_OF={budget:"warning",recap:"info",subs:"info",install:"info",reminders:"info",news:"info"};
  var ICON_OF={budget:"warning",recap:"calendar",subs:"repeat",install:"phone",reminders:"bell",news:"spark"};
  var TONES={info:1,success:1,warning:1};
  var URGENT=100;

  var hasDom=typeof document!=="undefined"&&!!document.createElement;
  function byId(id){return document.getElementById(id);}
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function reduced(){return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);}
  function later(fn){if(typeof requestAnimationFrame==="function")requestAnimationFrame(fn);else setTimeout(fn,0);}

  /* ── État persistant ─────────────────────────────────────────────────────── */
  var cache=null,cacheOwner=null;
  function owner(){try{return window.safeStore&&window.safeStore.financialOwner?window.safeStore.financialOwner():"";}catch(e){return "";}}
  function blank(){return{v:1,dismissed:{},read:{},born:{},prefs:{}};}
  function readState(){
    var s=blank();
    try{
      var raw=window.safeStore&&window.safeStore.getItem(KEY),v=raw&&JSON.parse(raw);
      if(v&&typeof v==="object")["dismissed","read","born","prefs"].forEach(function(k){if(v[k]&&typeof v[k]==="object"&&!Array.isArray(v[k]))s[k]=v[k];});
    }catch(e){}
    return s;
  }
  function state(){
    var o=owner();
    if(!cache||cacheOwner!==o){
      if(cache&&cacheOwner!==o)pushed={};// un autre compte : les messages poussés par le précédent ne le suivent pas
      cache=readState();cacheOwner=o;
    }
    return cache;
  }
  function save(){try{if(window.safeStore)window.safeStore.setItem(KEY,JSON.stringify(cache));}catch(e){}}
  function prune(st,liveIds){
    var limit=Date.now()-KEEP_MS;
    ["dismissed","read","born"].forEach(function(k){Object.keys(st[k]).forEach(function(id){if(Number(st[k][id])<limit&&!liveIds[id])delete st[k][id];});});
  }

  /* ── Réglages par famille ─────────────────────────────────────────────────── */
  function legacyFinanceOn(){
    // Avant ce module : plafonds (réglage des alertes) et bilan du mois (bloc de l'accueil). Tout coupé = famille coupée.
    try{
      var alerts=window.safeStore.getItem("personalFinanceDashboard.budgetAlertsOn")!=="0";
      var blocks=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.homeBlocks")||"{}")||{};
      return alerts||blocks.recap!==false;
    }catch(e){return true;}
  }
  function familyOn(name){
    var p=state().prefs;
    if(typeof p[name]==="boolean")return p[name];
    return name==="finance"?legacyFinanceOn():true;
  }
  function setFamily(name,on){
    if(name!=="finance"&&name!=="tips")return;
    state().prefs[name]=!!on;save();
    // Rallumer « Mes finances » rallume aussi les réglages plus fins qui existaient avant (plafonds, bilan du mois).
    if(on&&name==="finance"&&window.GFHome){try{window.GFHome.setAlertsOn(true);if(window.GFHome.setBlock)window.GFHome.setBlock("recap",true);}catch(e){}}
    rebuild();
    if(window.GFHome&&window.GFHome.render)window.GFHome.render();
  }

  /* ── Messages ─────────────────────────────────────────────────────────────── */
  var providers={},results={},pushed={},current=[];
  function normAction(a){
    if(!a||!a.label)return null;
    if(typeof a.run==="function")return{label:String(a.label),run:a.run};
    if(a.href)return{label:String(a.label),href:String(a.href)};
    return null;
  }
  function normalize(m){
    if(!m||typeof m.id!=="string"||!m.id||!FAMILY[m.kind])return null;
    var sticky=!!m.sticky,pr=Number(m.priority);
    return{id:m.id,kind:m.kind,priority:isFinite(pr)?pr:PRIORITY[m.kind],title:String(m.title||""),body:m.body?String(m.body):"",kicker:m.kicker?String(m.kicker):"",
      tone:TONES[m.tone]?m.tone:TONE_OF[m.kind],icon:m.icon||ICON_OF[m.kind],ring:m.ring||null,sensitive:!!m.sensitive,action:normAction(m.action),
      sticky:sticky,dismissible:m.dismissible!==false&&!sticky,once:!!m.once};
  }
  /* Messages en cours, déjà filtrés : famille activée, pas fermés. */
  function gather(){
    var st=state(),seen={},out=[],now=Date.now(),dirty=false;
    var all=[];Object.keys(results).forEach(function(k){all=all.concat(results[k]||[]);});Object.keys(pushed).forEach(function(k){all.push(pushed[k]);});
    all.forEach(function(raw){
      var m=normalize(raw);if(!m||seen[m.id])return;seen[m.id]=1;
      if(!familyOn(FAMILY[m.kind]))return;
      if(st.dismissed[m.id]&&!m.sticky)return;
      if(!st.born[m.id]){st.born[m.id]=now;dirty=true;}
      m.born=Number(st.born[m.id])||now;m.read=!!st.read[m.id];out.push(m);
    });
    if(dirty){prune(st,seen);save();}
    return out;
  }
  /* Messages candidats pour l'emplacement du haut : non lus (ou épinglés), du plus important au moins important.
     Sans aucune donnée (accueil vide), seuls les conseils passent : jamais devant la carte « Pour commencer ». */
  function select(list,ctx){
    ctx=ctx||{};
    return list.filter(function(m){
      if(m.read&&!m.sticky)return false;
      if(ctx.blank&&FAMILY[m.kind]!=="tips")return false;
      return true;
    }).sort(function(a,b){return b.priority-a.priority||b.born-a.born||(a.id<b.id?-1:1);});
  }
  function rebuild(){current=gather();emit();return current;}
  function refresh(){
    var token=refresh.t=(refresh.t||0)+1;
    Object.keys(providers).forEach(function(k){
      var r;try{r=providers[k]();}catch(e){r=[];if(window.console)console.warn("Messages Meuniance",k,e);}
      if(r&&typeof r.then==="function"){r.then(function(a){if(token!==refresh.t)return;results[k]=Array.isArray(a)?a:[];rebuild();}).catch(function(){});}
      else results[k]=Array.isArray(r)?r:[];
    });
    return rebuild();
  }
  var refreshQueued=false;
  function scheduleRefresh(){if(refreshQueued)return;refreshQueued=true;later(function(){refreshQueued=false;refresh();});}

  function register(source,fn){if(typeof fn==="function"){providers[source]=fn;scheduleRefresh();}}
  function push(m){var n=normalize(m);if(!n)return false;pushed[n.id]=m;rebuild();return current.some(function(x){return x.id===n.id;});}
  function remove(id){delete pushed[id];rebuild();}
  function list(){return current.slice().sort(function(a,b){return b.born-a.born||b.priority-a.priority||(a.id<b.id?-1:1);});}
  function unread(){return current.filter(function(m){return !m.read;}).length;}
  function find(id){return current.filter(function(m){return m.id===id;})[0]||null;}
  function isDismissed(id){return !!state().dismissed[id];}
  function dismiss(id){var m=find(id);if(m&&!m.dismissible)return;state().dismissed[id]=Date.now();save();rebuild();}
  function markRead(id){var st=state();if(!st.read[id]){st.read[id]=Date.now();save();}rebuild();}
  // Remet en jeu les messages d'une famille d'identifiants (ex. « news:2026-10-19-ensemble ») : « Découvrir sur l'accueil ».
  function restore(prefix){var st=state();["dismissed","read"].forEach(function(k){Object.keys(st[k]).forEach(function(id){if(id.indexOf(prefix)===0)delete st[k][id];});});save();rebuild();}
  function markAllRead(){var st=state(),now=Date.now();current.forEach(function(m){if(!m.read)st.read[m.id]=now;});save();rebuild();}

  function runAction(id){
    var m=find(id);if(!m||!m.action)return;
    var st=state();st.read[id]=st.read[id]||Date.now();
    if(m.once&&m.dismissible)st.dismissed[id]=Date.now();
    save();rebuild();
    if(hasDom)closePanel(true);
    try{
      if(m.action.run)m.action.run();
      else if(m.action.href){if(/^#/.test(m.action.href))location.hash=m.action.href;else location.assign(m.action.href);}
    }catch(e){if(window.console)console.warn("Messages Meuniance",e);}
  }

  /* ── Affichage ───────────────────────────────────────────────────────────── */
  var SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var IC={
    info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor"/>',
    success:'<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
    warning:'<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.4"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    repeat:'<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>',
    phone:'<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M12 7.5v6M9.5 11 12 13.5 14.5 11"/>',
    bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    spark:'<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z"/><path d="M18.5 16.5v3M17 18h3"/>',
    close:'<path d="m7 7 10 10M17 7 7 17"/>',
    prev:'<path d="m14.5 6-6 6 6 6"/>',
    next:'<path d="m9.5 6 6 6-6 6"/>'
  };
  function svgNode(name,cls){var s=el("span",cls||"gfn-svg");s.setAttribute("aria-hidden","true");s.innerHTML=SVG+(IC[name]||IC.info)+"</svg>";return s;}
  /* Anneau de progression du logo, repris des nouveautés : un tour de plus à chaque nouveauté essayée. */
  function ringNode(done,total){
    var ns="http://www.w3.org/2000/svg",R=2*Math.PI*9.4,svg=document.createElementNS(ns,"svg");
    svg.setAttribute("viewBox","0 0 28 28");svg.setAttribute("class","gfn-ring");svg.setAttribute("aria-hidden","true");
    function node(tag,attrs){var n=document.createElementNS(ns,tag);Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});svg.appendChild(n);return n;}
    node("circle",{"class":"gfn-ring-track",cx:14,cy:14,r:9.4});
    node("circle",{"class":"gfn-ring-arc",cx:14,cy:14,r:9.4,transform:"rotate(-90 14 14)","stroke-dasharray":(total?R*done/total:0)+" "+R});
    var g=node("g",{transform:"rotate(30 14 14) translate(14 14) scale(.62) translate(-14 -14)"});
    var seed=document.createElementNS(ns,"path");seed.setAttribute("class","gfn-ring-seed");seed.setAttribute("d","M14 6.2C14.9 7.4 17.2 10 17.2 13.7 17.2 16.9 15.4 19.6 14 21.8 12.6 19.6 10.8 16.9 10.8 13.7 10.8 10 13.1 7.4 14 6.2Z");g.appendChild(seed);
    return svg;
  }
  function card(m,mode){
    var urgent=m.priority>=URGENT;
    var a=el("article","gfn-card is-"+m.tone+(urgent?" is-urgent":"")+" is-"+mode+(m.read?" is-read":""));a.setAttribute("data-id",m.id);
    var ic=el("span","gfn-ic");ic.setAttribute("aria-hidden","true");
    if(m.ring)ic.append(ringNode(m.ring.done,m.ring.total));else ic.append(svgNode(m.icon));
    var body=el("div","gfn-body");
    if(m.kicker)body.append(el("p","gfn-kicker",m.kicker));
    var title=el("strong","gfn-title");
    if(mode==="list"&&!m.read)title.append(el("span","gfn-sr",t2("Non lu. ","Unread. ")));
    title.append(document.createTextNode(m.title));body.append(title);
    if(m.body)body.append(el("p","gfn-text"+(m.sensitive?" gfn-sensitive":""),m.body));
    var foot=el("div","gfn-foot");
    if(m.action){var go=el("button","gfn-act",m.action.label);go.type="button";go.addEventListener("click",function(){runAction(m.id);});foot.append(go);}
    a.append(ic,body);
    if(m.dismissible||mode==="slot"&&!m.sticky){
      var x=el("button","gfn-x");x.type="button";x.setAttribute("aria-label",mode==="slot"?t2("Fermer ce message","Close this message"):t2("Supprimer ce message","Delete this message"));
      x.append(svgNode("close"));
      x.addEventListener("click",function(){if(mode==="slot")closeSlot(m.id);else dismissInPanel(m.id);});
      a.append(x);
    }
    if(mode==="list"&&!m.read)a.append(el("span","gfn-dot"));
    a.append(foot);
    // Dans la cloche, toucher la carte n'importe où la marque comme lue (les boutons gardent leur rôle).
    if(mode==="list"&&!m.read)a.addEventListener("click",function(){markRead(m.id);});
    return a;
  }

  /* — L'emplacement du haut de l'accueil — */
  var slotEl=null,slotId=null,slotManual=false,slotSig="",slotFocus="";
  function slot(){
    if(!hasDom)return null;
    if(!slotEl){slotEl=el("section","gfn-slot");slotEl.id="gfnSlot";slotEl.setAttribute("role","status");slotEl.setAttribute("aria-live","polite");slotEl.setAttribute("aria-atomic","true");slotEl.setAttribute("aria-label",t2("Messages","Messages"));}
    return slotEl;
  }
  function candidates(){return select(current,{blank:!!(hasDom&&document.body&&document.body.classList.contains("gfh-empty"))});}
  function closeSlot(id){
    // Fermer = « lu » : le message quitte l'accueil mais reste dans la cloche jusqu'à ce qu'on le supprime.
    var cand=candidates(),i=cand.map(function(m){return m.id;}).indexOf(id);
    slotFocus="after:"+Math.min(i,cand.length-2);
    markRead(id);
  }
  function renderSlot(){
    if(!slotEl)return;
    var cand=candidates(),n=cand.length;
    if(!n){
      var hadFocus=slotEl.contains(document.activeElement);
      if(slotEl.firstChild)slotEl.replaceChildren();
      slotId=null;slotSig="";slotManual=false;
      if(hadFocus||slotFocus){slotFocus="";var b=byId("gfnBell");if(b)b.focus({preventScroll:true});}
      return;
    }
    var idx=slotManual?cand.map(function(m){return m.id;}).indexOf(slotId):-1;
    if(idx<0){idx=0;slotManual=false;}
    if(/^after:/.test(slotFocus)){idx=Math.max(0,Math.min(n-1,Number(slotFocus.slice(6))));}
    var m=cand[idx];slotId=m.id;
    var sig=JSON.stringify([n,idx,m.id,m.title,m.body,m.tone,m.icon,m.ring,m.action&&m.action.label,m.sticky,m.dismissible,en()]);
    if(sig===slotSig&&slotEl.firstChild)return;
    slotSig=sig;
    var a=card(m,"slot");
    if(n>1){
      var pager=el("div","gfn-pager"),prev=el("button","gfn-nav gfn-prev"),next=el("button","gfn-nav gfn-next");
      prev.type=next.type="button";prev.append(svgNode("prev"));next.append(svgNode("next"));
      prev.setAttribute("aria-label",t2("Message précédent","Previous message"));next.setAttribute("aria-label",t2("Message suivant","Next message"));
      function go(d){slotManual=true;slotId=cand[(idx+d+n)%n].id;slotFocus=d<0?"prev":"next";renderSlot();}
      prev.addEventListener("click",function(){go(-1);});next.addEventListener("click",function(){go(1);});
      pager.append(prev,el("span","gfn-count",t2((idx+1)+"\u00a0sur\u00a0"+n,(idx+1)+" of "+n)),next);
      a.querySelector(".gfn-foot").append(pager);
    }
    if(!a.querySelector(".gfn-foot").childNodes.length)a.querySelector(".gfn-foot").remove();
    if(slotEl.firstChild)a.classList.add("is-swap");
    slotEl.replaceChildren(a);
    if(slotFocus){
      var f=null;
      if(slotFocus==="prev")f=a.querySelector(".gfn-prev");else if(slotFocus==="next")f=a.querySelector(".gfn-next");else f=a.querySelector(".gfn-act")||a.querySelector(".gfn-x");
      slotFocus="";if(f)f.focus({preventScroll:true});
    }
  }

  /* — La cloche — */
  var bell=null,badge=null;
  function bellLabel(n){return n>0?t2("Notifications, "+n+(n>1?" non lues":" non lue"),"Notifications, "+n+" unread"):t2("Notifications","Notifications");}
  function mountBell(){
    if(bell&&bell.isConnected)return true;
    var host=document.querySelector(".app-header .top-actions");if(!host)return false;
    if(!bell){
      bell=el("button","gfn-bell");bell.id="gfnBell";bell.type="button";bell.setAttribute("aria-haspopup","dialog");bell.setAttribute("aria-expanded","false");
      bell.append(svgNode("bell","gfn-bell-ic"));badge=el("span","gfn-badge");badge.setAttribute("aria-hidden","true");badge.hidden=true;bell.append(badge);
      bell.addEventListener("click",function(){if(panel&&panel.open)closePanel();else openPanel();});
    }
    var gear=host.querySelector(".mobile-settings-button"),menu=host.querySelector(".profile-menu");
    host.insertBefore(bell,gear||menu||null);
    return true;
  }
  function renderBell(){
    if(!bell)return;
    var n=unread();
    bell.setAttribute("aria-label",bellLabel(n));bell.title=t2("Notifications","Notifications");
    badge.hidden=!n;badge.textContent=n>9?"9+":String(n);
    bell.classList.toggle("has-unread",n>0);
  }

  /* — Le panneau : feuille sur téléphone, volet sous la cloche sur ordinateur — */
  var panel=null,panelSig="",returnFocus=null,drag=null,closing=0;
  function wide(){return window.matchMedia&&window.matchMedia("(min-width:900px)").matches;}
  function buildPanel(){
    panel=el("dialog","gfn-dialog");panel.id="gfnPanel";panel.setAttribute("aria-labelledby","gfnPTitle");
    var wrap=el("div","gfn-panel"),head=el("div","gfn-p-head"),grab=el("span","gfn-grab");grab.setAttribute("aria-hidden","true");
    var row=el("div","gfn-p-row"),h=el("h2","gfn-p-title",t2("Notifications","Notifications"));h.id="gfnPTitle";h.tabIndex=-1;
    var x=el("button","gfn-p-x");x.type="button";x.setAttribute("aria-label",t2("Fermer les notifications","Close notifications"));x.append(svgNode("close"));x.addEventListener("click",function(){closePanel();});
    row.append(h,x);
    var sub=el("div","gfn-p-sub"),cnt=el("span","gfn-p-count"),all=el("button","gfn-readall",t2("Tout marquer comme lu","Mark all as read"));all.type="button";
    all.addEventListener("click",function(){if(all.getAttribute("aria-disabled")==="true")return;markAllRead();});
    sub.append(cnt,all);head.append(grab,row,sub);
    var listBox=el("div","gfn-p-list");
    wrap.append(head,listBox);panel.append(wrap);
    panel.addEventListener("click",function(e){if(e.target===panel)closePanel();});
    // Le focus reste dans le panneau : Tab sur le dernier élément revient au premier, Maj+Tab l'inverse.
    panel.addEventListener("keydown",function(e){
      if(e.key!=="Tab")return;
      var f=[].filter.call(panel.querySelectorAll("button"),function(n){return !n.hidden&&n.getClientRects().length;});
      if(!f.length)return;
      var first=f[0],last=f[f.length-1],cur=document.activeElement;
      if(e.shiftKey&&(cur===first||cur===panel.querySelector(".gfn-p-title"))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&cur===last){e.preventDefault();first.focus();}
    });
    panel.addEventListener("cancel",function(e){e.preventDefault();closePanel();});
    panel.addEventListener("close",function(){
      clearTimeout(closing);panel.classList.remove("is-closing");panel.style.transform="";panel.style.transition="";
      if(bell)bell.setAttribute("aria-expanded","false");
      window.removeEventListener("resize",place);
      var f=returnFocus&&returnFocus.isConnected?returnFocus:bell;returnFocus=null;
      if(f&&f.focus&&!document.querySelector("dialog[open]"))f.focus({preventScroll:true});
    });
    // Glisser la feuille vers le bas pour la fermer (téléphone).
    head.addEventListener("pointerdown",function(e){
      if(wide()||(e.pointerType==="mouse"&&e.button!==0)||(e.target.closest&&e.target.closest("button")))return;
      drag={y:e.clientY,t:Date.now(),id:e.pointerId,dy:0};try{head.setPointerCapture(e.pointerId);}catch(err){}
      panel.style.transition="none";
    });
    head.addEventListener("pointermove",function(e){
      if(!drag||e.pointerId!==drag.id)return;
      drag.dy=Math.max(0,e.clientY-drag.y);panel.style.transform="translateY("+drag.dy+"px)";
    });
    function end(e){
      if(!drag||e.pointerId!==drag.id)return;
      var d=drag;drag=null;panel.style.transition="";
      var v=d.dy/Math.max(1,Date.now()-d.t);
      if(d.dy>110||(d.dy>40&&v>.6)){panel.style.transform="translateY(100%)";clearTimeout(closing);closing=setTimeout(function(){if(panel.open)panel.close();},reduced()?0:190);}
      else panel.style.transform="";
    }
    head.addEventListener("pointerup",end);head.addEventListener("pointercancel",end);
    document.body.append(panel);
  }
  function place(){
    if(!panel)return;
    if(wide()&&bell){
      var host=bell.parentElement,r=host.getBoundingClientRect(),b=bell.getBoundingClientRect();
      panel.style.top=Math.round(b.bottom+10)+"px";panel.style.right=Math.max(12,Math.round(window.innerWidth-r.right))+"px";
    }else{panel.style.top="";panel.style.right="";}
  }
  var focusAfterRender="";
  function dismissInPanel(id){
    var ids=list().map(function(m){return m.id;}),i=ids.indexOf(id);
    focusAfterRender="x:"+i;
    dismiss(id);
  }
  function renderPanel(){
    if(!panel)return;
    var items=list(),n=items.filter(function(m){return !m.read;}).length;
    var sig=JSON.stringify([items.map(function(m){return[m.id,m.read,m.title,m.body,m.tone,m.icon,m.ring,m.action&&m.action.label,m.dismissible,m.sticky];}),en()]);
    var all=panel.querySelector(".gfn-readall"),cnt=panel.querySelector(".gfn-p-count");
    cnt.textContent=n?t2(n+(n>1?"\u00a0non lues":"\u00a0non lue"),n+" unread"):items.length?t2("Tout est lu","All caught up"):"";
    all.setAttribute("aria-disabled",String(!n));all.hidden=!items.length;
    if(sig===panelSig)return;panelSig=sig;
    var box=panel.querySelector(".gfn-p-list"),scroll=box.scrollTop;
    if(!items.length){
      var empty=el("div","gfn-empty"),ic=el("span","gfn-empty-ic");ic.append(svgNode("bell"));
      empty.append(ic,el("strong","",t2("Rien de nouveau pour l’instant.","Nothing new for now.")),el("p","",t2("Quand il y aura du nouveau, tu le retrouveras ici.","When there’s something new, you’ll find it here.")));
      box.replaceChildren(empty);
    }else{
      var start=new Date();start.setHours(0,0,0,0);
      var today=items.filter(function(m){return m.born>=start.getTime();}),older=items.filter(function(m){return m.born<start.getTime();});
      var nodes=[];
      [[t2("Aujourd’hui","Today"),today],[t2("Plus tôt","Earlier"),older]].forEach(function(g){
        if(!g[1].length)return;
        var sec=el("section","gfn-group"),h=el("h3","gfn-group-t",g[0]),ul=el("div","gfn-group-l");
        g[1].forEach(function(m){ul.append(card(m,"list"));});
        sec.append(h,ul);nodes.push(sec);
      });
      box.replaceChildren.apply(box,nodes);
    }
    box.scrollTop=scroll;
    if(focusAfterRender){
      var f=null;
      if(/^x:/.test(focusAfterRender)){var xs=box.querySelectorAll(".gfn-x");f=xs[Math.min(Number(focusAfterRender.slice(2)),xs.length-1)];}
      focusAfterRender="";
      (f||panel.querySelector(".gfn-p-title")).focus({preventScroll:true});
    }
  }
  function openPanel(){
    if(!hasDom||(panel&&panel.open))return;
    if(!mountBell())return;
    returnFocus=document.activeElement&&document.activeElement!==document.body?document.activeElement:bell;
    if(!panel)buildPanel();
    bell.setAttribute("aria-expanded","true");
    panelSig="";renderPanel();place();
    panel.classList.remove("is-closing");panel.style.transform="";
    panel.showModal();
    window.addEventListener("resize",place);
    panel.querySelector(".gfn-p-title").focus({preventScroll:true});
  }
  function closePanel(instant){
    if(!panel||!panel.open)return;
    clearTimeout(closing);
    if(instant===true||reduced()){panel.close();return;}
    panel.classList.add("is-closing");
    closing=setTimeout(function(){if(panel.open)panel.close();},180);
  }

  /* ── Confirmations brèves (toast) : même apparence, même place, même durée partout ── */
  var toastTimer=0;
  function hideToast(){var t=byId("gfhToast");if(t)t.classList.remove("is-on");}
  function toast(text,opts){
    if(!hasDom)return;
    opts=opts||{};
    var t=byId("gfhToast");
    if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");t.setAttribute("aria-atomic","true");document.body.append(t);}
    var parts=[el("span","gfh-toast-tx",String(text==null?"":text))],u=opts.undo;
    if(typeof u==="function")u={run:u};
    t.classList.toggle("has-act",!!(u&&typeof u.run==="function"));
    if(u&&typeof u.run==="function"){
      var b=el("button","gfh-toast-act",u.label||t2("Annuler","Undo"));b.type="button";
      b.addEventListener("click",function(){hideToast();u.run();});parts.push(b);
    }
    t.replaceChildren.apply(t,parts);
    t.classList.add("is-on");clearTimeout(toastTimer);toastTimer=setTimeout(hideToast,opts.ms||(u?6500:3200));
  }

  /* ── Réglages : Paramètres › Notifications › « Messages dans le site » ─────────── */
  function families(){return[
    ["finance",t2("Mes finances","My finances"),t2("Plafond atteint ou presque, bilan du mois, abonnements repérés.","Limit reached or close, monthly recap, subscriptions found.")],
    ["tips",t2("Nouveautés et conseils","News and tips"),t2("Nouveautés de Meuniance, installer l’app, activer les rappels.","What’s new in Meuniance, installing the app, turning on reminders.")]
  ];}
  function settingsUI(){
    var host=document.querySelector('[data-settings-panel="notifications"]');if(!host)return;
    var box=byId("gfnSettings");
    if(!box){box=el("section","gfh-set gfn-set");box.id="gfnSettings";box.setAttribute("aria-labelledby","gfnSetTitle");}
    var h=el("h4","",t2("Messages dans le site","Messages in the site"));h.id="gfnSetTitle";
    var lead=el("p","",t2("Les messages qui s’affichent en haut de l’accueil et dans la cloche, quand Meuniance est ouverte. Rien à voir avec les notifications du téléphone ci-dessus.","The messages shown at the top of Home and in the bell, while Meuniance is open. Not the same as the phone notifications above."));
    var group=el("div","gfh-set-group");
    families().forEach(function(f){
      var r=el("div","gfh-set-row"),c=el("div","gfh-set-copy"),sw=el("button","gfh-switch");
      c.append(el("strong","",f[1]),el("small","",f[2]));
      sw.type="button";sw.setAttribute("role","switch");sw.setAttribute("aria-checked",String(familyOn(f[0])));sw.setAttribute("aria-label",f[1]);sw.append(el("span"));
      sw.addEventListener("click",function(){var next=sw.getAttribute("aria-checked")!=="true";sw.setAttribute("aria-checked",String(next));setFamily(f[0],next);});
      r.append(c,sw);group.append(r);
    });
    box.replaceChildren(h,lead,group);
    host.append(box);// toujours après le bloc « Sur cet appareil » (téléphone)
  }

  /* ── Mise à jour de l'affichage ──────────────────────────────────────────── */
  var uiQueued=false;
  function emit(){
    if(!hasDom||uiQueued)return;
    uiQueued=true;
    later(function(){
      uiQueued=false;
      try{mountBell();renderBell();renderSlot();renderPanel();}catch(e){if(window.console)console.warn("Messages Meuniance",e);}
    });
  }

  window.GFNotify={push:push,register:register,remove:remove,list:list,unread:unread,dismiss:dismiss,markRead:markRead,markAllRead:markAllRead,restore:restore,isDismissed:isDismissed,
    refresh:scheduleRefresh,familyOn:familyOn,setFamily:setFamily,toast:toast,slot:slot,open:openPanel,close:closePanel,settings:settingsUI,
    _select:select,_state:state,_refreshNow:refresh};

  if(hasDom){
    var start=function(){mountBell();settingsUI();scheduleRefresh();};
    window.addEventListener("gf:languagechange",function(){slotSig="";panelSig="";if(panel){panel.setAttribute("aria-labelledby","gfnPTitle");var t=panel.querySelector(".gfn-p-title");if(t)t.textContent=t2("Notifications","Notifications");var x=panel.querySelector(".gfn-p-x");if(x)x.setAttribute("aria-label",t2("Fermer les notifications","Close notifications"));var a=panel.querySelector(".gfn-readall");if(a)a.textContent=t2("Tout marquer comme lu","Mark all as read");}settingsUI();scheduleRefresh();});
    window.addEventListener("authStateChanged",function(){cache=null;slotSig="";panelSig="";settingsUI();scheduleRefresh();setTimeout(scheduleRefresh,900);});
    window.addEventListener("gf:dashboardupdate",scheduleRefresh);
    document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-settings-view="notifications"]'))setTimeout(settingsUI,0);});
    if(window.MutationObserver)new MutationObserver(scheduleRefresh).observe(document.body,{attributes:true,attributeFilter:["class"]});
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  }
})();
