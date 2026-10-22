/* Menus déroulants, page Apparence, confirmation de suppression d'objectif. */
(function(){
  "use strict";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  var valueDesc=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value");
  var openDD=null;

  /* ── Menu déroulant générique, branché sur un <select> natif (qui reste la source de vérité) ── */
  function enhance(sel,opts){
    if(!sel||sel._gfs)return sel&&sel._gfs;opts=opts||{};
    var wrap=el("div","gfs-dd"),btn=el("button","gfs-dd-btn"),txt=el("span"),menu=el("div","gfs-dd-menu");
    btn.type="button";btn.setAttribute("aria-haspopup","listbox");btn.setAttribute("aria-expanded","false");menu.hidden=true;menu.setAttribute("role","listbox");
    var lab=sel.closest("label");if(lab){var s=lab.querySelector("span");if(s){if(!s.id)s.id="gfsl"+Math.random().toString(36).slice(2,8);btn.setAttribute("aria-labelledby",s.id);}}
    btn.append(txt);wrap.append(btn,menu);sel.after(wrap);sel.classList.add("gfs-native");sel.tabIndex=-1;sel.setAttribute("aria-hidden","true");
    function split(text){var m=String(text).match(/^(.*?)\s·\s([^·]+)$/);return m?[m[1],m[2]]:[text,""];}
    function sync(){
      var o=sel.options[sel.selectedIndex];txt.textContent=(o&&o.text.trim())?split(o.text)[0]+(opts.showValue&&o&&split(o.text)[1]?" · "+split(o.text)[1]:""):(opts.placeholder||t2("Choisir…","Choose…"));
      btn.classList.toggle("is-placeholder",!o||!o.text.trim());btn.disabled=sel.disabled;
      if(!menu.hidden)build();
    }
    function build(){
      menu.replaceChildren();
      [].forEach.call(sel.children,function(ch){
        if(ch.tagName==="OPTGROUP"){menu.append(el("div","gfs-dd-h",ch.label));[].forEach.call(ch.children,add);}else add(ch);
      });
    }
    function add(o){
      if(o.hidden)return;var parts=split(o.text),b=el("button","gfs-dd-opt");b.type="button";b.setAttribute("role","option");b.setAttribute("aria-selected",String(o.selected));b.disabled=o.disabled;
      b.append(el("span","t",parts[0]));if(parts[1])b.append(el("span","v",parts[1]));
      b.addEventListener("click",function(){if(sel.value!==o.value){valueDesc.set.call(sel,o.value);sel.dispatchEvent(new Event("change",{bubbles:true}));}sync();close();btn.focus();});
      menu.append(b);
    }
    function open(){
      if(sel.disabled)return;if(openDD&&openDD!==api)openDD.close();build();menu.hidden=false;btn.setAttribute("aria-expanded","true");openDD=api;
      menu.classList.remove("is-up");var r=menu.getBoundingClientRect();if(r.bottom>window.innerHeight-8&&btn.getBoundingClientRect().top>r.height+20)menu.classList.add("is-up");
      var cur=menu.querySelector('[aria-selected="true"]')||menu.querySelector(".gfs-dd-opt");if(cur){cur.focus();cur.scrollIntoView({block:"nearest"});}
    }
    function close(){menu.hidden=true;btn.setAttribute("aria-expanded","false");if(openDD===api)openDD=null;}
    btn.addEventListener("click",function(){menu.hidden?open():close();});
    btn.addEventListener("keydown",function(e){if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();open();}});
    menu.addEventListener("keydown",function(e){
      var items=[].slice.call(menu.querySelectorAll(".gfs-dd-opt:not(:disabled)")),i=items.indexOf(document.activeElement);
      if(e.key==="ArrowDown"){e.preventDefault();(items[i+1]||items[0]).focus();}
      else if(e.key==="ArrowUp"){e.preventDefault();(items[i-1]||items[items.length-1]).focus();}
      else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();btn.focus();}
      else if(e.key==="Tab"){close();}
      else if(e.key.length===1){var k=e.key.toLowerCase(),f=items.filter(function(b){return b.textContent.trim().toLowerCase().indexOf(k)===0;});if(f.length)(f[(f.indexOf(document.activeElement)+1)%f.length]).focus();}
    });
    try{Object.defineProperty(sel,"value",{configurable:true,get:function(){return valueDesc.get.call(sel);},set:function(v){valueDesc.set.call(sel,v);sync();}});}catch(e){}
    sel.addEventListener("change",sync);
    if(window.MutationObserver)new MutationObserver(sync).observe(sel,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled"]});
    var api={sync:sync,close:close,open:open,el:wrap};sel._gfs=api;sync();return api;
  }
  document.addEventListener("mousedown",function(e){if(openDD&&!openDD.el.contains(e.target))openDD.close();},true);
  document.addEventListener("focusin",function(e){if(openDD&&!openDD.el.contains(e.target))openDD.close();});
  window.GFSelect={enhance:enhance,sync:function(sel){if(sel&&sel._gfs)sel._gfs.sync();}};
  // Les anciens menus de l'app appellent GFCustomSelect.sync : on garde nos menus à jour aussi.
  function hookCustomSelect(){var cs=window.GFCustomSelect;if(!cs||cs._gfsHooked||typeof cs.sync!=="function")return;var o=cs.sync;cs.sync=function(sel){var r=o.apply(this,arguments);try{if(sel&&sel._gfs)sel._gfs.sync();}catch(e){}return r;};cs._gfsHooked=true;}

  function objectiveSelects(){
    ["objectiveType","objectiveCadence"].forEach(function(id){var s=byId(id);if(s)enhance(s);});
    var link=byId("gfoLink");if(link)[].forEach.call(link.querySelectorAll("select"),function(s,i){enhance(s,{showValue:i===1});});
  }

  /* ── Confirmation avant de supprimer un objectif ── */
  function confirmDelete(title,onYes){
    var d=el("dialog","gfh-dialog");var h=el("h2","",t2("Supprimer l’objectif ?","Delete this goal?"));
    var p=el("p","gfh-muted",t2("« "+title+" » et sa progression seront supprimés. Tu peux aussi l’archiver pour le garder de côté.","“"+title+"” and its progress will be deleted. You can archive it instead to keep it."));
    var row=el("div","gfh-dialog-actions"),no=el("button","gfh-btn",t2("Annuler","Cancel")),yes=el("button","gfh-btn gfh-danger",t2("Supprimer","Delete"));no.type=yes.type="button";row.append(no,yes);
    var f=el("div");f.style.display="grid";f.style.gap="14px";f.append(h,p,row);d.append(f);
    no.addEventListener("click",function(){d.close();});yes.addEventListener("click",function(){d.close();onYes();});
    d.addEventListener("close",function(){d.remove();});document.body.append(d);d.showModal();no.focus();
  }
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("#objectivesPage .objective-remove");if(!b)return;
    if(b.dataset.gfsOk==="1"){delete b.dataset.gfsOk;return;}
    e.preventDefault();e.stopImmediatePropagation();
    var card=b.closest(".objective-card"),t=card&&card.querySelector("h4");
    confirmDelete(t?t.textContent:"",function(){b.dataset.gfsOk="1";b.click();});
  },true);

  /* ── Page Apparence ── */
  function prev(mode,layout){
    // Miniature fidèle de l'accueil : en-tête ou menu latéral, carte du solde, encadrés à droite.
    var C=mode==="dark"?{bg:"#0E1713",line:"#2A3A32",card:"#182822",cardLine:"#2A3A32",acc:"#EDB73B",txt:"#F3EEE2",bar:"rgba(243,238,226,.2)",side:"#182822",soft:"#3A3624",logo:"#F3EEE2"}
                      :{bg:"#F6F2E8",line:"#D9D2BF",card:"#17261F",cardLine:"#17261F",acc:"#E3A82B",txt:"#17261F",bar:"rgba(246,242,232,.25)",side:"#FBF8F1",soft:"#EEDFB6",logo:"#17261F"};
    function bars(x,y,w,h){var s="",hs=[.3,.4,.36,.5,.46,.62,.9],bw=(w-6*2)/7;for(var i=0;i<7;i++){var bh=h*hs[i];s+='<rect x="'+(x+i*(bw+2)).toFixed(1)+'" y="'+(y+h-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1" fill="'+(i===6?C.acc:C.bar)+'"/>';}return s;}
    function card(x,y,w,h){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="6" fill="'+C.card+'" stroke="'+C.cardLine+'"/><rect x="'+(x+5)+'" y="'+(y+5)+'" width="'+(w*.22)+'" height="2" rx="1" fill="'+C.bar+'"/><rect x="'+(x+5)+'" y="'+(y+10)+'" width="'+(w*.42)+'" height="5" rx="1.5" fill="#F6F2E8" opacity=".92"/>'+bars(x+5,y+20,w-10,h-26);}
    function panel(x,y,w,h,rows){var s='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="5" fill="none" stroke="'+C.line+'"/><rect x="'+(x+4)+'" y="'+(y+4)+'" width="'+(w*.45)+'" height="2.5" rx="1" fill="'+C.txt+'" opacity=".75"/>';for(var r=0;r<rows;r++){var yy=y+11+r*7;s+='<rect x="'+(x+4)+'" y="'+yy+'" width="'+(w-8)+'" height="2" rx="1" fill="'+C.line+'"/><rect x="'+(x+4)+'" y="'+yy+'" width="'+((w-8)*(r===0?.62:.38))+'" height="2" rx="1" fill="'+C.acc+'"/>';}return s;}
    var svg='<svg viewBox="0 0 160 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="160" height="96" fill="'+C.bg+'"/>';
    if(layout==="side"){
      svg+='<rect x="4" y="4" width="34" height="88" rx="6" fill="'+C.side+'" stroke="'+C.line+'"/><rect x="9" y="9" width="7" height="7" rx="2" fill="'+C.logo+'"/><rect x="18" y="11" width="14" height="3" rx="1" fill="'+C.txt+'" opacity=".7"/>';
      for(var k=0;k<5;k++){svg+=(k===0?'<rect x="8" y="'+(23+k*9)+'" width="26" height="7" rx="3.5" fill="'+C.soft+'"/>':'')+'<rect x="12" y="'+(25.5+k*9)+'" width="'+(k===0?14:12)+'" height="2" rx="1" fill="'+C.txt+'" opacity="'+(k===0?".8":".45")+'"/>';}
      svg+='<rect x="44" y="7" width="40" height="9" rx="4.5" fill="none" stroke="'+C.line+'"/><rect x="132" y="7" width="22" height="9" rx="4.5" fill="'+C.acc+'"/>';
      svg+=card(44,22,64,68)+panel(113,22,41,32,2)+panel(113,58,41,32,2);
    }else{
      svg+='<rect x="6" y="5" width="8" height="8" rx="2" fill="'+C.logo+'"/><rect x="16" y="7.5" width="18" height="3" rx="1" fill="'+C.txt+'" opacity=".7"/>';
      svg+='<rect x="60" y="4" width="40" height="10" rx="5" fill="none" stroke="'+C.line+'"/><rect x="63" y="5.5" width="11" height="7" rx="3.5" fill="'+C.soft+'"/><rect x="77" y="8" width="8" height="2" rx="1" fill="'+C.txt+'" opacity=".45"/><rect x="88" y="8" width="9" height="2" rx="1" fill="'+C.txt+'" opacity=".45"/>';
      svg+='<circle cx="150" cy="9" r="4" fill="'+C.acc+'"/><rect x="6" y="18" width="148" height=".8" fill="'+C.line+'"/>';
      svg+='<rect x="6" y="23" width="40" height="8" rx="4" fill="none" stroke="'+C.line+'"/><rect x="134" y="23" width="20" height="8" rx="4" fill="'+C.acc+'"/>';
      svg+=card(6,36,90,56)+panel(101,36,53,27,2)+panel(101,66,53,26,2);
    }
    var d=el("div","gfa-prev "+mode);d.innerHTML=svg+'</svg>';return d;
  }
  // Aperçu « Automatique » : moitié clair, moitié sombre.
  function prevAuto(layout){
    var d=el("div","gfa-prev auto"),a=prev("light",layout),b=prev("dark",layout);
    a.classList.add("gfa-half-l");b.classList.add("gfa-half-d");d.append(a,b);return d;
  }
  function appearance(){
    var panel=document.querySelector('[data-settings-panel="appearance"]');if(!panel)return;
    var head=panel.querySelector(".settings-section-head:not(.split) p");if(head)head.textContent=t2("Le mode, la disposition et ce que montre ton accueil.","Mode, layout and what your home shows.");
    var box=byId("gfaBox");
    if(!box){box=el("div","gfa");box.id="gfaBox";var h=panel.querySelector(".settings-section-head:not(.split)");if(h)h.after(box);else panel.append(box);}
    var pref=document.body.dataset.modePref==="light"||document.body.dataset.modePref==="dark"?document.body.dataset.modePref:"auto",mode=document.body.dataset.mode==="dark"?"dark":"light",layout=document.body.dataset.interface==="studio"?"side":"top";
    function section(title,sub,tiles,cls){var s=el("section",cls||"");s.append(el("h4","",title),el("p","",sub));var g=el("div","gfa-tiles"+(tiles.length===3?" is-three":""));g.setAttribute("role","group");g.setAttribute("aria-label",title);tiles.forEach(function(t){g.append(t);});s.append(g);return s;}
    function tile(label,small,on,preview,act){var b=el("button","gfa-tile");b.type="button";b.setAttribute("aria-pressed",String(on));var s=el("strong","",label);b.append(preview,s,el("small","",small));b.addEventListener("click",function(){act();setTimeout(appearance,60);});return b;}
    var modeS=section(t2("Mode d’affichage","Display mode"),t2("Clair pour la journée, sombre pour le soir.","Light for daytime, dark for the evening."),[
      tile(t2("Automatique","Automatic"),t2("Suit le réglage du téléphone","Follows your phone"),pref==="auto",prevAuto(layout),function(){var b=document.querySelector('[data-mode-option="auto"]');if(b)b.click();}),
      tile(t2("Clair","Light"),t2("Fond crème, carte sombre","Cream background"),pref==="light",prev("light",layout),function(){var b=document.querySelector('[data-mode-option="light"]');if(b)b.click();}),
      tile(t2("Sombre","Dark"),t2("Reposant pour les yeux","Easy on the eyes"),pref==="dark",prev("dark",layout),function(){var b=document.querySelector('[data-mode-option="dark"]');if(b)b.click();})]);
    var tog=byId("interfaceLayoutToggle");
    function setLayout(want){if(!tog)return;var on=tog.getAttribute("aria-checked")==="true";if(on!==want)tog.click();}
    var layS=section(t2("Disposition","Layout"),t2("Où se trouve la navigation sur ordinateur.","Where navigation sits on desktop."),[
      tile(t2("Barre en haut","Top bar"),t2("Simple et compacte","Simple and compact"),layout==="top",prev(mode,"top"),function(){setLayout(false);}),
      tile(t2("Menu latéral","Side menu"),t2("Tout à portée de clic","Everything one click away"),layout==="side",prev(mode,"side"),function(){setLayout(true);})],"gfa-layout");
    box.replaceChildren(modeS,layS);
    var home=byId("gfhSettings");if(home&&home.previousSibling!==box){box.after(home);}
  }

  function start(){
    hookCustomSelect();objectiveSelects();appearance();
    var form=byId("objectiveForm");if(form&&window.MutationObserver)new MutationObserver(function(){objectiveSelects();}).observe(form,{childList:true,subtree:true});
    document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest('[data-settings-view="appearance"]'))setTimeout(appearance,30);});
    window.addEventListener("gf:languagechange",function(){appearance();});
    setTimeout(function(){hookCustomSelect();objectiveSelects();appearance();},1300);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
