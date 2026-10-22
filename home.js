/* Accueil Meuniance (maquette « Tes finances, enfin lisibles »).
   Lit les mois du tableau de bord via window.__gfHomeData() ; les sélecteurs
   année / mois d'origine restent la source de vérité (graphiques, partage…). */
(function(){
  "use strict";
  var MN=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  var MN_EN=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var MS=["J","F","M","A","M","J","J","A","S","O","N","D"];
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function mname(i){return en()?MN_EN[i]:MN[i];}
  function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  var FMT=null,FMT_L="";
  // Chiffres du bas de la carte : arrondis à l'euro au-delà de 1 000 € pour tenir sur petit écran.
  function eurS(v){return Math.abs(v)>=1000?eur(Math.round(v)):eur(v);}
  function eur(v){var l=en()?"en-IE":"fr-FR";if(!FMT||FMT_L!==l){FMT=new Intl.NumberFormat(l,{style:"currency",currency:"EUR",maximumFractionDigits:0});FMT2=new Intl.NumberFormat(l,{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});FMT_L=l;}return Math.round(v)===Math.round(v*100)/100?FMT.format(v):FMT2.format(v);}
  var FMT2=null;
  function pct(a,b){var v=(a-b)/Math.abs(b||1)*100;return(v>=0?"+":"−")+Math.abs(v).toLocaleString(en()?"en-IE":"fr-FR",{maximumFractionDigits:1})+(en()?"%":" %");}
  function profile(){try{var p=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.setupProfile")||"{}");return p&&typeof p==="object"?p:{};}catch(e){return{};}}
  function mainGoal(p){var g=(Array.isArray(p.objectives)?p.objectives:[]).filter(function(x){return x&&!x.archived&&!x.paused&&Number(x.target)>0;});return g.filter(function(x){return x.type==="savings";})[0]||g[0]||null;}
  function name(){
    var u=byId("identityCurrentUsername"),t=(u&&u.textContent||"").trim();if(/^@/.test(t))return t.slice(1);
    var acc=window.__account||{};var m=acc.user&&acc.user.email;return m?m.split("@")[0]:"";
  }
  function flow(m){return m.salary-m.expenses-m.savings;}
  var emptyMi=new Date().getMonth(),emptyYear=new Date().getFullYear();
  var DEMO_KEY="personalFinanceDashboard.homeDemo",BLOCKS_KEY="personalFinanceDashboard.homeBlocks";
  /* Toujours via safeStore : ces clés (dont la copie de sauvegarde du tableur) sont rangées par compte. */
  function lsGet(k){try{return window.safeStore.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{if(v==null)window.safeStore.removeItem(k);else window.safeStore.setItem(k,v);}catch(e){}}
  /* Exemple chargé DANS le tableur : l'accueil, les graphiques et le tableur montrent les mêmes chiffres.
     Le tableur précédent est gardé de côté et revient quand on retire l'exemple. */
  var EX_BACKUP="personalFinanceDashboard.exampleBackup";
  /* Mode discret : montants floutés (pour montrer son écran sans dévoiler ses chiffres). */
  var HIDE_KEY="personalFinanceDashboard.hideAmounts";
  function amountsHidden(){return lsGet(HIDE_KEY)==="1";}
  function applyHidden(){document.body.classList.toggle("gf-hide-amounts",amountsHidden());}
  function setHidden(on){lsSet(HIDE_KEY,on?"1":null);applyHidden();schedule();settingsUI();}
  function eyeButton(){
    var on=amountsHidden(),b=el("button","gfh-eye");b.type="button";b.setAttribute("aria-pressed",String(on));
    b.setAttribute("aria-label",on?t2("Afficher les montants","Show amounts"):t2("Masquer les montants","Hide amounts"));b.title=b.getAttribute("aria-label");
    b.innerHTML=on?'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.6 4.3 9.6 6.4a1.4 1.4 0 0 1 0 1.2 13 13 0 0 1-2.4 3.2M6.6 6.6A13.4 13.4 0 0 0 2.4 11.4a1.4 1.4 0 0 0 0 1.2C3.4 14.7 7 19 12 19a9.6 9.6 0 0 0 5.4-1.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      :'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.4 11.4C3.4 9.3 7 5 12 5s8.6 4.3 9.6 6.4a1.4 1.4 0 0 1 0 1.2C20.6 14.7 17 19 12 19s-8.6-4.3-9.6-6.4a1.4 1.4 0 0 1 0-1.2Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.9"/></svg>';
    b.addEventListener("click",function(){setHidden(!amountsHidden());});
    return b;
  }
  function blocks(){var d={month:true,recap:true,recapPin:false,year:true,where:true,goal:true,subs:true,charts:true,fixed:true};try{var v=JSON.parse(lsGet(BLOCKS_KEY)||"{}");Object.keys(d).forEach(function(k){if(typeof v[k]==="boolean")d[k]=v[k];});}catch(e){}return d;}
  function setBlock(k,on){var b=blocks();b[k]=!!on;lsSet(BLOCKS_KEY,JSON.stringify(b));schedule();}
  function exampleOn(){return lsGet(DEMO_KEY)==="1";}
  function sheetEmpty(){try{var sn=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();return !sn||!sn.sheets||!sn.sheets.some(function(x){return x.cells&&Object.keys(x.cells).some(function(k){return String(x.cells[k]&&x.cells[k].raw||"").trim()!=="";});});}catch(e){return true;}}
  function exampleSnapshot(){
    var y=new Date().getFullYear(),last=new Date().getMonth();
    var rows=[[t2("Salaire","Salary"),[2100,2100,2150,2150,2150,2200,2200,2200,2250,2250,2250,2300]],[t2("Loyer","Rent"),[-720,-720,-720,-720,-720,-720,-735,-735,-735,-735,-735,-735]],[t2("Courses","Groceries"),[-360,-390,-370,-410,-400,-385,-380,-420,-395,-405,-390,-430]],["Transports",[-96,-96,-90,-96,-110,-96,-80,-70,-96,-96,-96,-96]],[t2("Loisirs","Leisure"),[-204,-244,-214,-274,-274,-288,-230,-320,-210,-240,-250,-300]],[t2("Épargne voyage","Travel savings"),[-80,-100,-120,-100,-120,-130,-130,-90,-150,-140,-150,-160]]];
    var cells={};rows.forEach(function(r,ri){for(var c=0;c<=last;c++)cells[ri+","+c]={raw:String(r[1][c])};});
    return{v:"v4-20260831",sheets:[{id:"exemple-"+y,name:String(y),cells:cells,headers:MN.map(cap),rowHeaders:rows.map(function(r){return r[0];}),rows:Math.max(9,rows.length+2),cols:12}],activeSheetId:"exemple-"+y};
  }
  function refreshAll(){try{if(window.syncDashboardFromFinanceSheet)window.syncDashboardFromFinanceSheet({silent:true});}catch(e){}try{window.FinanceSheet&&window.FinanceSheet.updateSheetBalanceCards&&window.FinanceSheet.updateSheetBalanceCards();}catch(e){}schedule();sheetBanner();}
  function loadExample(){
    var FS=window.FinanceSheet;if(!FS||!FS.loadSnapshot)return;
    loaderStart(t2("Je prépare l’exemple…","Preparing the sample…"));
    try{lsSet(EX_BACKUP,JSON.stringify({sheet:FS.getSnapshot(),start:profile().startingCash==null?null:profile().startingCash,month:profile().startingMonth||null}));}catch(e){}
    FS.loadSnapshot(exampleSnapshot());
    try{var p=profile();if(p.startingCash===""||p.startingCash==null){p.startingCash="1200";p.startingMonth=new Date().getFullYear()+"-01";p._exampleStart=true;window.safeStore.setItem("personalFinanceDashboard.setupProfile",JSON.stringify(p));}}catch(e){}
    lsSet(DEMO_KEY,"1");refreshAll();
  }
  function removeExample(){
    var FS=window.FinanceSheet,bk=null;loaderStart(t2("Je remets ton tableur…","Restoring your spreadsheet…"));try{bk=JSON.parse(lsGet(EX_BACKUP)||"null");}catch(e){}
    if(FS){if(bk&&bk.sheet&&bk.sheet.sheets&&bk.sheet.sheets.length)FS.loadSnapshot(bk.sheet);else if(FS.resetToDefaultSheets)FS.resetToDefaultSheets({silent:true});}
    try{var p=profile();if(p._exampleStart){delete p._exampleStart;if(bk&&bk.start!=null)p.startingCash=bk.start;else delete p.startingCash;if(bk&&bk.month)p.startingMonth=bk.month;else delete p.startingMonth;window.safeStore.setItem("personalFinanceDashboard.setupProfile",JSON.stringify(p));}}catch(e){}
    lsSet(DEMO_KEY,null);lsSet(EX_BACKUP,null);refreshAll();
  }
  function exampleBar(where){
    var db=el("div","gfh-demo"),dt=el("span","",t2("Exemple chargé dans ton tableur : modifie-le librement ou retire-le.","Sample loaded in your spreadsheet: edit it freely or remove it.")),dx=el("button","gfh-link",t2("Retirer l’exemple","Remove sample"));
    dx.type="button";dx.addEventListener("click",removeExample);db.append(dt,dx);db.dataset.where=where;return db;
  }
  function unlabeledRows(){try{var sn=window.FinanceSheet.getSnapshot(),a=sn.sheets.filter(function(x){return x.id===sn.activeSheetId;})[0]||sn.sheets[0];if(!a)return 0;var rows={};Object.keys(a.cells||{}).forEach(function(k){if(String(a.cells[k]&&a.cells[k].raw||"").trim()){var r=Number(k.split(",")[0]);if(!String((a.rowHeaders||[])[r]||"").trim())rows[r+1]=1;}});var ks=Object.keys(rows);return ks.length?ks.join(", "):0;}catch(e){return 0;}}
  function preferCurrentYear(){try{var FS=window.FinanceSheet;if(!FS||!sheetEmpty())return;var sn=FS.getSnapshot(),y=String(new Date().getFullYear()),cur=sn.sheets.filter(function(x){return String(x.name).trim()===y;})[0];if(cur&&sn.activeSheetId!==cur.id){sn.activeSheetId=cur.id;FS.loadSnapshot(sn);}}catch(e){}}
  function sheetBanner(){
    var page=byId("sheetPage"),anchor=byId("sheetBalanceCards");if(!page||!anchor)return;
    var box=byId("gfhSheetExample"),on=exampleOn(),empty=!on&&sheetEmpty();
    var unl=!on&&!empty&&unlabeledRows();
    if(!on&&!empty&&!unl){if(box)box.remove();return;}
    if(unl){if(!box){box=el("div");box.id="gfhSheetExample";anchor.parentNode.insertBefore(box,anchor);}box.className="gfh-sheet-empty";var tx=el("div");tx.append(el("strong","",t2("Ligne sans nom.","Unnamed row.")),el("span","",t2(" Donne un nom à la ligne "+unl+" (ex. Salaire, Loyer, Courses) avec ✎ pour qu’elle compte dans l’accueil."," Name row "+unl+" (e.g. Salary, Rent) with ✎ so it counts on the home screen.")));box.replaceChildren(tx);return;}
    if(!box){box=el("div");box.id="gfhSheetExample";anchor.parentNode.insertBefore(box,anchor);}
    if(on){box.className="";box.replaceChildren(exampleBar("sheet"));return;}
    box.className="gfh-sheet-empty";
    var txt=el("div");txt.append(el("strong","",t2("Ton moulin est prêt, il attend ses premiers grains…","The mill is ready and waiting for its first grain…")),el("span","",t2(" Saisis un montant, importe un relevé ou un fichier Excel, ou pars d’un exemple."," Type an amount, import a statement or an Excel file, or start from a sample.")));
    var b=el("button","gfh-btn",t2("Charger un exemple","Load a sample"));b.type="button";b.addEventListener("click",loadExample);
    box.replaceChildren(txt,b);
  }
  /* ── Écriture dans le tableur (ajout rapide, dépenses fixes) ───────────────── */
  function normKey(v){return String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
  function snapshot(){try{return JSON.parse(JSON.stringify(window.FinanceSheet.getSnapshot()));}catch(e){return null;}}
  function sheetFor(snap,year,create){
    var s=(snap.sheets||[]).filter(function(x){return String(x.name).trim()===String(year);})[0];
    if(!s&&create){s={id:"s"+year+"-"+Date.now().toString(36),name:String(year),cells:{},headers:MN.map(cap),rowHeaders:[],rows:9,cols:12};snap.sheets.push(s);}
    return s;
  }
  function rowFor(sheet,label){
    var k=normKey(label),i=(sheet.rowHeaders||[]).findIndex(function(h){return normKey(h)===k;});
    if(i<0){sheet.rowHeaders=sheet.rowHeaders||[];i=sheet.rowHeaders.length;sheet.rowHeaders.push(String(label).trim());}
    sheet.rows=Math.max(Number(sheet.rows)||0,sheet.rowHeaders.length+2);
    return i;
  }
  function addRaw(old,amount){
    old=String(old==null?"":old).trim();var a=Math.round(amount*100)/100;
    if(!old)return String(a);
    var n=Number(old.replace(",","."));if(old.charAt(0)!=="="&&isFinite(n))return String(Math.round((n+a)*100)/100);
    return "="+(old.charAt(0)==="="?old.slice(1):old)+(a<0?"-":"+")+Math.abs(a);
  }
  function setRule(label,kind){
    try{var key="personalFinanceDashboard.categoryRules",r=JSON.parse(window.safeStore.getItem(key)||"{}")||{};r[normKey(label)]=kind;window.safeStore.setItem(key,JSON.stringify(r));}catch(e){}
  }
  /* Signe déjà utilisé dans le tableur (dépenses saisies en positif ou en négatif) :
     d'abord la ligne elle-même, puis les autres lignes du même type. 0 si rien ne permet de le savoir. */
  function signIn(values){var pos=0,neg=0;values.forEach(function(v){if(v>0)pos++;else if(v<0)neg++;});return pos>neg?1:neg>pos?-1:0;}
  function rowNumbers(sh,row){var out=[];Object.keys(sh.cells||{}).forEach(function(key){var p=key.split(",");if(Number(p[0])!==row)return;var raw=String((sh.cells[key]||{}).raw||"").trim().replace(",",".");if(raw&&raw.charAt(0)!=="="&&isFinite(Number(raw)))out.push(Number(raw));});return out;}
  function sheetSign(snap,label,kind){
    var own=[],same=[];
    (snap.sheets||[]).forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h,i){if(!String(h||"").trim())return;var nums=rowNumbers(sh,i);if(normKey(h)===normKey(label))own=own.concat(nums);else if(lineKind(h)===kind)same=same.concat(nums);});});
    return signIn(own)||signIn(same);
  }
  /* entries : [{year, mi, label, amount, onlyIfEmpty, kind}] */
  function writeEntries(entries){
    var FS=window.FinanceSheet,snap=snapshot();if(!FS||!snap||!snap.sheets)return false;
    var lastSheet=null;
    entries.forEach(function(e){
      var sign=sheetSign(snap,e.label,e.kind||lineKind(e.label));if(sign)e.amount=sign*Math.abs(e.amount);
      var sh=sheetFor(snap,e.year,true),known=(sh.rowHeaders||[]).some(function(h){return normKey(h)===normKey(e.label);});
      var r=rowFor(sh,e.label),key=r+","+e.mi,cell=sh.cells[key],old=cell&&cell.raw;
      if(e.onlyIfEmpty&&String(old||"").trim())return;
      sh.cells[key]={raw:addRaw(old,e.amount)};
      if(!known&&e.kind)setRule(e.label,e.kind);
      lastSheet=sh;
    });
    if(lastSheet)snap.activeSheetId=lastSheet.id;
    FS.loadSnapshot(snap);
    try{FS.saveNow&&FS.saveNow();}catch(e){}
    refreshAll();return true;
  }
  function toast(text){
    var t=byId("gfhToast");if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}
    t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},3200);
  }
  function knownLabels(){var snap=snapshot(),set={},out=[];(snap&&snap.sheets||[]).forEach(function(s){(s.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!set[normKey(h)]){set[normKey(h)]=1;out.push(h);}});});return out;}

  // Même lecture que le tableur : « 1 234,56 », « 1.234,56 » et « 1,234.56 » valent 1234,56.
  function amountOf(text){
    if(/%/.test(String(text)))return NaN; // un pourcentage n'est pas un montant
    var FS=window.FinanceSheet;if(FS&&typeof FS.parseAmount==="function")return FS.parseAmount(text);
    return parseFloat(String(text).replace(/\s/g,"").replace(",","."));
  }
  /* ── Ajout rapide ───────────────────────────────────────────────────────── */
  function lineKind(label){
    var r={};try{r=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.categoryRules")||"{}")||{};}catch(e){}
    var v=r[normKey(label)];if(v==="Salaire")return"Salaire";if(v==="Épargne"||v==="Epargne")return"Épargne";if(v==="Ignorer")return null;if(v)return"Dépense";
    // Même classement que le tableau de bord (mots entiers : « Café » ≠ CAF, « Péage » ≠ PEA).
    var g=null;try{g=window.GFClassifyRow?window.GFClassifyRow(label):null;}catch(e){}
    if(g==="Ignorer")return null;return g==="Salaire"||g==="Épargne"?g:"Dépense";
  }
  function quickAdd(ctx){
    var KINDS=[["Dépense",t2("Dépense","Expense"),-1,t2("Dépenses","Expenses")],["Salaire",t2("Revenu","Income"),1,t2("Revenus","Income")],["Épargne",t2("Épargne","Savings"),-1,t2("Épargne","Savings")]];
    var kind=KINDS[0],chosen="",creating=false;
    var d=el("dialog","gfh-dialog gfh-quick");d.setAttribute("aria-labelledby","gfhQuickTitle");
    var h=el("h2","",t2("Ajouter","Add"));h.id="gfhQuickTitle";
    var typeRow=el("div","gfh-type-row"),seg=el("div","gfh-seg");seg.setAttribute("role","group");seg.setAttribute("aria-label",t2("Type","Type"));
    var newBtn=el("button","gfh-new-line");newBtn.type="button";newBtn.setAttribute("aria-label",t2("Créer une nouvelle catégorie","Create a new category"));newBtn.title=t2("Nouvelle catégorie","New category");
    newBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    KINDS.forEach(function(k){var b=el("button","",k[1]);b.type="button";b.dataset.kind=k[0];b.setAttribute("aria-pressed",String(k===kind));b.addEventListener("click",function(){setKind(k,true);});seg.append(b);});
    typeRow.append(seg,newBtn);
    var amtL=el("label","gfh-field"),amt=document.createElement("input");amtL.append(el("span","",t2("Montant","Amount")));amt.type="text";amt.inputMode="decimal";amt.placeholder="0,00 €";amt.autocomplete="off";amtL.append(amt);
    // Ligne : vrai menu déroulant
    var lineBox=el("div","gfh-field"),lineLab=el("span","",t2("Catégorie","Category"));lineLab.id="gfhLineLab";
    var pick=el("button","gfh-pick");pick.type="button";pick.setAttribute("aria-haspopup","listbox");pick.setAttribute("aria-expanded","false");pick.setAttribute("aria-labelledby","gfhLineLab");
    var pickTxt=el("span","gfh-pick-txt",t2("Choisir une catégorie","Choose a category"));pick.append(pickTxt);
    var menu=el("div","gfh-menu");menu.hidden=true;menu.setAttribute("role","listbox");
    var newWrap=el("label","gfh-field gfh-newline"),newInp=document.createElement("input");newWrap.hidden=true;newInp.type="text";newInp.autocomplete="off";newInp.maxLength=40;newInp.placeholder=t2("Ex. Restaurant, Netflix…","E.g. Restaurant, Netflix…");
    var newLab=el("span","");newWrap.append(newLab,newInp);
    var chips=el("div","gfh-suggest");chips.setAttribute("role","group");chips.setAttribute("aria-labelledby","gfhLineLab");chips.hidden=true;
    lineBox.append(lineLab,pick,menu,chips);
    var monL=el("label","gfh-field"),mon=document.createElement("select");monL.append(el("span","",t2("Mois","Month")),mon);
    for(var i=0;i<12;i++){var o=new Option(cap(mname(i))+" "+ctx.year,String(i));if(i===ctx.mi)o.selected=true;mon.append(o);}
    if(window.GFSelect)setTimeout(function(){window.GFSelect.enhance(mon);},0);
    var err=el("p","gfh-err");err.setAttribute("role","alert");
    var row=el("div","gfh-dialog-actions"),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Ajouter","Add"));cancel.type="button";ok.type="submit";row.append(cancel,ok);
    var form=document.createElement("form");form.append(h,typeRow,amtL,lineBox,newWrap,monL,err,row);d.append(form);

    function allLines(){var seen={},out=[];knownLabels().forEach(function(l){var k=lineKind(l);if(k&&!seen[normKey(l)]){seen[normKey(l)]=1;out.push({label:l,kind:k});}});(ctx.expenseLines||[]).forEach(function(l){if(!seen[normKey(l)]){seen[normKey(l)]=1;out.push({label:l,kind:"Dépense"});}});return out;}
    function setKind(k,fromUser){kind=k;seg.querySelectorAll("button").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.kind===k[0]));});newLab.textContent=t2("Nom de la catégorie (","Category name (")+k[1].toLowerCase()+")";if(fromUser&&chosen&&lineKind(chosen)!==k[0]&&!creating){chosen="";pickTxt.textContent=t2("Choisir une catégorie","Choose a category");pick.classList.remove("has-value");}buildMenu();buildChips();}
    function setCreating(on){creating=on;newWrap.hidden=!on;newBtn.setAttribute("aria-pressed",String(on));lineBox.hidden=on;if(on){chosen="";setTimeout(function(){newInp.focus();},20);}else buildChips();}
    // Catégories proposées quand on démarre (ou en plus des siennes), selon le type choisi.
    var SUGGEST={"Dépense":[["Courses","Groceries"],["Loyer","Rent"],["Transports","Transport"],["Restaurants","Restaurants"],["Loisirs","Leisure"],["Abonnements","Subscriptions"],["Santé","Health"],["Shopping","Shopping"]],"Salaire":[["Salaire","Salary"],["Prime","Bonus"],["Aides","Benefits"],["Autres revenus","Other income"]],"Épargne":[["Livret A","Savings account"],["Épargne","Savings"],["Placements","Investments"]]};
    function suggestions(){var have={};allLines().forEach(function(l){have[normKey(l.label)]=1;});return (SUGGEST[kind[0]]||[]).map(function(x){return t2(x[0],x[1]);}).filter(function(n){return !have[normKey(n)];});}
    function choose(label){chosen=label;pickTxt.textContent=label;pick.classList.add("has-value");[].forEach.call(chips.querySelectorAll(".gfh-chip"),function(c){c.setAttribute("aria-pressed",String(c.dataset.label===label));});}
    // Aucune catégorie de ce type encore : des pastilles à toucher, plutôt qu'une liste vide.
    function buildChips(){
      var mine=allLines().filter(function(l){return l.kind===kind[0];}),empty=!mine.length&&!creating;
      chips.hidden=!empty;pick.hidden=empty;if(!empty){chips.replaceChildren();return;}
      chips.replaceChildren();
      suggestions().forEach(function(n){var c=el("button","gfh-chip",n);c.type="button";c.dataset.label=n;c.setAttribute("aria-pressed",String(n===chosen));c.addEventListener("click",function(){choose(n);amt.value?ok.focus():amt.focus();});chips.append(c);});
      var other=el("button","gfh-chip is-other",t2("Autre…","Other…"));other.type="button";other.addEventListener("click",function(){setCreating(true);});chips.append(other);
    }
    function buildMenu(){
      menu.replaceChildren();var lines=allLines(),mine=lines.filter(function(l){return l.kind===kind[0];}),others=lines.filter(function(l){return l.kind!==kind[0];});
      function group(title,items){if(!items.length)return;menu.append(el("div","gfh-menu-h",title));items.forEach(function(it){var b=el("button","gfh-menu-item"+(it.label===chosen?" is-on":""),it.label);b.type="button";b.setAttribute("role","option");b.setAttribute("aria-selected",String(it.label===chosen));
        var tag=KINDS.filter(function(k){return k[0]===it.kind;})[0];if(it.kind!==kind[0]&&tag)b.append(el("small","",tag[1]));
        b.addEventListener("click",function(){chosen=it.label;pickTxt.textContent=it.label;pick.classList.add("has-value");if(it.kind!==kind[0]){var k=KINDS.filter(function(x){return x[0]===it.kind;})[0];if(k)setKind(k,false);}closeMenu();amt.value?ok.focus():amt.focus();});menu.append(b);});}
      group(kind[3],mine);group(t2("Autres catégories","Other categories"),others);
      var sug=suggestions().map(function(n){return{label:n,kind:kind[0]};});group(t2("Suggestions","Suggestions"),sug);
      var add=el("button","gfh-menu-item gfh-menu-new","+ "+t2("Nouvelle catégorie…","New category…"));add.type="button";add.addEventListener("click",function(){closeMenu();setCreating(true);});menu.append(add);
    }
    function openMenu(){buildMenu();menu.hidden=false;pick.setAttribute("aria-expanded","true");var f=menu.querySelector(".is-on")||menu.querySelector(".gfh-menu-item");if(f)f.focus();}
    function closeMenu(){menu.hidden=true;pick.setAttribute("aria-expanded","false");}
    pick.addEventListener("click",function(){menu.hidden?openMenu():closeMenu();});
    menu.addEventListener("keydown",function(e){var items=[].slice.call(menu.querySelectorAll(".gfh-menu-item")),i=items.indexOf(document.activeElement);if(e.key==="ArrowDown"){e.preventDefault();(items[i+1]||items[0]).focus();}else if(e.key==="ArrowUp"){e.preventDefault();(items[i-1]||items[items.length-1]).focus();}else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeMenu();pick.focus();}});
    d.addEventListener("click",function(e){if(!menu.hidden&&!lineBox.contains(e.target))closeMenu();});
    newBtn.addEventListener("click",function(){setCreating(!creating);});
    setKind(kind,false);
    cancel.addEventListener("click",function(){d.close();});
    form.addEventListener("submit",function(e){
      e.preventDefault();err.textContent="";
      var v=amountOf(amt.value);
      if(!isFinite(v)||v<=0){err.textContent=t2("Indique un montant positif.","Enter a positive amount.");amt.focus();return;}
      var lab=creating?String(newInp.value||"").trim():chosen;
      if(!lab){err.textContent=creating?t2("Donne un nom à la catégorie.","Name the category."):t2("Choisis une catégorie.","Choose a category.");(creating?newInp:(pick.hidden?chips.querySelector(".gfh-chip")||pick:pick)).focus();return;}
      var mi=Number(mon.value);
      writeEntries([{year:ctx.year,mi:mi,label:lab,amount:kind[2]*v,kind:kind[0]}]);
      d.close();toast(t2("Ajouté : ","Added: ")+eur(v)+" · "+lab+" · "+mname(mi));
    });
    d.addEventListener("close",function(){d.remove();});
    document.body.append(d);d.showModal();setTimeout(function(){amt.focus();},30);
  }

  /* ── Dépenses fixes : lignes présentes et stables sur 3 mois d'affilée ─────── */
  var FIX_KEY="personalFinanceDashboard.fixedDismissed";
  function catMap(m){var o={};(m.cats||[]).forEach(function(c){var a=Math.abs(Number(c.value||0));if(a>0)o[String(c.name)]=(o[String(c.name)]||0)+a;});return o;}
  function consecutive(a,b){return (b.year*12+b.mi)-(a.year*12+a.mi)===1;}
  function stableIn(months){
    var maps=months.map(catMap),names=Object.keys(maps[0]||{}),out=[];
    names.forEach(function(n){var vals=maps.map(function(m){return m[n];});if(vals.some(function(v){return !v;}))return;var mx=Math.max.apply(null,vals),mn=Math.min.apply(null,vals);if(mx/mn<=1.03)out.push({name:n,amount:vals[vals.length-1]});});
    return out;
  }
  function fixedSuggestion(all){
    if(all.length<3)return null;
    var L=all[all.length-1],a=all[all.length-2],b=all[all.length-3],c=all[all.length-4];
    // 1) le dernier mois a commencé mais il manque des lignes fixes des 3 mois précédents
    if(c&&consecutive(c,b)&&consecutive(b,a)&&consecutive(a,L)){
      var miss=stableIn([c,b,a]).filter(function(x){return !catMap(L)[x.name];});
      if(miss.length)return{year:L.year,mi:L.mi,items:miss};
    }
    // 2) sinon, on prépare le mois suivant, mais seulement à partir du 25 : plus tôt, c'est prématuré
    if(consecutive(b,a)&&consecutive(a,L)){
      var ny=L.mi===11?L.year+1:L.year,nm=(L.mi+1)%12,now=new Date(),cur=now.getFullYear()*12+now.getMonth(),nxt=ny*12+nm;
      if(cur<nxt-1||(cur===nxt-1&&now.getDate()<25))return null;
      var items=stableIn([b,a,L]);if(!items.length)return null;
      return{year:ny,mi:nm,items:items};
    }
    return null;
  }
  function fixedPanel(sug){
    var tag=sug.year+"-"+sug.mi;if(lsGet(FIX_KEY)===tag)return null;
    var box=el("div","gfh-panel gfh-fixed"),head=el("div","gfh-row");
    head.append(el("h3","",t2("Dépenses fixes de ","Fixed expenses for ")+mname(sug.mi)),el("span","gfh-muted",t2("Reviennent chaque mois","Every month")));
    box.append(head);
    var list=el("div","gfh-fixed-list");
    sug.items.forEach(function(it){
      var r=el("div","gfh-fixed-row"),add=el("button","gfh-icon-btn","+");add.type="button";add.setAttribute("aria-label",t2("Ajouter ","Add ")+it.name+" "+eur(it.amount));
      add.addEventListener("click",function(){writeEntries([{year:sug.year,mi:sug.mi,label:it.name,amount:-it.amount,onlyIfEmpty:true}]);toast(it.name+" "+eur(it.amount)+t2(" ajouté à "," added to ")+mname(sug.mi));});
      var txt=el("span","",it.name);r.append(txt,el("span","gfh-fixed-amt",eur(it.amount)),add);list.append(r);
    });
    var acts=el("div","gfh-acts"),all=el("button","gfh-btn is-primary",t2("Tout ajouter","Add all")),later=el("button","gfh-link",t2("Plus tard","Later"));all.type=later.type="button";
    all.addEventListener("click",function(){writeEntries(sug.items.map(function(it){return{year:sug.year,mi:sug.mi,label:it.name,amount:-it.amount,onlyIfEmpty:true};}));toast(fixedAdded(sug.items.length,mname(sug.mi)));});
    later.addEventListener("click",function(){lsSet(FIX_KEY,tag);schedule();});
    acts.append(all,later);box.append(list,acts);return box;
  }

  /* ── Plafonds par ligne ─────────────────────────────────────────────────── */
  var BUDGET_KEY="personalFinanceDashboard.budgets";
  function budgets(){try{var b=JSON.parse(window.safeStore.getItem(BUDGET_KEY)||"{}");return b&&typeof b==="object"?b:{};}catch(e){return{};}}
  function setBudget(name,v){var b=budgets();quietAlerts=true;if(v>0)b[normKey(name)]=v;else delete b[normKey(name)];try{window.safeStore.setItem(BUDGET_KEY,JSON.stringify(b));}catch(e){}schedule();}
  function budgetOf(name){var v=Number(budgets()[normKey(name)]);return v>0?v:0;}
  function budgetDialog(name,spent){
    var d=el("dialog","gfh-dialog");var h=el("h2","",t2("Plafond pour ","Limit for ")+name);
    var cur=budgetOf(name),f=el("label","gfh-field"),inp=document.createElement("input");inp.type="text";inp.inputMode="decimal";inp.value=cur?String(cur):"";inp.placeholder=t2("Ex. 250","E.g. 250");
    f.append(el("span","",t2("Montant maximum par mois","Monthly maximum")),inp);
    var p=el("p","gfh-muted",t2("Ce mois-ci : ","This month: ")+eur(spent)+t2(". La barre passe en rouge au-delà du plafond.",". The bar turns red above the limit."));
    var row=el("div","gfh-dialog-actions"),rm=el("button","gfh-link",t2("Retirer le plafond","Remove limit")),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Enregistrer","Save"));
    rm.type=cancel.type="button";ok.type="submit";if(!cur)rm.hidden=true;row.append(rm,cancel,ok);
    var form=document.createElement("form");form.append(h,f,p,row);d.append(form);
    rm.addEventListener("click",function(){setBudget(name,0);d.close();});cancel.addEventListener("click",function(){d.close();});
    form.addEventListener("submit",function(e){e.preventDefault();var v=amountOf(inp.value);setBudget(name,isFinite(v)&&v>0?v:0);d.close();});
    d.addEventListener("close",function(){d.remove();});document.body.append(d);d.showModal();setTimeout(function(){inp.focus();inp.select();},30);
  }

  /* ── Alertes de plafond : 80 % puis 100 %, une fois par seuil et par mois ─────── */
  /* Une seule carte flottante à la fois (alerte de plafond, installation, rappels, bravo…) :
     les autres attendent qu'elle soit fermée. */
  var POPUPS="#gfhBudgetAlert,#gfiCard,#gfrInvite,#gfhToast.is-on,.gfd-coach";
  function popupBusy(self){
    if(document.hidden)return true;
    return [].some.call(document.querySelectorAll(POPUPS+",dialog[open]"),function(e){return e!==self&&!e.hidden&&e.getClientRects().length>0;});
  }
  window.GFPopup={busy:popupBusy,selector:POPUPS};
  function whenFree(fn,tries){tries=tries||0;if(!popupBusy()){fn();return;}if(tries>40)return;setTimeout(function(){whenFree(fn,tries+1);},1500);}
  function closeAlert(){var c=byId("gfhBudgetAlert");if(!c)return;c.classList.remove("is-on");setTimeout(function(){c.remove();},250);}
  // L'alerte appartient à l'accueil : elle se ferme quand on change de page.
  if(window.MutationObserver)new MutationObserver(function(){if(document.body.dataset.page!=="dashboard")closeAlert();}).observe(document.body,{attributes:true,attributeFilter:["data-page"]});
  var ALERT_KEY="personalFinanceDashboard.budgetAlerts",ALERT_ON="personalFinanceDashboard.budgetAlertsOn",quietAlerts=false;
  function alertsOn(){return lsGet(ALERT_ON)!=="0";}
  function checkBudgets(all){
    if(!alertsOn())return;
    var now=new Date(),m=all.filter(function(x){return x.year===now.getFullYear()&&x.mi===now.getMonth();})[0];if(!m)return;
    var b=budgets();if(!Object.keys(b).length)return;
    var state={};try{state=JSON.parse(lsGet(ALERT_KEY)||"{}")||{};}catch(e){}
    var month=m.year+"-"+m.mi,fresh=[];
    Object.keys(state).forEach(function(k){if(k.split("|")[0]!==month)delete state[k];});// les mois passés sont oubliés
    (m.cats||[]).forEach(function(c){
      var name=String(c.name||""),bud=budgetOf(name);if(!bud)return;
      var spent=Math.abs(Number(c.value||0)),lvl=spent>=bud?100:spent>=bud*.8?80:0,k=month+"|"+normKey(name),prev=Number(state[k]||0);
      if(lvl>prev)fresh.push({name:name,spent:spent,bud:bud,lvl:lvl});
      if(lvl!==prev){if(lvl)state[k]=lvl;else delete state[k];}
    });
    lsSet(ALERT_KEY,JSON.stringify(state));
    // Juste après avoir fixé un plafond, on note le niveau actuel sans prévenir.
    if(quietAlerts){quietAlerts=false;return;}
    if(fresh.length){var sorted=fresh.sort(function(a,b){return b.lvl-a.lvl||b.spent/b.bud-a.spent/a.bud;});pushNow(sorted);whenFree(function(){if(document.body.dataset.page==="dashboard")budgetAlert(sorted);});}
  }
  /* Pluriel : « 1 dépense fixe ajoutée » / « 3 dépenses fixes ajoutées » */
  function fixedAdded(n,month){return en()?n+" fixed expense"+(n===1?"":"s")+" added to "+month:n===1?"1 dépense fixe ajoutée à "+month:n+" dépenses fixes ajoutées à "+month;}
  /* Texte des notifications poussées (écran verrouillé, autres appareils) : jamais de montant. */
  function pushText(a){return a.lvl>=100?t2(a.name+" : plafond atteint",a.name+": limit reached"):t2(a.name+" : 80 % du plafond",a.name+": 80% of the limit");}
  function pushBody(a){return a.lvl>=100?t2("Tu as atteint le plafond fixé pour ce mois.","You reached the limit set for this month."):t2("Tu approches du plafond fixé pour ce mois.","You are getting close to this month’s limit.");}
  // Bandeau fin au-dessus de la barre du bas : une ligne, une croix. Se ferme seul, ou en changeant de page.
  function budgetAlert(list){
    var first=list[0],more=list.length-1,over=first.lvl>=100;
    var old=byId("gfhBudgetAlert");if(old)old.remove();
    var c=el("div","gfh-banner"+(over?" is-over":""));c.id="gfhBudgetAlert";c.setAttribute("role","status");
    var ic=el("span","gfh-banner-ic");ic.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4L12 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></svg>';
    var tx=el("span","gfh-banner-tx");
    tx.append(el("b","",first.name),document.createTextNode(" · "+(over?t2("plafond atteint","limit reached"):t2("80 % du plafond","80% of the limit"))+" · "),el("span","gfh-banner-amt",eur(Math.round(first.spent))+" / "+eur(Math.round(first.bud))));
    if(more)tx.append(document.createTextNode(t2(" · +"+more+" autre"+(more>1?"s":"")," · +"+more+" more")));
    var x=el("button","gfh-banner-x");x.type="button";x.setAttribute("aria-label",t2("Fermer","Close"));x.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';x.addEventListener("click",closeAlert);
    c.append(ic,tx,x);document.body.append(c);requestAnimationFrame(function(){c.classList.add("is-on");});
    setTimeout(function(){if(c.isConnected)closeAlert();},9000);
  }
  function pushNow(list){var first=list[0],more=list.length-1,title=first.lvl>=100?t2("Plafond atteint","Limit reached"):t2("Bientôt au plafond","Close to the limit");pushBudget(list,title,pushText(first)+(more?t2(" · et "+more+" autre"+(more>1?"s":""),", and "+more+" more"):""));}
  /* Notification sur tous mes appareils (compte connecté et notifications activées), même app fermée.
     Sinon, notification de cet appareil seulement si elle a déjà été autorisée (jamais de demande surprise). */
  function pushBudget(list,title,body){
    var R=window.GFReminders;
    var local=function(){try{if("Notification" in window&&Notification.permission==="granted"&&navigator.serviceWorker)navigator.serviceWorker.ready.then(function(r){r.showNotification("Meuniance · "+title,{body:body,icon:"/app-icon-180.png",tag:"meuniance-plafond",data:{url:"/accueil"}});}).catch(function(){});}catch(e){}};
    if(!R||!R.pushReady){local();return;}
    R.pushReady().then(function(ready){
      if(!ready){local();return;}
      var now=new Date(),month=now.getFullYear()+"-"+(now.getMonth()+1);
      list.forEach(function(a){
        var t=pushText(a),b=pushBody(a);// jamais de montant dans une notification poussée
        R.notifyMe("budget","plafond:"+month+":"+normKey(a.name).slice(0,40)+":"+a.lvl,t,b,"/accueil");
      });
    }).catch(local);
  }

  /* ── Objectif atteint : bravo sur l'accueil et sur le téléphone (jamais pour un objectif de dépense) ── */
  var GOALS_KEY="personalFinanceDashboard.goalsCelebrated";
  function checkGoals(p){
    var srcs=[];try{srcs=window.FinanceSheet&&window.FinanceSheet.getObjectiveSources?window.FinanceSheet.getObjectiveSources():[];}catch(e){}
    var goals=(Array.isArray(p.objectives)?p.objectives:[]).filter(function(g){return g&&g.id&&!g.archived&&Number(g.target)>0&&g.type!=="expense";});
    var seen=null;try{seen=JSON.parse(lsGet(GOALS_KEY)||"null");}catch(e){}
    var first=!seen||typeof seen!=="object";if(first)seen={};
    var fresh=[];
    goals.forEach(function(g){
      var src=g.sourceId&&srcs.filter(function(x){return x.id===g.sourceId;})[0],cur=src?Number(src.value):Number(g.current||0),tar=Number(g.target),key=String(g.id);
      if(cur>=tar){if(Number(seen[key])!==tar){if(!first)fresh.push({g:g,cur:cur,tar:tar});seen[key]=tar;}}
      else if(seen[key]&&cur<tar*.9)delete seen[key];// repassé nettement en dessous : on pourra refêter
    });
    lsSet(GOALS_KEY,JSON.stringify(seen));
    if(!fresh.length)return;
    var f=fresh[0],title=t2("Bravo, objectif atteint !","Well done, goal reached!"),name=String(f.g.title||t2("Ton objectif","Your goal"));
    whenFree(function(){toast(title+" « "+name+" »");});
    var R=window.GFReminders;if(!R||!R.notifyMe)return;
    fresh.forEach(function(x){
      var nm=String(x.g.title||t2("Ton objectif","Your goal")).slice(0,60);
      R.notifyMe("goals","goal:"+String(x.g.id).slice(0,40)+":"+x.tar,title,t2("« "+nm+" » est atteint.","“"+nm+"” is reached."),"/objectifs");
    });
  }

  /* ── Bilan du mois en une phrase ───────────────────────────────────────── */
  function bilan(sel,prev,empty){
    if(empty)return t2("Rien de saisi ce mois-ci : ajoute tes lignes dans le Tableur ou avec le bouton +.","Nothing entered this month: add rows in the Spreadsheet or with the + button.");
    var over=(sel.cats||[]).filter(function(c){var b=budgetOf(c.name);return b&&Math.abs(Number(c.value||0))>b;}).map(function(c){return c.name;});
    var tail=over.length?" "+(over.length===1?t2("«\u00a0"+over[0]+"\u00a0» dépasse son plafond.","“"+over[0]+"” is over its limit."):t2(over.length+" lignes dépassent leur plafond.",over.length+" rows are over their limit.")):"";
    if(!prev||!prev.expenses){return t2("Ce mois-ci : ","This month: ")+eur(sel.expenses)+t2(" dépensés et "," spent and ")+eur(sel.savings)+t2(" mis de côté."," saved.")+tail;}
    var d=(sel.expenses-prev.expenses)/prev.expenses*100,pm=catMap(prev),cm=catMap(sel),best=null;
    Object.keys(Object.assign({},pm,cm)).forEach(function(n){var diff=(cm[n]||0)-(pm[n]||0);if(d<0?diff<0:diff>0){if(!best||Math.abs(diff)>Math.abs(best.diff))best={n:n,diff:diff};}});
    var pct1=Math.abs(d).toLocaleString(en()?"en-IE":"fr-FR",{maximumFractionDigits:0}),pmn=mname(prev.mi);
    if(Math.abs(d)<1)return t2("Tes dépenses sont stables par rapport à ","Your spending is stable compared with ")+pmn+"."+tail;
    var why=best?(d<0?t2(", surtout grâce à «\u00a0",", mostly thanks to “"):t2(", surtout à cause de «\u00a0",", mostly because of “"))+best.n+t2("\u00a0» (","” (")+(best.diff<0?"−":"+")+eur(Math.abs(best.diff))+")":"";
    return (d<0?t2("Tu as dépensé "+pct1+" % de moins qu’en "+pmn,"You spent "+pct1+"% less than in "+pmn):t2("Tu as dépensé "+pct1+" % de plus qu’en "+pmn,"You spent "+pct1+"% more than in "+pmn))+why+"."+tail;
  }

  /* ── Bilan du mois écoulé : affiché dès le début du mois suivant, jusqu'à « J'ai vu » ─── */
  var RECAP_KEY="personalFinanceDashboard.recapSeen",flashMonth=0;
  function recapMonth(all){
    var now=new Date(),cur=now.getFullYear()*12+now.getMonth();
    var past=all.filter(function(m){return !m.blank&&m.year*12+m.mi<cur&&(m.salary||m.expenses||m.savings);});
    return past.length?past[past.length-1]:null;
  }
  function recapPanel(all,bal,force){
    var R=recapMonth(all);if(!R)return null;
    var pinned=blocks().recapPin;
    var tag=R.year+"-"+String(R.mi+1).padStart(2,"0");if(!force&&!pinned&&lsGet(RECAP_KEY)===tag)return null;
    var prev=all.filter(function(m){return m.year*12+m.mi===R.year*12+R.mi-1&&!m.blank;})[0]||null;
    var rest=flow(R),cats=catMap(R),names=Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];}),top=names[0];
    var year=all.filter(function(m){return m.year===R.year&&!m.blank&&(m.salary||m.expenses||m.savings);});
    var box=el("section","gfh-recap");box.setAttribute("aria-labelledby","gfhRecapT");
    var head=el("div","gfh-recap-head"),ht=el("div");
    ht.append(el("span","gfh-kick",t2("Bilan du mois","Monthly recap")));
    var ys=R.year!==new Date().getFullYear()?" "+R.year:"",fr=MN[R.mi];
    var h=el("h3","",en()?"Your "+MN_EN[R.mi]+ys+" in review":"Ton mois "+(/^[aeiou]/.test(fr)?"d’":"de ")+fr+ys);h.id="gfhRecapT";ht.append(h);
    var x=el("button","gfh-recap-x","×");x.type="button";x.setAttribute("aria-label",t2("Masquer le bilan","Hide recap"));
    x.addEventListener("click",function(){lsSet(RECAP_KEY,tag);schedule();});
    head.append(ht);if(!pinned)head.append(x);box.append(head);
    var grid=el("div","gfh-recap-grid");
    function stat(label,value,note,cls){var d=el("div","gfh-recap-stat"+(cls?" "+cls:""));d.append(el("span","t",label),el("b","v gf-amount",value));if(note)d.append(el("small","",note));grid.append(d);}
    stat(t2("Reste du mois","Left this month"),(rest<0?"−":"")+eur(Math.abs(rest)),R.salary?t2("sur ","of ")+eur(R.salary)+t2(" de revenus"," income"):t2("Revenus non saisis","Income not entered"),rest<0?"is-neg":"");
    var rate=R.salary?Math.round(R.savings/R.salary*100):null;
    stat(t2("Épargne","Savings"),eur(R.savings),rate!=null&&R.savings?rate+(en()?"%":" %")+t2(" de tes revenus"," of your income"):(R.savings?"":t2("Rien de côté","Nothing saved")));
    if(top)stat(t2("Plus grosse dépense","Biggest expense"),eur(cats[top]),top+(R.expenses?" · "+Math.round(cats[top]/R.expenses*100)+(en()?"% of spending":" % de tes dépenses"):""));
    if(prev&&prev.expenses&&R.expenses){var dv=(R.expenses-prev.expenses)/prev.expenses*100,ab=Math.abs(dv);stat(t2("Dépenses","Spending"),(dv>0?"+":dv<0?"−":"")+ab.toLocaleString(en()?"en-IE":"fr-FR",{maximumFractionDigits:0})+(en()?"%":" %"),t2("face à ","vs ")+mname(prev.mi)+" · "+eur(R.expenses),dv>0?"is-up":"is-down");}
    else stat(t2("Dépenses","Spending"),eur(R.expenses),t2("Premier mois comparable","First comparable month"));
    box.append(grid);
    // Un fait marquant, le plus parlant d'abord
    var others=year.filter(function(m){return m.id!==R.id;}),fact="",savs=others.map(function(m){return m.savings;}),exps=others.filter(function(m){return m.expenses;}).map(function(m){return m.expenses;});
    var over=names.filter(function(n){var b=budgetOf(n);return b&&cats[n]>b;});
    if(over.length)fact=over.length===1?t2("«\u00a0"+over[0]+"\u00a0» a dépassé son plafond de ","“"+over[0]+"” went over its limit by ")+eur(cats[over[0]]-budgetOf(over[0]))+".":t2(over.length+" lignes ont dépassé leur plafond.",over.length+" rows went over their limit.");
    else if(year.length>=3&&R.savings>0&&R.savings>Math.max.apply(null,savs))fact=t2("Ton meilleur mois d’épargne de l’année. Bravo !","Your best savings month of the year. Well done!");
    else if(year.length>=3&&R.expenses&&exps.length&&R.expenses<Math.min.apply(null,exps))fact=t2("Tes dépenses les plus basses de l’année.","Your lowest spending of the year.");
    else if(prev){var pm=catMap(prev),best=null;names.forEach(function(n){var d=cats[n]-(pm[n]||0);if(pm[n]&&d>0&&(!best||d>best.d))best={n:n,d:d};});
      if(best&&best.d>=20)fact=t2("«\u00a0"+best.n+"\u00a0» a augmenté de ","“"+best.n+"” went up by ")+eur(best.d)+t2(" par rapport à "," compared with ")+mname(prev.mi)+".";}
    if(!fact&&rest>0)fact=t2("Mois bouclé dans le vert : ","Month closed in the green: ")+eur(rest)+t2(" de reste."," left.");
    if(fact)box.append(el("p","gfh-recap-fact",fact));
    var acts=el("div","gfh-recap-acts"),see=el("button","gfh-btn",t2("Voir ","See ")+mname(R.mi)),ok=el("button","gfh-link",t2("J’ai vu","Got it"));see.type=ok.type="button";
    // Ouvre le mois sur l'accueil : le bilan se range et on remonte au mois choisi, bien visible.
    see.addEventListener("click",function(){if(!pinned)lsSet(RECAP_KEY,tag);flashMonth=Date.now();select(R);schedule();setTimeout(function(){var t=document.querySelector("#gfhHome .gfh-topbar");if(t)t.scrollIntoView({behavior:"smooth",block:"start"});},350);});ok.addEventListener("click",function(){lsSet(RECAP_KEY,tag);schedule();});
    acts.append(see);if(!pinned)acts.append(ok);box.append(acts);
    return box;
  }

  /* ── Objectifs sur l'accueil (avec les montants liés au tableur) ─────────── */
  function goalsPanel(p){
    var srcs=[];try{srcs=window.FinanceSheet&&window.FinanceSheet.getObjectiveSources?window.FinanceSheet.getObjectiveSources():[];}catch(e){}
    var goals=(Array.isArray(p.objectives)?p.objectives:[]).filter(function(g){return g&&!g.archived&&Number(g.target)>0;});
    var box=el("div","gfh-panel gfh-goal"),head=el("div","gfh-row");
    head.append(el("h3","",t2("Objectifs","Goals")));
    var go=el("button","gfh-link",goals.length?t2("Tout voir","See all"):t2("Fixer un objectif","Set a goal"));go.type="button";go.addEventListener("click",function(){if(window.setPage)window.setPage("objectives");});head.append(go);box.append(head);
    if(!goals.length){box.append(el("small","",t2("Un voyage, un apport, un coussin de sécurité : fixe un montant et suis ta progression ici.","A trip, a deposit, a safety net: set an amount and follow your progress here.")));return box;}
    goals.slice(0,3).forEach(function(g){
      var src=g.sourceId&&srcs.filter(function(s){return s.id===g.sourceId;})[0],cur=src?Number(src.value):Number(g.current||0),tar=Number(g.target),pc=Math.max(0,Math.min(100,Math.round(cur/tar*100)));
      var it=el("div","gfh-goal-item"),r=el("div","gfh-row");r.append(el("span","gfh-goal-t",String(g.title||"")),el("span","gfh-pc",pc+(en()?"%":" %")));
      var pg=el("div","gfh-pg"),pf=el("b");pf.style.width=pc+"%";pg.append(pf);pg.setAttribute("role","progressbar");pg.setAttribute("aria-valuemin","0");pg.setAttribute("aria-valuemax","100");pg.setAttribute("aria-valuenow",String(pc));pg.setAttribute("aria-label",String(g.title||""));
      var meta=el("small","",eur(cur)+" "+t2("sur","of")+" "+eur(tar)+(g.paused?t2(" · en pause"," · paused"):src?" · "+String(src.label).replace(" — "," "):""));
      it.append(r,pg,meta);box.append(it);
    });
    if(goals.length>3)box.append(el("small","gfh-muted","+ "+(goals.length-3)+t2(" autres"," more")));
    return box;
  }
  var loaderOn=false;
  function loaderStart(label){try{if(window.MeuniLoader){window.MeuniLoader.start(label);loaderOn=true;setTimeout(loaderDone,4000);}}catch(e){}}
  function loaderDone(){if(!loaderOn)return;loaderOn=false;try{window.MeuniLoader.done();}catch(e){}}
  window.addEventListener("gf:dashboardupdate",function(){setTimeout(loaderDone,60);});
  function select(m){
    if(m&&(m.blank||m.local)){emptyMi=m.mi;schedule();return;}
    var ys=byId("yearSelect"),ms=byId("monthSelect");if(!ms||!m)return;
    if(ys&&String(ys.value)!==String(m.year)){loaderStart(t2("Je retrouve tes chiffres de ","Finding your figures for ")+m.year+"…");ys.value=String(m.year);ys.dispatchEvent(new Event("change",{bubbles:true}));}
    ms.value=m.id;ms.dispatchEvent(new Event("change",{bubbles:true}));
  }

  function render(){
    var page=byId("dashboardPage"),content=page&&page.querySelector(".content");if(!content)return;
    var data=typeof window.__gfHomeData==="function"?window.__gfHomeData():null;
    var all=(data&&data.all||[]).filter(function(m){return m.year&&m.mi>=0;}).map(function(m){return{id:m.id,year:Number(m.year),mi:m.mi,salary:Number(m.salary||0),expenses:Math.abs(Number(m.expenses||0)),savings:Math.abs(Number(m.savingsTotal||0)),cats:m.cats||[]};});
    var root=byId("gfhHome");
    var blank=!all.length;
    if(blank){all=[];for(var bi=0;bi<12;bi++)all.push({id:"blank-"+bi,blank:true,year:emptyYear,mi:bi,salary:0,expenses:0,savings:0,cats:[]});data={selectedId:"blank-"+emptyMi};}
    document.body.classList.toggle("gfh-empty",blank);
    var demo=!blank&&exampleOn();
    var B=blocks();document.body.classList.toggle("gfh-nocharts",!B.charts);
    all.sort(function(a,b){return a.year-b.year||a.mi-b.mi;});
    var idx=all.findIndex(function(m){return m.id===data.selectedId;});if(idx<0)idx=all.length-1;
    var sel=all[idx],prev=idx>0?all[idx-1]:null;
    var p=profile(),hasStart=p.startingCash!==""&&p.startingCash!=null&&isFinite(parseFloat(p.startingCash));
    var ref=String(p.currentCashDate||p.startingMonth||"").slice(0,7);
    var run=hasStart?parseFloat(p.startingCash):0,bal={};
    all.forEach(function(m){var k=m.year+"-"+String(m.mi+1).padStart(2,"0");if(!hasStart||!ref||k>=ref)run+=flow(m);bal[m.id]=run;});
    var sd=bal[sel.id],psd=prev?bal[prev.id]:null;
    var yearMonths={};all.forEach(function(m){if(m.year===sel.year)yearMonths[m.mi]=m;});
    var empty=sel.salary+sel.expenses+sel.savings===0;

    if(!root){root=el("section","gfh-home");root.id="gfhHome";root.setAttribute("aria-label",t2("Accueil","Home"));content.insertBefore(root,content.firstChild);}

    // Années : un seul menu compact (2026 ▾), qui reste lisible avec 2 comme avec 20 années
    var years=Array.from(new Set(all.map(function(m){return m.year;}))).sort(function(a,b){return b-a;});
    var yrs=el("div","gfh-yrs");
    if(years.length<2){yrs.append(el("span","gfh-yr-only",String(sel.year)));}
    else{
      var ylab=el("label","gfh-yr"),ysel=document.createElement("select");
      ylab.append(el("span","gfh-sr",t2("Année","Year")),ysel);
      years.forEach(function(y){var last=all.filter(function(m){return m.year===y;}).pop(),o=new Option(String(y)+(last&&bal[last.id]!=null&&!amountsHidden()?" · "+eur(bal[last.id]):""),String(y));o.selected=y===sel.year;ysel.append(o);});
      // Changer d'année garde le même mois quand il existe
      ysel.addEventListener("change",function(){var y=Number(ysel.value);if(y===sel.year)return;var ms=all.filter(function(m){return m.year===y;}),same=ms.filter(function(m){return m.mi===sel.mi;})[0];select(same||ms[ms.length-1]);});
      yrs.append(ylab);
      if(window.GFSelect)window.GFSelect.enhance(ysel);
    }
    // Mois ‹ ›
    var mon=el("div","gfh-mon"),pb=el("button","","‹"),nb=el("button","","›");
    pb.type=nb.type="button";pb.setAttribute("aria-label",t2("Mois précédent","Previous month"));nb.setAttribute("aria-label",t2("Mois suivant","Next month"));
    pb.disabled=idx===0;nb.disabled=idx===all.length-1;
    pb.addEventListener("click",function(){select(all[idx-1]);});nb.addEventListener("click",function(){select(all[idx+1]);});
    var mlab=el("span"),mshort=el("span","gfh-mon-s",cap(new Intl.DateTimeFormat(en()?"en-GB":"fr-FR",{month:"short"}).format(new Date(2020,sel.mi,1)))+" "+sel.year);
    mshort.setAttribute("aria-hidden","true");mlab.append(el("span","gfh-mon-l",cap(mname(sel.mi))+" "+sel.year),mshort);
    mon.append(pb,mlab,nb);
    if(Date.now()-flashMonth<1500)mon.classList.add("is-flash");

    // Salutation
    var hi=el("div","gfh-hi"),nm=name();
    hi.append(el("h2","",(t2("Bonjour","Hello")+(nm?" "+nm:"")).trim()));
    hi.append(el("p","gfh-bilan",blank?t2("Rien de saisi pour l’instant : commence dans le Tableur ou avec le bouton +.","Nothing entered yet: start in the Spreadsheet or with the + button."):bilan(sel,prev,empty)));

    // Carte solde
    var card=el("div","gfh-card");
    var lab=el("div","gfh-lab");lab.append(el("span","",hasStart?t2("Solde disponible","Available balance"):t2("Solde calculé","Calculated balance")),eyeButton());card.append(lab);
    var bigTxt=eur(sd); card.append(el("div","gfh-big"+(bigTxt.length>11?" is-xl":bigTxt.length>9?" is-long":""),bigTxt));
    var dl=el("div","gfh-dl");
    if(blank)dl.append(document.createTextNode(t2("Aucune donnée pour l’instant","No data yet")));
    else if(prev&&psd){dl.append(el("b","",pct(sd,psd)),document.createTextNode(t2(" face à "," vs ")+mname(prev.mi)));}
    else dl.append(document.createTextNode(t2("Premier mois suivi","First tracked month")));
    if(!hasStart){var su=el("button","gfh-setup",t2("Ajouter mon solde de départ","Add my starting balance"));su.type="button";su.addEventListener("click",function(){if(window.FinanceSheet&&window.FinanceSheet.openStartingBalance)window.FinanceSheet.openStartingBalance();else if(window.setPage)window.setPage("sheet");});dl.append(su);}
    card.append(dl);
    var vals=Object.keys(yearMonths).map(function(k){return bal[yearMonths[k].id];}),mx=Math.max.apply(null,vals),mn=Math.min.apply(null,vals.concat([0]));
    var bars=el("div","gfh-bars"),mo=el("div","gfh-mo");bars.setAttribute("role","group");bars.setAttribute("aria-label",t2("Solde mois par mois","Balance month by month"));
    for(var j=0;j<12;j++){(function(j){
      var m=yearMonths[j],b=el("button",(m&&m.id===sel.id?"on":"")+(m&&m.blank?" e":"")),s=el("span");b.type="button";
      if(m&&m.blank){s.style.height="6%";b.setAttribute("aria-label",cap(mname(j))+", "+t2("aucune donnée","no data"));b.setAttribute("aria-pressed",String(m.id===sel.id));b.addEventListener("click",function(){select(m);});}
      else if(m){var v=bal[m.id],h=mx>mn?(mn<0?(v-mn)/(mx-mn):v/mx)*100:100;s.style.height=Math.max(6,Math.round(h))+"%";b.setAttribute("aria-label",cap(mname(j))+", "+t2("solde ","balance ")+eur(v));b.setAttribute("aria-pressed",String(m.id===sel.id));b.addEventListener("click",function(){select(m);});}
      else{s.style.height="6%";b.disabled=true;b.setAttribute("aria-label",cap(mname(j))+", "+t2("aucune donnée","no data"));}
      b.append(s);bars.append(b);mo.append(el("span","",en()?MN_EN[j].charAt(0):MS[j]));
    })(j);}
    card.append(bars,mo);

    // Pied de carte : le mois en trois chiffres (comme la carte de la maquette). Chaque chiffre est facultatif.
    if(!blank&&B.month){
      var foot=el("div","gfh-foot"),rest=flow(sel);
      var ep=all.filter(function(m){return m.year===sel.year&&m.mi<=sel.mi;}).reduce(function(s,m){return s+m.savings;},0);
      var f1=el("div");f1.append(el("div","t",t2("Revenus","Income")),el("div","v"+(sel.salary?"":" none"),sel.salary?eurS(sel.salary):"—"),el("small","",sel.salary?t2("Reste ","Left ")+eur(rest):t2("Non saisis","Not entered")));
      var f2=el("div");f2.append(el("div","t",t2("Dépenses","Expenses")),el("div","v"+(sel.expenses?"":" none"),sel.expenses?eurS(sel.expenses):"—"));
      var d2=el("small");if(!sel.expenses)d2.textContent=t2("Rien ce mois-ci","None this month");else if(prev&&prev.expenses){d2.append(el("b",sel.expenses<=prev.expenses?"up":"down",pct(sel.expenses,prev.expenses)),document.createTextNode(t2(" face à "," vs ")+mname(prev.mi).slice(0,4)+"."));}else d2.textContent=t2("Ce mois","This month");f2.append(d2);
      var f3=el("div");f3.append(el("div","t",t2("Épargne","Savings")),el("div","v"+(sel.savings?"":" none"),sel.savings?eurS(sel.savings):"—"),el("small","",ep?t2("Cumul ","Total ")+eur(ep):t2("Rien de côté","Nothing saved")));
      foot.append(f1,f2,f3);card.append(foot);
    }

    // Colonne droite
    var right=el("div","gfh-right"),goal=mainGoal(p);
    if(blank){
      var start=el("div","gfh-panel gfh-start");
      start.append(el("span","gfh-kick",t2("Pour commencer","Get started")),el("h3","",t2("Ton accueil se remplit tout seul.","Your home fills itself in.")));
      var steps=el("ol","gfh-steps");[t2("Indique ton solde de départ","Enter your starting balance"),t2("Ajoute ou importe tes opérations","Add or import your transactions"),t2("Retrouve ici ton solde, tes dépenses et ton épargne","See your balance, spending and savings here")].forEach(function(x){steps.append(el("li","",x));});
      var acts=el("div","gfh-acts"),a1=el("button","gfh-btn is-primary",t2("Ouvrir le tableur","Open the spreadsheet")),a2=el("button","gfh-btn",t2("Importer un relevé ou un fichier Excel","Import a statement or an Excel file"));a1.type=a2.type="button";
      a1.addEventListener("click",function(){if(window.setPage)window.setPage("sheet");});
      a2.addEventListener("click",function(){if(window.setPage)window.setPage("sheet");requestAnimationFrame(function(){var b=byId("btnSheetImport");if(b)b.click();});});
      acts.append(a1,a2);start.append(steps,acts);
      var ex=el("button","gfh-link",t2("Ou charge un exemple dans le tableur","Or load a sample into the spreadsheet"));ex.type="button";ex.addEventListener("click",loadExample);start.append(ex);
      right.append(start);if(B.goal)right.append(goalsPanel(p));
    }else{
      var where=el("div","gfh-panel gfh-where"),wh=el("div","gfh-row");
      wh.append(el("h3","",t2("Où part ton argent","Where your money goes")),el("span","gfh-muted",cap(mname(sel.mi))));
      where.append(wh);
      var cats=sel.cats.map(function(c){return{n:String(c.name||""),a:Math.abs(Number(c.value||0))};}).filter(function(c){return c.a>0;}).sort(function(a,b){return b.a-a.a;});
      if(cats.length){var tot=cats.reduce(function(s,c){return s+c.a;},0);cats.slice(0,7).forEach(function(c){
        var bud=budgetOf(c.n),over=bud&&c.a>bud,d=el("button","gfh-cat"+(over?" is-over":"")),r=el("div","gfh-row");d.type="button";d.title=t2("Fixer un plafond pour ","Set a limit for ")+c.n;
        r.append(el("span","",c.n),el("span","",bud?eur(c.a)+" / "+eur(bud):eur(c.a)));
        var g=el("div","gfh-pg"),f=el("b");f.style.width=Math.min(100,bud?c.a/bud*100:(tot?c.a/tot*100:0))+"%";g.append(f);d.append(r,g);
        if(over)d.append(el("small","gfh-over",t2("Dépassé de ","Over by ")+eur(c.a-bud)));
        d.addEventListener("click",function(){budgetDialog(c.n,c.a);});where.append(d);});
        if(cats.length>7)where.append(el("small","gfh-muted","+ "+(cats.length-7)+t2(" autres lignes"," more rows")));
        where.append(el("p","gfh-hint",t2("Touche une ligne pour lui fixer un plafond.","Tap a row to set a limit.")));}
      else where.append(el("p","gfh-empty",t2("Aucune dépense ce mois-ci.","No expenses this month.")));
      var fx=(B.fixed!==false)&&sel.id===all[all.length-1].id?fixedSuggestion(all):null,fp=fx?fixedPanel(fx):null;if(B.where)right.append(where);if(fp)right.append(fp);if(B.subs&&window.GFSubs){var sp=window.GFSubs.panel();if(sp)right.append(sp);}if(B.goal)right.append(goalsPanel(p));
    }

    var rc=!blank&&B.recap?recapPanel(all,bal):null;
    var yc=!blank&&B.year!==false&&window.GFYear?window.GFYear.card():null;
    var left=el("div","gfh-left");left.append(card);
    var dg=el("div","gfh-dg"+(right.childNodes.length?"":" is-solo"));dg.append(left);if(right.childNodes.length)dg.append(right);
    var top=[];
    if(demo)top.push(exampleBar("home"));
    var bar=el("div","gfh-topbar");
    bar.append(yrs);
    bar.append(mon);
    var plus=el("button","gfh-add");plus.type="button";plus.setAttribute("aria-label",t2("Ajouter une dépense ou un revenu","Add an expense or income"));
    plus.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>'+t2("Ajouter","Add")+'</span>';
    var expLines=[];all.slice().reverse().forEach(function(m){(m.cats||[]).forEach(function(c){if(expLines.indexOf(c.name)<0)expLines.push(c.name);});});
    plus.addEventListener("click",function(){quickAdd({year:sel.year,mi:sel.mi,expenseLines:expLines});});
    bar.append(plus);
    // Redessiner l'accueil ne doit ni faire remonter la page ni perdre le focus (sinon, après un toucher sur
    // une barre de mois, le navigateur remonte tout en haut et la barre jaune sort de l'écran).
    var keepY=window.scrollY,hadFocus=document.activeElement&&root.contains(document.activeElement),focusBar=hadFocus&&document.activeElement.closest(".gfh-bars");
    root.replaceChildren.apply(root,top.concat([bar,hi],yc?[yc]:[],rc?[rc]:[],[dg]));
    if(focusBar){var nf=root.querySelector(".gfh-bars button.on");if(nf)try{nf.focus({preventScroll:true});}catch(e){}}
    if(Math.abs(window.scrollY-keepY)>1)window.scrollTo(0,keepY);
    document.body.classList.add("gfh-ready");
    if(document.body.classList.contains("tutorial-active"))setTimeout(function(){window.dispatchEvent(new Event("resize"));},30);
    openFromLink(plus);
    if(window.GFYear&&!blank)window.GFYear.fromLink();
    if(!blank&&!demo){checkBudgets(all);checkGoals(p);}
    if(window.GFSubs)setTimeout(function(){try{window.GFSubs.afterRender();}catch(e){}},700);
  }
  /* Raccourci « Ajouter une dépense » (appui long sur l'icône de l'app, ou /accueil?ajout=depense|revenu|epargne) :
     ouvre l'ajout rapide une seule fois, dès que l'accueil est prêt, jamais par-dessus le tutoriel. */
  var linkAdd=(function(){try{var v=new URLSearchParams(location.search).get("ajout");return ["depense","revenu","epargne"].indexOf(v)>=0?v:null;}catch(e){return null;}})();
  function openFromLink(plus){
    if(!linkAdd||document.body.dataset.page!=="dashboard"||document.body.classList.contains("tutorial-active")||document.querySelector("dialog[open]"))return;
    var kind=linkAdd;linkAdd=null;
    try{var u=new URL(location.href);u.searchParams.delete("ajout");history.replaceState(history.state,"",u.pathname+u.search+u.hash);}catch(e){}
    setTimeout(function(){plus.click();var i={depense:0,revenu:1,epargne:2}[kind];var b=document.querySelectorAll(".gfh-quick .gfh-seg button")[i];if(b&&i)b.click();},60);
  }

  /* Réglages : Paramètres › Apparence › Accueil (blocs facultatifs) */
  var homeSetOpen=false;
  function settingsUI(){
    var panel=document.querySelector('[data-settings-panel="appearance"]');if(!panel)return;
    var box=byId("gfhSettings");
    if(!box){box=el("section","gfh-set");box.id="gfhSettings";box.setAttribute("aria-labelledby","gfhSetTitle");var head=panel.querySelector(".settings-section-head");if(head&&head.nextSibling)panel.insertBefore(box,head.nextSibling);else panel.append(box);}
    var b=blocks(),rows=[["month",t2("Chiffres du mois","Month figures"),t2("Revenus, dépenses et épargne.","Income, expenses and savings.")],["recap",t2("Bilan du mois","Monthly recap"),t2("Le résumé du mois écoulé, en début de mois.","Last month’s summary, at the start of the month.")],["recapPin",t2("Bilan toujours affiché","Always show the recap"),t2("Le garde en haut de l’accueil tout le mois.","Keeps it at the top of Home all month.")],["year",t2("Bilan de l’année","Year in review"),t2("En décembre et janvier, ton année en quelques écrans.","In December and January, your year in a few screens.")],["where",t2("Où part ton argent","Where your money goes"),t2("Tes dépenses du mois, ligne par ligne.","Your month’s expenses, row by row.")],["goal",t2("Objectif","Goal"),t2("La progression de ton objectif principal.","Progress of your main goal.")],["fixed",t2("Dépenses fixes","Fixed expenses"),t2("Propose les lignes qui reviennent chaque mois.","Suggests rows that come back every month.")],["subs",t2("Abonnements","Subscriptions"),t2("Ceux repérés dans tes relevés importés.","Those found in your imported statements.")],["charts",t2("Graphiques","Charts"),t2("Camembert, comparatif, évolution.","Pie, comparison, trend.")]];
    function sw(label,on,onClick){var x=el("button","gfh-switch");x.type="button";x.setAttribute("role","switch");x.setAttribute("aria-checked",String(!!on));x.setAttribute("aria-label",label);x.append(el("span"));x.addEventListener("click",function(){var next=x.getAttribute("aria-checked")!=="true";x.setAttribute("aria-checked",String(next));onClick(next);});return x;}
    function row(title,desc,control,sub){var r=el("div","gfh-set-row"+(sub?" is-sub":"")),txt=el("div","gfh-set-copy");txt.append(el("strong","",title),el("small","",desc));r.append(txt,control);return r;}
    // En-tête repliable : une flèche à droite développe tous les réglages de l'accueil.
    var h=el("h4","");h.id="gfhSetTitle";
    var tog=el("button","gfh-set-toggle");tog.type="button";tog.setAttribute("aria-expanded",String(homeSetOpen));tog.setAttribute("aria-controls","gfhSetBody");
    var tt=el("span","gfh-set-toggle-text");tt.append(el("strong","",t2("Accueil","Home")),el("small","",t2("Choisis ce que montre ton accueil. Tout est facultatif.","Choose what your home shows. Everything is optional.")));
    var chev=el("span","gfh-set-chev");chev.setAttribute("aria-hidden","true");chev.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    tog.append(tt,chev);h.append(tog);
    var body=el("div","gfh-set-body");body.id="gfhSetBody";body.hidden=!homeSetOpen;
    tog.addEventListener("click",function(){homeSetOpen=!homeSetOpen;tog.setAttribute("aria-expanded",String(homeSetOpen));body.hidden=!homeSetOpen;});
    // Groupe 1 : les blocs de l'accueil. « Bilan toujours affiché » n'apparaît que si le bilan est activé.
    var blocksList=el("div","gfh-set-group");
    rows.forEach(function(r){
      if(r[0]==="recapPin"&&!b.recap)return;
      blocksList.append(row(r[1],r[2],sw(r[1],b[r[0]],function(next){setBlock(r[0],next);if(r[0]==="recap")settingsUI();}),r[0]==="recapPin"));
    });
    // Groupe 2 : discrétion.
    var privacy=el("div","gfh-set-group");
    privacy.append(row(t2("Masquer les montants","Hide amounts"),t2("Floute tes chiffres quand tu montres ton écran.","Blurs your figures when you show your screen."),sw(t2("Masquer les montants","Hide amounts"),amountsHidden(),function(){setHidden(!amountsHidden());})));
    body.append(el("p","gfh-set-label",t2("Sur l’accueil","On Home")),blocksList,el("p","gfh-set-label",t2("Discrétion","Privacy")),privacy);
    box.replaceChildren(h,body);
  }
  var queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{render();}catch(e){console.warn("Accueil Meuniance",e);document.body.classList.remove("gfh-ready");}});}
  /* Solde global (dernier mois saisi) avec la même règle que l'accueil, pour que le tableur affiche le même chiffre. */
  function totalBalance(){
    var data=typeof window.__gfHomeData==="function"?window.__gfHomeData():null,all=(data&&data.all||[]).filter(function(m){return m.year&&m.mi>=0;});if(!all.length)return null;
    var p=profile(),hasStart=p.startingCash!==""&&p.startingCash!=null&&isFinite(parseFloat(p.startingCash)),ref=String(p.currentCashDate||p.startingMonth||"").slice(0,7),run=hasStart?parseFloat(p.startingCash):0;
    all.forEach(function(m){var k=m.year+"-"+String(m.mi+1).padStart(2,"0");if(!hasStart||!ref||k>=ref)run+=Number(m.salary||0)-Math.abs(Number(m.expenses||0))-Math.abs(Number(m.savingsTotal||0));});
    return run;
  }
  window.addEventListener("gf:dashboardupdate",function(){setTimeout(function(){try{window.FinanceSheet&&window.FinanceSheet.updateSheetBalanceCards&&window.FinanceSheet.updateSheetBalanceCards();}catch(e){}},0);});
  window.GFHome={alertsOn:alertsOn,setAlertsOn:function(v){lsSet(ALERT_ON,v?null:"0");},render:schedule,totalBalance:totalBalance,loadExample:loadExample,removeExample:removeExample};
  document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("[data-page]"))setTimeout(sheetBanner,60);});
  window.addEventListener("gf:dashboardupdate",function(){sheetBanner();});
  document.addEventListener("focusout",function(e){if(e.target&&e.target.closest&&e.target.closest("#sheetApp"))setTimeout(sheetBanner,400);});
  window.addEventListener("gf:dashboardupdate",schedule);
  window.addEventListener("gf:languagechange",function(){schedule();settingsUI();});
  window.addEventListener("authStateChanged",function(){setTimeout(schedule,800);});
  document.addEventListener("change",function(e){if(e.target&&(e.target.id==="monthSelect"||e.target.id==="yearSelect"))schedule();});
  applyHidden();window.addEventListener("authStateChanged",function(){setTimeout(applyHidden,850);});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){schedule();settingsUI();});else{schedule();settingsUI();}
  setTimeout(function(){preferCurrentYear();schedule();sheetBanner();},900);
})();
