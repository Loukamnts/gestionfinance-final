/* Finitions : boutons de vue des graphiques, navigation Paramètres, raccourcis Mon espace. */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}

  /* 1. Vues du graphique : 4 boutons en haut à droite du graphique */
  var VIEWS=[["pie","Camembert","Pie"],["grouped","Comparatif","Comparison"],["stacked","Épargne","Savings"],["line","Évolution","Trend"]];
  function chartViews(){
    var head=document.querySelector("#dashboardPage .chart-head"),sel=byId("viewSelect");if(!head||!sel)return;
    var box=byId("gfcViews");
    if(!box){box=el("div","gfc-views");box.id="gfcViews";box.setAttribute("role","group");box.setAttribute("aria-label",t2("Type de graphique","Chart type"));head.append(box);}
    box.replaceChildren.apply(box,VIEWS.map(function(v){var b=el("button","",t2(v[1],v[2]));b.type="button";b.dataset.view=v[0];b.setAttribute("aria-pressed",String(sel.value===v[0]));b.addEventListener("click",function(){if(sel.value===v[0])return;sel.value=v[0];sel.dispatchEvent(new Event("change",{bubbles:true}));syncViews();});return b;}));
  }
  function syncViews(){var sel=byId("viewSelect");document.querySelectorAll("#gfcViews button").forEach(function(b){b.setAttribute("aria-pressed",String(sel&&sel.value===b.dataset.view));});}

  /* 2. Barre du bas : Mon espace → Paramètres */
  function bottomNav(){
    var b=byId("personalNavButton");if(!b)return;
    b.id="settingsNavButton";b.dataset.page="settings";b.setAttribute("aria-label",t2("Paramètres","Settings"));b.title=t2("Paramètres","Settings");
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="bottom-nav-label">'+t2("Paramètres","Settings")+'</span>';
    b.addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();if(window.setPage)window.setPage("settings");},true);
  }
  function syncBottom(){var b=byId("settingsNavButton");if(b)b.classList.toggle("is-active",document.body.dataset.page==="settings");}

  /* 3. Paramètres : raccourcis vers Mon espace (accessible aussi par l'avatar) */
  function hubLinks(){
    var hub=byId("settingsHub");if(!hub||byId("gfpHubSpace"))return;
    var label=el("span","settings-hub-label",t2("Mon espace","My space"));label.id="gfpHubSpace";
    var items=[["objectives",t2("Objectifs","Goals"),t2("Tes projets et leur progression","Your projects and progress")],["sharing",t2("Partage et amis","Sharing and friends"),t2("Qui voit quoi, et quand","Who sees what, and when")],["updates",t2("Nouveautés","What’s new"),t2("Les dernières améliorations","Latest improvements")],["notes",t2("Notes","Notes"),t2("Tes idées et rappels privés","Your private ideas and reminders")]];
    var labels=hub.querySelectorAll(".settings-hub-label"),first=labels[1]||null;
    var frag=document.createDocumentFragment();frag.append(label);
    items.forEach(function(it){var b=el("button","settings-hub-item gfp-hub-link");b.type="button";var s=el("span");s.append(el("strong","",it[1]),el("small","",it[2]));b.append(s);
      b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();if(it[0]==="notes"){if(window.GFObjectives&&window.GFObjectives.setNotesOpen)window.GFObjectives.setNotesOpen(true);}else if(window.setPage)window.setPage(it[0]);});frag.append(b);});
    if(first)hub.insertBefore(frag,first);else hub.append(frag);
  }


  /* Objectifs : lien avec le tableur en deux choix simples (ligne, puis mois ou toute l'année). */
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
    function eurS(v){try{return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(v);}catch(e){return v+" €";}}
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
  function openManagement(){document.querySelectorAll("#objectivesPage details.objective-management").forEach(function(d){d.open=true;});}
  function shortLabels(){document.querySelectorAll('.personal-workspace-nav .personal-workspace-link[data-page="sharing"]').forEach(function(b){if(b.querySelector(".gfp-short"))return;b.innerHTML='<span class="gfp-long">'+t2("Partage et amis","Sharing and friends")+'</span><span class="gfp-short">'+t2("Partage","Sharing")+'</span>';});}
  function start(){
    shortLabels();
    goalLinkUI();
    chartViews();bottomNav();syncBottom();
    var nb=byId("latestUpdateAllButton");if(nb){nb.textContent=t2("Voir","See");nb.setAttribute("aria-label",t2("Voir les nouveautés","See what’s new"));}
    document.addEventListener("change",function(e){if(e.target&&e.target.id==="viewSelect")syncViews();});
    document.addEventListener("click",function(){setTimeout(syncBottom,0);});
    window.addEventListener("gf:dashboardupdate",function(){if(!byId("gfcViews"))chartViews();syncViews();});
    window.addEventListener("gf:languagechange",function(){chartViews();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
