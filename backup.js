/* Sauvegarde complète : télécharger toutes ses données dans un fichier, puis les restaurer.
   Format JSON (structuré et lisible, comme l'exige le droit à la portabilité), propre à Meuniance :
   seul le site sait le restaurer, et la restauration ne lit que des clés connues, vérifiées une à une. */
(function(){
  "use strict";
  var FORMAT="meuniance-sauvegarde",VERSION=1,MAX_BYTES=5*1024*1024;
  // Réglages repris d'une sauvegarde (aucune autre clé n'est jamais écrite)
  var KEYS=["personalFinanceDashboard.setupProfile","personalFinanceDashboard.categoryRules","personalFinanceDashboard.customRules",
    "personalFinanceDashboard.budgets","personalFinanceDashboard.homeBlocks","personalFinanceDashboard.hideAmounts",
    "personalFinanceDashboard.mode","personalFinanceDashboard.palette","personalFinanceDashboard.interface",
    "personalFinanceDashboard.language","personalFinanceDashboard.currentView","personalFinanceDashboard.merchantRules","personalFinanceDashboard.subscriptions","personalFinanceDashboard.importLedger"];
  var byId=function(id){return document.getElementById(id);};
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function store(){return window.safeStore;}
  function toast(text){var t=byId("gfhToast");if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},3800);}

  /* ── Téléchargement ─────────────────────────────── */
  async function sharing(){
    var a=window.__account||{};if(!a.client||!a.user)return [];
    try{var r=await a.client.rpc("get_my_friendships");return (r.data||[]).map(function(x){return{nom:x.other_display_name||"",email:x.other_email||"",statut:x.status};});}catch(e){return [];}
  }
  async function build(){
    var a=window.__account||{},user=a.user||null,settings={};
    KEYS.forEach(function(k){var v=store().getItem(k);if(v==null)return;try{settings[k]=JSON.parse(v);}catch(e){settings[k]=v;}});
    var sheet=window.FinanceSheet&&window.FinanceSheet.getSnapshot?window.FinanceSheet.getSnapshot():null;
    return{format:FORMAT,version:VERSION,application:"Meuniance",creeLe:new Date().toISOString(),
      compte:user?{email:user.email||"",pseudo:(function(t){t=String(t||"");return t.charAt(0)==="@"?t.slice(1):"";})((byId("identityCurrentUsername")||{}).textContent)}:null,
      tableur:sheet?{feuilles:sheet.sheets,feuilleActive:sheet.activeSheetId}:null,
      reglages:settings,partages:await sharing()};
  }
  async function download(){
    var data=await build(),text=JSON.stringify(data,null,2),blob=new Blob([text],{type:"application/json"});
    var url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download="meuniance-sauvegarde-"+new Date().toISOString().slice(0,10)+".json";
    document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},4000);
    toast(t2("Sauvegarde téléchargée.","Backup downloaded."));
  }

  /* ── Restauration : tout est vérifié avant d'écrire quoi que ce soit ── */
  function str(v,max){return typeof v==="string"&&v.length<=max;}
  function validSheets(list){
    if(!Array.isArray(list)||!list.length||list.length>60)return null;
    var cells=0,out=[];
    for(var i=0;i<list.length;i++){
      var s=list[i];if(!s||typeof s!=="object"||!str(String(s.name||""),40))return null;
      var c=s.cells&&typeof s.cells==="object"?s.cells:{},clean={};
      for(var k in c){if(!Object.prototype.hasOwnProperty.call(c,k))continue;if(!/^\d{1,4},\d{1,2}$/.test(k))return null;var raw=c[k]&&c[k].raw;if(raw==null||raw==="")continue;raw=String(raw);if(raw.length>2000)return null;clean[k]={raw:raw};if(++cells>200000)return null;}
      var rh=Array.isArray(s.rowHeaders)?s.rowHeaders.slice(0,2000).map(function(h){return String(h==null?"":h).slice(0,120);}):[];
      out.push({id:String(s.id||"s"+i).replace(/[^\w-]/g,"").slice(0,60)||"s"+i,name:String(s.name||"Feuille").slice(0,40),cells:clean,headers:[],rowHeaders:rh,rows:Math.min(Math.max(Number(s.rows)||9,1),2000),cols:12});
    }
    return out;
  }
  function parseBackup(text){
    var d;try{d=JSON.parse(text);}catch(e){throw new Error(t2("Ce fichier n’est pas une sauvegarde Meuniance.","This file is not a Meuniance backup."));}
    if(!d||d.format!==FORMAT||typeof d.version!=="number")throw new Error(t2("Ce fichier n’est pas une sauvegarde Meuniance.","This file is not a Meuniance backup."));
    if(d.version>VERSION)throw new Error(t2("Cette sauvegarde vient d’une version plus récente de Meuniance.","This backup comes from a newer version of Meuniance."));
    var sheets=d.tableur?validSheets(d.tableur.feuilles):null;
    if(d.tableur&&!sheets)throw new Error(t2("Le tableur de cette sauvegarde est illisible ou abîmé.","The spreadsheet in this backup is unreadable or damaged."));
    var settings={},src=d.reglages&&typeof d.reglages==="object"?d.reglages:{};
    KEYS.forEach(function(k){if(!(k in src))return;var v=src[k],s=typeof v==="string"?v:JSON.stringify(v);if(s&&s.length<=1000000)settings[k]=s;});
    return{date:String(d.creeLe||"").slice(0,10),sheets:sheets,active:d.tableur&&String(d.tableur.feuilleActive||""),settings:settings};
  }
  function confirmRestore(b){
    return new Promise(function(resolve){
      var dlg=el("dialog","gfh-dialog");var h=el("h2","",t2("Restaurer la sauvegarde ?","Restore this backup?"));
      var when=b.date?new Date(b.date+"T12:00:00").toLocaleDateString(en()?"en-GB":"fr-FR",{day:"numeric",month:"long",year:"numeric"}):"";
      var p=el("p","gfh-muted",t2("Tes données actuelles (tableur, objectifs, notes et réglages) seront remplacées par celles de la sauvegarde"+(when?" du "+when:"")+". Pense à télécharger une sauvegarde de l’état actuel avant, si besoin.","Your current data (spreadsheet, goals, notes and settings) will be replaced by the backup"+(when?" from "+when:"")+". Download a backup of the current state first if needed."));
      var row=el("div","gfh-dialog-actions"),no=el("button","gfh-btn",t2("Annuler","Cancel")),yes=el("button","gfh-btn is-primary",t2("Restaurer","Restore"));no.type=yes.type="button";row.append(no,yes);
      dlg.append(h,p,row);var done=false;function end(v){if(done)return;done=true;dlg.close();resolve(v);}
      no.addEventListener("click",function(){end(false);});yes.addEventListener("click",function(){end(true);});
      dlg.addEventListener("close",function(){if(!done){done=true;resolve(false);}dlg.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      document.body.append(dlg);dlg.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
    });
  }
  function restore(){
    var inp=el("input");inp.type="file";inp.accept=".json,application/json";
    inp.addEventListener("change",async function(){
      var f=inp.files&&inp.files[0];if(!f)return;
      try{
        if(f.size>MAX_BYTES)throw new Error(t2("Ce fichier est trop lourd pour une sauvegarde Meuniance.","This file is too large for a Meuniance backup."));
        var b=parseBackup(await f.text());
        if(!(await confirmRestore(b)))return;
        Object.keys(b.settings).forEach(function(k){store().setItem(k,b.settings[k]);});
        // Le registre des imports suit le tableur restauré : sans lui dans la sauvegarde, on repart de zéro.
        if(b.sheets&&!("personalFinanceDashboard.importLedger" in b.settings))try{store().removeItem("personalFinanceDashboard.importLedger");}catch(e){}
        if(b.sheets&&window.FinanceSheet){var ids=b.sheets.map(function(s){return s.id;});window.FinanceSheet.loadSnapshot({v:"restore",sheets:b.sheets,activeSheetId:ids.indexOf(b.active)>=0?b.active:ids[0]});window.FinanceSheet.saveNow&&window.FinanceSheet.saveNow();}
        toast(t2("Sauvegarde restaurée.","Backup restored."));
        setTimeout(function(){location.reload();},900);
      }catch(e){toast(e&&e.message?e.message:t2("Restauration impossible.","Restore failed."));}
    });
    inp.click();
  }

  /* ── Panneau Paramètres › Données et compte ─────── */
  function render(){
    var panel=document.querySelector('[data-settings-panel="data"]');if(!panel)return;
    var box=byId("gfbBackup");
    if(!box){box=el("section","gfb-backup");box.id="gfbBackup";box.setAttribute("aria-labelledby","gfbBackupTitle");var copy=panel.querySelector(".settings-reset-copy");if(copy&&copy.nextSibling)panel.insertBefore(box,copy.nextSibling);else panel.append(box);}
    var h=el("h4","",t2("Sauvegarde de mes données","Back up my data"));h.id="gfbBackupTitle";
    var p=el("p","",t2("Un fichier avec ton tableur, tes objectifs, tes notes, tes réglages et la liste de tes partages. Garde-le en lieu sûr : il contient tes chiffres.","A file with your spreadsheet, goals, notes, settings and the list of your shares. Keep it somewhere safe: it contains your figures."));
    var row=el("div","gfb-backup-actions"),dl=el("button","gfh-btn is-primary",t2("Télécharger mes données","Download my data")),rs=el("button","gfh-btn",t2("Restaurer une sauvegarde","Restore a backup"));dl.type=rs.type="button";
    dl.addEventListener("click",function(){download().catch(function(){toast(t2("Téléchargement impossible.","Download failed."));});});rs.addEventListener("click",restore);
    row.append(dl,rs);box.replaceChildren(h,p,row);
  }
  window.addEventListener("gf:languagechange",render);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render);else render();
  window.GFBackup={build:build,parse:parseBackup,validSheets:validSheets};
})();
