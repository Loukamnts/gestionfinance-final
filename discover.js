/* Nouveautés sur l'accueil : l'anneau du logo se remplit à chaque nouveauté essayée.
   Chaque nouveauté a son bouton « Essayer » qui ouvre directement la fonction.
   Pour une version sans parcours défini, le bloc annonce simplement la dernière nouveauté. */
(function(){
  "use strict";
  var KEY="personalFinanceDashboard.discover";
  var RING=2*Math.PI*9.4;
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
  function state(){var r=release(),s=read();if(!r)return null;if(s.v!==r.version)s={v:r.version,tried:[],hidden:false};if(!Array.isArray(s.tried))s.tried=[];return s;}
  function markSeen(){var r=release();try{if(r&&store())store().setItem("personalFinanceDashboard.lastSeenRelease",r.version);}catch(e){}}

  // reminders.js a fondu l’ancien bloc #gfrBudget dans les notifications : on vise la ligne « plafond »
  // si elle est visible (dépliée), sinon tout le bloc des notifications.
  function budgetTarget(){var box=byId("gfrReminders"),row=box&&box.querySelector(".gfr-kind.is-budget");return row&&row.getClientRects().length?row:box;}
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

  function ring(done,total,complete){
    var ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 28 28");svg.setAttribute("class","gfd-ring"+(complete?" is-complete":""));svg.setAttribute("aria-hidden","true");
    function node(tag,attrs){var n=document.createElementNS(ns,tag);Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});svg.appendChild(n);return n;}
    node("circle",{"class":"gfd-track",cx:14,cy:14,r:9.4});
    var arc=node("circle",{"class":"gfd-arc",cx:14,cy:14,r:9.4,transform:"rotate(-90 14 14)"});
    arc.style.strokeDasharray="0 "+RING;
    var g=node("g",{transform:"rotate(30 14 14) translate(14 14) scale(.62) translate(-14 -14)"});
    var seed=document.createElementNS(ns,"path");seed.setAttribute("class","gfd-seed");seed.setAttribute("d","M14 6.2C14.9 7.4 17.2 10 17.2 13.7 17.2 16.9 15.4 19.6 14 21.8 12.6 19.6 10.8 16.9 10.8 13.7 10.8 10 13.1 7.4 14 6.2Z");g.appendChild(seed);
    // L'arc se remplit après l'affichage, pour que la progression se voie
    var len=total?RING*done/total:0;requestAnimationFrame(function(){requestAnimationFrame(function(){arc.style.strokeDasharray=len+" "+RING;});});
    return svg;
  }

  var focus=null;
  function render(){
    var page=byId("dashboardPage"),content=page&&page.querySelector(".content"),box=byId("gfdDiscover");
    var s=state(),r=release(),tour=r&&TOURS[r.version];
    var visible=!!(s&&r&&document.body.dataset.theme==="moulin"&&!s.hidden&&!document.body.classList.contains("tutorial-active")&&store()&&store().getItem("personalFinanceDashboard.onboardingCompleted"));
    if(!visible||!content){if(box)box.remove();return;}
    if(!box){box=el("section","gfd");box.id="gfdDiscover";box.setAttribute("aria-live","polite");var anchor=byId("latestUpdateBanner"),grid=content.querySelector(".gfh-dg");
      // Sur l’accueil, le bloc se place dans la grille (sous le solde) ; l’accueil le reprend à chaque rafraîchissement.
      if(grid&&grid.firstChild)grid.insertBefore(box,grid.firstChild.nextSibling);else content.insertBefore(box,anchor||null);}
    box.setAttribute("aria-label",t2("Nouveautés","What’s new"));
    var all=tour||[],left=all.filter(function(i){return s.tried.indexOf(i.id)<0;}),complete=!!tour&&!left.length;
    // Anneau plein : il reste visible un moment (pour voir le résultat), puis le bloc disparaît
    if(complete&&s.doneAt&&Date.now()-s.doneAt>15000){s.hidden=true;write(s);box.remove();markSeen();return;}
    var item=complete||!tour?null:(left.filter(function(i){return i.id===focus;})[0]||left[0]);focus=item&&item.id;
    var idx=item?all.indexOf(item):0;
    var copy=el("div","gfd-copy"),actions=el("div","gfd-actions");
    if(!tour){
      copy.append(el("p","gfd-kicker",t2("Nouveau","New")+" · "+r.notes[0].date),el("h3","gfd-title",r.notes[0].title));
      var see=el("button","gfd-try",t2("Voir","View"));see.type="button";see.addEventListener("click",function(){s.hidden=true;write(s);markSeen();if(window.setPage)window.setPage("updates");});actions.append(see);
    }else if(complete){
      copy.append(el("p","gfd-kicker",t2("Tout est découvert","All discovered")),el("h3","gfd-title",t2("L’anneau est plein : tu as tout essayé.","The ring is full: you tried everything.")));
      var list=el("button","gfd-next",t2("Toutes les nouveautés","All updates"));list.type="button";list.addEventListener("click",function(){s.hidden=true;write(s);markSeen();if(window.setPage)window.setPage("updates");});actions.append(list);
      if(!s.doneAt){s.doneAt=Date.now();write(s);markSeen();setTimeout(schedule,15500);}
    }else{
      var n=all.length;
      copy.append(el("p","gfd-kicker",t2(n+" nouveautés à découvrir",n+" new things to discover")+" · "+(idx+1)+"/"+n),el("h3","gfd-title",item.title[en()?1:0]),el("p","gfd-text",item.text[en()?1:0]));
      var tryBtn=el("button","gfd-try",t2("Essayer","Try it"));tryBtn.type="button";
      tryBtn.addEventListener("click",function(){var cur=state();if(cur.tried.indexOf(item.id)<0)cur.tried.push(item.id);write(cur);focus=null;item.run();setTimeout(render,50);});
      actions.append(tryBtn);
      if(left.length>1){var next=el("button","gfd-next",t2("Suivante","Next"));next.type="button";next.setAttribute("aria-label",t2("Nouveauté suivante","Next new feature"));
        next.addEventListener("click",function(){var i=left.indexOf(item);focus=left[(i+1)%left.length].id;render();var b=byId("gfdDiscover");var f=b&&b.querySelector(".gfd-next");if(f)f.focus();});actions.append(next);}
    }
    var close=el("button","gfd-close");close.type="button";close.setAttribute("aria-label",t2("Masquer les nouveautés","Hide what’s new"));close.textContent="×";
    close.addEventListener("click",function(){var cur=state();cur.hidden=true;write(cur);markSeen();render();});
    var main=el("div","gfd-main");main.append(copy,actions);
    box.replaceChildren(ring(tour?all.length-left.length:1,tour?all.length:1,complete||!tour),main,close);
  }

  var queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{render();}catch(e){console.warn("Nouveautés Meuniance",e);}});}
  window.GFDiscover={coach:coach,render:schedule,reset:function(){var r=release();if(!r)return;write({v:r.version,tried:[],hidden:false});focus=null;schedule();}};
  window.addEventListener("gf:dashboardupdate",schedule);
  window.addEventListener("gf:languagechange",schedule);
  window.addEventListener("authStateChanged",schedule);
  if(window.MutationObserver)new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:["class","data-page","data-theme"]});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();
})();
