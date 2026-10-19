/* Import d'un relevé bancaire (CSV) : le fichier est lu uniquement dans le navigateur.
   Les opérations sont regroupées par catégorie et par mois, puis écrites dans le tableur
   (une ligne par catégorie, une colonne par mois). Rien d'autre que ces totaux n'est conservé. */
(function(){
  "use strict";
  var MN=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  var MN_EN=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function en(){return !!(window.GFI18n&&typeof window.GFI18n.getLanguage==="function"&&window.GFI18n.getLanguage()==="en");}
  function t2(fr,e){return en()?e:fr;}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function norm(v){return String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();}
  function key(v){return norm(v).replace(/[^a-z0-9]/g,"");}
  function eur(v){return new Intl.NumberFormat(en()?"en-IE":"fr-FR",{style:"currency",currency:"EUR"}).format(v);}

  /* ── Lecture du fichier ─────────────────────────────────────────────── */
  function decode(buffer){
    var bytes=new Uint8Array(buffer);
    if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder("utf-16le").decode(bytes);
    try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^﻿/,"");}
    catch(e){return new TextDecoder("windows-1252").decode(bytes);}
  }
  function splitLines(text){
    // Découpe en tenant compte des guillemets (un libellé peut contenir un retour à la ligne)
    var rows=[],cur="",q=false;
    for(var i=0;i<text.length;i++){var ch=text[i];if(ch==='"'){q=!q;cur+=ch;}else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&text[i+1]==="\n")i++;rows.push(cur);cur="";}else cur+=ch;}
    if(cur)rows.push(cur);return rows.filter(function(r){return r.trim()!=="";});
  }
  function splitRow(line,sep){
    var out=[],cur="",q=false;
    for(var i=0;i<line.length;i++){var ch=line[i];
      if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}
      else if(ch===sep&&!q){out.push(cur.trim());cur="";}
      else cur+=ch;}
    out.push(cur.trim());return out;
  }
  function guessSeparator(lines){
    var best=";",score=-1;[";",",","\t","|"].forEach(function(s){
      var counts=lines.slice(0,30).map(function(l){return splitRow(l,s).length;}),many=counts.filter(function(c){return c>=3;}).length;
      if(many>score){score=many;best=s;}});
    return best;
  }

  /* ── Valeurs ───────────────────────────────────────────────────────── */
  function parseAmount(v){
    var s=String(v==null?"":v).replace(/[\s  €]|EUR/gi,"").replace(/^\+/,"");
    if(!s)return null;var neg=/^\(.*\)$/.test(s)||/-$/.test(s);s=s.replace(/[()]/g,"").replace(/-$/,"");
    if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"").replace(",",".");
    else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
    else s=s.replace(",",".");
    if(!/^-?\d+(\.\d+)?$/.test(s))return null;var n=Number(s);return neg?-Math.abs(n):n;
  }
  // Ordre des dates du fichier : jour/mois (France) sauf si le fichier montre clairement mois/jour (« 09/25/2026 »).
  var MONTH_FIRST=false;
  function parseDate(v){
    var s=String(v||"").trim(),m;
    if((m=s.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(:\d{2})?.*)?$/)))return mk(+m[1],+m[2],+m[3]);
    if((m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T]\d{1,2}:\d{2}(:\d{2})?.*)?$/))){var y=m[3].length===2?2000+Number(m[3]):+m[3];return MONTH_FIRST?mk(y,+m[1],+m[2]):mk(y,+m[2],+m[1]);}
    return null;
    function mk(y,mo,d){return y>1990&&y<2100&&mo>=1&&mo<=12&&d>=1&&d<=31?{y:y,m:mo-1,d:d}:null;}
  }

  /* ── Repérage des colonnes ─────────────────────────────────────────── */
  var H={
    date:/^(date( de l.?)?( ?operation| ?op)?|date operation|date comptable|date de comptabilisation|dateop|date op\.?|booking date|transaction date|date)$/,
    value:/date de valeur|dateval|value date/,
    label:/libelle|description|detail|operation|nature|intitule|label|motif|beneficiaire|tiers|payee/,
    amount:/^montant|amount|somme|valeur$/,
    debit:/debit/,
    credit:/credit/
  };
  function labelScore(c){
    if(!c||/date|montant|amount|debit|credit|categor|numero|^n( |$)|^no$|solde|balance|devise|currency|^type|pointage|statut|state|status|compte|account|iban|bic|exchange|fee|frais/.test(c))return 0;
    if(/libelle|intitule/.test(c))return 3;
    if(/description|label|payee|beneficiaire|counterparty|contrepartie|tiers|merchant|commercant/.test(c))return 2;
    if(/detail|motif|reference|nature|operation|communication/.test(c))return 1;
    return 0;
  }
  function findColumns(lines,sep){
    for(var i=0;i<Math.min(lines.length,20);i++){
      var cells=splitRow(lines[i],sep).map(function(c){return norm(c).replace(/[^a-z ().]/g," ").replace(/\s+/g," ").trim();}),cols={},cand=[];
      cells.forEach(function(c,j){
        if(cols.date==null&&H.date.test(c))cols.date=j;
        else if(cols.date==null&&/date/.test(c)&&!H.value.test(c))cols.date=j;
        var sc=labelScore(c);if(sc>0)cand.push([j,sc,c]);
        if(cols.amount==null&&H.amount.test(c)&&!/date/.test(c))cols.amount=j;
        if(cols.debit==null&&H.debit.test(c))cols.debit=j;
        if(cols.credit==null&&H.credit.test(c)&&!/carte/.test(c))cols.credit=j;
        if(cols.state==null&&/^(state|status|statut|etat)$/.test(c))cols.state=j;
      });
      if(cols.date!=null&&(cols.amount!=null||cols.debit!=null||cols.credit!=null)){
        // Libellé : la colonne la plus parlante (« Libellé » plutôt que « Catégorie » ou « Numéro d'opération ») ;
        // les colonnes de détail (référence, motif…) complètent le libellé pour reconnaître la catégorie.
        var avg=function(j){var t=0,n=0;lines.slice(i+1,i+41).forEach(function(l){var v=splitRow(l,sep)[j];if(v!=null){t+=String(v).length;n++;}});return n?t/n:0;};
        cand.forEach(function(x){x[3]=avg(x[0]);});
        cand.sort(function(a,b){return b[1]-a[1]||b[3]-a[3]||a[0]-b[0];});
        if(cand.length){cols.label=cand[0][0];cols.extra=cand.slice(1).filter(function(x){return /detail|motif|reference|description|libelle/.test(x[2]);}).map(function(x){return x[0];});}
        return{header:i,cols:cols};
      }
    }
    // Sans en-tête : on devine sur le contenu (une date, un montant, le texte le plus long)
    var sample=lines.slice(0,40).map(function(l){return splitRow(l,sep);}),n=Math.max.apply(null,sample.map(function(r){return r.length;})),guess={};
    for(var c=0;c<n;c++){
      var dates=0,nums=0,len=0;sample.forEach(function(r){if(parseDate(r[c]))dates++;else if(parseAmount(r[c])!=null)nums++;len+=String(r[c]||"").length;});
      if(guess.date==null&&dates>=sample.length*.6)guess.date=c;
      else if(guess.amount==null&&nums>=sample.length*.6)guess.amount=c;
      if(dates<sample.length*.6&&nums<sample.length*.6&&(guess.label==null||len>guess.len)){guess.label=c;guess.len=len;}
    }
    return guess.date!=null&&guess.amount!=null?{header:-1,cols:guess}:null;
  }
  function detectOrder(lines,sep,found){
    var dm=0,md=0;lines.slice(found.header+1,found.header+401).forEach(function(l){var v=String(splitRow(l,sep)[found.cols.date]||"").trim(),m=v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/);if(!m)return;if(+m[1]>12&&+m[2]<=12)dm++;else if(+m[2]>12&&+m[1]<=12)md++;});
    return md>0&&dm===0;
  }
  // Total du débit différé (« FACTURE CARTE », « RELEVE CARTE ») : déjà compté via chaque paiement par carte.
  // Une ligne de total n'a pas de nom de commerçant : « FACTURE CARTE DU 010926 CARREFOUR » (BNP) est un paiement,
  // « RELEVE CARTE 30/09 » ou « FACTURES CARTES DEBIT DIFFERE » est un total.
  var DEFERRED=/\b(factures?|releves?|totale?s?|depenses|debit|operations?) (differee?s? )?(de |des )?(vos |mes )?(cartes?|cb)\b|debit differe/;
  function isDeferred(label){
    var l=norm(label);if(!DEFERRED.test(l))return false;
    var rest=l.replace(/x{2,}\d*|\d+[\/.\-]?\d*([\/.\-]\d+)?/g," ").replace(/[^a-z ]/g," ")
      .replace(/\b(factures?|releves?|totale?s?|depenses|debit|differee?s?|operations?|cartes?|cb|bleue|visa|mastercard|premier|gold|infinite|du|au|de|des|le|la|vos|mes|mois|mensuel(le)?|arrete|periode|numero|n|no|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/g," ").trim();
    // Il reste un nom, même court (« BP », « H&M ») : c'est un paiement chez un commerçant, pas un total.
    return rest.replace(/\s+/g,"").length===0;
  }
  // Opération annulée, refusée ou pas encore passée (Revolut, N26… ont une colonne d'état).
  var NOT_DONE=/revert|declin|cancel|annul|refus|rejet|failed|echou|pending|en attente|en cours/;
  function parse(text){
    var lines=splitLines(text);if(lines.length<2)return null;
    MONTH_FIRST=false;
    var sep=guessSeparator(lines),found=findColumns(lines,sep);if(!found)return null;
    MONTH_FIRST=detectOrder(lines,sep,found);
    var c=found.cols,ops=[],cards=0;
    for(var i=found.header+1;i<lines.length;i++){
      var r=splitRow(lines[i],sep),d=parseDate(r[c.date]);if(!d)continue;
      var amt=null;
      if(c.amount!=null)amt=parseAmount(r[c.amount]);
      if(amt==null&&(c.debit!=null||c.credit!=null)){var db=parseAmount(r[c.debit]),cr=parseAmount(r[c.credit]);if(db)amt=-Math.abs(db);else if(cr)amt=Math.abs(cr);}
      if(amt==null||amt===0)continue;
      if(c.state!=null&&NOT_DONE.test(norm(r[c.state])))continue;
      var label=c.label!=null?r[c.label]:r.filter(function(x,j){return j!==c.date&&j!==c.amount&&j!==c.debit&&j!==c.credit&&j!==c.state;}).join(" ");
      label=String(label||"").replace(/\s+/g," ").trim();
      var detail=(c.extra||[]).map(function(j){return String(r[j]||"").replace(/\s+/g," ").trim();}).filter(function(x){return x&&norm(label).indexOf(norm(x))<0;}).join(" ");
      if(!label&&detail){label=detail;detail="";}
      if(/\b(carte|cb)\b/.test(norm(label))&&!isDeferred(label))cards++;
      var op={date:d,amount:Math.round(amt*100)/100,label:label};if(detail)op.detail=detail;ops.push(op);
    }
    // Si le fichier détaille les paiements par carte, la ligne de total du débit différé ferait compter deux fois.
    if(cards>=3)ops=ops.filter(function(op){return !(op.amount<0&&isDeferred(op.label));});
    return ops.length>=2?ops:null;
  }

  /* ── Catégories ────────────────────────────────────────────────────── */
  // [libellé de ligne FR, EN, type, motifs]. L'ordre compte : le premier motif trouvé l'emporte.
  var CATS=[
    ["Épargne","Savings","Épargne",/livret|ldds|lep\b|\bpel\b|\bcel\b|epargne|assurance vie|\bpea\b|versement programme|virement vers.*(livret|epargne)/],
    ["Salaire","Salary","Salaire",/salaire|paie\b|\bpaye\b|remuneration|payroll|traitement mensuel/],
    ["Aides (CAF)","Benefits (CAF)","Salaire",/\bcaf\b|\bapl\b|allocation|pole emploi|france travail|\brsa\b|prime d.activite/],
    ["Loyer","Rent","Dépense",/loyer|foncia|nexity|bailleur|^(?!.*\b(carte|cb)\b).*habitat|immobiliere|\bopac\b|\bhlm\b/],
    ["Courses","Groceries","Dépense",/carrefour|leclerc|auchan|lidl|intermarche|super u|hyper u|\bu express|monoprix|franprix|\bcasino\b(?!.*(jeux|barriere|partouche|poker|\bbet\b|betclic|winamax))|\baldi\b|\bpicard\b|biocoop|netto|grand frais|naturalia|\bspar\b|\bmatch\b(?! (point|foot|de))|\bcora\b|g20|coccinelle|marche\b(?! (public|financier))/],
    ["Restaurants","Restaurants","Dépense",/restaurant|\bresto\b(?!s? du coeur)|mcdo|mc donald|mcdonald|burger king|\bkfc\b|uber ?eats|deliveroo|just ?eat|starbucks|boulangerie|brasserie|sushi|pizza|kebab|cafe\b|bistro|o.?tacos|subway|five guys|\b(carte|cb)\b.*\bpaul\b/],
    ["Transports","Transport","Dépense",/sncf|\bratp\b|navigo|\buber\b|bolt|blablacar|totalenergies station|total access|\besso\b|\bshell\b|\b(carte|cb)\b.*\b(bp|total ?energies)\b|\bavia\b|\bstation(nement)?\b(?! f\b)|paybyphone|carburant|essence|peage|autoroute|vinci|sanef|\baprr\b|parking|indigo|tisseo|\btcl\b|\brtm\b|keolis|transdev|\blime\b|velib|trainline|ouigo|tgv/],
    ["Abonnements","Subscriptions","Dépense",/netflix|spotify|deezer|disney|canal\+?|amazon prime|prime video|apple\.com|icloud|google (one|storage|play)|youtube|free mobile|free telecom|freebox|\borange\b(?! ?(boutique|store|shop|magasin))|\bsosh\b|\bsfr\b|bouygues|b ?& ?you|red by|basic.?fit|fitness park|keep cool|crunch|audible|chatgpt|openai/],
    ["Énergie et eau","Energy and water","Dépense",/\bedf\b|engie|total ?energies|ekwateur|\beau de (paris|.*(ville|agglo|metropole|syndicat))|\bsyndicat des eaux|veolia|suez|saur\b|gaz\b|electricite|mint energie|octopus/],
    ["Assurances","Insurance","Dépense",/assurance|\baxa\b|maif|macif|matmut|allianz|groupama|\bgmf\b|\bmma\b|generali|\bapril\b(?! \d)|luko|lovys/],
    ["Santé","Health","Dépense",/pharmacie|docteur|medecin|dentiste|laboratoire|opticien|doctolib|hopital|clinique|\bkine\b|kinesi|mutuelle|harmonie|ameli/],
    ["Shopping","Shopping","Dépense",/amazon|fnac|darty|decathlon|zara|h ?& ?m\b|ikea|leroy merlin|castorama|boulanger|cdiscount|shein|vinted|\baction\b|primark|kiabi|sephora|nocibe|uniqlo|zalando|temu|aliexpress|apple store|galeries lafayette|printemps/],
    ["Loisirs","Leisure","Dépense",/cinema|\bugc\b|pathe|gaumont|mk2|steam|playstation|nintendo|xbox|concert|ticketmaster|fnac spectacles|bowling|musee|theatre|\bescape\b|\bparc\b(?! (auto|de stationnement))/],
    ["Voyages","Travel","Dépense",/airbnb|booking|hotel|air france|easyjet|ryanair|vueling|transavia|expedia|abritel|club med|camping/],
    ["Retraits","Cash withdrawals","Dépense",/retrait|\bdab\b|distributeur|\bgab\b|withdrawal/],
    ["Frais bancaires","Bank fees","Dépense",/\bfrais\b(?! de (port|livraison|dossier|scolarite|garde))|commission|cotisation(?! (syndicale|club|association|asso|sport|licence|adhesion))|agios|interets debiteurs|tenue de compte|carte bancaire/],
    ["Impôts","Taxes","Dépense",/impot|dgfip|tresor public|taxe|finances publiques|amende|antai/]
  ];
  var OTHER_OUT=["Autres dépenses","Other expenses","Dépense"],OTHER_IN=["Autres revenus","Other income","Salaire"],TRANSFER=/virement interne|vir(ement)? (de|vers) (mon|ma|compte)|transfert interne/;
  /* Marchand d'une opération : le libellé sans le bruit bancaire (« CARTE 01/09 », « PRLV SEPA », numéros…).
     « CARTE 01/09/26 CARREFOUR CITY » → « carrefour city ». Sert de clé pour retenir tes choix. */
  var NOISE=/\b(paiement|paiemt|carte|cb|prlv|prelevement|prelev|sepa|vir|virement|achat|facture|fact|retrait|dab|gab|en votre faveur|votre|faveur|recu|emis|inst|instantane|de|du|des|le|la|les|par|pour|chez|ref|reference|mandat|ech|echeance|eu|fr|sas|sa|sarl|ltd|inc)\b/g;
  function merchantOf(label){
    var l=norm(label).replace(/x\d{2,}|\d+[\/.\-]\d+([\/.\-]\d+)?|\d+/g," ").replace(/[^a-z ]/g," ").replace(NOISE," ").replace(/\s+/g," ").trim();
    return l.split(" ").filter(function(w){return w.length>1;}).slice(0,3).join(" ");
  }
  // Choix retenus : { marchand : [ligne, type] } ; type « Ignorer » pour un virement entre tes comptes.
  var RULES_KEY="personalFinanceDashboard.merchantRules";
  function learned(){try{var v=JSON.parse(window.safeStore&&window.safeStore.getItem(RULES_KEY)||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  function saveLearned(extra){var all=learned();Object.keys(extra||{}).forEach(function(k){if(extra[k])all[k]=extra[k];else delete all[k];});var keys=Object.keys(all);if(keys.length>2000)keys.slice(0,keys.length-2000).forEach(function(k){delete all[k];});try{window.safeStore.setItem(RULES_KEY,JSON.stringify(all));}catch(e){}}
  // Virement (vers ou depuis une personne ou un compte), reconnu au début du libellé.
  function transferLabel(l){l=norm(l);return /^(vir|virement|vrt)\b/.test(l)||/\bvir(ement)? (sepa |inst |instantane )?(recu|emis|de|vers|a|en faveur)\b/.test(l);}
  function categorize(op,rules){
    var m=merchantOf(op.label),r=rules&&Object.prototype.hasOwnProperty.call(rules,m)?rules[m]:null;
    if(r){if(r[1]==="Ignorer")return null;return [r[0],r[0],r[1]];}
    var l=norm(op.label+(op.detail?" "+op.detail:""));
    if(TRANSFER.test(l)&&!CATS[0][3].test(l))return null; // simple mouvement entre tes comptes : ignoré
    // Un virement à une personne (« VIR SEPA M PICARD ») n'est pas un achat en magasin : seules les catégories
    // qui se paient par virement (loyer, épargne, salaire, aides, impôts, assurances, santé, énergie) restent possibles.
    var isTransfer=transferLabel(l);
    for(var i=0;i<CATS.length;i++){var c=CATS[i];if(c[3].test(l)){
      if(isTransfer&&!/^(Épargne|Salaire|Aides \(CAF\)|Loyer|Impôts|Assurances|Santé|Énergie et eau|Abonnements)$/.test(c[0]))continue;
      if(op.amount>0&&c[2]==="Dépense")return c; // remboursement : vient en déduction de la catégorie
      if(op.amount>0&&c[2]==="Épargne")return c; // retrait d'épargne : diminue l'épargne du mois
      if(op.amount<0&&c[2]==="Salaire")return OTHER_OUT;
      return c;}}
    return op.amount>0?OTHER_IN:OTHER_OUT;
  }
  /* Ligne du tableur qui correspond déjà à une catégorie : même nom, singulier/pluriel, ou nom voisin
     (« Abonnement », « Abos » pour « Abonnements »…). Évite de créer une deuxième ligne pour la même chose. */
  var SYN={abonnements:["abonnement","abos","abo","subscriptions","subscription"],courses:["alimentation","supermarche","nourriture","groceries"],
    restaurants:["restaurant","restos","resto","sorties resto"],transports:["transport","essence","carburant","voiture"],loyer:["logement","rent"],
    energieeteau:["energie","electricite","edf","eau","gaz","factures energie"],assurances:["assurance","insurance"],sante:["medecin","pharmacie","health"],
    loisirs:["sorties","leisure"],voyages:["vacances","voyage","travel"],impots:["impot","taxes","taxe"],salaire:["salaires","paie","salary"],
    shopping:["achats"],retraits:["retrait","especes","liquide"],fraisbancaires:["frais banque","banque","bank fees"],epargne:["savings"]};
  function sing(k){return k.replace(/(s|x)$/,"");}
  function sheetRows(){var out=[];try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();(snap&&snap.sheets||[]).forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!/^(solde|total)/i.test(h)&&out.indexOf(h)<0)out.push(h);});});}catch(e){}return out;}
  function existingRow(name,rows){
    var k=key(name);if(!k||!rows||!rows.length)return null;
    var hit=function(f){for(var i=0;i<rows.length;i++)if(f(key(rows[i])))return rows[i];return null;};
    var syn=(SYN[k]||[]).map(key);
    var exact=hit(function(r){return r===k;})||hit(function(r){return sing(r)===sing(k);})||hit(function(r){return syn.indexOf(r)>=0||syn.indexOf(sing(r))>=0;});
    if(exact)return exact;
    // « Abonnements streaming et musique » : une seule ligne qui commence par le nom de la catégorie
    var stem=sing(k);if(stem.length<5)return null;
    var starts=rows.filter(function(r){return key(r).indexOf(stem)===0;});return starts.length===1?starts[0]:null;
  }
  // Marchand qui a déjà sa propre ligne (une ligne « Netflix » dans le tableur) : on la remplit au lieu de « Abonnements ».
  var GENERIC=/^(prime|banque|bank|credit|carte|frais|total|service|services|paiement|achat|magasin|super|hyper|cafe|station|compte|pret|assurance|mutuelle|epargne|salaire|loyer|courses|impots?)$/;
  function merchantRow(m,rows){var w=String(m||"").split(" ")[0];if(!w||w.length<4||GENERIC.test(w))return null;for(var i=0;i<rows.length;i++){var r=key(rows[i]);if((r===key(w)||r===key(m))&&kindOf(rows[i])==="Dépense")return rows[i];}return null;}
  function summarize(ops,extra){
    var groups={},months={},ignored=0,rules=learned(),rows=sheetRows(),items=[],seenFp={},from=null,to=null;
    ops.forEach(function(op){var n=dayNum(op.date);if(from===null||n<from)from=n;if(to===null||n>to)to=n;});Object.keys(extra||{}).forEach(function(k){rules[k]=extra[k];});
    ops.forEach(function(op){
      var c=categorize(op,rules);if(!c){ignored++;return;}
      var mo=merchantOf(op.label),own=!Object.prototype.hasOwnProperty.call(rules,mo)&&c[2]==="Dépense"&&op.amount<0?merchantRow(mo,rows):null;
      var isOther=!own&&(c===OTHER_OUT||c===OTHER_IN),name=own||existingRow(en()?c[1]:c[0],rows)||(en()?c[1]:c[0]),kind=c[2],g=groups[name]||(groups[name]={name:name,kind:kind,count:0,total:0,byMonth:{},merchants:{}});if(isOther)g.other=true;
      // Dépenses et épargne comptées en positif ; un remboursement vient en déduction
      var v=kind==="Salaire"?op.amount:-op.amount,mk=op.date.y+"-"+op.date.m;
      g.count++;g.total+=v;g.byMonth[mk]=(g.byMonth[mk]||0)+v;months[mk]=op.date;
      var fp=fingerprint(op),n=seenFp[fp]=(seenFp[fp]||0)+1;items.push({fp:fp+"#"+n,mk:mk,name:name,kind:kind,v:v});
      var mid=merchantOf(op.label)||norm(op.label).slice(0,24),mm=g.merchants[mid]||(g.merchants[mid]={key:mid,label:op.label,count:0,total:0});mm.count++;mm.total+=v;
    });
    var list=Object.keys(groups).map(function(k){return groups[k];}).filter(function(g){return Math.abs(g.total)>=0.005;});
    var order={"Salaire":0,"Dépense":1,"Épargne":2};list.sort(function(a,b){return order[a.kind]-order[b.kind]||Math.abs(b.total)-Math.abs(a.total);});
    var mlist=Object.keys(months).map(function(k){return months[k];}).sort(function(a,b){return a.y-b.y||a.m-b.m;});
    return{groups:list,months:mlist,count:ops.length-ignored,ignored:ignored,items:items,from:from,to:to};
  }

  /* ── Écriture dans le tableur ───────────────────────────────────────── */
  function signIn(vals){var p=0,n=0;vals.forEach(function(v){if(v>0)p++;else if(v<0)n++;});return p>n?1:n>p?-1:0;}
  function kindOf(label){
    var r={};try{r=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.categoryRules")||"{}")||{};}catch(e){}
    var v=r[key(label)];if(v)return v==="Epargne"?"Épargne":v;
    var k=key(label);if(/salaire|revenu|prime|paie|allocation|caf/.test(k))return"Salaire";if(/epargne|livret|pea|placement/.test(k))return"Épargne";return"Dépense";
  }
  // Signe déjà utilisé dans le tableur pour ce type de ligne (dépenses en négatif ou en positif)
  function signFor(snap,kind){
    var vals=[];(snap.sheets||[]).forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h,i){if(!String(h||"").trim()||kindOf(h)!==kind)return;
      Object.keys(sh.cells||{}).forEach(function(k){var p=k.split(",");if(Number(p[0])!==i)return;var raw=String((sh.cells[k]||{}).raw||"").replace(",",".").trim();if(raw&&raw.charAt(0)!=="="&&isFinite(Number(raw)))vals.push(Number(raw));});});});
    return signIn(vals)||(kind==="Salaire"?1:-1);
  }
  /* Opérations déjà importées, mois par mois : { "2026-8": { empreinte: [ligne, type, montant] } }.
     L'empreinte (date, montant, libellé haché) permet de réimporter un relevé qui chevauche le précédent
     sans perdre ni compter deux fois. Le libellé lui-même n'est pas gardé. 24 mois au plus. */
  var LEDGER_KEY="personalFinanceDashboard.importLedger";
  function hash(t){var h=5381;for(var i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function fingerprint(op){return op.date.y+"-"+op.date.m+"-"+op.date.d+"|"+op.amount+"|"+hash(norm(op.label).replace(/\s+/g," ").trim());}
  function ledger(){try{var v=JSON.parse(window.safeStore&&window.safeStore.getItem(LEDGER_KEY)||"{}");return v&&v.m&&typeof v.m==="object"?v:{v:1,m:{}};}catch(e){return{v:1,m:{}};}}
  function saveLedger(L){var ks=Object.keys(L.m).sort(function(a,b){var x=a.split("-"),y=b.split("-");return (x[0]*12+ +x[1])-(y[0]*12+ +y[1]);});ks.slice(0,Math.max(0,ks.length-24)).forEach(function(k){delete L.m[k];});try{window.safeStore.setItem(LEDGER_KEY,JSON.stringify(L));}catch(e){}}
  /* Ce qu'il faut écrire, mois par mois et ligne par ligne.
     « Remplacer » : total de toutes les opérations connues du mois (anciennes + nouvelles), donc un relevé partiel
     ne fait pas disparaître le reste du mois. « Ajouter » : seulement les opérations jamais importées. */
  function dayNum(d){return (d.y*12+d.m)*32+d.d;}
  function plan(summary,mode){
    var L=ledger(),out={},dup=0,fresh=0,kinds={},before={},rows=sheetRows(),items=summary.items||[];
    // Une ligne renommée dans le tableur (« Abonnements » → « Abos ») garde ses anciennes opérations.
    var rowName=function(n){return existingRow(n,rows)||n;};
    // Mois touchés : ceux du fichier, plus ceux du registre qui tombent dans la période du fichier.
    var touched={};items.forEach(function(it){touched[it.mk]=1;});
    if(mode!=="add"&&summary.from!=null)Object.keys(L.m).forEach(function(mk){Object.keys(L.m[mk]).forEach(function(fp){var p=fp.split("|")[0].split("-"),n=dayNum({y:+p[0],m:+p[1],d:+p[2]});if(n>=summary.from&&n<=summary.to)touched[mk]=1;});});
    Object.keys(touched).forEach(function(mk){var b=before[mk]={};Object.keys(L.m[mk]||{}).forEach(function(fp){var e=L.m[mk][fp],n=rowName(e[0]);b[n]=1;kinds[n]=e[1];});});
    if(mode!=="add"){
      // Remplacer : dans la période du fichier, le fichier fait foi (une opération désormais ignorée ou
      // déplacée disparaît) ; en dehors, les opérations déjà importées sont gardées.
      var inFile={};items.forEach(function(it){inFile[it.fp]=1;});
      Object.keys(touched).forEach(function(mk){var M=L.m[mk]||{};Object.keys(M).forEach(function(fp){var p=fp.split("|")[0].split("-"),n=dayNum({y:+p[0],m:+p[1],d:+p[2]});if(n>=summary.from&&n<=summary.to&&!inFile[fp])delete M[fp];});});
    }
    items.forEach(function(it){kinds[it.name]=it.kind;var M=L.m[it.mk]||(L.m[it.mk]={});
      if(M[it.fp])dup++;else fresh++;
      if(mode==="add"&&M[it.fp])return;
      M[it.fp]=[it.name,it.kind,Math.round(it.v*100)/100];
      if(mode==="add"){var o=out[it.mk]||(out[it.mk]={});o[it.name]=(o[it.name]||0)+it.v;}});
    if(mode!=="add")Object.keys(touched).forEach(function(mk){
      var o=out[mk]={};Object.keys(before[mk]||{}).forEach(function(n){o[n]=0;});
      Object.keys(L.m[mk]||{}).forEach(function(fp){var e=L.m[mk][fp],n=rowName(e[0]);kinds[n]=kinds[n]||e[1];o[n]=(o[n]||0)+e[2];});
      if(!Object.keys(L.m[mk]||{}).length)delete L.m[mk];});
    return{cells:out,kinds:kinds,dup:dup,fresh:fresh,save:function(){saveLedger(L);}};
  }
  function write(summary,mode){
    var FS=window.FinanceSheet;if(!FS||!FS.getSnapshot)return false;
    var snap=JSON.parse(JSON.stringify(FS.getSnapshot()));snap.sheets=snap.sheets||[];
    var rules={};try{rules=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.categoryRules")||"{}")||{};}catch(e){}
    var signs={"Salaire":signFor(snap,"Salaire"),"Dépense":signFor(snap,"Dépense"),"Épargne":signFor(snap,"Épargne")},last=null;
    var P=plan(summary,mode);summary.dup=P.dup;summary.fresh=P.fresh;
    Object.keys(P.cells).forEach(function(mk){Object.keys(P.cells[mk]).forEach(function(name){
      var g={name:name,kind:P.kinds[name]||"Dépense"},amount=P.cells[mk][name];
      if(!rules[key(g.name)])rules[key(g.name)]=g.kind;
      (function(){
        var p=mk.split("-"),y=p[0],mi=Number(p[1]),sh=snap.sheets.filter(function(s){return String(s.name).trim()===y;})[0];
        if(!sh){sh={id:"s"+y+"-"+Date.now().toString(36),name:y,cells:{},headers:MN.map(function(m){return m.charAt(0).toUpperCase()+m.slice(1);}),rowHeaders:[],rows:9,cols:12};snap.sheets.push(sh);}
        sh.rowHeaders=sh.rowHeaders||[];
        var r=sh.rowHeaders.findIndex(function(h){return key(h)===key(g.name);});
        if(r<0){r=sh.rowHeaders.length;sh.rowHeaders.push(g.name);}
        sh.rows=Math.max(Number(sh.rows)||0,sh.rowHeaders.length+2);
        var v=Math.round(amount*signs[g.kind]*100)/100,cell=sh.cells[r+","+mi],old=cell&&String(cell.raw||"").trim();
        if(mode==="add"&&old){var n=Number(old.replace(",","."));sh.cells[r+","+mi]={raw:old.charAt(0)!=="="&&isFinite(n)?String(Math.round((n+v)*100)/100):"="+(old.charAt(0)==="="?old.slice(1):old)+(v<0?"-":"+")+Math.abs(v)};}
        else if(v===0&&mode!=="add")delete sh.cells[r+","+mi];
        else sh.cells[r+","+mi]={raw:String(v)};
        last=sh;
      })();
    });});
    P.save();
    try{window.safeStore.setItem("personalFinanceDashboard.categoryRules",JSON.stringify(rules));}catch(e){}
    if(last)snap.activeSheetId=last.id;
    FS.loadSnapshot(snap);try{FS.saveNow&&FS.saveNow();}catch(e){}
    try{window.syncDashboardFromFinanceSheet&&window.syncDashboardFromFinanceSheet({silent:true});}catch(e){}
    try{window.populateYearSelect&&window.populateYearSelect();}catch(e){}
    return true;
  }

  /* ── Aperçu avant import ────────────────────────────────────────────── */
  function monthLabel(d){return (en()?MN_EN[d.m]:MN[d.m])+" "+d.y;}
  // Lignes proposées pour classer un marchand : catégories connues, lignes déjà dans ton tableur, « autres », ignorer.
  function targets(){
    var out=[],seen={};function add(name,kind,group){var k=key(name);if(!name||seen[k])return;seen[k]=1;out.push({name:name,kind:kind,group:group});}
    CATS.forEach(function(c){add(en()?c[1]:c[0],c[2],"cat");});
    try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();(snap&&snap.sheets||[]).forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!/^(solde|total)/i.test(h))add(h,kindOf(h),"sheet");});});}catch(e){}
    add(en()?OTHER_OUT[1]:OTHER_OUT[0],"Dépense","other");add(en()?OTHER_IN[1]:OTHER_IN[0],"Salaire","other");
    return out;
  }
  function pretty(m){return m.split(" ").map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(" ");}
  function preview(ops){
    return new Promise(function(resolve){
      var extra={},opened={},summary=summarize(ops),T=targets();
      var otherNames=[en()?OTHER_OUT[1]:OTHER_OUT[0],en()?OTHER_IN[1]:OTHER_IN[0]];
      var d=el("dialog","gfh-dialog gfb-dialog");d.setAttribute("aria-labelledby","gfbTitle");
      var h=el("h2","",t2("Relevé bancaire","Bank statement"));h.id="gfbTitle";
      var lead=el("p","gfb-lead"),list=el("div","gfb-list"),note=el("p","gfb-note");
      var tip=el("p","gfb-tip",t2("Touche une catégorie pour voir ses marchands et en déplacer un : Meuniance s’en souviendra aux prochains imports.","Tap a category to see its merchants and move one: Meuniance will remember it next time."));
      function selectFor(m,current){
        var sel=document.createElement("select");sel.className="gfb-move";sel.setAttribute("aria-label",t2("Ranger « ","File “")+pretty(m.key)+t2(" » dans","” under"));
        var groups={cat:t2("Catégories","Categories"),sheet:t2("Lignes de ton tableur","Your spreadsheet rows"),other:t2("Autres","Other")};
        Object.keys(groups).forEach(function(g){var og=document.createElement("optgroup");og.label=groups[g];T.filter(function(t){return t.group===g;}).forEach(function(t){var o=new Option(t.name,t.name+"|"+t.kind);if(key(t.name)===key(current))o.selected=true;og.append(o);});if(og.children.length)sel.append(og);});
        var ig=new Option(t2("Ignorer (virement entre mes comptes)","Ignore (transfer between my accounts)"),"|Ignorer");sel.append(ig);
        sel.addEventListener("change",function(){var v=sel.value.split("|");extra[m.key]=v[1]==="Ignorer"?["","Ignorer"]:[v[0],v[1]];if(v[1]!=="Ignorer")opened[v[0]]=true;draw();});
        return sel;
      }
      function draw(){
        summary=summarize(ops,extra);
        var first=summary.months[0],lastM=summary.months[summary.months.length-1];
        lead.textContent=summary.count+t2(" opérations, "," transactions, ")+(first===lastM?monthLabel(first):t2("de ","from ")+monthLabel(first)+t2(" à "," to ")+monthLabel(lastM))+t2(". Elles sont regroupées par catégorie, une ligne du tableur chacune.",". They are grouped by category, one spreadsheet row each.");
        var titles={"Salaire":t2("Revenus","Income"),"Dépense":t2("Dépenses","Expenses"),"Épargne":t2("Épargne","Savings")},lastKind="",nodes=[];
        var isTodo=function(g){return g.other||otherNames.indexOf(g.name)>=0;};
        var todo=summary.groups.filter(isTodo);
        var rest=summary.groups.filter(function(g){return !isTodo(g);});
        function groupNode(g,isTodo){
          var det=document.createElement("details");det.className="gfb-group"+(isTodo?" is-todo":"");if(isTodo||opened[g.name])det.open=true;
          det.addEventListener("toggle",function(){opened[g.name]=det.open;});
          var sum=document.createElement("summary");sum.className="gfb-row";sum.append(el("span","gfb-name",g.name),el("span","gfb-count",g.count+t2(" op."," tx")),el("b","gf-amount",eur(Math.abs(g.total))));det.append(sum);
          var ms=Object.keys(g.merchants).map(function(k){return g.merchants[k];}).sort(function(a,b){return Math.abs(b.total)-Math.abs(a.total);});
          var box=el("div","gfb-merchants");
          ms.slice(0,25).forEach(function(m){var row=el("div","gfb-merchant");var nm=el("span","gfb-mname",m.key?pretty(m.key):m.label);nm.setAttribute("translate","no");nm.title=m.label;row.append(nm,el("b","gf-amount",eur(Math.abs(m.total))));if(m.key&&merchantOf(m.label)===m.key)row.append(selectFor(m,g.name));box.append(row);});
          if(ms.length>25)box.append(el("small","gfb-more","+ "+(ms.length-25)+t2(" autres marchands"," more merchants")));
          det.append(box);return det;
        }
        if(todo.length){nodes.push(el("div","gfb-kind gfb-todo-title",t2("À classer","To sort")));todo.forEach(function(g){nodes.push(groupNode(g,true));});}
        rest.forEach(function(g){if(g.kind!==lastKind){nodes.push(el("div","gfb-kind",titles[g.kind]));lastKind=g.kind;}nodes.push(groupNode(g,false));});
        list.replaceChildren.apply(list,nodes);
        note.textContent=t2("Le fichier reste sur ton appareil : seuls ces totaux sont ajoutés au tableur.","The file stays on your device: only these totals are added to the spreadsheet.")+(summary.ignored?" "+summary.ignored+t2(" virement(s) entre tes comptes ignoré(s)."," transfer(s) between your accounts ignored."):"");
        ok.disabled=!summary.groups.length;
      }
      var modeBox=el("fieldset","gfb-mode");modeBox.append(el("legend","",t2("Si un mois contient déjà ces lignes","If a month already has these rows")));
      [["replace",t2("Remplacer leurs montants (recommandé si tu réimportes le même relevé)","Replace their amounts (recommended if you re-import the same statement)")],["add",t2("Ajouter aux montants existants","Add to existing amounts")]].forEach(function(o,i){var lab=el("label","gfb-opt"),r=document.createElement("input");r.type="radio";r.name="gfbMode";r.value=o[0];r.checked=i===0;lab.append(r,el("span","",o[1]));modeBox.append(lab);});
      var acts=el("div","gfb-actions"),cancel=el("button","gfh-btn",t2("Annuler","Cancel")),ok=el("button","gfh-btn is-primary",t2("Importer","Import"));cancel.type="button";ok.type="submit";acts.append(cancel,ok);
      var form=document.createElement("form");form.append(h,lead,tip,list,modeBox,note,acts);d.append(form);draw();
      var done=false;function finish(v){if(done)return;done=true;d.close();resolve(v);}
      cancel.addEventListener("click",function(){finish(null);});
      form.addEventListener("submit",function(e){e.preventDefault();var m=form.querySelector('input[name="gfbMode"]:checked');finish({mode:m?m.value:"replace",summary:summary,extra:extra});});
      d.addEventListener("close",function(){if(!done){done=true;resolve(null);}d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      document.body.append(d);d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
    });
  }
  function toast(text){var t=document.getElementById("gfhToast");if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},3600);}

  /* Renvoie true si le fichier était un relevé bancaire (importé ou annulé), false sinon. */
  function handle(file){
    if(!file||!/\.(csv|txt)$/i.test(file.name||""))return Promise.resolve(false);
    return file.arrayBuffer().then(function(buf){
      var ops=parse(decode(buf));if(!ops)return false;
      var summary=summarize(ops);if(!summary.groups.length)return false;
      return preview(ops).then(function(res){
        if(!res)return true;
        // Les choix faits dans l'aperçu sont retenus pour les prochains imports.
        if(Object.keys(res.extra).length)saveLearned(res.extra);
        var summary=res.summary;
        if(write(summary,res.mode)){
          var n=summary.months.length,subs=0;try{subs=window.GFSubs?window.GFSubs.ingest(ops):0;}catch(e){}
          var msg=summary.count&&!summary.fresh?t2("Rien de nouveau : ces "+summary.count+" opérations étaient déjà importées.","Nothing new: these "+summary.count+" transactions were already imported.")
            :t2("Relevé importé : ","Statement imported: ")+summary.count+t2(" opérations sur "," transactions over ")+n+t2(" mois."," month(s).")+(summary.dup?t2(" "+summary.dup+" déjà importée"+(summary.dup>1?"s":"")+", pas comptée"+(summary.dup>1?"s":"")+" deux fois."," "+summary.dup+" already imported, not counted twice."):"");
          toast(msg+(subs?t2(" "+subs+" abonnement"+(subs>1?"s":"")+" repéré"+(subs>1?"s":"")+" : retrouve-les sur l’accueil."," "+subs+" subscription"+(subs>1?"s":"")+" found: see them on Home."):""));
          if(window.setPage)window.setPage("sheet");
        }
        return true;
      });
    });
  }
  window.GFBankImport={transferLabel:transferLabel,handle:handle,parse:parse,summarize:summarize,write:write,existingRow:existingRow,categorize:categorize,merchantOf:merchantOf,learned:learned,saveLearned:saveLearned,_decode:decode};
})();
