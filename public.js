(function(){
  "use strict";
  var key="personalFinanceDashboard.theme";
  var allowed=["glass","editorial","brutal"];
  var buttons=Array.from(document.querySelectorAll("[data-public-theme]"));
  function read(){try{var value=localStorage.getItem(key);return allowed.indexOf(value)>=0?value:"glass";}catch(error){return "glass";}}
  function apply(theme,persist){
    if(allowed.indexOf(theme)<0)theme="glass";
    document.documentElement.dataset.theme=theme;
    buttons.forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.publicTheme===theme));});
    if(persist)try{localStorage.setItem(key,theme);}catch(error){}
  }
  buttons.forEach(function(button){button.addEventListener("click",function(){apply(button.dataset.publicTheme,true);});});
  apply(read(),false);
  if("IntersectionObserver" in window){
    var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}});},{threshold:.13});
    document.querySelectorAll(".reveal").forEach(function(element){observer.observe(element);});
  }else document.querySelectorAll(".reveal").forEach(function(element){element.classList.add("is-visible");});
})();
