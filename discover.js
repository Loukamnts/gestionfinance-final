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
    "2026-10-13-le-moulin":[
      {id:"quickadd",title:["Ajoute en un geste","Add in one tap"],text:["Une dépense, un revenu ou de l’épargne, sans ouvrir le tableur.","An expense, income or savings, without opening the spreadsheet."],run:function(){goHome(function(){var b=document.querySelector("#gfhHome .gfh-add");if(b)b.click();});}},
      {id:"years",title:["Une feuille par année","One sheet per year"],text:["Ton tableur se range par année : ajoute la précédente ou la suivante en un clic.","Your spreadsheet is organised by year: add the previous or next one in one click."],run:function(){openPage("sheet","#sheetPage .sheet-years");}},
      {id:"goalmonth",title:["Un objectif lié à un mois","A goal linked to a month"],text:["Ton objectif suit une ligne du tableur, pour un mois précis ou toute l’année.","Your goal follows a spreadsheet row, for one month or the whole year."],run:function(){openPage("objectives","#gfoLink, .objective-link-field",function(){var form=byId("objectiveForm"),add=byId("objectiveAddButton");if(add&&(!form||form.hidden||!form.getClientRects().length))add.click();});}}
    ]
  };

  function release(){var r=window.GFReleaseNotes;return r&&r.notes&&r.notes[0]?r:null;}
  function read(){try{var v=JSON.parse((store()&&store().getItem(KEY))||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function write(v){try{store()&&store().setItem(KEY,JSON.stringify(v));}catch(e){}}
  function state(){var r=release(),s=read();if(!r)return null;if(s.v!==r.version)s={v:r.version,tried:[],hidden:false};if(!Array.isArray(s.tried))s.tried=[];return s;}
  function markSeen(){var r=release();try{if(r&&store())store().setItem("personalFinanceDashboard.lastSeenRelease",r.version);}catch(e){}}

  function goHome(after){if(typeof window.setPage==="function")window.setPage("dashboard");setTimeout(after,120);}
  function openPage(page,target,before){
    if(typeof window.setPage==="function")window.setPage(page);
    setTimeout(function(){try{before&&before();}catch(e){}setTimeout(function(){spotlight(document.querySelector(target));},220);},120);
  }
  function spotlight(node){
    if(!node)return;try{node.scrollIntoView({block:"center",behavior:"smooth"});}catch(e){node.scrollIntoView();}
    node.classList.remove("gfd-spot");void node.offsetWidth;node.classList.add("gfd-spot");
    setTimeout(function(){node.classList.remove("gfd-spot");},2600);
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
    if(!box){box=el("section","gfd");box.id="gfdDiscover";box.setAttribute("aria-live","polite");var anchor=byId("latestUpdateBanner");content.insertBefore(box,anchor||null);}
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
  window.GFDiscover={render:schedule,reset:function(){var r=release();if(!r)return;write({v:r.version,tried:[],hidden:false});focus=null;schedule();}};
  window.addEventListener("gf:dashboardupdate",schedule);
  window.addEventListener("gf:languagechange",schedule);
  window.addEventListener("authStateChanged",schedule);
  if(window.MutationObserver)new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:["class","data-page","data-theme"]});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();
})();
