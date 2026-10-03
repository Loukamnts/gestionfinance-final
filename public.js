(function(){
  "use strict";
  var key="personalFinanceDashboard.theme";
  var paletteKey="personalFinanceDashboard.palette";
  var allowed=["glass","editorial","brutal"];
  var buttons=Array.from(document.querySelectorAll("[data-public-theme]"));
  var paletteButtons=Array.from(document.querySelectorAll("[data-public-palette]"));
  function read(){try{var value=localStorage.getItem(key);return allowed.indexOf(value)>=0?value:"glass";}catch(error){return "glass";}}
  function apply(theme,persist){
    if(allowed.indexOf(theme)<0)theme="glass";
    document.documentElement.dataset.theme=theme;
    buttons.forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.publicTheme===theme));});
    if(persist)try{localStorage.setItem(key,theme);}catch(error){}
  }
  function readPalette(theme){try{var value=localStorage.getItem(paletteKey);return ["violet","bordeaux","gold"].indexOf(value)>=0?value:({glass:"violet",editorial:"bordeaux",brutal:"gold"})[theme];}catch(error){return "violet";}}
  function applyPalette(palette,persist){
    if(["violet","bordeaux","gold"].indexOf(palette)<0)palette="violet";
    document.documentElement.dataset.palette=palette;
    paletteButtons.forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.publicPalette===palette));});
    if(persist)try{localStorage.setItem(paletteKey,palette);}catch(error){}
  }
  buttons.forEach(function(button){button.addEventListener("click",function(){apply(button.dataset.publicTheme,true);});});
  paletteButtons.forEach(function(button){button.addEventListener("click",function(){applyPalette(button.dataset.publicPalette,true);});});
  var initialTheme=read();
  apply(initialTheme,false);
  applyPalette(readPalette(initialTheme),true);
  if("IntersectionObserver" in window){
    var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}});},{threshold:.13});
    document.querySelectorAll(".reveal").forEach(function(element){observer.observe(element);});
  }else document.querySelectorAll(".reveal").forEach(function(element){element.classList.add("is-visible");});
})();
