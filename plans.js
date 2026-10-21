/* Abonnements Meuniance : offres, page « Abonnement », onboarding et limites par formule.
   Les limites ne s'appliquent que si BILLING.enforce vaut true (période de lancement : tout reste ouvert).
   Pour brancher le paiement, renseigner BILLING.checkout.plus / .pro (ex. liens Stripe Payment Links)
   avant ce script via window.MEUNIANCE_BILLING = { enforce:true, checkout:{plus:"https://…", pro:"https://…"} }.
   La sécurité réelle (qui a payé) doit rester côté serveur : profiles.plan est mis à jour par le webhook de paiement. */
(function(){
  "use strict";
  var BILLING=Object.assign({enforce:false,checkout:{plus:"",pro:""},portal:""},window.MEUNIANCE_BILLING||{});
  BILLING.checkout=Object.assign({plus:"",pro:""},(window.MEUNIANCE_BILLING||{}).checkout||{});
  var RANK={free:0,plus:1,pro:2};
  var FEATURE_PLAN={avatar_plus:"plus",avatar_pro:"pro",excel:"plus",goals_unlimited:"plus",share:"plus",share_multi:"pro",share_rights:"pro",share_expiry:"pro",goals_history:"pro"};
  var FEATURE_COPY={
    avatar_plus:["Ce style d’avatar","This avatar style"],
    avatar_pro:["Ce style d’avatar","This avatar style"],
    excel:["L’import et l’export Excel","Excel import and export"],
    goals_unlimited:["Les objectifs illimités","Unlimited goals"],
    share:["Le partage avec un proche","Sharing with someone"],
    share_multi:["Le partage avec plusieurs personnes","Sharing with several people"],
    share_rights:["Les droits par personne","Per-person permissions"],
    share_expiry:["Les accès temporaires","Temporary access"],
    goals_history:["L’historique des objectifs","Goal history"]
  };
  var PLANS=[
    {id:"free",name:"Free",price:0,pitch:["Tout ce qu’il faut pour y voir clair.","Everything you need to see clearly."],period:["pour toujours","forever"],
      cta:["Rester sur Free","Stay on Free"],
      features:[["Tableau de bord et sélecteur de mois","Dashboard and month picker"],["Tableur avec formules","Spreadsheet with formulas"],["1 objectif","1 goal"],["Mode clair et sombre","Light and dark mode"],["Export et suppression de tes données","Export and delete your data"],["Pas de partage","No sharing",true]]},
    {id:"plus",name:"Plus",price:4.99,featured:true,pitch:["Ton budget, à ton image, et à deux.","Your budget, your way, for two."],period:["par mois","per month"],
      cta:["Passer à Plus","Upgrade to Plus"],
      features:[["Import et export Excel","Excel import and export"],["Objectifs illimités","Unlimited goals"],["Partage avec 1 personne : tu choisis les mois et les lignes visibles","Share with 1 person: you choose visible months and rows"],["Évolution mensuelle complète","Full monthly trends"],["Styles et couleurs d’avatar Plus","Plus avatar styles and colours"],["Tout ce qui est dans Free","Everything in Free"]]},
    {id:"pro",name:"Pro",price:7.99,pitch:["Pour partager sans limite et aller plus loin.","Share without limits and go further."],period:["par mois","per month"],
      cta:["Passer à Pro","Upgrade to Pro"],
      features:[["Tout ce qui est dans Plus","Everything in Plus"],["Partage avec plusieurs personnes","Share with several people"],["Droits par personne : lecture seule ou modification","Per-person rights: read-only or edit"],["Accès temporaire qui expire tout seul","Temporary access that expires on its own"],["Historique de progression des objectifs","Goal progress history"],["Tous les styles et couleurs d’avatar","Every avatar style and colour"]]}
  ];
  var state={plan:"free",since:null,loaded:false,loadedFor:"",request:0};
  var byId=function(id){return document.getElementById(id);};
  function en(){return window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en";}
  function tr(pair){return Array.isArray(pair)?(en()?pair[1]:pair[0]):String(pair||"");}
  function t2(fr,enText){return en()?enText:fr;}
  function account(){return window.__account||{};}
  function normalizePlan(value){value=String(value||"").toLowerCase();return value==="premium"||value==="pro"?"pro":value==="plus"?"plus":"free";}
  function planById(id){return PLANS.filter(function(p){return p.id===id;})[0]||PLANS[0];}
  function price(value){if(!value)return "0 €";try{return new Intl.NumberFormat(en()?"en-IE":"fr-FR",{style:"currency",currency:"EUR"}).format(value);}catch(e){return String(value).replace(".",",")+" €";}}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;return n;}
  function date(value){if(!value)return "";var d=new Date(value);if(isNaN(d.getTime()))return "";try{return new Intl.DateTimeFormat(en()?"en-GB":"fr-FR",{year:"numeric",month:"long",day:"numeric"}).format(d);}catch(e){return d.toLocaleDateString();}}

  /* ── Droits ─────────────────────────────────────── */
  function can(feature){
    if(!BILLING.enforce)return true;
    var need=FEATURE_PLAN[feature]||"free";
    return (RANK[state.plan]||0)>=(RANK[need]||0);
  }
  function requires(feature){if(can(feature))return true;openUpgrade(feature);return false;}

  /* ── Chargement de la formule depuis le profil Supabase ── */
  // Compte connecté dont la formule n'a pas encore été lue (affichage « chargement » dans les paramètres).
  function waiting(){var user=account().user;return !!(user&&state.loadedFor!==user.id&&window.MeuniLoader&&window.MeuniLoader.inline);}
  async function loadPlan(){
    var current=++state.request,acc=account(),user=acc.user;
    if(!user||!acc.client){state.plan="free";state.since=null;state.loaded=true;state.loadedFor=user?user.id:"";refresh();return;}
    if(waiting())refresh();// nouveau compte : la page s'affiche, seule la formule attend
    try{
      var result=await acc.client.rpc("get_my_profile");
      if(current!==state.request)return;
      if(result.error)throw result.error;
      var profile=Array.isArray(result.data)?result.data[0]:result.data;
      state.plan=normalizePlan(profile&&profile.plan);state.since=profile&&profile.subscription_started_at||null;
    }catch(e){if(current!==state.request)return;state.plan="free";state.since=null;}
    state.loaded=true;state.loadedFor=user.id;refresh();
  }

  /* ── Cartes d'offres ─────────────────────────────── */
  function renderPlans(container,options){
    options=options||{};if(!container)return;
    var grid=el("div","gfs-plans"+(options.compact?" is-compact":""));
    grid.setAttribute("role","list");grid.setAttribute("aria-label",t2("Formules","Plans"));
    PLANS.forEach(function(plan){
      var isCurrent=!options.pending&&plan.id===state.plan,card=el("article","gfs-card"+(plan.featured?" is-featured":"")+(isCurrent&&!options.compact?" is-current":""));
      card.setAttribute("role","listitem");
      if(isCurrent&&!options.compact)card.append(el("span","gfs-tag",t2("Ta formule","Your plan")));
      else if(plan.featured)card.append(el("span","gfs-tag",t2("Recommandé","Recommended")));
      card.append(el("h4","",plan.name),el("p","gfs-pitch",tr(plan.pitch)));
      var p=el("div","gfs-price");p.append(el("b","",price(plan.price)),el("small","",tr(plan.period)));card.append(p);
      var list=el("ul");plan.features.forEach(function(f){var li=el("li",f[2]?"is-dim":"",tr(f));list.append(li);});card.append(list);
      var btn=el("button","gfs-btn"+(plan.featured&&!isCurrent?" is-primary":""));btn.type="button";
      if(isCurrent){btn.textContent=t2("Formule actuelle","Current plan");btn.disabled=true;}
      else if(plan.id==="free"){btn.textContent=(RANK[state.plan]>0)?t2("Gérer mon abonnement","Manage my plan"):tr(plan.cta);btn.addEventListener("click",function(){if(options.onChoose&&RANK[state.plan]===0){options.onChoose("free");return;}manage();});}
      else if(!BILLING.checkout[plan.id]){btn.textContent=t2("Bientôt disponible","Coming soon");btn.disabled=true;btn.classList.add("is-soon");}
      else{btn.textContent=tr(plan.cta);btn.addEventListener("click",function(){(options.onChoose||startCheckout)(plan.id);});}
      if(options.pending)btn.disabled=true;// formule pas encore lue : on ne propose rien à l'aveugle
      card.append(btn);grid.append(card);
    });
    container.replaceChildren(grid);
    return grid;
  }
  function renderOnboardingOffer(container,options){options=options||{};return renderPlans(container,{compact:true,onChoose:function(id){if(id==="free"){var d=byId("accountWelcomeDialog");if(d&&d.open)d.close();return;}(options.onChoose||startCheckout)(id);}});}

  /* ── Paiement ───────────────────────────────────── */
  function dialog(kicker,title,text,actions){
    var d=el("dialog","gfplan-dialog");d.setAttribute("aria-labelledby","gfsDialogTitle");
    var h=el("h2","",title);h.id="gfsDialogTitle";
    var row=el("div","gfplan-dialog-actions");
    (actions||[]).forEach(function(a){var b=el("button","gfs-btn"+(a.primary?" is-primary":""),a.label);b.type="button";b.addEventListener("click",function(){d.close();if(a.run)a.run();});row.append(b);});
    d.append(el("span","gfs-kicker",kicker),h,el("p","",text),row);
    document.body.append(d);d.addEventListener("close",function(){d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();},{once:true});
    d.addEventListener("click",function(e){if(e.target===d)d.close();});
    d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
    return d;
  }
  function startCheckout(planId){
    var plan=planById(planId),user=account().user;
    var welcome=byId("accountWelcomeDialog");if(welcome&&welcome.open)welcome.close();
    if(!user){
      dialog(t2("Abonnement","Plan"),t2("Connecte-toi d’abord","Sign in first"),t2("Ton abonnement est rattaché à ton compte Meuniance, pour le retrouver sur tous tes appareils.","Your plan is linked to your Meuniance account so you get it on every device."),[{label:t2("Plus tard","Later")},{label:t2("Se connecter","Sign in"),primary:true,run:function(){openSettings("account");}}]);
      return;
    }
    var link=BILLING.checkout[plan.id];
    if(link){
      try{var url=new URL(link);if(url.protocol!=="https:")throw new Error("checkout");url.searchParams.set("client_reference_id",user.id);if(user.email)url.searchParams.set("prefilled_email",user.email);window.location.assign(url.toString());return;}catch(e){}
    }
    dialog(t2("Meuniance "+plan.name,"Meuniance "+plan.name),t2("Le paiement en ligne arrive bientôt","Online payment is coming soon"),
      BILLING.enforce?t2("Tu pourras passer à "+plan.name+" ("+price(plan.price)+" par mois) dès l’ouverture des paiements. Tes données restent intactes en attendant.","You will be able to upgrade to "+plan.name+" ("+price(plan.price)+" per month) as soon as payments open. Your data stays intact meanwhile.")
        :t2("Pendant le lancement, toutes les fonctions de "+plan.name+" sont déjà ouvertes sur ton compte. On te préviendra avant toute facturation.","During launch, every "+plan.name+" feature is already open on your account. We will let you know before any billing starts."),
      [{label:t2("Compris","Got it"),primary:true}]);
  }
  function manage(){
    if(BILLING.portal&&/^https:\/\//.test(String(BILLING.portal))){window.location.assign(BILLING.portal);return;}
    dialog(t2("Abonnement","Plan"),t2("Gérer ton abonnement","Manage your plan"),t2("Pour changer de formule ou résilier, écris-nous depuis la page Confidentialité et contact. La résiliation prend effet à la fin du mois payé.","To change plan or cancel, contact us from the Privacy and contact page. Cancellation takes effect at the end of the paid month."),[{label:t2("Fermer","Close"),primary:true}]);
  }
  function openUpgrade(feature){
    var need=planById(FEATURE_PLAN[feature]||"plus");
    dialog(t2("Réservé à "+need.name,"Included in "+need.name),tr(FEATURE_COPY[feature]||["Cette fonction","This feature"])+t2(" fait partie de "+need.name+"."," is part of "+need.name+"."),
      t2("À partir de "+price(need.price)+" par mois, sans engagement. Tes données restent les tiennes, quelle que soit ta formule.","From "+price(need.price)+" per month, no commitment. Your data stays yours, whatever your plan."),
      [{label:t2("Plus tard","Later")},{label:t2("Voir les formules","See plans"),primary:true,run:function(){openSettings("plan");}}]);
  }

  /* ── Page « Abonnement » dans les paramètres ───── */
  function ensurePanel(){
    var hub=byId("settingsHub");
    if(hub&&!hub.querySelector('[data-settings-view="plan"]')){
      var account=hub.querySelector('[data-settings-view="account"]'),item=el("button","settings-hub-item");
      item.type="button";item.dataset.settingsView="plan";
      var span=el("span"),strong=el("strong","",t2("Abonnement","Plan")),small=el("small","",t2("Free, Plus ou Pro","Free, Plus or Pro"));
      strong.dataset.gfsText="plan";small.dataset.gfsText="planHint";span.append(strong,small);item.append(span);
      if(account&&account.nextSibling)hub.insertBefore(item,account.nextSibling);else hub.append(item);
    }
    if(!document.querySelector('[data-settings-panel="plan"]')){
      var after=document.querySelector('[data-settings-panel="account"]');if(!after)return;
      var panel=el("section","settings-section panel gfplan-panel");panel.dataset.settingsPanel="plan";panel.hidden=true;panel.setAttribute("aria-label",t2("Abonnement","Plan"));panel.id="gfsPlanPanel";
      after.parentNode.insertBefore(panel,after.nextSibling);
    }
  }
  function renderPanel(){
    var panel=byId("gfsPlanPanel");if(!panel)return;
    var back=el("button","settings-detail-back",t2("← Paramètres","← Settings"));back.type="button";back.setAttribute("data-settings-back","");
    var head=el("div","gfplan-panel-head");head.append(el("h3","",t2("Choisis ta formule. Garde ta vie privée.","Pick your plan. Keep your privacy.")),el("p","",t2("Commence gratuitement. Passe à Plus ou Pro quand tu veux partager ou aller plus loin.","Start for free. Move to Plus or Pro when you want to share or go further.")));
    var current=el("div","gfs-current"),copy=el("div","gfs-current-copy"),plan=planById(state.plan),pending=waiting();
    if(pending){
      // Formule pas encore lue : le reste de la page est déjà là, seule cette ligne attend.
      var name=el("strong");name.append(window.MeuniLoader.inline(t2("Chargement de ta formule…","Loading your plan…"),{size:"sm"}));
      copy.append(el("small","",t2("Ta formule actuelle","Your current plan")),name,el("span",""," "));
    }
    else copy.append(el("small","",t2("Ta formule actuelle","Your current plan")),el("strong","",plan.name+(plan.price?" · "+price(plan.price)+t2(" / mois"," / month"):"")),el("span","",account().user?(state.since?t2("Abonné depuis le ","Subscribed since ")+date(state.since):t2("Aucun abonnement payant","No paid subscription")):t2("Connecte-toi pour retrouver ta formule sur tous tes appareils.","Sign in to keep your plan on every device.")));
    current.append(copy);
    if(pending){/* pas de bouton tant que la formule n'est pas connue */}
    else if(!account().user){var signin=el("button","gfs-btn is-inline",t2("Se connecter","Sign in"));signin.type="button";signin.addEventListener("click",function(){openSettings("account");});current.append(signin);}
    else if(RANK[state.plan]>0){var m=el("button","gfs-btn is-inline",t2("Gérer","Manage"));m.type="button";m.addEventListener("click",manage);current.append(m);}
    var plans=el("div");renderPlans(plans,{pending:pending});
    var nodes=[back,head,current];
    if(!BILLING.enforce){var note=el("p","gfs-note");var b=el("strong","",t2("Période de lancement.","Launch period."));note.append(b,document.createTextNode(t2(" Les formules Plus et Pro ne sont pas encore en vente : aucun paiement n’est possible et toutes les fonctions sont ouvertes gratuitement. Leur ouverture s’accompagnera de conditions générales de vente, et tu seras prévenu avant."," Plus and Pro are not on sale yet: no payment is possible and every feature is open for free. They will come with terms of sale, and you will be told beforehand.")));nodes.push(note);}
    var promise=el("p","gfs-promise");promise.append(document.createTextNode(t2("Même en payant, tes données restent ","Even when paying, your data stays ")),el("em","",t2("les tiennes","yours")),document.createTextNode(t2(". Aucune pub, aucun suivi, aucune revente.",". No ads, no tracking, no resale.")));
    nodes.push(plans,promise);
    panel.replaceChildren.apply(panel,nodes);
  }

  /* ── Navigation ─────────────────────────────────── */
  function openSettings(view){
    if(typeof window.setPage==="function")window.setPage("settings");
    var item=document.querySelector('#settingsHub [data-settings-view="'+view+'"]');
    if(item)item.click();
    markNav(view==="plan");
    try{window.scrollTo({top:0,behavior:"instant"});}catch(e){window.scrollTo(0,0);}
  }
  function markNav(onPlans){
    document.querySelectorAll(".studio-sidebar-nav [data-open-plans]").forEach(function(b){b.classList.toggle("is-active",onPlans);b.setAttribute("aria-current",onPlans?"page":"false");});
    if(onPlans)document.querySelectorAll('.studio-sidebar-nav [data-page="settings"]').forEach(function(b){b.classList.remove("is-active");b.setAttribute("aria-current","false");});
  }
  function addEntryPoints(){
    var nav=document.querySelector(".studio-sidebar-nav");
    if(nav&&!nav.querySelector("[data-open-plans]")){
      var settings=nav.querySelector('[data-page="settings"]'),b=el("button");b.type="button";b.setAttribute("data-open-plans","");b.setAttribute("aria-label",t2("Abonnement","Plan"));b.title=t2("Abonnement","Plan");
      b.innerHTML='<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.9"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.9"/><path d="M7 15h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg></span>';
      b.append(document.createTextNode(t2("Abonnement","Plan")));b.dataset.gfsLabel="1";
      if(settings)nav.insertBefore(b,settings);else nav.append(b);
    }
    var pop=byId("profilePopover");
    if(pop&&!pop.querySelector("[data-open-plans]")){
      var link=el("button","profile-menu-link");link.type="button";link.setAttribute("data-open-plans","");link.title=t2("Voir et changer ta formule","See and change your plan");
      link.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.8"/><path d="M7 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      var label=el("span","gfs-popover-label",t2("Abonnement","Plan"));link.append(label);
      var badge=el("span","gfs-lock");badge.id="gfsPopoverPlan";link.append(badge);
      var identity=byId("profileIdentityButton");if(identity&&identity.nextSibling)pop.insertBefore(link,identity.nextSibling);else pop.append(link);
    }
    var planFact=byId("identityPlan");
    if(planFact&&!byId("gfsIdentityManage")){var m=el("button","gfs-link",t2("Changer","Change"));m.type="button";m.id="gfsIdentityManage";m.setAttribute("data-open-plans","");m.style.marginLeft="8px";planFact.after(m);}
  }
  function refresh(){
    var plan=planById(state.plan),badge=byId("gfsPopoverPlan");if(badge){badge.textContent=plan.name;badge.hidden=waiting();}
    var fact=byId("identityPlan");if(fact&&account().user&&!waiting())fact.textContent=plan.id==="free"?t2("Gratuit","Free"):plan.name;
    renderPanel();updateLocks();
  }
  function updateLocks(){
    ["btnSheetImport","btnSheetExport"].forEach(function(id){var b=byId(id);if(!b)return;var lock=b.querySelector(".gfs-lock");var locked=!can("excel");if(locked&&!lock){lock=el("span","gfs-lock","Plus");b.append(lock);}else if(!locked&&lock)lock.remove();});
  }
  function relabel(){
    document.querySelectorAll('.studio-sidebar-nav [data-open-plans]').forEach(function(b){var node=b.lastChild;if(node&&node.nodeType===3)node.textContent=t2("Abonnement","Plan");b.setAttribute("aria-label",t2("Abonnement","Plan"));b.title=t2("Abonnement","Plan");});
    document.querySelectorAll('[data-gfs-text="plan"]').forEach(function(n){n.textContent=t2("Abonnement","Plan");});
    document.querySelectorAll('[data-gfs-text="planHint"]').forEach(function(n){n.textContent=t2("Free, Plus ou Pro","Free, Plus or Pro");});
    document.querySelectorAll(".gfs-popover-label").forEach(function(n){n.textContent=t2("Abonnement","Plan");});
    var m=byId("gfsIdentityManage");if(m)m.textContent=t2("Changer","Change");
    refresh();
  }

  /* ── Limites (actives seulement si BILLING.enforce) ── */
  function activeGoals(){try{var p=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.setupProfile")||"{}");var g=Array.isArray(p.objectives)?p.objectives:[];return g.filter(function(x){return x&&!x.archived;}).length;}catch(e){return 0;}}
  function guard(event,feature){if(can(feature))return false;event.preventDefault();event.stopImmediatePropagation();openUpgrade(feature);return true;}
  function installGuards(){
    document.addEventListener("click",function(event){
      var opener=event.target.closest&&event.target.closest("[data-open-plans]");
      if(opener){event.preventDefault();var pop=byId("profilePopover");if(pop&&!pop.hidden){pop.hidden=true;var t=byId("profileMenuButton");if(t)t.setAttribute("aria-expanded","false");}openSettings("plan");return;}
      var nav=event.target.closest&&event.target.closest("[data-page],[data-settings-view]");
      if(nav&&!(nav.dataset.settingsView==="plan"))markNav(false);
      if(nav&&nav.dataset.settingsView==="plan")markNav(true);
      if(!BILLING.enforce)return;
      var excel=event.target.closest&&event.target.closest("#btnSheetImport,#btnSheetExport,[data-gf-feature='excel']");
      if(excel){guard(event,"excel");return;}
      var add=event.target.closest&&event.target.closest("#objectiveAddButton");
      if(add&&activeGoals()>=1){guard(event,"goals_unlimited");return;}
    },true);
    document.addEventListener("submit",function(event){
      if(!BILLING.enforce)return;
      var form=event.target;if(!form||!form.classList||!form.classList.contains("sf-invite-form"))return;
      var feature=!can("share")?"share":null;
      // Compteur tenu par friends.js lui-même : un enrobage de loadFriends ratait ses appels internes.
      if(!feature&&state.plan==="plus"){var fs=window.FriendsSystem,count=fs&&typeof fs.friendCount==="function"?fs.friendCount():null;if(typeof count==="number"&&count>=1)feature="share_multi";}
      if(feature){event.preventDefault();event.stopImmediatePropagation();var d=form.closest("dialog");if(d)d.close();openUpgrade(feature);}
    },true);
  }

  window.GFSubscriptions={enabled:false,plans:PLANS,get plan(){return state.plan;},can:can,requires:requires,renderPlans:renderPlans,renderOnboardingOffer:renderOnboardingOffer,startCheckout:startCheckout,openPlans:function(){openSettings("plan");},reload:loadPlan,config:BILLING};

  /* Lien direct depuis la page de présentation (« Passer à Plus / Pro ») : /accueil#abonnement */
  var openPlansOnLoad=window.location.hash==="#abonnement";
  function start(){
    ensurePanel();addEntryPoints();installGuards();refresh();
    if(openPlansOnLoad)setTimeout(function(){openSettings("plan");},0);
    window.addEventListener("authStateChanged",loadPlan);
    window.addEventListener("gf:languagechange",relabel);
    if(account().user)loadPlan();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
