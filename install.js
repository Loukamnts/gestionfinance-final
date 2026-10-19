/* Installer Meuniance sur l'écran d'accueil de l'iPhone : un guide en trois gestes.
   Proposé seulement sur iPhone/iPad quand le site est ouvert dans le navigateur (pas déjà installé) :
   - une carte discrète sur l'accueil (au plus une fois tous les 10 jours, jamais pendant un tutoriel) ;
   - une entrée dans Paramètres ;
   - depuis l'invitation aux rappels (sur iPhone, les rappels demandent l'app installée). */
(function(){
  "use strict";
  var KEY="meuniance.installInvite";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function isIOS(){var ua=navigator.userAgent||"";return /iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
  function standalone(){return window.navigator.standalone===true||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);}
  function eligible(){return isIOS()&&!standalone();}
  function state(){try{var v=JSON.parse(localStorage.getItem(KEY)||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function setState(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
  var ICONS={
    share:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    add:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" stroke-width="1.9"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    done:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v6M9.5 11 12 13.5 14.5 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function syncLock(){if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();}

  /* ── Le guide ─────────────────────────────────── */
  function open(){
    if(byId("gfiGuide"))return;
    hideCard();
    var dlg=el("dialog","gfh-dialog gfi-guide");dlg.id="gfiGuide";dlg.setAttribute("aria-labelledby","gfiTitle");
    var head=el("div","gfi-head"),badge=el("span","gfi-badge");badge.innerHTML=ICONS.phone;
    var h=el("h2","",t2("Installe Meuniance sur ton iPhone","Install Meuniance on your iPhone"));h.id="gfiTitle";
    head.append(badge,h);
    var intro=el("p","gfi-intro",t2("Elle s’ouvrira en plein écran, comme une vraie app, et pourra t’envoyer des rappels.","It will open full screen like a real app, and can send you reminders."));
    var steps=el("ol","gfi-steps");
    [["share",t2("Touche le bouton Partager","Tap the Share button"),t2("Le carré avec une flèche vers le haut, dans la barre de Safari. S’il n’apparaît pas, touche d’abord « ••• ».","The square with an arrow pointing up, in the Safari bar. If you can’t see it, tap “•••” first.")],
     ["add",t2("Choisis « Sur l’écran d’accueil »","Choose “Add to Home Screen”"),t2("Fais défiler la liste vers le bas si besoin.","Scroll down the list if needed.")],
     ["done",t2("Touche « Ajouter »","Tap “Add”"),t2("L’icône Meuniance apparaît sur ton écran d’accueil : ouvre Meuniance depuis là.","The Meuniance icon appears on your Home Screen: open Meuniance from there.")]
    ].forEach(function(s,i){var li=el("li","gfi-step"),ic=el("span","gfi-step-ic");ic.innerHTML=ICONS[s[0]];var n=el("span","gfi-step-n",String(i+1));var tx=el("span","gfi-step-tx");tx.append(el("strong","",s[1]),el("small","",s[2]));li.append(n,ic,tx);steps.append(li);});
    var note=el("p","gfi-note",t2("Ton compte et ton tableur te suivent : connecte-toi dans l’app une fois installée.","Your account and spreadsheet come with you: sign in once the app is installed."));
    var row=el("div","gfh-dialog-actions"),ok=el("button","gfh-btn is-primary",t2("Compris","Got it"));ok.type="button";row.append(ok);
    dlg.append(head,intro,steps,note,row);
    ok.addEventListener("click",function(){dlg.close();});
    dlg.addEventListener("close",function(){dlg.remove();syncLock();});
    document.body.append(dlg);dlg.showModal();syncLock();
    var s=state();s.next=Date.now()+30*864e5;setState(s);
  }

  /* ── Carte discrète sur l'accueil ─────────────── */
  function hideCard(){var c=byId("gfiCard");if(!c)return;c.classList.remove("is-on");setTimeout(function(){c.remove();},250);}
  function busy(){
    if(document.hidden||document.body.dataset.page!=="dashboard"||document.body.classList.contains("tutorial-active"))return true;
    if(byId("gfrInvite")||byId("gfhBudgetAlert")||(window.__gfCoachUntil||0)>Date.now())return true;
    if(window.GFPopup&&window.GFPopup.busy(byId("gfiCard")))return true;
    if([].some.call(document.querySelectorAll("dialog[open],.sheet-modal-overlay,.tutorial-overlay:not(.hidden),.gfd-coach,.meuni-loader"),function(e){return !e.hidden&&e.getClientRects().length>0;}))return true;
    var a=document.activeElement;return !!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName));
  }
  function showCard(){
    if(!eligible()||byId("gfiCard")||busy())return;
    if(Date.now()<(Number(state().next)||0))return;
    var c=el("div","gfr-invite gfi-card");c.id="gfiCard";c.setAttribute("role","status");
    var ic=el("span","gfr-invite-ic");ic.innerHTML=ICONS.phone;
    var tx=el("div","gfr-invite-tx");tx.append(el("strong","",t2("Mets Meuniance sur ton écran d’accueil","Put Meuniance on your Home Screen")),el("span","",t2("Ouverture en plein écran, comme une app, et rappels possibles.","Opens full screen like an app, and reminders become possible.")));
    var later=el("button","gfr-invite-later",t2("Plus tard","Later")),go=el("button","gfr-invite-go",t2("Voir comment","Show me"));later.type=go.type="button";
    later.addEventListener("click",function(){var s=state();s.next=Date.now()+10*864e5;setState(s);hideCard();});
    go.addEventListener("click",open);
    var acts=el("div","gfr-invite-acts");acts.append(later,go);c.append(ic,tx,acts);document.body.append(c);
    requestAnimationFrame(function(){c.classList.add("is-on");});
  }
  function planCard(){
    if(!eligible()||planCard.done)return;planCard.done=true;
    setTimeout(function retry(n){if(busy()&&n<6){setTimeout(function(){retry(n+1);},10000);return;}showCard();},12000,0);
  }
  if(window.MutationObserver)new MutationObserver(function(){if(document.body.dataset.page!=="dashboard")hideCard();}).observe(document.body,{attributes:true,attributeFilter:["data-page"]});

  /* ── Entrée dans Paramètres (seulement là où c'est utile) ── */
  function settingsEntry(){
    var hub=byId("settingsHub");if(!hub)return;
    var item=byId("gfiSettingsItem");
    if(!eligible()){if(item)item.remove();return;}
    if(!item){
      item=el("button","settings-hub-item gfi-hub-item");item.id="gfiSettingsItem";item.type="button";
      item.addEventListener("click",function(e){e.preventDefault();open();});
      var anchor=hub.querySelector('[data-settings-view="notifications"]');
      if(anchor&&anchor.nextSibling)hub.insertBefore(item,anchor.nextSibling);else hub.append(item);
    }
    var sp=el("span");sp.append(el("strong","",t2("Installer sur l’iPhone","Install on iPhone")),el("small","",t2("Comme une app, sur ton écran d’accueil","Like an app, on your Home Screen")));
    item.replaceChildren(sp);
  }
  function start(){settingsEntry();planCard();}
  window.addEventListener("gf:languagechange",settingsEntry);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  window.GFInstall={open:open,eligible:eligible,_card:showCard};
})();
