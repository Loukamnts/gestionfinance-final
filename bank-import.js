/* Import d'un relevé bancaire (CSV, ou Excel au même format) : le fichier est lu uniquement dans le navigateur.
   Les opérations sont regroupées par catégorie et par mois, puis écrites dans le tableur
   (une ligne par catégorie, une colonne par mois). Le fichier n'est pas gardé ; sur l'appareil restent les totaux,
   une empreinte de chaque opération (pour ne rien compter deux fois), les choix de catégorie par marchand
   et l'historique des abonnements repérés. */
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
    if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder("utf-16be").decode(bytes);
    // UTF-16 sans marque : un octet sur deux est nul
    var zEven=0,zOdd=0,n=Math.min(bytes.length,400);for(var b=0;b<n;b++){if(bytes[b]===0){if(b%2)zOdd++;else zEven++;}}
    if(n>=8&&zOdd>n/4&&zEven<n/40)return new TextDecoder("utf-16le").decode(bytes);
    if(n>=8&&zEven>n/4&&zOdd<n/40)return new TextDecoder("utf-16be").decode(bytes);
    try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes).replace(/^﻿/,"");}
    catch(e){return new TextDecoder("windows-1252").decode(bytes);}
  }
  function splitLines(text){
    // Découpe en tenant compte des guillemets (un libellé peut contenir un retour à la ligne)
    // Un guillemet n'ouvre un champ qu'en début de champ et ne le ferme qu'avant un séparateur ou une fin de ligne :
    // un libellé comme « TV 55" OLED » ne doit pas avaler la suite du fichier.
    var rows=[],cur="",q=false,SEP=/[;,\t|]/;
    for(var i=0;i<text.length;i++){var ch=text[i];
      if(ch==='"'){
        if(!q){var prev=cur.replace(/[ \t]+$/,"");if(prev===""||SEP.test(prev.charAt(prev.length-1)))q=true;}
        else if(text[i+1]==='"'){cur+=ch;i++;}
        else{var nx=text.slice(i+1,i+40).match(/^[ \t]*([\s\S]?)/)[1];if(nx===""||SEP.test(nx)||nx==="\n"||nx==="\r")q=false;}
        cur+=ch;
      }else if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&text[i+1]==="\n")i++;rows.push(cur);cur="";}else cur+=ch;}
    if(cur)rows.push(cur);return rows.filter(function(r){return r.trim()!=="";});
  }
  function splitRow(line,sep){
    var out=[],cur="",q=false;
    for(var i=0;i<line.length;i++){var ch=line[i];
      if(ch==='"'){
        if(!q){if(cur.trim()==="")q=true;else cur+=ch;}
        else if(line[i+1]==='"'){cur+='"';i++;}
        else{var nx=line.slice(i+1).match(/^\s*([\s\S]?)/)[1];if(nx===""||nx===sep)q=false;else cur+=ch;}
      }
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
    var s=String(v==null?"":v).replace(/[\u2212\u2013]/g,"-").replace(/(\d)['\u2019](?=\d)/g,"$1").replace(/[\s\u00a0\u202f\u20ac$\u00a3\u00a5]|EUR|USD|GBP|CHF|CAD/gi,"").replace(/^\+/,"");
    if(!s)return null;var neg=/^\(.*\)$/.test(s)||/-$/.test(s);s=s.replace(/[()]/g,"").replace(/-$/,"");
    if(/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"").replace(",",".");
    else if(/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
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
    amount:/^montant|amount|somme|^value$|betrag|bedrag|^brut$|^gross$|^net$/,
    debit:/debit|paid out|money out|^sortie|^ausgang/,
    credit:/credit|paid in|money in|^entree|^eingang/
  };
  function labelScore(c){
    if(!c||/date|montant|amount|debit|credit|categor|numero|^n( |$)|^no$|solde|balance|devise|currency|^type|pointage|statut|state|status|compte|account|iban|bic|exchange|fee|frais/.test(c))return 0;
    if(/libelle|intitule/.test(c))return 3;
    if(/description|label|payee|beneficiaire|counterparty|contrepartie|tiers|merchant|commercant|^nom$|^name$|texte|buchungstext|^text$|notification|avis/.test(c))return 2;
    if(/detail|motif|reference|nature|operation|communication|transaction/.test(c))return 1;
    return 0;
  }
  function findColumns(lines,sep){
    for(var i=0;i<Math.min(lines.length,20);i++){
      var cells=splitRow(lines[i],sep).map(function(c){return norm(c).replace(/[^a-z ().]/g," ").replace(/\s+/g," ").trim();}),cols={},cand=[];
      cells.forEach(function(c,j){
        // Date : « Date d'opération » plutôt que « Date de débit » ou « Date de valeur »
        if(H.date.test(c)&&(cols.date==null||cols.dateLoose)){cols.date=j;cols.dateLoose=false;}
        else if(cols.date==null&&/date/.test(c)&&!H.value.test(c)){cols.date=j;cols.dateLoose=/debit|valeur|value|reglement/.test(c);}
        var sc=labelScore(c);if(sc>0)cand.push([j,sc,c]);
        // Montant : celui en euros, jamais le montant d'origine en devise ni le solde
        var exact=/eur|^montant$|^amount$/;
        if(H.amount.test(c)&&!/date|orig|devise|foreign|currency|solde|balance/.test(c)&&(cols.amount==null||(exact.test(c)&&!exact.test(cols.amountName)))){cols.amount=j;cols.amountName=c;}
        // « Débit/Crédit » ou « Sens » : colonne qui donne le signe, pas deux colonnes de montants
        if((H.debit.test(c)&&H.credit.test(c))||/^(sens|d ?c)$/.test(c)){if(cols.sense==null)cols.sense=j;}
        else{if(cols.debit==null&&H.debit.test(c))cols.debit=j;
        if(cols.credit==null&&H.credit.test(c)&&!/carte/.test(c))cols.credit=j;}
        if(cols.state==null&&/^(state|status|statut|etat)$/.test(c))cols.state=j;
        if(cols.account==null&&/^(account ?num(ber)?|account ?label|numero de compte|n de compte|compte|iban)$/.test(c))cols.account=j;
      });
      if(cols.date!=null&&(cols.amount!=null||cols.debit!=null||cols.credit!=null)){
        // Libellé : la colonne la plus parlante (« Libellé » plutôt que « Catégorie » ou « Numéro d'opération ») ;
        // les colonnes de détail (référence, motif…) complètent le libellé pour reconnaître la catégorie.
        var avg=function(j){var t=0,n=0;lines.slice(i+1,i+41).forEach(function(l){var v=splitRow(l,sep)[j];if(v!=null){t+=String(v).length;n++;}});return n?t/n:0;};
        cand.forEach(function(x){x[3]=avg(x[0]);});
        cand.sort(function(a,b){return b[1]-a[1]||b[3]-a[3]||a[0]-b[0];});
        if(cand.length){cols.label=cand[0][0];cols.extra=cand.slice(1).filter(function(x){return /detail|motif|reference|description|libelle|communication|transaction|texte/.test(x[2]);}).map(function(x){return x[0];});}
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
    var rest=l.replace(/\bx+\d*\b|x{2,}\d*|\d+[\/.\-]?\d*([\/.\-]\d+)?/g," ").replace(/[^a-z ]/g," ")
      .replace(/\b(factures?|releves?|totale?s?|depenses|debit|differee?s?|operations?|cartes?|cb|bleue|visa|mastercard|premier|gold|infinite|du|au|de|des|le|la|vos|mes|mois|mensuel(le)?|arrete|periode|numero|n|no|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|janv|fev|fevr|avr|juil|sept|oct|nov|dec)\b/g," ").trim();
    // Il reste un nom, même court (« BP », « H&M ») : c'est un paiement chez un commerçant, pas un total.
    return rest.replace(/\s+/g,"").length===0;
  }
  // Opération annulée, refusée ou pas encore passée (Revolut, N26… ont une colonne d'état).
  var NOT_DONE=/revert|revers|declin|denied|cancel|annul|refus|rejet|failed|echou|pending|en attente|en cours/;
  function parse(text){
    var lines=splitLines(text);if(lines.length<2)return null;
    MONTH_FIRST=false;
    var sep=guessSeparator(lines),found=findColumns(lines,sep);if(!found)return null;
    MONTH_FIRST=detectOrder(lines,sep,found);
    var c=found.cols,ops=[],cards=0,dropped=[];
    // Source : le numéro de compte quand le fichier en a un (une même opération sur deux comptes reste deux opérations).
    // L'en-tête n'est pas utilisé : le même relevé exporté avec une colonne de plus ne doit pas compter deux fois.
    for(var i=found.header+1;i<lines.length;i++){
      var r=splitRow(lines[i],sep),d=parseDate(r[c.date]);if(!d)continue;
      var amt=null;
      if(c.amount!=null)amt=parseAmount(r[c.amount]);
      if(amt==null&&(c.debit!=null||c.credit!=null)){var db=parseAmount(r[c.debit]),cr=parseAmount(r[c.credit]);if(db)amt=-Math.abs(db);else if(cr)amt=Math.abs(cr);}
      if(amt==null||amt===0)continue;
      // Colonne de sens (D/C, Débit/Crédit) avec des montants sans signe
      if(c.sense!=null){var sv=norm(r[c.sense]).trim();if(/^(d|db|deb|debit|-)$/.test(sv))amt=-Math.abs(amt);else if(/^(c|cr|cred|credit|\+)$/.test(sv))amt=Math.abs(amt);}
      var osrc=c.account!=null&&String(r[c.account]||"").trim()?hash(String(r[c.account]).trim()):"";
      if(c.state!=null&&NOT_DONE.test(norm(r[c.state]))){dropped.push({date:d,amount:Math.round(amt*100)/100,label:String(c.label!=null?r[c.label]:"").replace(/\s+/g," ").trim(),src:osrc});continue;}
      var label=c.label!=null?r[c.label]:r.filter(function(x,j){return j!==c.date&&j!==c.amount&&j!==c.debit&&j!==c.credit&&j!==c.state;}).join(" ");
      label=String(label||"").replace(/\s+/g," ").trim();
      var detail=(c.extra||[]).map(function(j){return String(r[j]||"").replace(/\s+/g," ").trim();}).filter(function(x){return x&&norm(label).indexOf(norm(x))<0;}).join(" ");
      if(!label&&detail){label=detail;detail="";}
      // Ligne de solde (« NOUVEAU SOLDE », ligne sans libellé en fin de relevé) : ce n'est pas une opération
      if(!label||/^(ancien |nouveau )?solde( (crediteur|debiteur|au|du|le|final|initial|comptable|disponible|en date du|en|eur|euros?))*[\s\d\/.,:-]*(eur)?$/.test(norm(label).replace(/€/g,"eur").trim()))continue;
      if(/\b(carte|cb)\b/.test(norm(label))&&!isDeferred(label))cards++;
      var op={date:d,amount:Math.round(amt*100)/100,label:label,src:osrc};if(detail)op.detail=detail;ops.push(op);
    }
    // Si le fichier détaille les paiements par carte, la ligne de total du débit différé ferait compter deux fois.
    if(cards>=3)ops=ops.filter(function(op){var drop=op.amount<0&&isDeferred(op.label);if(drop)dropped.push(op);return !drop;});
    if(ops.length<(found.header>=0?1:2))return null;
    ops.dropped=dropped;// pour retirer du registre ce qui avait été compté lors d'un import précédent
    return ops;
  }

  /* ── Catégories ────────────────────────────────────────────────────── */
  // [libellé de ligne FR, EN, type, motifs]. L'ordre compte : le premier motif trouvé l'emporte.
  var CATS=[
    ["Épargne","Savings","Épargne",/livret|ldds|lep\b|\bpel\b|\bcel\b|epargne|assurance vie|\bpea\b|versement programme|savings plan|plan d.?epargne|sparplan|virement vers.*(livret|epargne)/],
    ["Salaire","Salary","Salaire",/salaire|salary|retraite|pension(?! alimentaire)|carsat|\bcnav\b|agirc|arrco|paie\b|\bpaye\b|remuneration|payroll|traitement mensuel/],
    ["Aides (CAF)","Benefits (CAF)","Salaire",/\bcaf\b|\bcnaf\b|\bmsa\b|chomage|\bapl\b|allocation|pole emploi|france travail|\brsa\b|prime d.activite/],
    ["Crédits","Loans","Dépense",/echeance (de |du )?pret|\bpret (immo|perso|auto|etudiant)|credit (immo|conso|auto)|remboursement (de |du )?pret|cofidis|cetelem|sofinco|franfinance|younited|\boney\b|\bfloa\b|\bdiac\b|carrefour banque|\bpret\b(?! a porter)/],
    ["Loyer","Rent","Dépense",/loyer|foncia|nexity|bailleur|^(?!.*\b(carte|cb)\b).*habitat\b|action logement|immobiliere|\bopac\b|\bhlm\b/],
    // Carburant à part : « SNCF » ou « Uber » ne doivent jamais finir dans une ligne « Essence ».
    ["Carburant","Fuel","Dépense",/totalenergies station|total access|\besso\b|\bshell\b|\b(carte|cb)\b.*\b(bp|total ?energies)\b|\bavia\b|\bstation\b(?! f\b)|station.?service|carburant|essence|gazole|gasoil|\bsp ?9[58]\b|intermarche carbu|leclerc carbu|carrefour carbu|auchan carbu|super u carbu|dyneff|\beni\b|\bagip\b/],
    ["Courses","Groceries","Dépense",/carrefour|\bcoop\b|migros|\bmonop\b|leclerc|auchan|lidl|intermarche|super u|hyper u|\bu express|monoprix|franprix|\bcasino\b(?!.*(jeux|barriere|partouche|poker|\bbet\b|betclic|winamax))|\baldi\b|\bpicard\b|biocoop|netto|grand frais|naturalia|\bspar\b|\bmatch\b(?! (point|foot|de))|\bcora\b|g20|coccinelle|marche\b(?! (public|financier))/],
    ["Restaurants","Restaurants","Dépense",/restaurant|\bresto\b(?!s? du coeur)|mcdo|mc donald|mcdonald|burger king|\bkfc\b|uber\W*eats|deliveroo|just ?eat|starbucks|boulangerie|brasserie|sushi|pizza|kebab|cafe\b|bistro|o.?tacos|subway|five guys|\b(carte|cb)\b.*\bpaul\b/],
    ["Transports","Transport","Dépense",/sncf|\bg7\b|heetch|free ?now|\bratp\b|navigo|\buber\b|bolt|blablacar|\bstationnement\b|paybyphone|peage|autoroute|vinci|sanef|\baprr\b|parking|indigo|tisseo|\btcl\b|\brtm\b|keolis|transdev|\blime\b|velib|trainline|ouigo|tgv/],
    ["Abonnements","Subscriptions","Dépense",/netflix|spotify|deezer|disney ?(\+|plus)|disneyplus|primevideo|canal\+?|amazon prime|prime video|apple\.com|icloud|google (one|storage|play)|youtube|free mobile|free telecom|freebox|\borange\b(?! ?(boutique|store|shop|magasin))|\bsosh\b|\bsfr\b|bouygues|b ?& ?you|red by|basic.?fit|fitness park|keep cool|crunch|audible|chatgpt|openai/],
    ["Énergie et eau","Energy and water","Dépense",/\bedf\b|engie|total ?energies|ekwateur|\beau de (paris|.*(ville|agglo|metropole|syndicat))|\bsyndicat des eaux|veolia|suez|saur\b|gaz\b|electricite|mint energie|octopus/],
    ["Assurances","Insurance","Dépense",/assurance|\baxa\b|maif|macif|matmut|allianz|groupama|\bgmf\b|\bmma\b|generali|\bapril\b(?! \d)|luko|lovys/],
    ["Santé","Health","Dépense",/pharmacie|docteur|medecin|dentiste|laboratoire|opticien|doctolib|hopital|clinique|\bkine\b|kinesi|mutuelle|harmonie|ameli|\bcpam\b|\bcnam\b|\bmgen\b|\balan\b/],
    ["Shopping","Shopping","Dépense",/amazon|\bamzn\b|brico|cultura|fnac|darty|decathlon|zara|h ?& ?m\b|ikea|leroy merlin|castorama|boulanger|cdiscount|shein|vinted|\baction\b(?! logement)|primark|kiabi|sephora|nocibe|uniqlo|zalando|temu|aliexpress|apple store|galeries lafayette|printemps/],
    ["Loisirs","Leisure","Dépense",/cinema|disneyland|asterix|\bugc\b|pathe|gaumont|mk2|steam|playstation|nintendo|xbox|concert|ticketmaster|fnac spectacles|bowling|musee|theatre|\bescape\b|\bparc\b(?! (auto|de stationnement))/],
    ["Voyages","Travel","Dépense",/airbnb|booking|hotel|air france|easyjet|ryanair|vueling|transavia|expedia|abritel|club med|camping/],
    ["Retraits","Cash withdrawals","Dépense",/\bretraits?\b|\bdab\b|distributeur|\bgab\b|withdrawal/],
    ["Impôts","Taxes","Dépense",/impot|urssaf|\bsie\b|\bcfe\b|cotisations? sociales|cipav|dgfip|tresor public|taxe|finances publiques|amende|antai/],
    ["Frais bancaires","Bank fees","Dépense",/\bfrais\b(?! de (port|livraison|dossier|scolarite|garde))|commission|cotisation(?! (syndicale|club|association|asso|sport|licence|adhesion))|agios|interets debiteurs|tenue de compte|carte bancaire/],
  ];
  var OTHER_OUT=["Autres dépenses","Other expenses","Dépense"],OTHER_IN=["Autres revenus","Other income","Salaire"],TRANSFER=/virement interne|vir(ement)? (de|vers) (mon|ma|mes) (compte|livret|epargne|ldds|pel)\b|vir(ement)? (de|vers) (compte a compte|compte (joint|epargne|courant))\b|\bcompte a compte\b|transfert interne|^top ?-?up\b|top ?-?up by|general card deposit|exchanged to|converted \d|^(to|from) [a-z]{3} (savings|main|pocket)|recharge (depuis|par) (carte|cb)|virement bancaire sur le compte paypal|bank deposit to pp/;
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
    // « Caisse d'Épargne » est le nom d'une banque : son prêt ou ses frais ne sont pas de l'épargne.
    var l=norm(op.label+(op.detail?" "+op.detail:"")).replace(/caisse d.?epargne/g,"caisse banque");
    if(TRANSFER.test(l)&&!CATS[0][3].test(l))return null; // simple mouvement entre tes comptes : ignoré
    // Un virement à une personne (« VIR SEPA M PICARD ») n'est pas un achat en magasin : seules les catégories
    // qui se paient par virement (loyer, épargne, salaire, aides, impôts, assurances, santé, énergie) restent possibles.
    var isTransfer=transferLabel(l);
    for(var i=0;i<CATS.length;i++){var c=CATS[i];if(c[3].test(l)){
      if(isTransfer&&!/^(Épargne|Salaire|Aides \(CAF\)|Crédits|Loyer|Impôts|Assurances|Santé|Énergie et eau|Abonnements)$/.test(c[0]))continue;
      if(op.amount>0&&c[2]==="Dépense")return c; // remboursement : vient en déduction de la catégorie
      if(op.amount>0&&c[2]==="Épargne")return c; // retrait d'épargne : diminue l'épargne du mois
      if(op.amount<0&&c[2]==="Salaire")continue; // un prélèvement « retraite » n'est pas un revenu : on cherche plus loin
      return c;}}
    return op.amount>0?OTHER_IN:OTHER_OUT;
  }
  /* Ligne du tableur qui correspond déjà à une catégorie : même nom, singulier/pluriel, ou nom voisin
     (« Abonnement », « Abos » pour « Abonnements »…). Évite de créer une deuxième ligne pour la même chose. */
  var SYN={abonnements:["abonnement","abos","abo","subscriptions","subscription"],courses:["alimentation","supermarche","nourriture","groceries"],
    restaurants:["restaurant","restos","resto","sorties resto"],transports:["transport","transports en commun","deplacements","train","navigo"],carburant:["essence","carburant","fuel","gazole","gasoil","plein","plein essence","voiture","auto","vehicule"],autresrevenus:["autre revenu","revenus divers","revenu","revenus","income","other income","rentrees","entrees","extras"],autresdepenses:["autre depense","depenses diverses","other expenses","imprevus"],loyer:["logement","rent"],
    energieeteau:["energie","electricite","edf","eau","gaz","factures energie"],assurances:["assurance","insurance"],sante:["medecin","pharmacie","health"],
    loisirs:["sorties","leisure"],voyages:["vacances","voyage","travel"],impots:["impot","taxes","taxe"],salaire:["salaires","paie","salary","revenu","revenus","revenu net","income"],
    shopping:["achats"],credits:["credit","emprunt","emprunts","pret","prets","loans"],retraits:["retrait","especes","liquide"],fraisbancaires:["frais banque","banque","bank fees"],epargne:["savings"]};
  function sing(k){return k.replace(/(s|x)$/,"");}
  // Ligne de calcul (« Total dépenses », « Solde », « Reste à vivre ») : ni revenu, ni dépense, ni épargne.
  function structural(h){h=String(h||"").trim();if(!h)return false;var nh=norm(h);if(/^(solde|reste|disponible|balance|bilan|resultat)\b|^(sous ?-?)?(total|totaux)( (des?|du|general|generale|mensuel|annuel|depenses?|revenus?|epargnes?|charges?|sorties?|entrees?|mois|annee|fixes?|variables?)\b|$)|^(depenses|revenus|epargne) (globales?|totales?|du mois)$/.test(nh))return true;
    var d=window.GFClassifyRow&&window.GFClassifyRow(h);return d==="Ignorer";}
  // Lignes du tableur. Avec une année : celles de cette année (ou de la dernière année existante si elle n'a pas encore de feuille).
  function sheetRows(year){
    var out=[],sheets=[];try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();sheets=snap&&snap.sheets||[];}catch(e){}
    if(year!=null){var mine=sheets.filter(function(sh){return String(sh.name).trim()===String(year);});
      if(!mine.length){var yrs=sheets.filter(function(sh){return /^\d{4}$/.test(String(sh.name).trim());}).sort(function(a,b){return Number(b.name)-Number(a.name);});mine=yrs.slice(0,1);}
      if(mine.length)sheets=mine;}
    sheets.forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!structural(h)&&out.indexOf(h)<0)out.push(h);});});
    return out;
  }
  var ALIAS_KEY="personalFinanceDashboard.rowAliases";
  function aliases(){try{var v=JSON.parse(window.safeStore&&window.safeStore.getItem(ALIAS_KEY)||"{}");return v&&typeof v==="object"?v:{};}catch(e){return{};}}
  // Année dont on suit les renommages : la sienne, ou la dernière année existante si elle n'a pas encore de feuille.
  function aliasYear(year){
    if(year==null)return null;var sheets=[];try{sheets=window.FinanceSheet.getSnapshot().sheets||[];}catch(e){}
    if(sheets.some(function(sh){return String(sh.name).trim()===String(year);}))return String(year);
    var yrs=sheets.map(function(sh){return String(sh.name).trim();}).filter(function(n){return /^\d{4}$/.test(n);}).sort();return yrs.length?yrs[yrs.length-1]:String(year);
  }
  function existingRow(name,rows,year){
    var k=key(name);if(!k||!rows||!rows.length)return null;
    // Catégorie dont tu as renommé la ligne cette année-là (« Alimentation » → « Bouffe »)
    var A=aliases(),ay=aliasYear(year),al=ay!=null&&A[ay]&&typeof A[ay]==="object"?A[ay][k]:null;
    if(al){for(var a=0;a<rows.length;a++)if(key(rows[a])===key(al))return rows[a];}
    var hit=function(f){for(var i=0;i<rows.length;i++)if(f(key(rows[i])))return rows[i];return null;};
    var syn=(SYN[k]||[]).map(key);
    var exact=hit(function(r){return r===k;})||hit(function(r){return sing(r)===sing(k);})||hit(function(r){return syn.indexOf(r)>=0||syn.indexOf(sing(r))>=0;});
    if(exact)return exact;
    // « Abonnements streaming et musique » : une seule ligne qui commence par le nom de la catégorie
    var stem=sing(k);if(stem.length<5)return null;
    var starts=rows.filter(function(r){return key(r).indexOf(stem)===0;});if(starts.length===1)return starts[0];
    // Pas de ligne « Essence » mais une ligne « Transport » : le carburant y va plutôt que de créer une ligne de plus.
    return k==="carburant"||k==="fuel"?existingRow("Transports",rows,year):null;
  }
  // Épargne : la ligne d'épargne dont le nom est dans le libellé (« VIR VERS LIVRET A » → « Livret A »),
  // ou la seule ligne d'épargne du tableur.
  function savingsRow(op,rows){
    var w=" "+norm(op.label+(op.detail?" "+op.detail:"")).replace(/[^a-z0-9]+/g," ")+" ",sv=rows.filter(function(h){return kindOf(h)==="Épargne";});
    // Nom de la ligne en mots entiers dans le libellé (« Livret A », « PEL ») ; « CEL » ne doit pas trouver « Céline ».
    var named=sv.filter(function(h){var n=norm(h).replace(/[^a-z0-9]+/g," ").trim();return n.length>=2&&w.indexOf(" "+n+" ")>=0;}).sort(function(a,b){return key(b).length-key(a).length;});
    if(named[0])return named[0];
    // Sinon, la seule ligne d'épargne si elle est générale (« Épargne », « Économies »), pas un produit précis (« PEA »).
    var gen=sv.filter(function(h){return /^(epargne|economies?|savings?|mise de cote)\b/.test(norm(h).trim());});
    return gen.length===1?gen[0]:null;
  }
  // Marchand qui a déjà sa propre ligne (une ligne « Netflix » dans le tableur) : on la remplit au lieu de « Abonnements ».
  var GENERIC=/^(prime|banque|bank|credit|carte|frais|total|service|services|paiement|achat|magasin|super|hyper|cafe|station|compte|pret|assurance|mutuelle|epargne|salaire|loyer|courses|impots?)$/;
  function merchantRow(m,rows){var w=String(m||"").split(" ")[0];if(!w||w.length<4||GENERIC.test(w))return null;for(var i=0;i<rows.length;i++){var r=key(rows[i]);if((r===key(w)||r===key(m))&&kindOf(rows[i])==="Dépense")return rows[i];}return null;}
  function summarize(ops,extra){
    var groups={},months={},ignored=0,rules=learned(),rowsBy={},items=[],seenFp={},all=[];
    var rowsOf=function(y){return rowsBy[y]||(rowsBy[y]=sheetRows(y));};
    // Empreinte de chaque opération du fichier, même ignorée : une opération désormais ignorée sort du registre.
    ops.concat(ops.dropped||[]).forEach(function(op){var fp=fingerprint(op),n=seenFp[fp]=(seenFp[fp]||0)+1;op._fp=fp+"#"+n;all.push({fp:op._fp,mk:op.date.y+"-"+op.date.m});});Object.keys(extra||{}).forEach(function(k){rules[k]=extra[k];});
    ops.forEach(function(op){
      var c=categorize(op,rules);if(!c){ignored++;return;}
      var rows=rowsOf(op.date.y),mo=merchantOf(op.label),own=!Object.prototype.hasOwnProperty.call(rules,mo)&&c[2]==="Dépense"&&op.amount<0?merchantRow(mo,rows):null;
      if(!own&&c[2]==="Épargne")own=savingsRow(op,rows);
      var isOther=!own&&(c===OTHER_OUT||c===OTHER_IN),name=own||existingRow(en()?c[1]:c[0],rows,op.date.y)||existingRow(en()?c[0]:c[1],rows,op.date.y)||(en()?c[1]:c[0]),kind=c[2],g=groups[name]||(groups[name]={name:name,kind:kind,count:0,total:0,byMonth:{},merchants:{}});if(isOther)g.other=true;
      // Dépenses et épargne comptées en positif ; un remboursement vient en déduction
      var v=kind==="Salaire"?op.amount:-op.amount,mk=op.date.y+"-"+op.date.m;
      g.count++;g.total+=v;g.byMonth[mk]=(g.byMonth[mk]||0)+v;months[mk]=op.date;
      items.push({fp:op._fp,mk:mk,name:name,cat:en()?c[1]:c[0],kind:kind,v:v});
      var mid=merchantOf(op.label)||norm(op.label).slice(0,24),mm=g.merchants[mid]||(g.merchants[mid]={key:mid,label:op.label,count:0,total:0});mm.count++;mm.total+=v;
    });
    var list=Object.keys(groups).map(function(k){return groups[k];}).filter(function(g){return Math.abs(g.total)>=0.005;});
    var order={"Salaire":0,"Dépense":1,"Épargne":2};list.sort(function(a,b){return order[a.kind]-order[b.kind]||Math.abs(b.total)-Math.abs(a.total);});
    var mlist=Object.keys(months).map(function(k){return months[k];}).sort(function(a,b){return a.y-b.y||a.m-b.m;});
    return{groups:list,months:mlist,count:ops.length-ignored,ignored:ignored,items:items,all:all};
  }

  /* ── Écriture dans le tableur ───────────────────────────────────────── */
  function signIn(vals){var p=0,n=0;vals.forEach(function(v){if(v>0)p++;else if(v<0)n++;});return p>n?1:n>p?-1:0;}
  function kindOf(label){
    var r={};try{r=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.categoryRules")||"{}")||{};}catch(e){}
    var v=r[key(label)];if(v)return v==="Epargne"?"Épargne":v;
    // Même classement que le tableau de bord, pour ranger la ligne là où il la compte.
    var d=window.GFClassifyRow&&window.GFClassifyRow(label);if(d==="Salaire"||d==="Dépense"||d==="Épargne")return d;
    var w=" "+norm(label).replace(/[^a-z0-9]+/g," ")+" ";
    if(/ (salaires?|revenus?|primes?|paie|paye|allocations?|caf|apl|rsa) /.test(w))return"Salaire";
    if(/ (epargne|livrets?|pea|pel|cel|ldds|lep|placements?|assurance vie) /.test(w))return"Épargne";return"Dépense";
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
  function fingerprint(op){return op.date.y+"-"+op.date.m+"-"+op.date.d+"|"+op.amount+"|"+hash(norm(op.label).replace(/\s+/g," ").trim())+(op.src?"|"+op.src:"");}
  function ledger(){try{var v=JSON.parse(window.safeStore&&window.safeStore.getItem(LEDGER_KEY)||"{}");return v&&v.m&&typeof v.m==="object"?v:{v:1,m:{}};}catch(e){return{v:1,m:{}};}}
  function saveLedger(L){var ks=Object.keys(L.m).sort(function(a,b){var x=a.split("-"),y=b.split("-");return (x[0]*12+ +x[1])-(y[0]*12+ +y[1]);});ks.slice(0,Math.max(0,ks.length-24)).forEach(function(k){delete L.m[k];});try{window.safeStore.setItem(LEDGER_KEY,JSON.stringify(L));}catch(e){}}
  /* Ce qu'il faut écrire, mois par mois et ligne par ligne.
     « Remplacer » : total de toutes les opérations connues du mois (anciennes + nouvelles), donc un relevé partiel
     ne fait pas disparaître le reste du mois. « Ajouter » : seulement les opérations jamais importées. */
  function plan(summary,mode){
    var L=ledger(),out={},dup=0,fresh=0,kinds={},before={},rowsBy={},items=summary.items||[];
    // Une ligne renommée dans le tableur (« Abonnements » → « Abos ») garde ses anciennes opérations.
    var rowName=function(e,mk){var y=mk.split("-")[0],rows=rowsBy[y]||(rowsBy[y]=sheetRows(y));return existingRow(e[0],rows,y)||(e[3]&&existingRow(e[3],rows,y))||(rows.length&&e[3])||e[0];};
    // Mois touchés : ceux du fichier, plus ceux du registre qui tombent dans la période du fichier.
    var touched={};(summary.all||items).forEach(function(it){touched[it.mk]=1;});
    Object.keys(touched).forEach(function(mk){var b=before[mk]={};Object.keys(L.m[mk]||{}).forEach(function(fp){var e=L.m[mk][fp],n=rowName(e,mk);b[n]=1;kinds[n]=e[1];});});
    if(mode!=="add"){
      // Remplacer : une opération de ce fichier désormais ignorée sort du registre. Les opérations venues
      // d'un autre fichier (autre compte, export filtré) sont gardées.
      var kept={};items.forEach(function(it){kept[it.fp]=1;});
      (summary.all||[]).forEach(function(a){if(!kept[a.fp]&&L.m[a.mk])delete L.m[a.mk][a.fp];});
    }
    items.forEach(function(it){kinds[it.name]=it.kind;var M=L.m[it.mk]||(L.m[it.mk]={});
      if(M[it.fp])dup++;else fresh++;
      if(mode==="add"&&M[it.fp])return;
      M[it.fp]=[it.name,it.kind,Math.round(it.v*100)/100,it.cat];
      if(mode==="add"){var o=out[it.mk]||(out[it.mk]={});o[it.name]=(o[it.name]||0)+it.v;}});
    if(mode!=="add")Object.keys(touched).forEach(function(mk){
      var o=out[mk]={};Object.keys(before[mk]||{}).forEach(function(n){o[n]=0;});
      Object.keys(L.m[mk]||{}).forEach(function(fp){var e=L.m[mk][fp],n=rowName(e,mk);kinds[n]=kinds[n]||e[1];o[n]=(o[n]||0)+e[2];});
      if(!Object.keys(L.m[mk]||{}).length)delete L.m[mk];});
    return{cells:out,kinds:kinds,dup:dup,fresh:fresh,save:function(){saveLedger(L);}};
  }
  // Insère une ligne à l'index r : les lignes dessous descendent, les formules du tableur suivent (B4 → B5).
  // grow : la ligne prolonge le groupe juste au-dessus ; une plage qui finit sur ce groupe (=SUM(B2:B3)) s'étend à elle.
  function insertRow(sh,r,name,grow){
    var mv=function(col,row){return col.toUpperCase()+(Number(row)-1>=r?Number(row)+1:Number(row));};
    var shift=function(raw){if(typeof raw!=="string"||raw.charAt(0)!=="=")return raw;
      return raw.split('"').map(function(part,i){if(i%2)return part;
        return part.replace(/\b([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?\b/gi,function(m,c1,r1,c2,r2){
          if(c2==null)return mv(c1,r1);
          var end=Number(r2)===r&&grow&&Number(r1)<=r?c2.toUpperCase()+(r+1):mv(c2,r2);return mv(c1,r1)+":"+end;});}).join('"');};
    var next={};Object.keys(sh.cells||{}).forEach(function(k){var p=k.split(","),row=Number(p[0]),cell=sh.cells[k],nc=cell&&typeof cell==="object"?Object.assign({},cell,{raw:shift(cell.raw)}):cell;next[(row>=r?row+1:row)+","+p[1]]=nc;});
    sh.cells=next;
    while(sh.rowHeaders.length<r)sh.rowHeaders.push("");
    sh.rowHeaders.splice(r,0,name);
  }
  // Ligne renommée dans le tableur : les opérations déjà importées et les choix de marchands la suivent.
  function renameRow(oldName,newName,year){
    var o=key(oldName),n=String(newName||"").trim();if(!o||!n||o===key(n)||!/^\d{4}$/.test(String(year||"").trim()))return;year=String(year).trim();
    var L=ledger(),changed=false;Object.keys(L.m).forEach(function(mk){if(year&&mk.split("-")[0]!==String(year))return;Object.keys(L.m[mk]).forEach(function(fp){var e=L.m[mk][fp];if(key(e[0])===o){e[0]=n;changed=true;}});});
    if(changed)saveLedger(L);
    // Les catégories qui allaient dans cette ligne y vont toujours.
    var A=aliases(),Y=A[year]&&typeof A[year]==="object"?A[year]:(A[year]={}),ach=false,rowsNow=sheetRows(year);
    CATS.concat([OTHER_OUT,OTHER_IN]).forEach(function(c){[c[0],c[1]].forEach(function(nm){var k=key(nm);
      var live=Y[k]&&rowsNow.concat([n]).some(function(h){return key(h)===key(Y[k]);})?Y[k]:null;// alias dont la ligne a disparu : oublié
      if(live?key(live)===o:existingRow(nm,[oldName])){Y[k]=n;ach=true;}else if(Y[k]&&!live){delete Y[k];ach=true;}});});
    if(ach)try{window.safeStore.setItem(ALIAS_KEY,JSON.stringify(A));}catch(e){}
    // Choix de marchands : suivent le nouveau nom seulement si l'ancien n'existe plus dans aucune autre année.
    var elsewhere=false;try{(window.FinanceSheet.getSnapshot().sheets||[]).forEach(function(sh){if(String(sh.name).trim()!==year&&(sh.rowHeaders||[]).some(function(h){return key(h)===o;}))elsewhere=true;});}catch(e){}
    if(elsewhere)return;
    var R=learned(),upd={};Object.keys(R).forEach(function(m){if(R[m]&&key(R[m][0])===o)upd[m]=[n,R[m][1]];});if(Object.keys(upd).length)saveLearned(upd);
  }
  function write(summary,mode){
    var FS=window.FinanceSheet;if(!FS||!FS.getSnapshot)return false;
    var snap=JSON.parse(JSON.stringify(FS.getSnapshot()));snap.sheets=snap.sheets||[];
    var rules={};try{rules=JSON.parse(window.safeStore.getItem("personalFinanceDashboard.categoryRules")||"{}")||{};}catch(e){}
    var signs={"Salaire":signFor(snap,"Salaire"),"Dépense":signFor(snap,"Dépense"),"Épargne":signFor(snap,"Épargne")},last=null;
    var P=plan(summary,mode);summary.dup=P.dup;summary.fresh=P.fresh;
    var ORDER={"Salaire":0,"Dépense":1,"Épargne":2};
    var kindIn=function(h){var v=rules[key(h)];if(v)return v==="Epargne"?"Épargne":v;return kindOf(h);};
    // Ordre d'écriture : revenus, puis dépenses de la plus grosse à la plus petite, puis épargne.
    // « Autres dépenses » / « Autres revenus » restent en dernier dans leur groupe.
    var isOtherRow=function(h){return /^(autres?|other)\b/i.test(String(h||"").trim());};
    var sortNames=function(o){return Object.keys(o).sort(function(a,b){return ORDER[P.kinds[a]||"Dépense"]-ORDER[P.kinds[b]||"Dépense"]||isOtherRow(a)-isOtherRow(b)||Math.abs(o[b])-Math.abs(o[a]);});};
    Object.keys(P.cells).forEach(function(mk){sortNames(P.cells[mk]).forEach(function(name){
      var g={name:name,kind:P.kinds[name]||"Dépense"},amount=P.cells[mk][name];
      if(!rules[key(g.name)])rules[key(g.name)]=g.kind;
      (function(){
        var p=mk.split("-"),y=p[0],mi=Number(p[1]),sh=snap.sheets.filter(function(s){return String(s.name).trim()===y;})[0];
        if(!sh){sh={id:"s"+y+"-"+Date.now().toString(36),name:y,cells:{},headers:MN.map(function(m){return m.charAt(0).toUpperCase()+m.slice(1);}),rowHeaders:[],rows:9,cols:12};snap.sheets.push(sh);}
        sh.rowHeaders=sh.rowHeaders||[];
        var same=[];sh.rowHeaders.forEach(function(h,i){if(key(h)===key(g.name))same.push(i);});
        var sameKind=same.filter(function(i){return kindIn(sh.rowHeaders[i])===g.kind;}),r=sameKind.length?sameKind[0]:same.length?same[0]:-1;
        if(r<0){
          // Nouvelle ligne : après la dernière ligne du même type ; un revenu en haut, une dépense avant l'épargne.
          var sums=function(i){return Object.keys(sh.cells||{}).some(function(k){return k.split(",")[0]===String(i)&&/^=.*[A-Z]+\d+:[A-Z]+\d+/i.test(String((sh.cells[k]||{}).raw||""));});};
          var calc=function(h,i){return structural(h)||sums(i);};
          var lastSame=-1,firstAfter=-1;sh.rowHeaders.forEach(function(h,i){if(!String(h||"").trim()||calc(h,i))return;var k=ORDER[kindIn(h)];if(k===ORDER[g.kind]&&(isOtherRow(g.name)||!isOtherRow(h)))lastSame=i;else if(k>ORDER[g.kind]&&firstAfter<0)firstAfter=i;});
          // Sans ligne du même type : avant la première ligne d'un type suivant, sinon avant « Total »/« Solde », sinon en bas.
          var used=-1,firstTotal=-1;sh.rowHeaders.forEach(function(h,i){h=String(h||"").trim();if(!h)return;used=i;if(firstTotal<0&&calc(h,i))firstTotal=i;});
          r=lastSame>=0?lastSame+1:firstAfter>=0?firstAfter:firstTotal>=0?firstTotal:used+1;
          insertRow(sh,r,g.name,lastSame>=0&&r===lastSame+1);
        }
        sh.rows=Math.max(Number(sh.rows)||0,sh.rowHeaders.length+2);
        var v=Math.round(amount*signs[g.kind]*100)/100,cell=sh.cells[r+","+mi],old=cell&&String(cell.raw||"").trim();
        if(mode==="add"&&old){var n=Number(old.replace(",","."));sh.cells[r+","+mi]={raw:old.charAt(0)!=="="&&isFinite(n)?String(Math.round((n+v)*100)/100):"="+(old.charAt(0)==="="?old.slice(1):old)+(v<0?"-":"+")+Math.abs(v)};}
        else if(v===0&&mode!=="add")delete sh.cells[r+","+mi];
        else sh.cells[r+","+mi]={raw:String(v)};
        // Deux lignes du même nom (renommage) : le total est dans la première, l'autre ne doit pas le compter une 2e fois.
        if(mode!=="add")same.forEach(function(i){if(i!==r&&kindIn(sh.rowHeaders[i])===g.kind)delete sh.cells[i+","+mi];});
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
    // Une catégorie déjà présente dans le tableur sous un autre nom (« Alimentation » pour Courses) n'est proposée qu'une fois.
    var rowsNow=sheetRows();CATS.forEach(function(c){if(existingRow(c[0],rowsNow)||existingRow(c[1],rowsNow))return;add(en()?c[1]:c[0],c[2],"cat");});
    try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();(snap&&snap.sheets||[]).forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!structural(h))add(h,kindOf(h),"sheet");});});}catch(e){}
    add(en()?OTHER_OUT[1]:OTHER_OUT[0],"Dépense","other");add(en()?OTHER_IN[1]:OTHER_IN[0],"Salaire","other");
    return out;
  }
  function pretty(m){var w=m.split(" ");while(w.length>1&&/^(vers|de|du|m|mme|mr|monsieur|madame|mlle)$/.test(w[0]))w.shift();return w.map(function(x){return x.charAt(0).toUpperCase()+x.slice(1);}).join(" ");}
  // Mois de l'import qui ont déjà des montants dans les lignes visées (pour ne demander « Remplacer / Ajouter » qu'en cas de besoin).
  function conflictMonths(summary){
    var out=[],seen={};
    try{var snap=window.FinanceSheet.getSnapshot();
      summary.groups.forEach(function(g){Object.keys(g.byMonth).forEach(function(mk){if(seen[mk])return;var p=mk.split("-"),sh=(snap.sheets||[]).filter(function(x){return String(x.name).trim()===p[0];})[0];if(!sh)return;
        var r=(sh.rowHeaders||[]).findIndex(function(h){return key(h)===key(g.name);});if(r<0)return;var c=sh.cells&&sh.cells[r+","+p[1]];
        if(c&&String(c.raw||"").trim()!==""){seen[mk]=1;out.push(summary.months.filter(function(d){return d.y+"-"+d.m===mk;})[0]||{y:+p[0],m:+p[1]});}});});
    }catch(e){}
    return out.sort(function(a,b){return a.y-b.y||a.m-b.m;});
  }
  /* Aperçu en étapes, une décision par écran :
     1. ce qu'on a trouvé · 2. à vérifier · 3. mois déjà remplis (seulement s'il y en a) · 4. confirmer. */
  function preview(ops,fileName){
    return new Promise(function(resolve){
      var extra={},opened={},showAll={},summary=summarize(ops),T=targets(),rowsNow=sheetRows(),lastMove=null,mode="replace",step="found",steps=[],conf=[];
      var otherNames=[en()?OTHER_OUT[1]:OTHER_OUT[0],en()?OTHER_IN[1]:OTHER_IN[0]];
      var NB=" ",q=function(s){return t2("«"+NB+s+NB+"»","“"+s+"”");};
      var KINDS=[["Salaire",t2("Revenus","Income")],["Dépense",t2("Dépenses","Expenses")],["Épargne",t2("Épargne","Savings")]],titles={};KINDS.forEach(function(k){titles[k[0]]=k[1];});
      var signed=function(kind,v){return kind==="Salaire"?(v<0?"−":"+")+eur(Math.abs(v)):kind==="Dépense"?(v>0?"−":"+")+eur(Math.abs(v)):eur(v);};
      var plural=function(n,fr1,frN,en1,enN){return n+NB+(n>1?t2(frN,enN):t2(fr1,en1));};
      var isNew=function(name){return !rowsNow.some(function(r){return key(r)===key(name);});};

      var d=el("dialog","gfh-dialog gfb-dialog gfb-wiz");d.setAttribute("aria-labelledby","gfbTitle");
      var head=el("div","gfb-head"),h=el("h2","",t2("Relevé bancaire","Bank statement"));h.id="gfbTitle";h.tabIndex=-1;
      var x=el("button","gfb-x");x.type="button";x.setAttribute("aria-label",t2("Fermer","Close"));x.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      head.append(h,x);
      // Indicateur d'étape : « Étape 2 sur 4 » + barre en segments
      var prog=el("div","gfb-progress"),stepTxt=el("p","gfb-step-txt"),bar=el("div","gfb-bar");stepTxt.setAttribute("aria-live","polite");bar.setAttribute("aria-hidden","true");prog.append(stepTxt,bar);

      var HEADS={found:t2("Relevé reconnu","Statement recognised"),check:t2("À vérifier","To check"),months:t2("Mois déjà remplis","Months already filled"),confirm:t2("Prêt à importer","Ready to import")};
      var P={};["found","check","months","confirm"].forEach(function(id){var s=el("section","gfb-pane"),hh=el("h3","gfb-step-h",HEADS[id]);hh.tabIndex=-1;hh.id="gfbStep-"+id;s.setAttribute("aria-labelledby",hh.id);s.dataset.step=id;s.hidden=true;s.append(hh);s._h=hh;P[id]=s;});
      var ICON_OK='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var badge=el("span","gfb-badge");badge.innerHTML=ICON_OK;P.found._h.prepend(badge);

      /* 1. Ce qu'on a trouvé */
      var fLead=el("p","gfb-lead"),facts=el("dl","gfb-facts"),fHow=el("p","gfb-lead"),fIgn=el("p","gfb-note"),fPriv=el("p","gfb-note gfb-priv");
      P.found.append(fLead,facts,fHow,fIgn,fPriv);
      /* 2. À vérifier */
      var cLead=el("p","gfb-lead"),list=el("div","gfb-list"),flash=el("p","gfb-flash");
      flash.setAttribute("role","status");flash.setAttribute("aria-live","polite");flash.hidden=true;
      P.check.append(cLead,flash,list);
      /* 3. Mois déjà remplis */
      var mLead=el("p","gfb-lead"),modeBox=el("fieldset","gfb-mode"),legend=el("legend","",t2("Que faire de ces mois"+NB+"?","What should happen to these months?"));modeBox.append(legend);
      [["replace",t2("Remplacer","Replace"),t2("Ces lignes prennent les montants du relevé pour ces mois. Ce que tu y avais tapé à la main est effacé.","These rows take the statement’s amounts for these months. What you typed there by hand is erased.")],
       ["add",t2("Ajouter","Add"),t2("Les opérations jamais importées s’ajoutent à tes chiffres. Celles déjà importées ne comptent pas deux fois.","Transactions never imported before are added to your amounts. Those already imported aren’t counted twice.")]].forEach(function(o){
        var lab=el("label","gfb-opt"),r=document.createElement("input"),txt=el("span","gfb-opt-txt");r.type="radio";r.name="gfbMode";r.value=o[0];r.checked=o[0]===mode;
        r.addEventListener("change",function(){if(r.checked)mode=o[0];});
        txt.append(el("strong","",o[1]),el("small","",o[2]));lab.append(r,txt);modeBox.append(lab);});
      P.months.append(mLead,modeBox);
      /* 4. Confirmer */
      var kLead=el("p","gfb-lead"),recap=el("div","gfb-recap"),kMode=el("p","gfb-note"),kAfter=el("p","gfb-note",t2("Tu pourras tout modifier ensuite dans le tableur.","You can change anything afterwards in the spreadsheet."));
      P.confirm.append(kLead,recap,kMode,kAfter);

      function selectFor(m,current){
        var sel=document.createElement("select");sel.className="gfb-move";sel.setAttribute("aria-label",t2("Ranger «"+NB,"File “")+pretty(m.key)+t2(NB+"» dans","” under"));
        var groups={cat:t2("Catégories","Categories"),sheet:t2("Lignes de ton tableur","Your spreadsheet rows"),other:t2("Autres","Other")};
        Object.keys(groups).forEach(function(g){var og=document.createElement("optgroup");og.label=groups[g];T.filter(function(t){return t.group===g;}).forEach(function(t){var o=new Option(t.name,t.name+"|"+t.kind);if(key(t.name)===key(current))o.selected=true;og.append(o);});if(og.children.length)sel.append(og);});
        var ig=new Option(t2("Ignorer (virement entre mes comptes)","Ignore (transfer between my accounts)"),"|Ignorer");sel.append(ig);
        // Au clavier, chaque flèche change la valeur : on applique le choix quand le menu est quitté ou validé.
        var apply=function(){var v=sel.value.split("|"),prev=Object.prototype.hasOwnProperty.call(extra,m.key)?extra[m.key]:undefined;
          if(key(v[0])===key(current)&&v[1]!=="Ignorer")return;
          extra[m.key]=v[1]==="Ignorer"?["","Ignorer"]:[v[0],v[1]];if(v[1]!=="Ignorer")opened[v[0]]=true;
          lastMove={key:m.key,prev:prev,label:pretty(m.key),to:v[1]==="Ignorer"?t2("ignoré","ignored"):v[0]};draw(true);};
        sel.addEventListener("change",function(){if(!sel.matches(":focus-visible")||sel.dataset.kbd!=="1")apply();});
        sel.addEventListener("keydown",function(e){sel.dataset.kbd="1";if(e.key==="Enter"){e.preventDefault();e.stopPropagation();apply();}});
        sel.addEventListener("blur",function(){if(sel.dataset.kbd==="1"){sel.dataset.kbd="";apply();}});
        return sel;
      }
      function groupNode(g,todoGroup){
        var det=document.createElement("details");det.className="gfb-group"+(todoGroup?" is-todo":"");if(todoGroup||opened[g.name])det.open=true;
        det.addEventListener("toggle",function(){opened[g.name]=det.open;});
        var sum=document.createElement("summary");sum.className="gfb-row";var nm=el("span","gfb-name",g.name);
        if(isNew(g.name))nm.append(el("small","gfb-new",t2("nouvelle ligne","new row")));
        sum.append(nm,el("span","gfb-count",plural(g.count,"opération","opérations","transaction","transactions")),el("b","gf-amount",signed(g.kind,g.total)));det.append(sum);
        var ms=Object.keys(g.merchants).map(function(k){return g.merchants[k];}).sort(function(a,b){return Math.abs(b.total)-Math.abs(a.total);});
        var box=el("div","gfb-merchants"),lim=showAll[g.name]?ms.length:25;
        ms.slice(0,lim).forEach(function(m){var row=el("div","gfb-merchant");var mn=el("span","gfb-mname",m.key?pretty(m.key):m.label);mn.setAttribute("translate","no");mn.title=m.label;row.append(mn,el("b","gf-amount",eur(Math.abs(m.total))));if(m.key&&merchantOf(m.label)===m.key)row.append(selectFor(m,g.name));box.append(row);});
        if(ms.length>lim){var more=el("button","gfh-link gfb-more",t2("Afficher les "+(ms.length-lim)+" autres","Show the other "+(ms.length-lim)));more.type="button";more.addEventListener("click",function(){showAll[g.name]=true;draw(true);});box.append(more);}
        det.append(box);return det;
      }
      function draw(keepPlace){
        var top=body.scrollTop;
        summary=summarize(ops,extra);conf=conflictMonths(summary);
        steps=["found","check"].concat(conf.length?["months"]:[]).concat(["confirm"]);if(steps.indexOf(step)<0)step="check";
        var idx=steps.indexOf(step),last=idx===steps.length-1;
        var first=summary.months[0],lastM=summary.months[summary.months.length-1],years={};summary.months.forEach(function(m){years[m.y]=1;});
        var yl=Object.keys(years).join(", "),ny=Object.keys(years).length,period=!first?"":first===lastM?monthLabel(first):(first.y===lastM.y?(en()?MN_EN[first.m]:MN[first.m]):monthLabel(first))+" → "+monthLabel(lastM);
        var tot={"Salaire":0,"Dépense":0,"Épargne":0};summary.groups.forEach(function(g){tot[g.kind]+=g.total;});
        var isTodo=function(g){return g.other||otherNames.indexOf(g.name)>=0;};
        var todo=summary.groups.filter(isTodo),rest=summary.groups.filter(function(g){return !isTodo(g);}),todoOps=todo.reduce(function(s,g){return s+g.count;},0);

        // Indicateur
        stepTxt.textContent=t2("Étape "+(idx+1)+" sur "+steps.length,"Step "+(idx+1)+" of "+steps.length);
        bar.replaceChildren.apply(bar,steps.map(function(s,i){return el("span","gfb-seg"+(i<idx?" is-done":i===idx?" is-on":""));}));

        // 1. Ce qu'on a trouvé
        fLead.textContent=fileName?t2("Meuniance a bien lu ton fichier "+q(fileName)+".","Meuniance read your file "+q(fileName)+"."):t2("Meuniance a bien lu ton relevé.","Meuniance read your statement.");
        var rowsF=[[t2("Opérations","Transactions"),String(summary.count)],[t2("Période","Period"),period]];
        KINDS.forEach(function(k){if(tot[k[0]])rowsF.push([k[1],signed(k[0],tot[k[0]]),true]);});
        facts.replaceChildren.apply(facts,rowsF.map(function(r){var w=el("div","gfb-fact");w.append(el("dt","",r[0]),el("dd","",null));var dd=w.lastChild;if(r[2])dd.append(el("b","gf-amount",r[1]));else dd.textContent=r[1];return w;}));
        fHow.replaceChildren(document.createTextNode(ny>1?t2("Ces montants iront dans les feuilles ","These amounts will go into the "):t2("Ces montants iront dans la feuille ","These amounts will go into the ")),el("b","",yl),document.createTextNode(ny>1?t2(" du tableur"+NB+": une ligne par catégorie, une colonne par mois."," sheets: one row per category, one column per month."):t2(" du tableur"+NB+": une ligne par catégorie, une colonne par mois."," sheet: one row per category, one column per month.")));
        fIgn.hidden=!summary.ignored;fIgn.textContent=summary.ignored?t2(plural(summary.ignored,"virement entre tes comptes est ignoré","virements entre tes comptes sont ignorés","","")+NB+": ce n’est ni une dépense ni un revenu.",plural(summary.ignored,"","","transfer between your accounts is","transfers between your accounts are")+" ignored: it’s neither spending nor income."):"";
        fPriv.textContent=t2("Le fichier reste sur ton appareil"+NB+": seuls les totaux vont dans le tableur.","The file stays on your device: only the totals go into the spreadsheet.");

        // 2. À vérifier
        var nodes=[],lastKind="";
        if(!summary.groups.length)cLead.textContent=t2("Toutes les opérations sont ignorées"+NB+": il n’y a plus rien à importer.","Every transaction is ignored: there’s nothing left to import.");
        else if(todo.length)cLead.textContent=t2("Meuniance n’a pas reconnu "+plural(todoOps,"opération","opérations","transaction","transactions")+". Choisis où "+(todoOps>1?"les":"la")+" ranger, ou laisse-"+(todoOps>1?"les":"la")+" dans "+q("Autres")+".","Meuniance didn’t recognise "+plural(todoOps,"opération","opérations","transaction","transactions")+". Choose where to file "+(todoOps>1?"them":"it")+", or leave "+(todoOps>1?"them":"it")+" in “Other”.");
        else cLead.textContent=t2("Tout est classé. Ouvre une catégorie si tu veux ranger un marchand ailleurs"+NB+": Meuniance s’en souviendra.","Everything is sorted. Open a category if you want to move a merchant elsewhere: Meuniance will remember it.");
        if(todo.length){nodes.push(el("div","gfb-kind gfb-todo-title",t2("À classer","To sort")));todo.forEach(function(g){nodes.push(groupNode(g,true));});
          if(rest.length)nodes.push(el("p","gfb-todo-help",t2("Le reste est déjà classé. Ouvre une catégorie pour ranger un marchand ailleurs"+NB+": Meuniance s’en souviendra.","The rest is already sorted. Open a category to move a merchant elsewhere: Meuniance will remember it.")));}
        rest.forEach(function(g){if(g.kind!==lastKind){nodes.push(el("div","gfb-kind",titles[g.kind]));lastKind=g.kind;}nodes.push(groupNode(g,false));});
        list.replaceChildren.apply(list,nodes);list.hidden=!nodes.length;
        if(lastMove){flash.hidden=false;flash.replaceChildren(document.createTextNode(q(lastMove.label)+" → "+lastMove.to+" · "));var undo=el("button","gfh-link",t2("Annuler","Undo"));undo.type="button";
          undo.addEventListener("click",function(){var mv=lastMove;if(!mv)return;if(mv.prev===undefined)delete extra[mv.key];else extra[mv.key]=mv.prev;lastMove=null;flash.hidden=true;draw(true);});flash.append(undo);}

        // 3. Mois déjà remplis
        mLead.textContent=conf.length?t2("Ton tableur a déjà des montants pour "+conf.map(monthLabel).join(", ")+" dans les lignes de ce relevé.","Your spreadsheet already has amounts for "+conf.map(monthLabel).join(", ")+" in this statement’s rows."):"";

        // 4. Confirmer
        kLead.textContent=(ny>1?t2("Meuniance va écrire ces totaux dans les feuilles "+yl,"Meuniance will write these totals into the "+yl+" sheets"):t2("Meuniance va écrire ces totaux dans la feuille "+yl,"Meuniance will write these totals into the "+yl+" sheet"))
          +(summary.months.length>1?t2(", répartis mois par mois"+NB+":",", month by month:"):t2(NB+":",":"));
        var rnodes=[];lastKind="";
        summary.groups.forEach(function(g){if(g.kind!==lastKind){rnodes.push(el("div","gfb-kind",titles[g.kind]));lastKind=g.kind;}
          var r=el("div","gfb-row gfb-rrow"),nm=el("span","gfb-name",g.name);if(isNew(g.name))nm.append(el("small","gfb-new",t2("nouvelle ligne","new row")));r.append(nm,el("b","gf-amount",signed(g.kind,g.total)));rnodes.push(r);});
        recap.replaceChildren.apply(recap,rnodes);
        kMode.hidden=!conf.length;kMode.textContent=conf.length?(mode==="add"?t2("Mois déjà remplis"+NB+": les nouvelles opérations s’ajoutent à tes chiffres.","Months already filled: new transactions are added to your amounts."):t2("Mois déjà remplis"+NB+": les montants du relevé remplacent les tiens.","Months already filled: the statement’s amounts replace yours.")):"";

        // Écran visible + boutons
        Object.keys(P).forEach(function(id){P[id].hidden=id!==step;});
        back.textContent=idx?t2("Retour","Back"):t2("Annuler","Cancel");
        ok.textContent=last?t2("Importer","Import"):t2("Continuer","Continue");
        ok.disabled=!summary.groups.length&&step!=="found";
        if(keepPlace)body.scrollTop=top;
      }
      function go(id){
        step=id;draw(false);body.scrollTop=0;
        var hh=P[step]._h;try{hh.focus({preventScroll:true});}catch(e){}
      }
      var acts=el("div","gfb-actions"),back=el("button","gfh-btn"),ok=el("button","gfh-btn is-primary");back.type="button";ok.type="submit";acts.append(back,ok);
      var body=el("div","gfb-body");body.append(P.found,P.check,P.months,P.confirm);
      var form=document.createElement("form");form.className="gfb-form";form.noValidate=true;form.append(head,prog,body,acts);d.append(form);draw();
      var done=false;function finish(v){if(done)return;done=true;d.close();resolve(v);}
      back.addEventListener("click",function(){var i=steps.indexOf(step);if(i>0)go(steps[i-1]);else finish(null);});
      x.addEventListener("click",function(){finish(null);});
      // Les raccourcis du tableur (Entrée, flèches) écoutent le document : ils ne doivent pas agir sous la fenêtre.
      d.addEventListener("keydown",function(e){e.stopPropagation();});
      form.addEventListener("submit",function(e){e.preventDefault();if(ok.disabled)return;var i=steps.indexOf(step);
        if(i<steps.length-1){go(steps[i+1]);return;}
        finish({mode:conflictMonths(summary).length?mode:"replace",summary:summary,extra:extra});});
      d.addEventListener("close",function(){if(!done){done=true;resolve(null);}d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      document.body.append(d);d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();
      try{P.found._h.focus({preventScroll:true});}catch(e){}
    });
  }
  function looksLikeMonthTable(text){
    // En-tête de mois : des cellules entières « Janvier », « févr. », « Mar 2026 »… (pas un libellé qui contient « mai »).
    var MON=/^(janv(ier)?|fevr?(ier)?|mars|avr(il)?|mai|juin|juil(let)?|aout|sept?(embre)?|oct(obre)?|nov(embre)?|dec(embre)?|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(tember)?|october|november|december)\.?( ?'?\d{2,4})?$/;
    return String(text).split(/\r?\n/).slice(0,15).some(function(line){
      var n=0,seen={};line.split(/[;,\t|]/).forEach(function(c){c=norm(c.replace(/"/g,"")).trim();if(MON.test(c)&&!seen[c]){seen[c]=1;n++;}});
      return n>=2;});
  }
  // Fichier qui n'est pas un relevé : on le dit, et on propose de l'importer comme un simple tableau.
  function notStatement(empty){
    return new Promise(function(resolve){
      var d=el("dialog","gfh-dialog gfb-dialog gfb-small");d.setAttribute("aria-labelledby","gfbNsTitle");
      var h=el("h2","",empty?t2("Le fichier est vide","The file is empty"):t2("Ce n’est pas un relevé bancaire","This isn’t a bank statement"));h.id="gfbNsTitle";h.tabIndex=-1;
      var p=el("p","gfb-lead",empty?t2("Il ne contient aucune ligne. Télécharge à nouveau le relevé depuis l’espace client de ta banque.","It has no rows. Download the statement again from your bank’s website."):t2("Meuniance n’y trouve pas de colonnes date, libellé et montant. Pour un relevé, télécharge le fichier CSV de ta banque (espace client › comptes › télécharger › CSV) ; le PDF n’est pas lu.","Meuniance can’t find date, description and amount columns. For a statement, download your bank’s CSV file (online banking › accounts › download › CSV); PDF isn’t supported."));
      var acts=el("div","gfb-actions"),close=el("button","gfh-btn"+(empty?" is-primary":""),t2("Fermer","Close"));close.type="button";acts.append(close);
      var asTable=null;if(!empty){asTable=el("button","gfh-btn",t2("L’importer comme tableau","Import it as a table"));asTable.type="button";acts.prepend(asTable);}
      var done=false;function finish(v){if(done)return;done=true;d.close();resolve(v);}
      close.addEventListener("click",function(){finish(true);});if(asTable)asTable.addEventListener("click",function(){finish(false);});
      d.addEventListener("close",function(){if(!done){done=true;resolve(true);}d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      d.append(h,p,acts);document.body.append(d);d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();try{h.focus({preventScroll:true});}catch(e){}
    });
  }
  function toast(text,ms){var t=document.getElementById("gfhToast");if(!t){t=el("div","gfh-toast");t.id="gfhToast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.append(t);}t.textContent=text;t.classList.add("is-on");clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove("is-on");},ms||3600);}

  /* Renvoie true si le fichier était un relevé bancaire (importé ou annulé), false sinon. */
  function handle(file){
    var name=String(file&&file.name||""),excel=/\.(xlsx|xls|xlsm|ods)$/i.test(name);
    if(!file||!(excel||/\.(csv|txt)$/i.test(name)))return Promise.resolve(false);
    // Un relevé fait quelques centaines de Ko : au-delà de 10 Mo, ce n'est pas un relevé (et l'onglet gèlerait).
    if(file.size>10*1024*1024){if(excel)return Promise.resolve(false);toast(t2("Ce fichier est trop lourd pour un relevé bancaire (10 Mo au plus).","This file is too large for a bank statement (10 MB max)."));return Promise.resolve(true);}
    return file.arrayBuffer().then(function(buf){
      var ops=null,text="";
      if(excel){
        // Relevé en Excel (Crédit Agricole, LCL…) : la première feuille est lue comme un CSV ; sinon import Excel classique.
        try{if(!window.XLSX)return false;var wb=window.XLSX.read(new Uint8Array(buf),{type:"array",cellDates:false,dateNF:"dd/mm/yyyy",sheetRows:20000});var ws=wb.Sheets[wb.SheetNames[0]];
          text=window.XLSX.utils.sheet_to_csv(ws,{FS:";",blankrows:false,rawNumbers:false});}catch(e){return false;}
        ops=parse(text);if(!ops||looksLikeMonthTable(text))return false;
      }else{
        text=decode(buf);
        if(!text.replace(/[\s;,]/g,""))return notStatement(true);
        ops=parse(text);
        // Tableau de budget (« Ligne ; Janvier ; Février… ») : c'est un tableau, pas un relevé, on l'importe comme tel.
        if(!ops&&looksLikeMonthTable(text))return false;
        if(!ops)return notStatement(false);
      }
      var summary=summarize(ops);if(!summary.groups.length)return excel?false:notStatement(false);
      return preview(ops,name).then(function(res){
        if(!res)return true;
        // Les choix faits dans l'aperçu sont retenus pour les prochains imports.
        if(Object.keys(res.extra).length)saveLearned(res.extra);
        var summary=res.summary;
        if(write(summary,res.mode)){
          var subs=0;try{subs=window.GFSubs?window.GFSubs.ingest(ops):0;}catch(e){}
          var first=summary.months[0],last=summary.months[summary.months.length-1],years={};summary.months.forEach(function(m){years[m.y]=1;});
          var when=first===last?monthLabel(first):t2("de ","from ")+monthLabel(first)+t2(" à "," to ")+monthLabel(last);
          var msg=summary.count&&!summary.fresh?(res.mode==="add"?t2("Rien de nouveau : ces "+summary.count+" opérations étaient déjà importées.","Nothing new: these "+summary.count+" transactions were already imported."):t2("Déjà à jour : ce relevé avait déjà été importé.","Already up to date: this statement was already imported."))
            :t2("Relevé importé : ","Statement imported: ")+summary.count+t2(" opérations, "," transactions, ")+when+t2(", dans la feuille ",", in the ")+Object.keys(years).join(", ")+t2("."," sheet.")+(summary.dup?t2(" "+summary.dup+" déjà importée"+(summary.dup>1?"s":"")+", pas comptée"+(summary.dup>1?"s":"")+" deux fois."," "+summary.dup+" already imported, not counted twice."):"");
          toast(msg+(subs?t2(" "+subs+" abonnement"+(subs>1?"s":"")+" repéré"+(subs>1?"s":"")+" : retrouve-les sur l’accueil."," "+subs+" subscription"+(subs>1?"s":"")+" found: see them on Home."):""),7000);
          if(window.setPage)window.setPage("sheet");
        }
        return true;
      });
    });
  }

  window.GFBankImport={transferLabel:transferLabel,renameRow:renameRow,handle:handle,parse:parse,summarize:summarize,write:write,existingRow:existingRow,categorize:categorize,merchantOf:merchantOf,learned:learned,saveLearned:saveLearned,_decode:decode,_monthTable:looksLikeMonthTable,_amount:parseAmount};
})();
