/* Notifications sur le téléphone : rappel de saisie, plafonds, amis et dépenses partagées, bilans, objectifs.
   Paramètres › Notifications. L'abonnement est rattaché au compte (fonctions Supabase dédiées) ;
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
  function errorText(e){var m=String(e&&e.message||e||"");if(/too_many_devices/.test(m))return t2("Déjà 5 appareils reçoivent tes notifications. Désactive-les sur un autre appareil d’abord.","5 devices already get your reminders. Turn them off on another device first.");if(/denied|permission/i.test(m))return t2("Notifications refusées. Autorise-les dans les réglages de ton appareil, puis réessaie.","Notifications blocked. Allow them in your device settings, then try again.");return t2("Impossible d’activer les rappels pour le moment. Réessaie plus tard.","Could not turn reminders on right now. Try again later.");}

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

  /* Préférences du compte (serveur) : quels types de notifications recevoir sur ses appareils. */
  var KINDS=[
    ["reminder",["Rappel de saisie","Entry reminder"],["Si tu n’as rien noté depuis un moment.","If you haven’t logged anything for a while."]],
    ["budget",["Plafonds à 80\u00a0% et 100\u00a0%","Limits at 80% and 100%"],["Quand une ligne approche ou atteint son plafond.","When a row nears or reaches its limit."]],
    ["friends",["Amis et dépenses partagées","Friends and shared expenses"],["Demande d’ami, dépense partagée, remboursement.","Friend request, shared expense, payback."]],
    ["recaps",["Bilans prêts","Recaps ready"],["Chaque 1er du mois, et l’année en décembre.","Every 1st of the month, and the year in December."]],
    ["goals",["Objectifs et dépenses fixes","Goals and fixed expenses"],["Objectif atteint, et tes fixes à noter le 25.","Goal reached, and fixed expenses on the 25th."]]
  ];
  var server={data:null,user:""};
  async function loadSettings(force){
    var sb=client(),u=account().user;if(!sb||!u)return null;
    if(!force&&server.data&&server.user===u.id)return server.data;
    try{var r=await sb.rpc("get_notification_settings");if(r.error)throw r.error;server={data:r.data||{},user:u.id};}catch(e){server={data:null,user:""};}
    return server.data;
  }
  async function saveSetting(patch){
    var sb=client();if(!sb||!account().user)throw new Error("not_authenticated");
    patch.lang=en()?"en":"fr";
    var r=await sb.rpc("set_notification_settings",{p:patch});if(r.error)throw r.error;server={data:r.data||{},user:account().user.id};return server.data;
  }
  function switchBtn(label,on){var sw=el("button","gfh-switch");sw.type="button";sw.setAttribute("role","switch");sw.setAttribute("aria-checked",String(!!on));sw.setAttribute("aria-label",label);sw.append(el("span"));return sw;}

  var ICONS={
    bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    reminder:'<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14 8 3 3" stroke="currentColor" stroke-width="1.8"/>',
    budget:'<path d="M4 16a8 8 0 1 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m12 16 4-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="16" r="1.4" fill="currentColor"/>',
    friends:'<circle cx="9" cy="8.5" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.2A5 5 0 0 1 20.5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    recaps:'<rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 14.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    goals:'<path d="M6 21V4M6 4h10l-2 3.5L16 11H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    send:'<path d="M20 4 9.5 14.5M20 4l-6.5 16-4-7.5L2 8.5 20 4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    info:'<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/>'
  };
  function icon(name,cls){var s=el("span",cls||"gfr-ic");s.setAttribute("aria-hidden","true");s.innerHTML='<svg viewBox="0 0 24 24" fill="none">'+ICONS[name]+'</svg>';return s;}

  var busy=false,kindsOpen=false;
  async function render(){
    var panel=document.querySelector('[data-settings-panel="notifications"]');if(!panel)return;
    var old=byId("gfrBudget");if(old)old.remove();
    var box=byId("gfrReminders");
    if(!box){box=el("section","gfh-set gfr-set");box.id="gfrReminders";box.setAttribute("aria-labelledby","gfrTitle");panel.append(box);}
    // Premier affichage : l'en-tête du panneau est déjà là, seul ce bloc attend l'appareil et le compte.
    if(!box.childElementCount&&window.MeuniLoader&&window.MeuniLoader.inline)box.append(window.MeuniLoader.inline(t2("Chargement de tes notifications…","Loading your notifications…"),{height:180}));
    var p=prefs(),sub=await currentSub(),on=!!(p.on&&sub),days=[3,7,14,30].indexOf(Number(p.days))>=0?Number(p.days):7;
    var msg=el("p","gfr-msg");msg.setAttribute("role","status");
    var blocked="";
    if(!account().user)blocked=t2("Connecte-toi pour recevoir des notifications : elles sont liées à ton compte.","Sign in to get notifications: they are linked to your account.");
    else if(!supported())blocked=isIOS()&&!standalone()?t2("Sur iPhone, ajoute d’abord Meuniance à l’écran d’accueil, puis ouvre-la depuis son icône.","On iPhone, first add Meuniance to your Home Screen, then open it from its icon."):t2("Ce navigateur ne permet pas les notifications.","This browser does not support notifications.");
    else if(Notification.permission==="denied"&&!on)blocked=t2("Les notifications sont bloquées pour Meuniance. Autorise-les dans les réglages de ton appareil.","Notifications are blocked for Meuniance. Allow them in your device settings.");
    var active=on&&!blocked;

    // En-tête : cet appareil, avec son état
    var hero=el("div","gfr-hero"+(active?" is-on":"")),heroTx=el("div","gfr-hero-tx");
    var h=el("h4","",t2("Sur cet appareil","On this device"));h.id="gfrTitle";
    var state=el("span","gfr-state",blocked?t2("Indisponibles ici","Not available here"):active?t2("Notifications activées","Notifications on"):t2("Notifications désactivées","Notifications off"));
    heroTx.append(h,state);
    var master=switchBtn(t2("Recevoir les notifications sur cet appareil","Get notifications on this device"),active);if(blocked)master.disabled=true;
    hero.append(icon("bell","gfr-hero-ic"),heroTx,master);
    var parts=[hero];
    if(blocked){var lead=el("p","gfr-lead is-warn",blocked);parts.push(lead);}
    if(blocked&&account().user&&isIOS()&&!standalone()&&window.GFInstall){var how=el("button","gfr-btn",t2("Voir comment l’installer","Show me how to install it"));how.type="button";how.addEventListener("click",function(){window.GFInstall.open();});parts.push(how);}
    master.addEventListener("click",async function(){
      if(busy)return;busy=true;master.disabled=true;msg.textContent="";
      try{if(master.getAttribute("aria-checked")==="true")await disable();else{await enable(days);try{await saveSetting({});}catch(e){}}}
      catch(e){msg.textContent=errorText(e);}
      busy=false;render();
    });

    if(active){
      var st=await loadSettings(false)||{};
      var list=el("div","gfr-kinds");list.setAttribute("role","group");list.setAttribute("aria-label",t2("Types de notifications","Notification types"));
      KINDS.forEach(function(k){
        var item=el("div","gfr-kind is-"+k[0]),r=el("div","gfr-kind-row"),c=el("div","gfr-kind-tx");
        c.append(el("strong","",t2(k[1][0],k[1][1])),el("small","",t2(k[2][0],k[2][1])));
        var sw=switchBtn(t2(k[1][0],k[1][1]),st[k[0]]!==false);
        r.append(icon(k[0]),c,sw);item.append(r);list.append(item);
        var chips=null;
        if(k[0]==="reminder"){
          chips=el("div","gfr-chips");chips.setAttribute("role","radiogroup");chips.setAttribute("aria-label",t2("Me prévenir après","Remind me after"));
          var cap=el("span","gfr-chips-cap",t2("Si rien n’est noté depuis","If nothing is logged for"));
          var row2=el("div","gfr-chip-row");
          [[3,t2("3 jours","3 days")],[7,t2("7 jours","7 days")],[14,t2("14 jours","14 days")],[30,t2("1 mois","1 month")]].forEach(function(o){
            var b=el("button","gfr-chip",o[1]);b.type="button";b.setAttribute("role","radio");b.setAttribute("aria-checked",String(o[0]===days));
            b.addEventListener("click",async function(){if(busy||b.getAttribute("aria-checked")==="true")return;busy=true;msg.textContent="";
              [].forEach.call(row2.children,function(x){x.setAttribute("aria-checked",String(x===b));});
              try{await enable(o[0]);days=o[0];}catch(e){msg.textContent=errorText(e);}busy=false;});
            row2.append(b);
          });
          chips.append(cap,row2);chips.hidden=st.reminder===false;item.append(chips);
        }
        sw.addEventListener("click",async function(){
          var next=sw.getAttribute("aria-checked")!=="true";sw.setAttribute("aria-checked",String(next));msg.textContent="";
          if(chips)chips.hidden=!next;
          try{var patch={};patch[k[0]]=next;await saveSetting(patch);}catch(e){sw.setAttribute("aria-checked",String(!next));if(chips)chips.hidden=next;msg.textContent=t2("Impossible d’enregistrer. Réessaie.","Could not save. Try again.");}
        });
      });
      var test=el("button","gfr-btn");test.type="button";test.append(icon("send","gfr-btn-ic"),document.createTextNode(t2("Envoyer une notification d’essai","Send a test notification")));
      test.addEventListener("click",async function(){try{var reg=await registration();await reg.showNotification("Meuniance",{body:t2("Les notifications sont bien activées.","Notifications are on."),icon:"/app-icon-180.png",tag:"meuniance-test"});msg.textContent=t2("Envoyée : regarde en haut de ton écran.","Sent: look at the top of your screen.");}catch(e){msg.textContent=errorText(e);}});
      // Repliable, comme « Accueil » dans Apparence : une flèche développe le choix des notifications.
      var count=function(){return [].filter.call(list.querySelectorAll(".gfr-kind-row .gfh-switch"),function(x){return x.getAttribute("aria-checked")==="true";}).length;};
      var card=el("div","gfr-card"),tog=el("button","gfh-set-toggle gfr-toggle");tog.type="button";tog.setAttribute("aria-expanded",String(kindsOpen));tog.setAttribute("aria-controls","gfrKinds");
      var tt=el("span","gfh-set-toggle-text"),sum=el("small","");
      var setSum=function(){var n=count();sum.textContent=n===KINDS.length?t2("Toutes activées","All on"):n===0?t2("Aucune activée","None on"):t2(n+" activées sur "+KINDS.length,n+" of "+KINDS.length+" on");};
      setSum();tt.append(el("strong","",t2("Choisir les notifications","Choose notifications")),sum);
      var chev=el("span","gfh-set-chev");chev.setAttribute("aria-hidden","true");chev.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      tog.append(tt,chev);
      var body=el("div","gfr-card-body");body.id="gfrKinds";body.hidden=!kindsOpen;body.append(list,test);
      tog.addEventListener("click",function(){kindsOpen=!kindsOpen;tog.setAttribute("aria-expanded",String(kindsOpen));body.hidden=!kindsOpen;});
      list.addEventListener("click",function(e){if(e.target.closest&&e.target.closest(".gfh-switch"))setTimeout(setSum,0);});
      card.append(tog,body);
      parts.push(card);
    }
    var note=el("p","gfr-note");note.append(icon("info","gfr-note-ic"),document.createTextNode(t2("Les plafonds se fixent sur l’accueil, en touchant une ligne de « Où part ton argent ».","Limits are set on Home by tapping a row in “Where your money goes”.")));
    parts.push(msg,note);
    box.replaceChildren.apply(box,parts);
    if(window.GFNotify)window.GFNotify.refresh();// l'invitation aux rappels dépend de cet état
  }
  // Notification envoyée à tous mes appareils (plafond, objectif). Renvoie false si rien n'a été mis en file.
  async function notifyMe(kind,tag,title,body,url){
    var sb=client();if(!sb||!account().user)return false;
    try{var r=await sb.rpc("notify_me",{p_kind:kind,p_tag:String(tag).slice(0,80),p_title:String(title).slice(0,80),p_body:String(body).slice(0,180),p_url:url||"/accueil"});return !r.error&&r.data===true;}catch(e){return false;}
  }
  async function pushReady(){if(!account().user||!supported())return false;var p=prefs();return !!(p.on&&await currentSub());}
  function schedule(){clearTimeout(schedule.t);schedule.t=setTimeout(function(){render().catch(function(){});},150);}
  window.addEventListener("authStateChanged",schedule);
  window.addEventListener("gf:languagechange",function(){schedule();if(account().user&&prefs().on)saveSetting({}).catch(function(){});});
  document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-settings-view="notifications"]'))schedule();});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();
  /* Invitation aux rappels : un message du site (notifications.js), tant que les rappels ne sont pas activés
     et que cet appareil peut les recevoir. Fermé, il ne revient pas. */
  function openReminderSettings(){
    if(window.setPage)window.setPage("settings");
    setTimeout(function(){var hub=document.querySelector('[data-settings-view="notifications"]');if(hub)hub.click();
      setTimeout(function(){var box=byId("gfrReminders");if(box){box.scrollIntoView({behavior:"smooth",block:"center"});box.classList.remove("is-flash");void box.offsetWidth;box.classList.add("is-flash");}},450);},120);
  }
  async function inviteMessages(){
    // Sur iPhone dans Safari, c'est le message « écran d'accueil » (install.js) qui explique la marche à suivre.
    if(!account().user||!supported()||("Notification" in window&&Notification.permission==="denied"))return[];
    if(prefs().on&&await currentSub())return[];
    return[{id:"reminders-invite",kind:"reminders",priority:50,tone:"info",once:true,
      title:t2("Active les rappels","Turn on reminders"),
      body:t2("Une notification si tu oublies de noter tes dépenses.","A notification if you forget to log your expenses."),
      action:{label:t2("Activer","Turn on"),run:openReminderSettings}}];
  }
  if(window.GFNotify)window.GFNotify.register("reminders",inviteMessages);
  // Service worker enregistré à chaque ouverture : il permet aussi d'ouvrir Meuniance sans connexion.
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){
    window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){});});
  }
  // Déconnexion : cet appareil arrête de recevoir les notifications du compte (la personne suivante ne les verra pas).
  function forgetDevice(){return Promise.race([disable().catch(function(){}),new Promise(function(r){setTimeout(r,3000);})]);}
  window.GFReminders={render:schedule,notifyMe:notifyMe,pushReady:pushReady,forgetDevice:forgetDevice};
})();
