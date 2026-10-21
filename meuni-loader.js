/* Meuniance : écran de chargement « le grain qui cherche ».
   API : MeuniLoader.start(label) au début d'une recherche, MeuniLoader.done(label) quand le résultat arrive.
   L'écran n'apparaît qu'après 350 ms (pas de clignotement si c'est instantané).
   MeuniLoader.inline(label, {size:"sm", height:160}) : le même grain, en petit, à poser dans un bloc qui charge
   (le reste de la page reste affiché). Il apparaît en fondu après 250 ms, géré en CSS. */
(function(){
  "use strict";
  var o,svg,spin,gw,tx,timer,shown=false,busy=false,reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Libellés lus à chaque affichage : la langue peut changer pendant la session.
  function en(){return !!(window.GFI18n&&window.GFI18n.getLanguage&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,eng){return en()?eng:fr;}
  var LOGO='<svg class="meuni-loader-logo srch" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect class="lg-sq" width="28" height="28" rx="7.5"/><circle class="lg-t" cx="14" cy="14" r="9.4"/><g class="ml-spin"><circle class="lg-a" cx="14" cy="14" r="9.4" transform="rotate(-90 14 14)"/></g><g class="ml-gw"><g transform="rotate(30 14 14)"><path class="lg-s" d="M14 6.2C14.9 7.4 17.2 10 17.2 13.7 17.2 16.9 15.4 19.6 14 21.8 12.6 19.6 10.8 16.9 10.8 13.7 10.8 10 13.1 7.4 14 6.2Z"/><path class="lg-c" d="M14 9.6c-.4 2.8-.4 5.8 0 8.6"/></g></g></svg>';
  function SEARCH(){return t2("Je retrouve tes chiffres…","Finding your figures…");}
  function FOUND(){return t2("Voilà.","There you go.");}
  function build(){
    if(o)return;
    var boot=document.getElementById("meuniBoot");
    if(boot){o=boot;svg=o.querySelector("svg");spin=o.querySelector(".ml-spin");gw=o.querySelector(".ml-gw");tx=o.querySelector(".meuni-loader-text");return;}
    o=document.createElement("div");o.className="meuni-loader";o.setAttribute("role","status");o.setAttribute("aria-live","polite");o.hidden=true;
    o.innerHTML=LOGO+'<span class="meuni-loader-text"></span>';
    document.body.appendChild(o);
    svg=o.querySelector("svg");spin=o.querySelector(".ml-spin");gw=o.querySelector(".ml-gw");tx=o.querySelector(".meuni-loader-text");
  }
  function cancelAll(){[spin,gw].forEach(function(g){if(g&&g.getAnimations)g.getAnimations().forEach(function(a){a.cancel();});});}
  function show(label){
    build();cancelAll();o.hidden=false;shown=true;busy=true;svg.classList.add("srch");tx.textContent=label||SEARCH();
  }
  function start(label){clearTimeout(timer);if(shown){show(label);return;}timer=setTimeout(function(){show(label);},350);}
  function hide(){o.hidden=true;shown=false;busy=false;}
  function done(label){
    clearTimeout(timer);
    if(!shown||!o)return;
    tx.textContent=label||FOUND();
    if(reduce||!spin.getAnimations){setTimeout(hide,500);return;}
    var an=spin.getAnimations()[0],t=an?(an.currentTime%1100)/1100*360:0,d=450+(360-t)/360*400;
    if(an)an.cancel();svg.classList.remove("srch");
    var a=spin.animate([{transform:"rotate("+t+"deg)"},{transform:"rotate(360deg)"}],{duration:d,easing:"cubic-bezier(.15,.75,.25,1)"});
    a.onfinish=function(){
      gw.animate([{transform:"translateX(0)"},{transform:"translateX(1.4px)"},{transform:"translateX(-.5px)"},{transform:"translateX(0)"}],{duration:420,easing:"ease-out"});
      setTimeout(hide,700);
    };
  }
  /* Chargement d'un bloc : le grain qui cherche, en petit, avec son libellé. Le bloc garde une hauteur
     minimale pour que la page ne saute pas à l'arrivée du contenu. size:"sm" le pose dans une ligne de texte
     (libellé lu par les lecteurs d'écran seulement). size:"page" : le grain seul, plus grand, centré dans la page
     (libellé lu par les lecteurs d'écran seulement). */
  function inline(label,opts){
    opts=opts||{};var small=opts.size==="sm",page=opts.size==="page",n=document.createElement(small?"span":"div");
    n.className="meuni-inline"+(small?" is-sm":page?" is-page":"");n.setAttribute("role","status");n.setAttribute("aria-live","polite");
    n.innerHTML=LOGO;
    var text=document.createElement("span");text.className=small||page?"meuni-inline-sr":"meuni-inline-text";text.textContent=label||t2("Chargement…","Loading…");n.append(text);
    if(!small&&!page&&opts.height)n.style.minHeight=(Number(opts.height)||0)+"px";
    return n;
  }
  window.MeuniLoader={start:start,done:done,inline:inline,isBusy:function(){return busy;}};
  /* Ouverture de l'app : l'écran d'ouverture (déjà affiché par la page) reste jusqu'à ce que tes vrais
     chiffres soient calculés, puis s'efface en fondu. Sur un nouvel appareil d'un compte connecté, il attend
     aussi tes données du cloud. Au plus 8 s dans tous les cas. */
  (function(){
    var boot=document.getElementById("meuniBoot");
    if(!boot){start();if(document.readyState==="complete")done();else window.addEventListener("load",function(){done();});return;}
    build();shown=true;busy=true;
    var synced=false,finished=false;
    function owner(){try{return window.safeStore&&window.safeStore.financialOwner?window.safeStore.financialOwner():"anonymous";}catch(e){return"anonymous";}}
    function localEmpty(){try{var sn=window.FinanceSheet&&window.FinanceSheet.getSnapshot();return !sn||!(sn.sheets||[]).some(function(x){return Object.keys(x.cells||{}).some(function(k){return String((x.cells[k]||{}).raw||"").trim()!=="";});});}catch(e){return true;}}
    function figuresReady(){try{var d=window.__gfHomeData&&window.__gfHomeData();return !!(d&&d.all&&d.all.length);}catch(e){return false;}}
    var watcher=null;
    function leave(){
      if(finished)return;finished=true;
      if(watcher)watcher.disconnect();// plus rien à surveiller une fois l’écran parti
      function fade(){boot.classList.add("is-leaving");setTimeout(function(){boot.hidden=true;boot.classList.remove("is-boot","is-leaving");shown=false;busy=false;},220);}
      // « Voilà. » seulement si l'attente a été perceptible, et brièvement : l'ouverture reste rapide.
      if(!window.performance||performance.now()<500){fade();return;}
      if(tx)tx.textContent=FOUND();if(svg)svg.classList.remove("srch");
      setTimeout(fade,380);
    }
    function check(){
      if(finished||!document.body.classList.contains("gfh-ready"))return;
      if(localEmpty()){if(owner()!=="anonymous"&&!synced)return;leave();return;}
      if(figuresReady())leave();
    }
    window.addEventListener("gf:syncready",function(){synced=true;setTimeout(check,120);});
    window.addEventListener("gf:dashboardupdate",function(){setTimeout(check,30);});
    if(window.MutationObserver){watcher=new MutationObserver(check);watcher.observe(document.body,{attributes:true,attributeFilter:["class"]});}
    setTimeout(leave,8000);
    check();
  })();
})();
