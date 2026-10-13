/* Pages publiques : identité unique « Le Moulin ». Seul le mode clair/sombre choisi dans l’application est repris ;
   sinon la page suit le réglage du système. Chargé sans defer pour éviter un flash de couleurs. */
(function(){
  "use strict";
  var modeKey="personalFinanceDashboard.mode";
  try{var m=localStorage.getItem(modeKey);if(m==="light"||m==="dark")document.documentElement.dataset.mode=m;}catch(error){}
})();
