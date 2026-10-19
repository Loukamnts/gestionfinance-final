/* Abonnements détectés dans les relevés bancaires importés.
   Tout est calculé sur l'appareil, à partir des opérations importées (rien n'est envoyé).
   Règles (on préfère en rater un plutôt qu'en inventer) :
   - service connu (Netflix, Spotify, opérateurs, salles de sport…) : vu au moins 2 mois, montant stable (facture
     de téléphone : à 2,5 fois près) ;
   - autre marchand : vu au moins 3 mois d'affilée (un trou d'un mois toléré), une seule fois par mois, même montant
     (un seul changement de prix toléré), et jamais dans courses, restaurants, transports, shopping, loyer, impôts…
   Un même service est regroupé même si la banque change la référence du libellé chaque mois.
   Un abonnement plus prélevé depuis 2 mois sort du total. */
(function(){
  "use strict";
  var KEY="personalFinanceDashboard.subscriptions",TUTO="personalFinanceDashboard.subsTutoDone";
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  // Nom de marchand : jamais traduit (« Free » ne doit pas devenir « Gratuit »).
  function nameEl(tag,cls,text){var n=el(tag,cls,text);n.setAttribute("translate","no");return n;}
  function eur(v){return new Intl.NumberFormat(en()?"en-IE":"fr-FR",{style:"currency",currency:"EUR"}).format(v);}
  function lsGet(k){try{return window.safeStore.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{window.safeStore.setItem(k,v);}catch(e){}}
  function mk(y,m){return y*12+m;}
  function norm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function pretty(m){return String(m||"").split(" ").map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(" ");}
  // Services connus : [clé, nom affiché, motif]. Le nom sert de clé : « NETFLIX.COM 8YH2 » et « NETFLIX 77QK » = Netflix.
  var BRANDS=[["netflix","Netflix",/netflix/],["spotify","Spotify",/spotify/],["deezer","Deezer",/deezer/],["disney","Disney+",/disney ?(plus|\+)|disneyplus/],
    ["canal","Canal+",/canal ?\+|canalplus|canal plus/],["amazon prime","Amazon Prime",/amazon prime|prime video|amzn prime|primevideo/],
    ["apple","Apple",/apple\.com|itunes|icloud/],["google","Google",/google (one|storage|play)|youtube premium|youtube music/],
    ["free","Free",/free mobile|free telecom|freebox/],["orange","Orange",/\borange\b|\bsosh\b/],["sfr","SFR",/\bsfr\b|red by sfr/],
    ["bouygues","Bouygues Telecom",/bouygues|b ?& ?you/],["basic fit","Basic-Fit",/basic.?fit/],["fitness park","Fitness Park",/fitness park/],
    ["keep cool","Keep Cool",/keep cool/],["audible","Audible",/audible/],["chatgpt","ChatGPT",/chatgpt|openai/],["navigo","Navigo",/navigo|imagine ?r/]];
  // Un achat en boutique (« ORANGE BOUTIQUE », « APPLE STORE ») n'est pas un abonnement.
  function brandOf(label){var l=norm(label);if(/\b(boutique|store|shop|magasin|agence)\b/.test(l))return null;for(var i=0;i<BRANDS.length;i++)if(BRANDS[i][2].test(l))return BRANDS[i];return null;}
  // Apple et Google vendent plusieurs abonnements (iCloud, Music, TV, One…) : un par produit, ou par montant.
  var PRODUCTS={apple:[["icloud","iCloud"],["music","Music"],["tv","TV"],["arcade","Arcade"],["fitness","Fitness"],["one","One"]],google:[["one","One"],["youtube","YouTube"],["storage","One"]]},PKEY={storage:"one"};
  function slotOf(b,op){
    if(!PRODUCTS[b[0]])return[b[0],b[1]];var l=norm(op.label+(op.detail?" "+op.detail:""));
    for(var i=0;i<PRODUCTS[b[0]].length;i++){var pr=PRODUCTS[b[0]][i];if(new RegExp("\\b"+pr[0]+"\\b").test(l))return[b[0]+" "+(PKEY[pr[0]]||pr[0]),b[1]+" "+pr[1],false];}
    // Libellé sans produit (« APPLE.COM/BILL ») : un seul « Apple », plusieurs prélèvements par mois acceptés,
    // mais 3 mois au moins (des achats ponctuels ne doivent pas passer pour un abonnement).
    return[b[0],b[1],true];
  }
  // Catégories où un prélèvement régulier n'est jamais un abonnement (une ligne créée par toi peut l'être).
  var NOT_SUB_CAT=/^(Courses|Groceries|Restaurants|Transports|Transport|Shopping|Loyer|Rent|Impôts|Taxes|Retraits|Cash withdrawals|Frais bancaires|Bank fees|Voyages|Travel|Salaire|Salary|Épargne|Savings|Aides \(CAF\)|Benefits \(CAF\)|Autres revenus|Other income|Crédits|Loans|Santé|Health)$/;
  // Jamais des abonnements, même réguliers : prêts, cotisations sociales, pension alimentaire, recharges, paiements entre personnes.
  var NOT_SUB_LABEL=/urssaf|pension alimentaire|recharg|izly|lydia|paylib|\bwero\b|paypal|\bpret\b|credit|echeance|cotisations? sociales|impot|amende/;
  // Ancienne mémoire : clés recalculées (une marque = une clé) et doublons fusionnés.
  function load(){
    var d;try{d=JSON.parse(lsGet(KEY)||"{}");}catch(e){d=null;}if(!d||!d.items||typeof d.items!=="object")return{v:2,items:{}};
    if(d.v===2)return d;
    var items={},hb={},B=window.GFBankImport;
    // Les anciennes clés ont perdu la ponctuation (« apple com bill », « canal ») : on la remet pour reconnaître la marque.
    var dotted=function(k){return String(k||"").replace(/ com\b/g,".com").replace(/^canal\b/,"canal+").replace(/\bb you\b/,"b&you");};
    Object.keys(d.items).forEach(function(k){
      var it=d.items[k],b=brandOf(dotted(k))||brandOf(k)||brandOf(it.name),nk=b?b[0]:k,cur=items[nk],cat=it.cat||null;
      if(b&&it.hidden)hb[b[0]]=true;
      if(!b&&!cat&&B){try{var c=B.categorize({label:k,amount:-1},B.learned());cat=c?c[0]:null;}catch(e){}}
      if(!b&&cat&&NOT_SUB_CAT.test(cat))return;// ancien relevé : courses, restaurants… ne sont pas repris
      if(!cur){items[nk]={name:b?b[1]:it.name,known:!!b,cat:cat,months:{},hidden:!!it.hidden};cur=items[nk];}else cur.hidden=cur.hidden||!!it.hidden;
      Object.keys(it.months||{}).forEach(function(m){var v=it.months[m],o=cur.months[m];cur.months[m]=o?[Math.round((o[0]+v[0])*100)/100,o[1]+v[1]]:[v[0],v[1]];});
    });
    // Sans le module d'import (cas anormal), on ne fige pas une migration incomplète.
    return{v:2,items:items,last:d.last||0,hb:hb,_noSave:!B};
  }
  function save(d){if(d._noSave)return;d.v=2;lsSet(KEY,JSON.stringify(d));}

  /* Appelé après un import : mémorise, par service et par mois, le montant et le nombre de prélèvements. */
  function ingest(ops){
    var B=window.GFBankImport;if(!B||!ops||!ops.length)return 0;
    var d=load(),per={};
    // Dernier mois importé (même sans abonnement dedans) : sert à savoir qu'un abonnement s'est arrêté.
    ops.forEach(function(op){if(op.date)d.last=Math.max(d.last||0,mk(op.date.y,op.date.m));});
    ops.forEach(function(op){
      if(!(op.amount<0))return;
      var c=B.categorize(op,B.learned());if(!c||c[2]!=="Dépense")return;// virement, revenu ou épargne
      var b=brandOf(op.label+(op.detail?" "+op.detail:""));if(!b&&B.transferLabel&&B.transferLabel(op.label))return;// virement à une personne : jamais un abonnement
      if(!b&&(NOT_SUB_CAT.test(c[0])||NOT_SUB_LABEL.test(norm(op.label+(op.detail?" "+op.detail:"")))))return;// courses, loyer, essence… reviennent chaque mois sans être des abonnements
      var sl=b?slotOf(b,op):null,m=sl?sl[0]:B.merchantOf(op.label);if(!m)return;
      var k=mk(op.date.y,op.date.m),slot=(per[m]=per[m]||{name:sl?sl[1]:pretty(m),known:!!b,multi:!!(sl&&sl[2]),brand:b?b[0]:null,cat:c[0],months:{}});
      var cur=slot.months[k]||(slot.months[k]=[0,0]);cur[0]+=-op.amount;cur[1]++;
    });
    Object.keys(per).forEach(function(m){
      var isNew=!d.items[m],it=d.items[m]||(d.items[m]={name:per[m].name,known:false,months:{},hidden:false});
      it.known=it.known||per[m].known;it.cat=per[m].cat;it.name=per[m].name;it.multi=per[m].multi;
      if(isNew&&per[m].multi!==false&&m===per[m].brand&&d.hb&&d.hb[per[m].brand])it.hidden=true;// « Ce n'est pas un abonnement » choisi avant la mise à jour
      // Un mois réimporté remplace l'ancien (même relevé importé deux fois)
      Object.keys(per[m].months).forEach(function(k){var v=per[m].months[k];it.months[k]=[Math.round(v[0]*100)/100,v[1]];});
      // On garde 18 mois au plus
      var ks=Object.keys(it.months).map(Number).sort(function(a,b){return a-b;});ks.slice(0,Math.max(0,ks.length-18)).forEach(function(k){delete it.months[k];});
    });
    // Les marchands vus une seule fois depuis longtemps ne servent à rien : on les oublie
    var latest=0;Object.keys(d.items).forEach(function(m){Object.keys(d.items[m].months).forEach(function(k){latest=Math.max(latest,Number(k));});});
    Object.keys(d.items).forEach(function(m){var it=d.items[m],ks=Object.keys(it.months).map(Number);if(ks.length<2&&latest-Math.max.apply(null,ks)>3)delete d.items[m];});
    save(d);return list().length;
  }

  // Apple/Google sans produit : la plupart des mois (2 sur 3) au même montant, à 10 % près ; un achat ponctuel
  // un mois donné ne compte pas, des petits achats au hasard non plus.
  function median(v){var a=v.slice().sort(function(x,y){return x-y;}),h=Math.floor(a.length/2);return a.length%2?a[h]:(a[h-1]+a[h])/2;}
  function steady(vals){var md=median(vals);return md>0&&vals.filter(function(v){return Math.abs(v-md)<=md*0.1;}).length>=Math.ceil(vals.length*2/3);}
  // Est-ce vraiment un abonnement ? (voir les règles en haut du fichier)
  function isSub(it,ks){
    var n=ks.length;if(n<(it.known?2:3))return false;
    var vals=ks.map(function(k){return it.months[k][0];}),mx=Math.max.apply(null,vals),mn=Math.min.apply(null,vals);if(!(mn>0))return false;
    if(it.known){if(it.multi)return n>=3&&steady(vals);return ks.every(function(k){return it.months[k][1]<=2;})&&mx/mn<=2.5;}
    if(it.cat&&NOT_SUB_CAT.test(it.cat))return false;
    if(!ks.every(function(k){return it.months[k][1]===1;}))return false;
    var gaps=0,changes=0;
    for(var i=1;i<n;i++){var g=ks[i]-ks[i-1];if(g>2)return false;if(g===2)gaps++;var a=vals[i-1],b=vals[i];if(Math.abs(b-a)>Math.max(0.5,a*0.03))changes++;}
    return gaps<=1&&changes<=1&&mx/mn<=1.5;
  }

  /* Abonnements détectés, du plus cher au moins cher. */
  function list(includeHidden){
    var d=load(),latest=d.last||0,out=[];
    Object.keys(d.items).forEach(function(m){Object.keys(d.items[m].months).forEach(function(k){latest=Math.max(latest,Number(k));});});
    Object.keys(d.items).forEach(function(m){
      var it=d.items[m],ks=Object.keys(it.months).map(Number).sort(function(a,b){return a-b;});if(!ks.length)return;
      if(!isSub(it,ks))return;
      var last=ks[ks.length-1],amount=it.months[last][0],prev=ks.length>1?it.months[ks[ks.length-2]][0]:null;
      var rise=prev!=null&&amount-prev>=0.5&&amount>prev*1.02?Math.round((amount-prev)*100)/100:0;
      if(it.multi){amount=Math.round(median(ks.slice(-3).map(function(k){return it.months[k][0];}))*100)/100;rise=0;}// montant habituel, sans l'achat ponctuel
      var active=latest-last<=1;
      if(it.hidden&&!includeHidden)return;
      out.push({key:m,name:it.name,amount:amount,yearly:Math.round(amount*12*100)/100,rise:rise,active:active,hidden:!!it.hidden,since:ks.length,lastKey:last});
    });
    return out.sort(function(a,b){return (b.active-a.active)||b.amount-a.amount;});
  }
  function setHidden(key,v){var d=load();if(d.items[key]){d.items[key].hidden=!!v;save(d);}}
  function totals(items){var act=items.filter(function(i){return i.active&&!i.hidden;});var m=act.reduce(function(s,i){return s+i.amount;},0);return{month:Math.round(m*100)/100,year:Math.round(m*1200)/100,count:act.length};}

  /* ── Panneau de l'accueil ── */
  var MN=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"],MNE=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function monthName(k){var m=k%12,y=Math.floor(k/12);return (en()?MNE[m]:MN[m])+" "+y;}
  function riseBadge(r){var b=el("span","gfs-rise","↑ +"+eur(r));b.title=t2("Le prix a augmenté par rapport au mois précédent","The price went up compared with the previous month");return b;}
  function panel(){
    var items=list();if(!items.length)return null;
    var tot=totals(items),box=el("div","gfh-panel gfs-panel");box.id="gfsPanel";
    var head=el("div","gfh-row");head.append(el("h3","",t2("Tes abonnements","Your subscriptions")),el("span","gfh-muted",t2("détectés dans tes relevés","found in your statements")));
    var sum=el("div","gfs-sum");sum.id="gfsTotal";
    var a=el("div");a.append(el("span","gfs-k",t2("Par mois","Per month")),el("b","gfs-v",eur(tot.month)));
    var b=el("div");b.append(el("span","gfs-k",t2("Sur un an","Per year")),el("b","gfs-v",eur(tot.year)));
    var c=el("div");c.append(el("span","gfs-k",t2("Abonnements","Subscriptions")),el("b","gfs-v",String(tot.count)));
    sum.append(a,b,c);
    var ul=el("div","gfs-list");
    items.filter(function(i){return i.active;}).slice(0,4).forEach(function(i,n){
      var r=el("button","gfs-row");r.type="button";if(n===0)r.id="gfsFirst";
      var nm=nameEl("span","gfs-name",i.name);r.append(nm);if(i.rise)r.append(riseBadge(i.rise));r.append(el("span","gfs-amt",eur(i.amount)));
      r.addEventListener("click",function(){openAll(i.key);});ul.append(r);
    });
    var all=el("button","gfh-link gfs-all",t2("Tout voir et gérer","See and manage all")+" ("+items.length+")");all.type="button";all.addEventListener("click",function(){openAll();});
    box.append(head,sum,ul,all);return box;
  }

  /* ── Liste complète : retirer ce qui n'est pas un abonnement, le remettre ── */
  function openAll(focusKey){
    if(byId("gfsDialog"))return;
    var d=el("dialog","gfh-dialog gfs-dialog");d.id="gfsDialog";d.setAttribute("aria-labelledby","gfsTitle");
    var h=el("h2","",t2("Tes abonnements","Your subscriptions"));h.id="gfsTitle";
    var lead=el("p","gfh-muted"),body=el("div","gfs-all-list"),showHidden=false;
    var close=el("button","gfh-btn is-primary",t2("Fermer","Close"));close.type="button";close.addEventListener("click",function(){d.close();});
    var row=el("div","gfh-dialog-actions");row.append(close);
    function draw(){
      var items=list(true),vis=items.filter(function(i){return !i.hidden;}),hid=items.filter(function(i){return i.hidden;}),tot=totals(items);
      lead.textContent=t2(tot.count+" abonnement"+(tot.count>1?"s":"")+" en cours : "+eur(tot.month)+" par mois, soit "+eur(tot.year)+" sur un an.",tot.count+" active subscription"+(tot.count>1?"s":"")+": "+eur(tot.month)+" a month, "+eur(tot.year)+" a year.");
      var nodes=[];
      vis.forEach(function(i){
        var it=el("div","gfs-item"+(i.active?"":" is-old"));if(i.key===focusKey)it.classList.add("is-focus");
        var top=el("div","gfs-item-top");var nm=nameEl("strong","",i.name);top.append(nm);if(i.rise)top.append(riseBadge(i.rise));top.append(el("b","gfs-amt",eur(i.amount)));
        var meta=el("small","gfh-muted",i.active?t2(eur(i.yearly)+" sur un an · vu "+i.since+" mois",eur(i.yearly)+" a year · seen "+i.since+" month"+(i.since>1?"s":"")):t2("Plus prélevé depuis "+monthName(i.lastKey),"Not charged since "+monthName(i.lastKey)));
        var rm=el("button","gfh-link gfs-rm",t2("Ce n’est pas un abonnement","Not a subscription"));rm.type="button";rm.addEventListener("click",function(){setHidden(i.key,true);draw();refresh();});
        it.append(top,meta,rm);nodes.push(it);
      });
      if(!vis.length)nodes.push(el("p","gfh-muted",t2("Aucun abonnement affiché.","No subscription shown.")));
      if(hid.length){
        var tg=el("button","gfh-link gfs-toggle",(showHidden?t2("Masquer","Hide"):t2("Voir","Show"))+t2(" les éléments retirés"," removed items")+" ("+hid.length+")");tg.type="button";tg.addEventListener("click",function(){showHidden=!showHidden;draw();});nodes.push(tg);
        if(showHidden)hid.forEach(function(i){var it=el("div","gfs-item is-hidden");var top=el("div","gfs-item-top");top.append(nameEl("strong","",i.name),el("b","gfs-amt",eur(i.amount)));var back=el("button","gfh-link gfs-rm",t2("C’est un abonnement","It is a subscription"));back.type="button";back.addEventListener("click",function(){setHidden(i.key,false);draw();refresh();});it.append(top,back);nodes.push(it);});
      }
      body.replaceChildren.apply(body,nodes);
    }
    d.append(h,lead,body,row);d.addEventListener("close",function(){d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
    document.body.append(d);draw();d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
    var f=d.querySelector(".is-focus");if(f)f.scrollIntoView({block:"center"});
  }
  function refresh(){if(window.GFHome&&window.GFHome.render)window.GFHome.render();}

  /* ── Petit tutoriel (3 repères), une seule fois, la première fois que des abonnements apparaissent ── */
  function afterRender(){
    if(lsGet(TUTO)==="1"||!byId("gfsPanel"))return;
    if(document.body.dataset.page!=="dashboard"||document.body.classList.contains("tutorial-active")||document.querySelector("dialog[open],.gfd-coach"))return;
    // Une autre carte ou un message est affiché (« Relevé importé… ») : on attend qu'il parte.
    if(window.GFPopup&&window.GFPopup.busy()){if((afterRender.n=(afterRender.n||0)+1)<20)setTimeout(afterRender,1500);return;}
    afterRender.n=0;
    var D=window.GFDiscover;if(!D||!D.coach)return;
    lsSet(TUTO,"1");
    var steps=[
      ["gfsPanel",t2("Nouveau : Meuniance a repéré tes abonnements dans ton relevé, les prélèvements qui reviennent chaque mois.","New: Meuniance found your subscriptions in your statement, the charges that come back every month.")],
      ["gfsTotal",t2("Leur coût par mois et sur un an, pour voir d’un coup d’œil ce qu’ils pèsent.","Their cost per month and per year, to see at a glance what they weigh.")],
      ["gfsFirst",t2("Touche un abonnement pour le retirer si ce n’en est pas un. « ↑ » signale une hausse de prix.","Tap a subscription to remove it if it isn’t one. “↑” flags a price rise.")]
    ].filter(function(s){return byId(s[0]);});
    // Pendant le tutoriel (et entre deux repères), aucune autre invitation ne doit s'afficher.
    (function go(i){if(i>=steps.length){window.__gfCoachUntil=0;return;}window.__gfCoachUntil=Date.now()+20000;D.coach(byId(steps[i][0]),steps[i][1],{step:i+1,total:steps.length,last:i===steps.length-1,onNext:function(){go(i+1);}});})(0);
  }

  window.GFSubs={ingest:ingest,list:list,totals:totals,panel:panel,openAll:openAll,afterRender:afterRender,setHidden:setHidden};
})();
