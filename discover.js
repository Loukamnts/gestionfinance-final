/* Nouveautés : chaque nouveauté est un message du site (notifications.js) avec son bouton « Essayer » qui ouvre
   directement la fonction ; l'anneau du logo se remplit à chaque nouveauté essayée.
   Pour une version sans parcours défini, un seul message annonce la dernière nouveauté. */
(function(){
  "use strict";
  var KEY="personalFinanceDashboard.discover";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function store(){return window.safeStore||null;}

  /* Parcours de découverte par version (identifiant = RELEASE_NOTES_VERSION) */
  var TOURS={
    "2026-10-19-ensemble":[
      {id:"year",title:["Ton bilan de l’année","Your year in review"],text:["Ton année en quelques écrans, avec tes propres chiffres.","Your year in a few screens, with your own numbers."],run:function(){goHome(function(){if(window.GFYear)window.GFYear.open(new Date().getFullYear());});}},
      {id:"split",title:["Partage une dépense entre amis","Split an expense with friends"],text:["Qui a payé, qui doit combien : les comptes se font tout seuls.","Who paid, who owes what: the maths is done for you."],run:function(){openPage("sharing",function(){return document.querySelector(".sfx-overview .sf-button")||document.querySelector("#sharingPage .sf-toolbar-actions .sf-primary")||document.querySelector("#sharingPage .sf-empty-onboarding .sf-primary");},["Note une dépense partagée : chacun voit ce qu’il doit, et tu marques quand c’est remboursé.","Log a shared expense: everyone sees what they owe, and you mark it when it’s paid back."]);}},
      {id:"alerts",title:["Prévenu avant le plafond","Warned before your limit"],text:["Une alerte à 80 % puis à 100 % du plafond d’une ligne.","An alert at 80% then 100% of a row’s limit."],run:function(){openPage("settings",budgetTarget,["Les alertes de plafond se règlent ici. Fixe un plafond en touchant une ligne de « Où part ton argent » sur l’accueil.","Limit alerts are set here. Set a limit by tapping a row in “Where your money goes” on Home."],function(){var h=document.querySelector('[data-settings-view="notifications"]');if(h)h.click();});}},
      {id:"subs",title:["Tes abonnements, repérés","Your subscriptions, spotted"],text:["Importe un relevé : les prélèvements réguliers sont listés sur l’accueil.","Import a statement: recurring payments are listed on Home."],run:function(){if(byId("gfsPanel")){goHome(function(){var n=byId("gfsPanel");if(n){n.scrollIntoView({block:"center"});setTimeout(function(){coach(n,t2("Tes abonnements et leur coût sur un an. Touche « Tout voir et gérer » pour en retirer un.","Your subscriptions and their yearly cost. Tap “See and manage all” to remove one."));},350);}});return;}openPage("sheet",function(){return byId("btnSheetImport");},["Importe le relevé CSV de ta banque : les abonnements repérés apparaîtront sur l’accueil.","Import your bank’s CSV statement: the subscriptions found will show on Home."]);}}
    ],
    "2026-10-15-bilan":[
      {id:"discreet",title:["Montre ton écran sans tes chiffres","Show your screen, not your figures"],text:["L’œil à côté du solde floute tous tes montants.","The eye next to the balance blurs all your amounts."],run:function(){openPage("dashboard",function(){return document.querySelector("#gfhHome .gfh-eye");},["Touche l’œil pour flouter tes montants, et touche-le à nouveau pour les revoir.","Tap the eye to blur your amounts, and tap it again to see them."]);}},
      {id:"bank",title:["Importe ton relevé bancaire","Import your bank statement"],text:["Le fichier CSV de ta banque, rangé par catégorie et par mois.","Your bank’s CSV file, sorted by category and month."],run:function(){openPage("sheet",function(){return byId("btnSheetImport");},["Choisis ici le relevé CSV téléchargé depuis ta banque : tu vois un aperçu avant l’import.","Pick the CSV statement downloaded from your bank here: you get a preview before importing."]);}},
      {id:"reminders",title:["Active les rappels","Turn on reminders"],text:["Une notification si tu oublies de noter tes dépenses.","A notification if you forget to log your expenses."],run:function(){openPage("settings",function(){return byId("gfrReminders");},["Active le rappel et choisis après combien de jours sans saisie tu veux être prévenu.","Turn the reminder on and choose after how many days without entries you want a nudge."],function(){var h=document.querySelector('[data-settings-view="notifications"]');if(h)h.click();});}}
    ],
    "2026-10-13-le-moulin":[
      {id:"quickadd",title:["Ajoute en un geste","Add in one tap"],text:["Une dépense, un revenu ou de l’épargne, sans ouvrir le tableur.","An expense, income or savings, without opening the spreadsheet."],run:function(){goHome(function(){var b=document.querySelector("#gfhHome .gfh-add");if(b)b.click();});}},
      {id:"years",title:["Une feuille par année","One sheet per year"],text:["Ton tableur se range par année : ajoute la précédente ou la suivante en un clic.","Your spreadsheet is organised by year: add the previous or next one in one click."],run:function(){openPage("sheet",function(){var adds=document.querySelectorAll("#sheetPage .sheet-years .sheet-year-add");return adds[adds.length-1];},["Touche ici pour ajouter l’année suivante. Le « + » de gauche ajoute la précédente.","Tap here to add the next year. The “+” on the left adds the previous one."]);}},
      {id:"goalmonth",title:["Un objectif lié à un mois","A goal linked to a month"],text:["Ton objectif suit une ligne du tableur, pour un mois précis ou toute l’année.","Your goal follows a spreadsheet row, for one month or the whole year."],run:function(){openPage("objectives",function(){return document.querySelector("#gfoLink .gfo-row")||byId("gfoLink");},["Choisis la ligne du tableur et le mois à suivre : l’objectif se mettra à jour tout seul.","Pick the spreadsheet row and month to follow: the goal updates on its own."],function(){var form=byId("objectiveForm"),add=byId("objectiveAddButton");if(add&&(!form||form.hidden||!form.getClientRects().length))add.click();});}}
    ]
  };

  function release(){var r=window.GFReleaseNotes;return r&&r.notes&&r.notes[0]?r:null;}
  function read(){try{var v=JSON.parse((store()&&store().getItem(KEY))||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function write(v){try{store()&&store().setItem(KEY,JSON.stringify(v));}catch(e){}}
  function state(){var r=release(),s=read();if(!r)return null;if(s.v!==r.version)s={v:r.version,tried:[]};if(!Array.isArray(s.tried))s.tried=[];return s;}
  function markSeen(){var r=release();try{if(r&&store()&&store().getItem("personalFinanceDashboard.lastSeenRelease")!==r.version)store().setItem("personalFinanceDashboard.lastSeenRelease",r.version);}catch(e){}}

  // Les alertes de plafond se règlent dans Paramètres › Notifications › « Messages dans le site ».
  function budgetTarget(){return byId("gfnSettings");}
  function goHome(after){if(typeof window.setPage==="function")window.setPage("dashboard");setTimeout(after,120);}
  function openPage(page,find,caption,before){
    if(typeof window.setPage==="function")window.setPage(page);
    setTimeout(function(){try{before&&before();}catch(e){}
      // Pas de clavier pendant la découverte : on veut montrer la fonction, pas saisir
      var f=document.activeElement;if(f&&/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))f.blur();
      setTimeout(function(){coach(find(),caption[en()?1:0]);},450);},120);
  }
  function bottomBar(){var n=document.querySelector(".bottom-nav");if(!n||!n.getClientRects().length)return 0;var r=n.getBoundingClientRect();return r.top<window.innerHeight?window.innerHeight-r.top:0;}
  /* Repère : l'écran s'assombrit sauf l'élément visé, entouré d'un anneau, avec une bulle d'explication. */
  var coachEl=null;
  var coachPad=null;
  function closeCoach(){if(coachEl&&!coachEl._multiNext)window.__gfCoachUntil=0;if(coachPad!==null){document.body.style.paddingBottom=coachPad;coachPad=null;}if(!coachEl)return;coachEl.remove();coachEl=null;window.removeEventListener("scroll",placeCoach,true);window.removeEventListener("resize",placeCoach);document.removeEventListener("keydown",coachKey);}
  function coachKey(e){if(e.key==="Escape")closeCoach();}
  function placeCoach(){
    if(!coachEl)return;var node=coachEl._node;
    // L'accueil peut se redessiner pendant le repère : on retrouve l'élément par son identifiant.
    if(node&&!node.isConnected&&node.id){var again=document.getElementById(node.id);if(again)node=coachEl._node=again;}
    if(!node||!node.isConnected||!node.getClientRects().length){closeCoach();return;}
    var r=node.getBoundingClientRect(),pad=6,hole=coachEl.querySelector(".gfd-coach-hole"),tip=coachEl.querySelector(".gfd-coach-tip");
    hole.style.left=(r.left-pad)+"px";hole.style.top=(r.top-pad)+"px";hole.style.width=(r.width+pad*2)+"px";hole.style.height=(r.height+pad*2)+"px";
    var vw=document.documentElement.clientWidth,tw=Math.min(320,vw-32),below=r.bottom+pad+12,room=window.innerHeight-bottomBar()-below;
    tip.style.width=tw+"px";tip.style.left=Math.max(16,Math.min(vw-tw-16,r.left+r.width/2-tw/2))+"px";
    var th=tip.offsetHeight;tip.classList.toggle("is-above",room<th+8);
    tip.style.top=(room<th+8?Math.max(12,r.top-pad-12-th):below)+"px";
  }
  /* opts (facultatif) : {step, total, last, onNext} pour enchaîner plusieurs repères (« Suivant », 1/3…). */
  function coach(node,text,opts){
    closeCoach();
    // Élément absent ou caché : on passe sans bloquer (étape suivante s’il y en a une).
    if(!node||!node.isConnected||!node.getClientRects().length){if(opts&&!opts.last&&opts.onNext)setTimeout(opts.onNext,60);return;}
    // Place l'élément au centre de la zone visible, au-dessus de la barre de navigation du bas
    var r=node.getBoundingClientRect(),visible=window.innerHeight-bottomBar(),y=window.scrollY+r.top-Math.max(16,(visible-r.height)/2);
    // En bas de page, on ajoute un peu d'espace le temps du repère pour pouvoir centrer l'élément
    var max=document.documentElement.scrollHeight-window.innerHeight;
    if(y>max){coachPad=document.body.style.paddingBottom;document.body.style.paddingBottom=(parseFloat(getComputedStyle(document.body).paddingBottom)||0)+(y-max)+"px";}
    var smooth=!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    try{window.scrollTo({top:Math.max(0,y),behavior:smooth?"smooth":"auto"});}catch(e){window.scrollTo(0,Math.max(0,y));}
    setTimeout(function(){
      coachEl=el("div","gfd-coach");coachEl._node=node;coachEl.setAttribute("role","dialog");coachEl.setAttribute("aria-label",t2("Nouveauté","New feature"));
      var multi=opts&&opts.total>1,label=multi&&!opts.last?t2("Suivant","Next"):t2("Compris","Got it");
      var hole=el("div","gfd-coach-hole"),tip=el("div","gfd-coach-tip"),ok=el("button","gfd-coach-ok",label);ok.type="button";
      if(multi)tip.append(el("span","gfd-coach-step",opts.step+" / "+opts.total));
      tip.append(el("p","",text),ok);coachEl.append(hole,tip);document.body.append(coachEl);
      coachEl.addEventListener("click",function(e){node=coachEl._node||node;var rr=node.getBoundingClientRect(),inside=e.clientX>=rr.left&&e.clientX<=rr.right&&e.clientY>=rr.top&&e.clientY<=rr.bottom;if(e.target===ok&&multi&&!opts.last&&opts.onNext){coachEl._multiNext=true;closeCoach();setTimeout(opts.onNext,60);return;}closeCoach();if(inside&&e.target!==ok){try{node.click&&node.tagName==="BUTTON"&&node.click();}catch(err){}}});
      window.addEventListener("scroll",placeCoach,true);window.addEventListener("resize",placeCoach);document.addEventListener("keydown",coachKey);
      placeCoach();ok.focus({preventScroll:true});
    },smooth?450:30);
  }

  /* Messages du site : un par nouveauté pas encore essayée (identifiant : version + nouveauté). */
  function messages(){
    var r=release(),s=state();
    if(!r||!s||!store()||!store().getItem("personalFinanceDashboard.onboardingCompleted"))return[];
    var tour=TOURS[r.version],L=en()?1:0;
    if(!tour){
      var note=r.notes[0];
      return[{id:"news:"+r.version,kind:"news",priority:40,tone:"info",once:true,kicker:t2("Nouveau","New")+" · "+note.date,title:note.title,body:note.text||"",
        action:{label:t2("Voir","View"),run:function(){markSeen();if(window.setPage)window.setPage("updates");}}}];
    }
    var left=tour.filter(function(i){return s.tried.indexOf(i.id)<0;}),n=tour.length;
    if(!left.length){markSeen();return[];}
    return left.map(function(item){
      return{id:"news:"+r.version+":"+item.id,kind:"news",priority:40,tone:"info",once:true,ring:{done:n-left.length,total:n},
        kicker:t2(n+" nouveautés à découvrir",n+" new things to discover")+" · "+(tour.indexOf(item)+1)+"/"+n,title:item.title[L],body:item.text[L],
        action:{label:t2("Essayer","Try it"),run:function(){var cur=state();if(cur.tried.indexOf(item.id)<0)cur.tried.push(item.id);write(cur);item.run();if(window.GFNotify)window.GFNotify.refresh();}}};
    });
  }
  if(window.GFNotify)window.GFNotify.register("news",messages);
  window.GFDiscover={coach:coach,reset:function(){var r=release();if(!r)return;write({v:r.version,tried:[]});if(window.GFNotify){window.GFNotify.restore("news:"+r.version);window.GFNotify.refresh();}}};
})();
