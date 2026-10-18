/* Rappels de saisie : une notification quand rien n'a été saisi depuis quelques jours.
   Paramètres › Apparence › Rappels. L'abonnement est rattaché au compte (fonctions Supabase dédiées) ;
   l'envoi est fait chaque jour par le serveur. Sur iPhone, il faut d'abord ajouter Meuniance à l'écran d'accueil. */
(function(){
  "use strict";
  var LOCAL="personalFinanceDashboard.reminders";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function account(){return window.__account||{};}
  function client(){var a=account();return a.client||null;}
  function prefs(){try{var p=JSON.parse(window.safeStore.getItem(LOCAL)||"{}");return p&&typeof p==="object"?p:{};}catch(e){return{};}}
  function savePrefs(p){try{window.safeStore.setItem(LOCAL,JSON.stringify(p));}catch(e){}}
  function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
  function standalone(){return navigator.standalone===true||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);}
  function supported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
  function b64uToBytes(s){var p=s.replace(/-/g,"+").replace(/_/g,"/");p+="===".slice((p.length+3)%4);var raw=atob(p),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  function registration(){return navigator.serviceWorker.register("/sw.js",{scope:"/"}).then(function(){return navigator.serviceWorker.ready;});}
  function currentSub(){if(!supported())return Promise.resolve(null);return navigator.serviceWorker.getRegistration("/").then(function(r){return r?r.pushManager.getSubscription():null;}).catch(function(){return null;});}
  function errorText(e){var m=String(e&&e.message||e||"");if(/too_many_devices/.test(m))return t2("Déjà 5 appareils reçoivent tes rappels. Désactive-les sur un autre appareil d’abord.","5 devices already get your reminders. Turn them off on another device first.");if(/denied|permission/i.test(m))return t2("Notifications refusées. Autorise-les dans les réglages de ton appareil, puis réessaie.","Notifications blocked. Allow them in your device settings, then try again.");return t2("Impossible d’activer les rappels pour le moment. Réessaie plus tard.","Could not turn reminders on right now. Try again later.");}

  async function enable(days){
    var sb=client();if(!sb||!account().user)throw new Error("not_authenticated");
    var perm=await Notification.requestPermission();if(perm!=="granted")throw new Error("permission denied");
    var reg=await registration();
    var key=await sb.rpc("reminder_public_key");if(key.error||!key.data)throw new Error("no_key");
    var sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await Promise.race([reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToBytes(key.data)}),new Promise(function(_,reject){setTimeout(function(){reject(new Error("timeout"));},20000);})]);
    var json=sub.toJSON();
    var res=await sb.rpc("save_reminder_subscription",{p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,p_every_days:days});
    if(res.error)throw new Error(res.error.message||"save");
    savePrefs({on:true,days:days});
  }
  async function disable(){
    var sub=await currentSub(),sb=client();
    if(sub){var endpoint=sub.endpoint;try{await sub.unsubscribe();}catch(e){}if(sb)try{await sb.rpc("remove_reminder_subscription",{p_endpoint:endpoint});}catch(e){}}
    var p=prefs();p.on=false;savePrefs(p);
  }

  var busy=false;
  async function render(){
    var panel=document.querySelector('[data-settings-panel="notifications"]');if(!panel)return;
    var box=byId("gfrReminders");
    if(!box){box=el("section","gfh-set gfr-set");box.id="gfrReminders";box.setAttribute("aria-labelledby","gfrTitle");panel.append(box);}
    var h=el("h4","",t2("Rappels","Reminders"));h.id="gfrTitle";
    var intro=el("p","",t2("Une notification si tu n’as rien saisi depuis quelques jours. Elle ne contient aucun montant.","A notification if you haven’t entered anything for a few days. It never shows any amount."));
    var p=prefs(),sub=await currentSub(),on=!!(p.on&&sub),days=[3,7,14,30].indexOf(Number(p.days))>=0?Number(p.days):7;
    var row=el("div","gfh-set-row"),txt=el("div");txt.append(el("strong","",t2("Rappel de saisie","Entry reminder")));
    var hint=el("small","");txt.append(hint);
    var sw=el("button","gfh-switch");sw.type="button";sw.setAttribute("role","switch");sw.setAttribute("aria-checked",String(on));sw.setAttribute("aria-label",t2("Rappel de saisie","Entry reminder"));sw.append(el("span"));
    row.append(txt,sw);
    var freq=el("div","gfh-set-row gfr-freq"),fl=el("label","gfr-label"),sel=document.createElement("select");sel.id="gfrDays";
    fl.htmlFor="gfrDays";fl.append(el("strong","",t2("Me prévenir après","Remind me after")),el("small","",t2("sans aucune saisie","with no entry")));
    [[3,t2("3 jours","3 days")],[7,t2("1 semaine","1 week")],[14,t2("2 semaines","2 weeks")],[30,t2("1 mois","1 month")]].forEach(function(o){var op=new Option(o[1],String(o[0]));op.selected=o[0]===days;sel.append(op);});
    freq.append(fl,sel);freq.hidden=!on;
    var acts=el("div","gfr-acts"),test=el("button","gfh-link",t2("Essayer une notification","Try a notification"));test.type="button";acts.append(test);acts.hidden=!on;
    var msg=el("p","gfr-msg");msg.setAttribute("role","status");
    var blocked="";
    if(!account().user)blocked=t2("Connecte-toi pour recevoir des rappels : ils sont liés à ton compte.","Sign in to get reminders: they are linked to your account.");
    else if(!supported())blocked=isIOS()&&!standalone()?t2("Sur iPhone, ajoute d’abord Meuniance à l’écran d’accueil (Partager › « Sur l’écran d’accueil »), puis ouvre-la depuis son icône pour activer les rappels.","On iPhone, first add Meuniance to your Home Screen (Share › “Add to Home Screen”), then open it from its icon to turn reminders on."):t2("Ce navigateur ne permet pas les notifications.","This browser does not support notifications.");
    else if(Notification.permission==="denied"&&!on)blocked=t2("Les notifications sont bloquées pour Meuniance. Autorise-les dans les réglages de ton appareil.","Notifications are blocked for Meuniance. Allow them in your device settings.");
    hint.textContent=blocked||(on?t2("Activé sur cet appareil.","On for this device."):t2("Désactivé.","Off."));
    if(blocked){sw.disabled=true;sw.setAttribute("aria-checked","false");freq.hidden=true;acts.hidden=true;}
    // Sur iPhone dans Safari : le guide d'installation, directement depuis ce message.
    var how=null;if(blocked&&account().user&&isIOS()&&!standalone()&&window.GFInstall){how=el("button","gfh-link gfr-how",t2("Voir comment faire","Show me how"));how.type="button";how.addEventListener("click",function(){window.GFInstall.open();});}
    sw.addEventListener("click",async function(){
      if(busy)return;busy=true;sw.disabled=true;msg.textContent="";
      try{if(sw.getAttribute("aria-checked")==="true")await disable();else await enable(Number(sel.value)||7);}
      catch(e){msg.textContent=errorText(e);}
      busy=false;render();
    });
    sel.addEventListener("change",async function(){if(busy)return;busy=true;msg.textContent="";try{await enable(Number(sel.value));msg.textContent=t2("C’est noté.","Saved.");}catch(e){msg.textContent=errorText(e);}busy=false;});
    test.addEventListener("click",async function(){try{var reg=await registration();await reg.showNotification("Meuniance",{body:t2("Les rappels sont bien activés.","Reminders are on."),icon:"/app-icon-180.png",tag:"meuniance-test"});}catch(e){msg.textContent=errorText(e);}});
    box.replaceChildren.apply(box,[h,intro,row].concat(how?[how]:[],[freq,acts,msg]));    budgetSetting(panel);
  }
  /* Alertes de plafond (calculées sur l'appareil) : un interrupteur, activé par défaut. */
  function budgetSetting(panel){
    var box=byId("gfrBudget");
    if(!box){box=el("section","gfh-set gfr-set");box.id="gfrBudget";box.setAttribute("aria-labelledby","gfrBudgetTitle");panel.append(box);}
    var H=window.GFHome,on=!H||H.alertsOn();
    var h=el("h4","",t2("Alertes de plafond","Limit alerts"));h.id="gfrBudgetTitle";
    var row=el("div","gfh-set-row"),txt=el("div");txt.append(el("strong","",t2("Prévenir à 80 % et à 100 %","Warn at 80% and 100%")),el("small","",t2("Quand une ligne du mois approche puis atteint son plafond. Une seule fois par seuil et par mois.","When a row of the month nears then reaches its limit. Once per threshold and per month.")));
    var sw=el("button","gfh-switch");sw.type="button";sw.setAttribute("role","switch");sw.setAttribute("aria-checked",String(on));sw.setAttribute("aria-label",t2("Alertes de plafond","Limit alerts"));sw.append(el("span"));
    sw.addEventListener("click",function(){var next=sw.getAttribute("aria-checked")!=="true";sw.setAttribute("aria-checked",String(next));if(H)H.setAlertsOn(next);});
    row.append(txt,sw);
    var hint=el("p","gfr-msg",t2("Les plafonds se fixent sur l’accueil, en touchant une ligne de « Où part ton argent ».","Limits are set on Home by tapping a row in “Where your money goes”."));
    box.replaceChildren(h,row,hint);
  }
  function schedule(){clearTimeout(schedule.t);schedule.t=setTimeout(function(){render().catch(function(){});},150);}
  window.addEventListener("authStateChanged",schedule);
  window.addEventListener("gf:languagechange",schedule);
  document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-settings-view="notifications"]'))schedule();});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();
  /* Invitation discrète : à un moment pris au hasard, sur l'accueil seulement (jamais pendant une saisie
     dans le tableur), une petite carte propose d'activer les rappels. « Plus tard » la fait revenir dans
     1 à 2 semaines ; une fois les rappels activés, elle ne revient plus. */
  var INVITE="personalFinanceDashboard.reminderInvite";
  function inviteState(){try{var v=JSON.parse(window.safeStore.getItem(INVITE)||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function setInviteState(v){try{window.safeStore.setItem(INVITE,JSON.stringify(v));}catch(e){}}
  function openReminderSettings(){
    if(window.setPage)window.setPage("settings");
    setTimeout(function(){var hub=document.querySelector('[data-settings-view="notifications"]');if(hub)hub.click();
      setTimeout(function(){var box=byId("gfrReminders");if(box){box.scrollIntoView({behavior:"smooth",block:"center"});box.classList.remove("is-flash");void box.offsetWidth;box.classList.add("is-flash");}},450);},120);
  }
  function hideInvite(){var c=byId("gfrInvite");if(!c)return;c.classList.remove("is-on");setTimeout(function(){c.remove();},250);}
  async function inviteEligible(){
    if(!account().user||document.hidden||document.body.dataset.page!=="dashboard")return false;
    // Rien d'ouvert à l'écran (fenêtre, tutoriel, repère, chargement) : on ne dérange pas.
    if([].some.call(document.querySelectorAll("dialog[open],.sheet-modal-overlay,.tutorial-overlay,.gfd-coach,.meuni-loader"),function(e){return !e.hidden&&e.getClientRects().length>0;}))return false;
    var a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return false;
    if(!supported()&&!(isIOS()&&!standalone()))return false;
    if("Notification" in window&&Notification.permission==="denied")return false;
    var p=prefs();if(p.on&&await currentSub())return false;
    return Date.now()>=(Number(inviteState().next)||0);
  }
  async function showInvite(){
    if(byId("gfrInvite")||!(await inviteEligible()))return;
    var ios=!supported();
    var c=el("div","gfr-invite");c.id="gfrInvite";c.setAttribute("role","status");
    var ic=el("span","gfr-invite-ic");ic.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    var tx=el("div","gfr-invite-tx");tx.append(el("strong","",t2("Active les rappels","Turn on reminders")),el("span","",ios?t2("Ajoute Meuniance à ton écran d’accueil pour être prévenu si tu oublies de noter tes dépenses.","Add Meuniance to your Home Screen to be reminded when you forget to log expenses."):t2("Une notification si tu oublies de noter tes dépenses.","A notification if you forget to log your expenses.")));
    var later=el("button","gfr-invite-later",t2("Plus tard","Later")),go=el("button","gfr-invite-go",ios?t2("Voir comment","Show me"):t2("Activer","Turn on"));later.type=go.type="button";
    later.addEventListener("click",function(){setInviteState({next:Date.now()+(7+Math.random()*7)*864e5});hideInvite();});
    go.addEventListener("click",function(){setInviteState({next:Date.now()+3*864e5});hideInvite();if(ios&&window.GFInstall)window.GFInstall.open();else openReminderSettings();});
    var acts=el("div","gfr-invite-acts");acts.append(later,go);c.append(ic,tx,acts);document.body.append(c);
    requestAnimationFrame(function(){c.classList.add("is-on");});
  }
  // Une chance sur trois par visite, après 20 à 90 secondes passées sur l'accueil.
  function planInvite(){
    if(planInvite.done||Math.random()>0.34)return;planInvite.done=true;
    setTimeout(function tryShow(){showInvite().catch(function(){});},(20+Math.random()*70)*1000);
  }
  if(window.MutationObserver)new MutationObserver(function(){if(document.body.dataset.page!=="dashboard")hideInvite();}).observe(document.body,{attributes:true,attributeFilter:["data-page"]});
  window.addEventListener("authStateChanged",function(e){if(e.detail&&e.detail.user)planInvite();});
  // Service worker enregistré à chaque ouverture : il permet aussi d'ouvrir Meuniance sans connexion.
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){
    window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){});});
  }
  window.GFReminders={render:schedule,_invite:showInvite};
})();
