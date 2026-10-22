/* Finitions : boutons de vue des graphiques, navigation Paramètres, raccourcis Mon espace. */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}

  /* 1. Vues du graphique : 4 boutons en haut à droite du graphique */
  var VIEWS=[["pie","Dépenses","Spending"],["grouped","Comparatif","Comparison"],["stacked","Épargne","Savings"],["line","Évolution","Trend"]];
  function chartViews(){
    var head=document.querySelector("#dashboardPage .chart-head"),sel=byId("viewSelect");if(!head||!sel)return;
    var box=byId("gfcViews");
    if(!box){box=el("div","gfc-views");box.id="gfcViews";box.setAttribute("role","group");box.setAttribute("aria-label",t2("Type de graphique","Chart type"));head.append(box);}
    box.replaceChildren.apply(box,VIEWS.map(function(v){var b=el("button","",t2(v[1],v[2]));b.type="button";b.dataset.view=v[0];b.setAttribute("aria-pressed",String(sel.value===v[0]));b.addEventListener("click",function(){if(sel.value===v[0])return;sel.value=v[0];sel.dispatchEvent(new Event("change",{bubbles:true}));syncViews();});return b;}));
  }
  function syncViews(){var sel=byId("viewSelect");document.querySelectorAll("#gfcViews button").forEach(function(b){b.setAttribute("aria-pressed",String(sel&&sel.value===b.dataset.view));});}

  /* 2. Navigation : Accueil, Tableur, Mon espace (Partage, Objectifs, Nouveautés), en bas sur
     téléphone et en haut sur ordinateur. Paramètres est l'engrenage, à gauche du profil. */
  var SPACE=["sharing","objectives","updates"];
  function navPage(x){var page=document.body.dataset.page;return x.dataset.page===page||(x.dataset.space==="1"&&SPACE.indexOf(page)>=0);}
  function syncBottom(){
    document.querySelectorAll(".bottom-nav .bottom-nav-btn, .desktop-nav .desktop-nav-link").forEach(function(x){var on=navPage(x);x.classList.toggle("is-active",on);if(on)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current");});
    document.querySelectorAll(".mobile-settings-button").forEach(function(x){x.classList.toggle("is-active",document.body.dataset.page==="settings");});
  }

  /* 3. Objectifs : lien avec le tableur en deux choix simples (ligne, puis mois ou toute l'année). */
  function goalLinkUI(){
    var form=byId("objectiveForm"),src=byId("objectiveSheetSource");if(!form||!src||byId("gfoLink"))return;
    var box=el("fieldset","gfo-link");box.id="gfoLink";
    var lg=el("legend","",t2("Lier à mon tableur","Link to my spreadsheet"));
    var hint=el("p","gfo-hint",t2("Facultatif. Le montant atteint se met à jour tout seul depuis la case choisie.","Optional. The amount updates itself from the chosen cell."));
    var lineL=el("label","gfo-field"),line=document.createElement("select");lineL.append(el("span","",t2("Ligne","Row")),line);
    var perL=el("label","gfo-field"),per=document.createElement("select");perL.append(el("span","",t2("Période","Period")),per);
    var row=el("div","gfo-row");row.append(lineL,perL);
    box.append(lg,hint,row);
    var target=form.querySelector(".objective-plan-toggle");if(target)form.insertBefore(box,target);else form.append(box);
    var linkField=src.closest("label");if(linkField)linkField.style.display="none";
    function sources(){try{return window.FinanceSheet.getObjectiveSources()||[];}catch(e){return[];}}
    function eurS(v){try{return new Intl.NumberFormat(t2("fr-FR","en-GB"),{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(v);}catch(e){return v+" €";}}
    function base(id){var p=String(id||"").split(":");return p.length>=2?p[0]+":"+p[1]:"";}
    function fillLines(sel){
      var list=sources().filter(function(s){return s.month==null||s.month<0;});
      line.replaceChildren(new Option(t2("Aucun lien (montant saisi à la main)","No link (typed manually)"),""));
      list.forEach(function(s){line.append(new Option((s.line||s.label)+" · "+(s.year||""),s.id));});
      line.value=sel||"";if(line.value!==(sel||""))line.value="";
    }
    function fillPeriods(b,sel){
      per.replaceChildren();per.disabled=!b;
      if(!b){per.append(new Option("—",""));return;}
      var all=sources().filter(function(s){return base(s.id)===b;});
      all.sort(function(x,y){return (x.month<0?-1:x.month)-(y.month<0?-1:y.month);});
      all.forEach(function(s){per.append(new Option((s.month<0?t2("Toute l’année (cumul)","Whole year (total)"):String(s.monthName||"").replace(/^./,function(c){return c.toUpperCase();}))+" · "+eurS(s.value),s.id));});
      per.value=sel&&base(sel)===b?sel:b;
    }
    function push(){
      var v=line.value?per.value||line.value:"";
      if(![].some.call(src.options,function(o){return o.value===v;})&&v){src.append(new Option(v,v));}
      src.value=v;src.dispatchEvent(new Event("change",{bubbles:true}));
      var cur=byId("objectiveCurrent");if(cur){cur.disabled=!!v;cur.closest("label")&&cur.closest("label").classList.toggle("gfo-auto",!!v);}
    }
    function sync(){var v=src.value||"";fillLines(base(v));fillPeriods(line.value,v);var cur=byId("objectiveCurrent");if(cur){cur.disabled=!!v;}}
    line.addEventListener("change",function(){fillPeriods(line.value,"");push();});
    per.addEventListener("change",push);
    if(window.MutationObserver)new MutationObserver(function(){if(!form.hidden)setTimeout(sync,0);}).observe(form,{attributes:true,attributeFilter:["hidden"]});
    sync();
  }
  // Libellés courts posés ici : refaits à chaque changement de langue.
  function shortLabels(){
    var nb=byId("latestUpdateAllButton");if(nb){nb.textContent=t2("Voir","See");nb.setAttribute("aria-label",t2("Voir les nouveautés","See what’s new"));}
    document.querySelectorAll('.personal-workspace-nav .personal-workspace-link[data-page="sharing"]').forEach(function(b){b.innerHTML='<span class="gfp-long">'+t2("Partage et amis","Sharing and friends")+'</span><span class="gfp-short">'+t2("Partage","Sharing")+'</span>';});}
  function start(){
    shortLabels();
    goalLinkUI();
    chartViews();syncBottom();
    // Changement de page, d'où qu'il vienne : l'onglet du bas suit (Mon espace couvre ses trois pages).
    if(window.MutationObserver)new MutationObserver(syncBottom).observe(document.body,{attributes:true,attributeFilter:["data-page"]});
    document.addEventListener("change",function(e){if(e.target&&e.target.id==="viewSelect")syncViews();});
    document.addEventListener("click",function(){setTimeout(syncBottom,0);});
    // Barre du bas : l'onglet touché prend sa couleur dès l'appui ; la nouvelle page n'est construite
    // qu'après l'affichage de cette couleur, pour que le retour visuel soit immédiat.
    var nav=document.querySelector(".bottom-nav");
    if(nav){
      var mark=function(b){nav.querySelectorAll(".bottom-nav-btn").forEach(function(x){x.classList.toggle("is-active",x===b);});};
      var restore=syncBottom;
      nav.addEventListener("pointerdown",function(e){var b=e.target.closest(".bottom-nav-btn");if(b&&!(e.button>0))mark(b);});
      nav.addEventListener("pointercancel",restore);
      nav.addEventListener("click",function(e){
        var b=e.target.closest(".bottom-nav-btn");if(!b||!b.dataset.page||!window.setPage)return;
        e.preventDefault();e.stopPropagation();
        mark(b);b.classList.remove("gf-pop");void b.offsetWidth;b.classList.add("gf-pop");
        var page=b.dataset.page;
        requestAnimationFrame(function(){setTimeout(function(){window.setPage(page);syncBottom();},0);});
      },true);
      nav.addEventListener("animationend",function(e){if(e.target.classList&&e.target.classList.contains("gf-pop"))e.target.classList.remove("gf-pop");});
    }
    window.addEventListener("gf:dashboardupdate",function(){if(!byId("gfcViews"))chartViews();syncViews();});
    window.addEventListener("gf:languagechange",function(){chartViews();shortLabels();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();

/* Menu du profil sur iPhone : poignée + glisser vers le bas pour fermer (la mise en forme est dans finishing.css). */
(function(){
  "use strict";
  function init(){
    var pop=document.getElementById("profilePopover"),btn=document.getElementById("profileMenuButton");
    if(!pop||pop.querySelector(".gf-sheet-grab"))return;
    var grab=document.createElement("div");grab.className="gf-sheet-grab";grab.setAttribute("aria-hidden","true");pop.insertBefore(grab,pop.firstChild);
    var mq=window.matchMedia("(max-width:720px)"),y0=0,dy=0,t0=0,on=false;
    function sheet(){return mq.matches&&document.body.dataset.interface!=="studio";}
    function close(){pop.hidden=true;pop.style.transform="";pop.classList.remove("is-dragging");if(btn){btn.setAttribute("aria-expanded","false");try{btn.focus({preventScroll:true});}catch(e){}}}
    grab.addEventListener("pointerdown",function(e){if(!sheet())return;on=true;y0=e.clientY;dy=0;t0=Date.now();pop.classList.add("is-dragging");try{grab.setPointerCapture(e.pointerId);}catch(x){}});
    grab.addEventListener("pointermove",function(e){if(!on)return;dy=Math.max(0,e.clientY-y0);pop.style.transform="translateY("+dy+"px)";});
    function end(){if(!on)return;on=false;var fast=dy/Math.max(1,Date.now()-t0)>0.5;if(dy>90||(fast&&dy>30))close();else{pop.classList.remove("is-dragging");pop.style.transform="";}}
    grab.addEventListener("pointerup",end);grab.addEventListener("pointercancel",end);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

/* Grand texte : quand le réglage « Taille du texte » de l’iPhone dépasse ~130 %, la page reçoit une classe qui active
   des mises en page plus aérées (étiquettes de la barre du bas raccourcies, colonnes empilées). Aucun texte n’est modifié. */
(function(){
  "use strict";
  var root=document.documentElement;
  function sync(){
    var px=parseFloat(getComputedStyle(root).fontSize)||16;
    root.classList.toggle("gf-bigtext",px>=21);
    root.classList.toggle("gf-hugetext",px>=27);
  }
  sync();window.addEventListener("resize",sync);window.addEventListener("orientationchange",sync);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync);
  if(window.matchMedia){try{var mq=window.matchMedia("(min-resolution: 1dppx)");if(mq.addEventListener)mq.addEventListener("change",sync);}catch(e){}}
  window.addEventListener("pageshow",sync);document.addEventListener("visibilitychange",function(){if(!document.hidden)sync();});
})();
