/* Bilan de l'année : des écrans façon « stories », calculés avec les chiffres de chaque utilisateur.
   - Une carte apparaît sur l'accueil du 1er décembre au 31 janvier (au moins 3 mois remplis dans l'année).
   - /accueil?bilan (ou ?bilan=2026) l'ouvre à tout moment, pour l'année demandée.
   - Les écrans sans données sont sautés (pas d'objectif → pas d'écran Objectifs, etc.).
   - Chaque écran dure 6 s ; toucher à droite avance, à gauche recule ; un appui long met en pause.
   - La carte à partager ne contient aucun montant. */
(function(){
  "use strict";
  var DURATION=6000,HOLD=220,HIDE_KEY="personalFinanceDashboard.yearReview";
  var MN=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  var MN_EN=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var MS=["J","F","M","A","M","J","J","A","S","O","N","D"];
  var MA=["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."];
  var MA_EN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function mname(i){return en()?MN_EN[i]:MN[i];}
  function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
  function eur(v){return new Intl.NumberFormat(en()?"en-IE":"fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Math.round(v));}
  function pctTxt(v){if(Math.abs(v)<1)return t2("Stable","Steady");return (v>=0?"+":"−")+Math.abs(Math.round(v))+(en()?"%":" %");}
  function store(){return window.safeStore||null;}
  function hidden(){try{var v=JSON.parse((store()&&store().getItem(HIDE_KEY))||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function setHidden(v){try{store()&&store().setItem(HIDE_KEY,JSON.stringify(v));}catch(e){}}

  /* ── Les chiffres de l'année (fonction pure, testée) ───────────────────────────
     months : [{year, mi, salary, expenses, savings, cats:[{name,value}]}]
     ctx    : {goals:[{title,target,current}], entries, prevSaved, partial} */
  var LEISURE=/loisir|sortie|restau|resto|voyage|vacance|bar\b|cin[eé]|concert|shopping|leisure|travel|holiday|going out/i;
  var HOUSING=/loyer|logement|rent\b|housing|cr[eé]dit immo|mortgage/i;
  function compute(months,year,ctx){
    ctx=ctx||{};
    var by=new Array(12).fill(null);
    (months||[]).forEach(function(m){if(Number(m.year)!==year||m.mi<0||m.mi>11)return;var s=Number(m.salary)||0,x=Math.abs(Number(m.expenses)||0),v=Math.abs(Number(m.savings)||0);if(!(s||x||v))return;by[m.mi]={mi:m.mi,salary:s,expenses:x,savings:v,cats:m.cats||[]};});
    var act=by.filter(Boolean);if(!act.length)return null;
    var income=0,spent=0,saved=0,regular=0,deficit=0,cats={};
    act.forEach(function(m){income+=m.salary;spent+=m.expenses;saved+=m.savings;if(m.savings>0)regular++;if(m.salary>0&&m.expenses>m.salary)deficit++;
      m.cats.forEach(function(c){var n=String(c&&c.name||"").trim();if(!n)return;cats[n]=(cats[n]||0)+Math.abs(Number(c.value)||0);});});
    var first=act[0].mi,last=act[act.length-1].mi,run=0,cumul=by.map(function(m,i){if(i>last||i<first)return null;run+=m?m.savings:0;return run;});
    // Meilleur mois : ce qui reste (revenus − dépenses) quand il y a des revenus, sinon l'épargne du mois.
    var withIncome=act.filter(function(m){return m.salary>0;}),best=null;
    if(withIncome.length){withIncome.forEach(function(m){var k=m.salary-m.expenses;if(k>0&&(!best||k>best.kept))best={mi:m.mi,kept:k,income:m.salary};});}
    if(!best){act.forEach(function(m){if(m.savings>0&&(!best||m.savings>best.saved))best={mi:m.mi,saved:m.savings};});}
    var kept=by.map(function(m){if(!m)return null;return best&&best.kept!=null?Math.max(0,m.salary-m.expenses):m.savings;});
    var catTotal=Object.keys(cats).reduce(function(a,k){return a+cats[k];},0);
    var catList=Object.keys(cats).map(function(k){return{name:k,value:cats[k],share:catTotal?cats[k]/catTotal:0};}).filter(function(c){return c.value>0;}).sort(function(a,b){return b.value-a.value;});
    var leisure=catList.filter(function(c){return LEISURE.test(c.name);}).reduce(function(a,c){return a+c.share;},0);
    var goals=(ctx.goals||[]).filter(function(g){return g&&Number(g.target)>0;}).map(function(g){var pc=Math.max(0,Math.min(100,Math.round((Number(g.current)||0)/Number(g.target)*100)));return{title:String(g.title||"").slice(0,40),pc:pc,reached:pc>=100};});
    var reached=goals.filter(function(g){return g.reached;}).length;
    var rate=income>0?saved/income:0,n=act.length,profile;
    if(n>=3&&rate>=0.2&&regular/n>=0.6)profile="builder";
    else if(n>=3&&regular/n>=0.75)profile="squirrel";
    else if(deficit>=Math.max(2,Math.ceil(n/3)))profile="tightrope";
    else if(leisure>=0.2)profile="bonvivant";
    else profile="explorer";
    var prev=Number(ctx.prevSaved);
    return{year:year,partial:!!ctx.partial,months:by,active:n,income:income,spent:spent,saved:saved,avgSaved:n?saved/n:0,
      delta:prev>0&&saved>0?(saved-prev)/prev*100:null,cumul:cumul,best:best,kept:kept,cats:catList,catTotal:catTotal,
      goals:goals,reached:reached,regular:regular,deficit:deficit,profile:profile,entries:Math.max(0,Number(ctx.entries)||0)};
  }
  var PROFILES={
    builder:{fr:"Le bâtisseur",en:"The builder",dfr:"Tu mets une belle part de tes revenus de côté, mois après mois.",den:"You put a good share of your income aside, month after month.",tfr:["Ambitieux","Discipliné","Patient"],ten:["Ambitious","Disciplined","Patient"]},
    squirrel:{fr:"L’écureuil prévoyant",en:"The far-sighted squirrel",dfr:"Tu épargnes un peu chaque mois, sans à-coups.",den:"You save a little every month, steadily.",tfr:["Régulier","Prudent","Constant"],ten:["Steady","Careful","Consistent"]},
    tightrope:{fr:"L’équilibriste",en:"The tightrope walker",dfr:"Certains mois ont été serrés, et tu as tenu le cap.",den:"Some months were tight, and you held your course.",tfr:["Débrouillard","Souple","Résilient"],ten:["Resourceful","Flexible","Resilient"]},
    bonvivant:{fr:"L’épicurien",en:"The bon vivant",dfr:"Tu sais te faire plaisir, et tu sais où part ton argent.",den:"You know how to treat yourself, and where your money goes.",tfr:["Curieux","Généreux","Vivant"],ten:["Curious","Generous","Lively"]},
    explorer:{fr:"L’explorateur",en:"The explorer",dfr:"Tu as pris tes finances en main cette année : chaque saisie compte.",den:"You took charge of your money this year: every entry counts.",tfr:["Curieux","Attentif","En progrès"],ten:["Curious","Attentive","Improving"]}
  };
  function prof(r){var p=PROFILES[r.profile]||PROFILES.explorer;return{name:en()?p.en:p.fr,desc:en()?p.den:p.dfr,tags:en()?p.ten:p.tfr};}

  /* ── Lecture des données de l'appli ───────────────────────────────────────── */
  function homeMonths(){
    try{var d=window.__gfHomeData&&window.__gfHomeData();return((d&&d.all)||[]).filter(function(m){return m.year&&m.mi>=0;}).map(function(m){return{year:Number(m.year),mi:m.mi,salary:Number(m.salary||0),expenses:Math.abs(Number(m.expenses||0)),savings:Math.abs(Number(m.savingsTotal!=null?m.savingsTotal:m.savings)||0),cats:m.cats||[]};});}catch(e){return[];}
  }
  function goalsNow(){
    var p={};try{p=JSON.parse((store()&&store().getItem("personalFinanceDashboard.setupProfile"))||"{}")||{};}catch(e){}
    var srcs=[];try{srcs=window.FinanceSheet&&window.FinanceSheet.getObjectiveSources?window.FinanceSheet.getObjectiveSources():[];}catch(e){}
    return(Array.isArray(p.objectives)?p.objectives:[]).filter(function(g){return g&&!g.archived&&Number(g.target)>0;}).map(function(g){var s=g.sourceId&&srcs.filter(function(x){return x.id===g.sourceId;})[0];return{title:g.title,target:Number(g.target),current:s?Number(s.value):Number(g.current||0)};});
  }
  function entries(year){
    try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();var n=0;
      ((snap&&snap.sheets)||[]).forEach(function(sh){var y=String(sh&&sh.name||"").match(/(19|20|21)\d{2}/);if(!y||Number(y[0])!==year)return;
        Object.keys(sh.cells||{}).forEach(function(k){var c=Number(k.split(",")[1]),raw=sh.cells[k]&&sh.cells[k].raw;if(c>=0&&c<12&&raw!=null&&String(raw).trim()!=="")n++;});});
      return n;}catch(e){return 0;}
  }
  function build(year){
    var all=homeMonths(),now=new Date();
    var prevSaved=0,prevActive=0;all.forEach(function(m){if(m.year===year-1&&(m.salary||m.expenses||m.savings)){prevActive++;prevSaved+=m.savings;}});
    return compute(all,year,{goals:goalsNow(),entries:entries(year),prevSaved:prevActive>=3?prevSaved:0,partial:year===now.getFullYear()&&now.getMonth()<11});
  }
  function demo(){try{return !!(store()&&store().getItem("personalFinanceDashboard.homeDemo")==="1");}catch(e){return false;}}
  // Décembre : l'année en cours. Janvier : l'année qui vient de finir. Sinon, pas de carte.
  function seasonYear(d){d=d||new Date();return d.getMonth()===11?d.getFullYear():d.getMonth()===0?d.getFullYear()-1:null;}

  /* ── Les écrans ───────────────────────────────────────────────────────────── */
  function money(v,cls){var s=el("span","gf-amount"+(cls?" "+cls:""),eur(v));return s;}
  function tag(text){return el("span","gfy-tag",text);}
  function title(text,cls){var h=el("h2","gfy-title"+(cls?" "+cls:""));String(text).split("\n").forEach(function(line,i){if(i)h.append(el("br"));h.append(document.createTextNode(line));});return h;}
  function para(nodes){var p=el("p","gfy-text");(Array.isArray(nodes)?nodes:[nodes]).forEach(function(n){p.append(typeof n==="string"?document.createTextNode(n):n);});return p;}
  function barsBox(values,hi,labels,label,badge){
    var box=el("div","gfy-chart"),head=el("div","gfy-chart-head");head.append(el("span","",label));if(badge)head.append(el("b","",badge));
    var max=Math.max.apply(null,values.map(function(v){return v||0;}).concat([1])),row=el("div","gfy-bars");row.setAttribute("aria-hidden","true");
    values.forEach(function(v,i){var col=el("div","gfy-bar"+(i===hi?" is-hi":"")+(v==null?" is-none":"")),b=el("i");b.style.height=(v==null?4:Math.max(6,Math.round(v/max*100)))+"%";col.append(b);if(labels)col.append(el("span","",labels[i]));row.append(col);});
    box.append(head,row);return box;
  }
  function screens(r){
    var list=[],y=r.year,P=prof(r),abbr=en()?MA_EN:MA;
    // 1. Ouverture
    list.push({key:"intro",look:"forest",render:function(b){
      b.append(tag(r.partial?t2("TON ANNÉE JUSQU’ICI","YOUR YEAR SO FAR"):t2("TON ANNÉE","YOUR YEAR")),title(t2(y+",\nc’était\ntoi.",y+",\nthat was\nyou."),"is-xl"),para(t2("Voici ce que tes chiffres racontent sur ton année.","Here is what your numbers say about your year.")));
      var tiles=el("div","gfy-tiles");function tile(n,l){var d=el("div","gfy-tile");d.append(el("b","",String(n)),el("span","",l));tiles.append(d);}
      tile(r.active,r.active>1?t2("mois suivis","months tracked"):t2("mois suivi","month tracked"));
      if(r.entries)tile(r.entries,r.entries>1?t2("saisies","entries"):t2("saisie","entry"));
      if(r.goals.length)tile(r.goals.length,r.goals.length>1?t2("objectifs","goals"):t2("objectif","goal"));else if(r.cats.length)tile(r.cats.length,r.cats.length>1?t2("catégories","categories"):t2("catégorie","category"));
      b.append(tiles,el("p","gfy-hint",t2("Touche pour continuer","Tap to continue")));
    }});
    // 2. Épargne
    if(r.saved>0)list.push({key:"saved",look:"wheat",render:function(b){
      b.append(tag(t2("ÉPARGNE","SAVINGS")),title(t2("Tu as mis de côté","You put aside")),el("div","gfy-big",""));b.lastChild.append(money(r.saved));
      var txt=t2("Soit ","That’s ")+eur(r.avgSaved)+t2(" par mois en moyenne"," a month on average");
      if(r.delta!=null&&Math.abs(r.delta)<1)txt+=t2(", autant qu’en "+(y-1)+".",", the same as in "+(y-1)+".");
      else if(r.delta!=null)txt+=t2(", "+Math.abs(Math.round(r.delta))+" % de "+(r.delta>=0?"plus":"moins")+" qu’en "+(y-1)+".",", "+Math.abs(Math.round(r.delta))+"% "+(r.delta>=0?"more":"less")+" than in "+(y-1)+".");else txt+=".";
      var p=para(txt);p.classList.add("gf-amount-text");b.append(p);
      var ch=barsBox(r.cumul.filter(function(v){return v!=null;}),r.cumul.filter(function(v){return v!=null;}).length-1,null,t2("Ton épargne, mois après mois","Your savings, month by month"),r.delta!=null?pctTxt(r.delta):null);
      var firstI=r.cumul.findIndex(function(v){return v!=null;}),lastI=r.cumul.reduce(function(a,v,i){return v!=null?i:a;},0),ends=el("div","gfy-chart-ends");ends.append(el("span","",abbr[firstI]));if(lastI-firstI>=2)ends.append(el("span","",abbr[Math.round((firstI+lastI)/2)]));if(lastI>firstI)ends.append(el("span","",abbr[lastI]));ch.append(ends);
      ch.classList.add("is-cumul");b.append(ch);
    }});
    // 3. Meilleur mois
    if(r.best&&r.active>=2)list.push({key:"best",look:"forest",render:function(b){
      b.append(tag(t2("TON MEILLEUR MOIS","YOUR BEST MONTH")),title(cap(mname(r.best.mi)),"is-l"));
      if(r.best.kept!=null)b.append(para([t2("Ton mois le plus économe : ","Your thriftiest month: "),money(r.best.kept),t2(" gardés sur "," kept out of "),money(r.best.income),t2(" de revenus."," of income.")]));
      else b.append(para([t2("Le mois où tu as le plus épargné : ","The month you saved the most: "),money(r.best.saved),"."]));
      b.append(barsBox(r.kept,r.best.mi,MS,r.best.kept!=null?t2("Ce qui t’est resté chaque mois","What you had left each month"):t2("Épargne par mois","Savings per month")));
    }});
    // 4. Dépenses
    if(r.cats.length&&r.catTotal>0)list.push({key:"spend",look:"cream",render:function(b){
      var top=r.cats[0],share=Math.round(top.share*100);
      b.append(tag(t2("OÙ EST PARTI TON ARGENT","WHERE YOUR MONEY WENT")),title(HOUSING.test(top.name)?t2("Le loyer,\nsans surprise.","Rent,\nno surprise."):t2("« "+top.name+" »\nen tête.","“"+top.name+"”\ncomes first.")));
      b.append(para([t2("Ta plus grosse dépense : ","Your biggest expense: "),money(top.value),t2(" sur l’année, soit "," over the year, "),share+(en()?"% of your spending.":" % de tes dépenses.")]));
      var box=el("div","gfy-cats"),colors=["#17261F","#B9553E","#B98112","#5E7F5A"];
      r.cats.slice(0,4).forEach(function(c,i){var row=el("div","gfy-cat"),h=el("div","gfy-cat-h"),nm=el("span","",c.name);nm.setAttribute("translate","no");h.append(nm,el("span","",Math.round(c.share*100)+(en()?"%":" %")));
        var tr=el("div","gfy-cat-track"),f=el("i");f.style.width=Math.max(3,Math.round(c.share/top.share*100))+"%";f.style.background=colors[i];tr.append(f);row.append(h,tr);box.append(row);});
      b.append(box);
    }});
    // 5. Objectifs
    if(r.goals.length)list.push({key:"goals",look:"navy",render:function(b){
      var n=r.goals.length,k=r.reached;
      b.append(tag(t2("OBJECTIFS","GOALS")),title(k?t2(k+" objectif"+(k>1?"s":"")+"\natteint"+(k>1?"s":"")+" sur "+n,k+" goal"+(k>1?"s":"")+"\nreached out of "+n):t2(n>1?n+" objectifs\nen cours":"Ton objectif\nen cours",n>1?n+" goals\nin progress":"Your goal\nin progress")));
      var open=r.goals.filter(function(g){return !g.reached;}).sort(function(a,b){return b.pc-a.pc;})[0];
      b.append(para(!open?t2("Tous atteints. Bravo.","All reached. Well done."):open.pc>=50?t2("Et « "+open.title+" » est en bonne voie.","And “"+open.title+"” is well on its way."):t2("Chaque euro mis de côté t’en rapproche.","Every euro you save brings you closer.")));
      var box=el("div","gfy-goals");r.goals.slice(0,3).forEach(function(g){var d=el("div","gfy-goal"),h=el("div","gfy-cat-h"),nm=el("span","",g.title);nm.setAttribute("translate","no");h.append(nm,el("span","",g.reached?t2("Atteint","Reached"):g.pc+(en()?"%":" %")));var tr=el("div","gfy-cat-track"),f=el("i");f.style.width=g.pc+"%";tr.append(f);d.append(h,tr);box.append(d);});
      b.append(box);
    }});
    // 6. Profil
    list.push({key:"profile",look:"clay",render:function(b){
      b.append(tag(t2("TON PROFIL","YOUR PROFILE")),title(P.name.replace(" ","\n"),"is-l"),para(P.desc));
      var box=el("div","gfy-dots-box"),h=el("div","gfy-chart-head");h.append(el("span","",t2("Mois avec de l’épargne","Months with savings")),el("b","",r.regular+" / "+r.active));
      var grid=el("div","gfy-dots");grid.setAttribute("aria-hidden","true");r.months.forEach(function(m,i){var d=el("div","gfy-dot"+(m?(m.savings>0?" is-on":" is-miss"):" is-none"));d.append(el("i"),el("span","",MS[i]));grid.append(d);});
      box.append(h,grid);b.append(box);
      var tags=el("div","gfy-chips");P.tags.forEach(function(t){tags.append(el("span","",t));});b.append(tags);
    }});
    // 7. Carte à partager (sans montants)
    list.push({key:"share",look:"forest",render:function(b,ui){
      b.append(tag(t2("À PARTAGER","TO SHARE")),title(t2("Ta carte "+y+",\nsans aucun montant.","Your "+y+" card,\nwith no amounts."),"is-s"));
      var card=el("div","gfy-card");card.append(el("span","gfy-card-k",t2("MON ANNÉE ","MY YEAR ")+y),el("strong","gfy-card-t",P.name));
      var g=el("div","gfy-card-g");shareStats(r).forEach(function(s){var d=el("div");d.append(el("span","",s[0]),el("b","",s[1]));g.append(d);});
      card.append(g,el("span","gfy-card-u","meuniance.vercel.app"));b.append(card);
      var acts=el("div","gfy-acts"),share=el("button","gfy-share",t2("Partager ma carte","Share my card")),again=el("button","gfy-again",t2("Revoir mon bilan","Watch again"));share.type=again.type="button";
      share.addEventListener("click",function(){shareCard(r,share);});again.addEventListener("click",function(){ui.go(0);});
      acts.append(share,again);b.append(acts);
    }});
    return list;
  }
  function shareStats(r){
    return[
      r.delta!=null?[t2("Épargne","Savings"),pctTxt(r.delta)]:[t2("Mois suivis","Months tracked"),String(r.active)],
      [t2("Meilleur mois","Best month"),r.best?cap(mname(r.best.mi)):"—"],
      r.goals.length?[t2("Objectifs","Goals"),r.reached+" / "+r.goals.length]:[t2("Catégories","Categories"),String(r.cats.length)],
      [t2("Régularité","Consistency"),r.regular+" / "+r.active]
    ];
  }

  /* ── Image de la carte (1080 × 1350), partagée ou téléchargée ─────────────── */
  function roundRect(c,x,y,w,h,rad){c.beginPath();c.moveTo(x+rad,y);c.arcTo(x+w,y,x+w,y+h,rad);c.arcTo(x+w,y+h,x,y+h,rad);c.arcTo(x,y+h,x,y,rad);c.arcTo(x,y,x+w,y,rad);c.closePath();}
  function wrap(c,text,maxW){var words=text.split(" "),lines=[],cur="";words.forEach(function(w){var t=cur?cur+" "+w:w;if(c.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;});if(cur)lines.push(cur);return lines;}
  function drawCard(r){
    var W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H;var c=cv.getContext("2d"),P=prof(r);
    var head="'Bricolage Grotesque', system-ui, sans-serif",body="'Instrument Sans', system-ui, sans-serif";
    c.fillStyle="#17261F";c.fillRect(0,0,W,H);
    c.fillStyle="#E3A82B";c.font="600 34px "+body;c.fillText("MEUNIANCE",90,140);c.fillStyle="#F3EEE2";
    c.font="700 96px "+head;c.fillText(String(r.year),90,250);
    roundRect(c,70,330,W-140,880,56);c.fillStyle="#F3EEE2";c.fill();
    c.fillStyle="#5b665f";c.font="600 32px "+body;c.fillText(t2("MON ANNÉE ","MY YEAR ")+r.year,130,420);
    c.fillStyle="#17261F";c.font="700 92px "+head;var lines=wrap(c,P.name,W-260);lines.slice(0,2).forEach(function(l,i){c.fillText(l,130,530+i*100);});
    var top=530+Math.min(2,lines.length)*100+30;
    c.font="500 36px "+body;c.fillStyle="#3e4a43";wrap(c,P.desc,W-260).slice(0,2).forEach(function(l,i){c.fillText(l,130,top+i*50);});
    var gy=top+170;shareStats(r).forEach(function(s,i){var x=130+(i%2)*420,yy=gy+Math.floor(i/2)*150;c.fillStyle="#5b665f";c.font="600 32px "+body;c.fillText(s[0],x,yy);c.fillStyle="#17261F";c.font="700 56px "+head;c.fillText(s[1],x,yy+66);});
    c.fillStyle="#5b665f";c.font="600 30px "+body;c.fillText("meuniance.vercel.app",130,1160);
    c.fillStyle="#F3EEE2";c.font="600 32px "+body;c.fillText(P.tags.join(" · "),90,1290);
    return cv;
  }
  function shareCard(r,btn){
    var done=function(text){btn.textContent=text;setTimeout(function(){btn.textContent=t2("Partager ma carte","Share my card");},2600);};
    var ready=document.fonts&&document.fonts.load?Promise.all([document.fonts.load("700 92px 'Bricolage Grotesque'"),document.fonts.load("600 32px 'Instrument Sans'")]).catch(function(){}):Promise.resolve();
    ready.then(function(){
      var cv=drawCard(r);
      cv.toBlob(function(blob){
        if(!blob){done(t2("Impossible de créer l’image","Couldn’t create the image"));return;}
        var name="meuniance-"+r.year+".png",file=null;try{file=new File([blob],name,{type:"image/png"});}catch(e){}
        if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
          navigator.share({files:[file],title:t2("Mon année ","My year ")+r.year}).then(function(){done(t2("Carte partagée","Card shared"));}).catch(function(){});
          return;
        }
        var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},4000);
        done(t2("Image enregistrée","Image saved"));
      },"image/png");
    });
  }

  /* ── Le lecteur façon « stories » ─────────────────────────────────────────── */
  var LOOKS={forest:"#17261F",wheat:"#E3A82B",cream:"#F3EEE2",navy:"#22304A",clay:"#8F3D2A"};
  var viewer=null;
  function open(year){
    if(viewer)return;
    year=Number(year)||seasonYear()||new Date().getFullYear();
    var r=build(year);
    if(!r){toast(t2("Pas encore de chiffres pour "+year+" : remplis au moins un mois dans le tableur.","No figures for "+year+" yet: fill in at least one month in the spreadsheet."));return;}
    var list=screens(r),i=0,elapsed=0,paused=false,raf=0,lastT=0,held=false,holdT=0,skipClick=false;
    var dlg=el("dialog","gfy");dlg.setAttribute("aria-label",t2("Bilan de l’année ","Year in review ")+year);
    var stage=el("div","gfy-stage"),segs=el("div","gfy-segs"),head=el("div","gfy-head"),body=el("div","gfy-body"),pause=el("div","gfy-paused");
    var prevB=el("button","gfy-zone is-prev"),nextB=el("button","gfy-zone is-next");prevB.type=nextB.type="button";
    prevB.setAttribute("aria-label",t2("Écran précédent","Previous screen"));nextB.setAttribute("aria-label",t2("Écran suivant (maintenir pour mettre en pause)","Next screen (hold to pause)"));
    var close=el("button","gfy-close");close.type="button";close.setAttribute("aria-label",t2("Fermer le bilan","Close"));close.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    head.append(el("span","gfy-brand",t2("MEUNIANCE · BILAN ","MEUNIANCE · ")+year+(en()?" IN REVIEW":"")),close);
    pause.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';pause.append(document.createTextNode(t2("En pause","Paused")));
    var fills=list.map(function(){var s=el("span","gfy-seg"),f=el("i");s.append(f);segs.append(s);return f;});
    var top=el("div","gfy-top");top.append(segs,head);
    stage.append(prevB,nextB,top,body,pause);dlg.append(stage);
    var ui={go:go};
    function paint(){fills.forEach(function(f,k){f.style.width=(k<i?100:k>i?0:Math.min(100,elapsed/DURATION*100))+"%";});}
    function go(k){
      if(k<0)k=0;if(k>=list.length)k=list.length-1;
      i=k;elapsed=0;paused=false;stage.classList.remove("is-paused");
      var s=list[i];stage.dataset.look=s.look;stage.style.background=LOOKS[s.look];
      var inner=el("div","gfy-screen is-"+s.key);s.render(inner,ui);body.replaceChildren(inner);
      dlg.setAttribute("aria-label",t2("Bilan ","Review ")+year+" — "+(i+1)+" / "+list.length);
      paint();
    }
    function tick(t){
      if(!viewer)return;
      var dt=lastT?Math.min(100,t-lastT):0;lastT=t;
      if(!paused&&!document.hidden&&i<list.length-1){elapsed+=dt;if(elapsed>=DURATION){go(i+1);}}
      else if(i===list.length-1&&!paused){elapsed=Math.min(DURATION,elapsed+dt);}
      paint();raf=requestAnimationFrame(tick);
    }
    function setPaused(on){paused=on;stage.classList.toggle("is-paused",on);}
    function press(){clearTimeout(holdT);held=false;holdT=setTimeout(function(){held=true;setPaused(true);},HOLD);}
    function release(){clearTimeout(holdT);if(held){held=false;skipClick=true;setPaused(false);setTimeout(function(){skipClick=false;},400);}}
    [prevB,nextB].forEach(function(b){b.addEventListener("pointerdown",press);b.addEventListener("pointerup",release);b.addEventListener("pointercancel",release);b.addEventListener("pointerleave",release);b.addEventListener("contextmenu",function(e){e.preventDefault();});});
    prevB.addEventListener("click",function(){if(skipClick){skipClick=false;return;}if(i>0)go(i-1);else go(0);});
    nextB.addEventListener("click",function(){if(skipClick){skipClick=false;return;}if(i<list.length-1)go(i+1);});
    close.addEventListener("click",function(){dlg.close();});
    dlg.addEventListener("keydown",function(e){
      if(e.target.closest&&e.target.closest(".gfy-acts"))return;
      if(e.key==="ArrowRight"){e.preventDefault();if(i<list.length-1)go(i+1);}
      else if(e.key==="ArrowLeft"){e.preventDefault();if(i>0)go(i-1);}
      else if(e.key===" "){e.preventDefault();setPaused(!paused);}
    });
    dlg.addEventListener("close",function(){cancelAnimationFrame(raf);viewer=null;dlg.remove();syncLock();var h=hidden();h.seen=h.seen||{};h.seen[year]=1;setHidden(h);if(window.GFHome&&window.GFHome.render)window.GFHome.render();});
    document.body.append(dlg);viewer=dlg;dlg.showModal();syncLock();
    go(0);dlg.tabIndex=-1;try{dlg.focus({preventScroll:true});}catch(e){}
    raf=requestAnimationFrame(tick);
  }
  function syncLock(){if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();}
  function toast(text){var t=document.getElementById("gfhToast");if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},3600);}

  /* ── Carte sur l'accueil (décembre et janvier) ────────────────────────────── */
  function card(){
    var year=seasonYear();if(!year||demo())return null;
    var h=hidden();if(h.closed&&h.closed[year])return null;
    var r=build(year);if(!r||r.active<3)return null;
    var seen=!!(h.seen&&h.seen[year]);
    var box=el("section","gfy-home");box.setAttribute("aria-labelledby","gfyHomeT");
    var x=el("button","gfy-home-x");x.type="button";x.setAttribute("aria-label",t2("Masquer le bilan de l’année","Hide the year in review"));x.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    x.addEventListener("click",function(){var v=hidden();v.closed=v.closed||{};v.closed[year]=1;setHidden(v);box.remove();});
    var k=el("span","gfy-home-k",new Date().getMonth()===11?t2("NOUVEAU · DÉCEMBRE","NEW · DECEMBER"):t2("TON ANNÉE ","YOUR YEAR ")+year);
    var tt=el("h3","gfy-home-t");tt.id="gfyHomeT";tt.append(document.createTextNode(t2("Ton bilan "+year,"Your "+year)),el("br"),document.createTextNode(t2("est prêt","in review")));
    var p=el("p","gfy-home-p",t2("Quelques écrans, une minute : ton année racontée par tes chiffres.","A few screens, one minute: your year told by your numbers."));
    var tiles=el("div","gfy-home-tiles");
    function tile(v,l,amount){var d=el("div","gfy-home-tile"),b=el("b",amount?"gf-amount":"");b.textContent=v;d.append(b,el("span","",l));tiles.append(d);}
    if(r.saved>0)tile(eur(r.saved),t2("épargnés","saved"),true);else tile(String(r.active),t2("mois suivis","months tracked"));
    if(r.delta!=null)tile(pctTxt(r.delta),t2("vs ","vs ")+(year-1));else if(r.best)tile((en()?MA_EN:MA)[r.best.mi],t2("meilleur mois","best month"));
    if(r.goals.length)tile(r.reached+" / "+r.goals.length,t2("objectifs","goals"));else tile(String(r.regular),t2("mois épargnés","months saved"));
    var go=el("button","gfy-home-go",seen?t2("Revoir mon bilan","Watch again"):t2("Voir mon bilan","See my review"));go.type="button";go.addEventListener("click",function(){open(year);});
    box.append(x,k,tt,p,tiles,go);return box;
  }
  // Lien direct : /accueil?bilan ou ?bilan=2026 (ouvre une fois, puis nettoie l'adresse).
  function fromLink(){
    var q;try{q=new URLSearchParams(location.search);}catch(e){return;}if(!q.has("bilan"))return;
    var y=Number(q.get("bilan"))||seasonYear()||new Date().getFullYear();
    if(document.body.classList.contains("tutorial-active")||document.querySelector("dialog[open]"))return;
    q.delete("bilan");try{history.replaceState(history.state,"",location.pathname+(q.toString()?"?"+q:"")+location.hash);}catch(e){}
    setTimeout(function(){open(y);},300);
  }
  window.GFYear={compute:compute,open:open,card:card,fromLink:fromLink,seasonYear:seasonYear,_shareStats:shareStats,_profile:prof};
})();
