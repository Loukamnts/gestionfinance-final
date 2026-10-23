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
  // Typographie française : espace insécable avant : ; ! ? et dans les guillemets « ».
  function nb(s){return String(s).replace(/ ([:;!?»])/g,"\u00a0$1").replace(/« /g,"«\u00a0");}
  function t2(fr,e){return en()?e:nb(fr);}
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
  // Nom de mois (français, anglais, abrégé ou non) → 1..12, sinon 0.
  var MON_NAMES=["janvier january jan janv","fevrier february feb fev fevr","mars march mar","avril april apr avr","mai may","juin june jun","juillet july jul juil","aout august aug aou","septembre september sep sept","octobre october oct","novembre november nov","decembre december dec"].map(function(x){return " "+x+" ";});
  function monthIndex(w){w=norm(w).replace(/[^a-z]/g,"");if(w.length<3)return 0;for(var i=0;i<12;i++)if(MON_NAMES[i].indexOf(" "+w+" ")>=0)return i+1;return 0;}
  // Ordre des dates du fichier : jour/mois (France) sauf si le fichier montre clairement mois/jour (« 09/25/2026 »).
  var MONTH_FIRST=false;
  function parseDate(v){
    var s=String(v||"").trim(),m;
    if((m=s.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(:\d{2})?.*)?$/)))return mk(+m[1],+m[2],+m[3]);
    // 20260902 (ING, certaines banques belges et allemandes)
    if((m=s.match(/^(\d{4})(\d{2})(\d{2})(?:[ T]\d{1,2}:?\d{2}.*)?$/)))return mk(+m[1],+m[2],+m[3]);
    // « 02 Sep 2026 », « 2 sept. 2026 », « 2-Sep-26 », « Sep 2, 2026 », « September 2 2026 »
    if((m=s.match(/^(\d{1,2})(?:st|nd|rd|th)?[ \-.\/]+([^\W\d_]{3,12})\.?[ \-.,\/]+(\d{2,4})(?:[ T,]+\d{1,2}:\d{2}.*)?$/))){var mo1=monthIndex(m[2]);if(mo1)return mk(m[3].length===2?2000+Number(m[3]):+m[3],mo1,+m[1]);}
    if((m=s.match(/^([^\W\d_]{3,12})\.?[ \-.]+(\d{1,2})(?:st|nd|rd|th)?,?[ \-.]+(\d{4})(?:[ T,]+\d{1,2}:\d{2}.*)?$/))){var mo2=monthIndex(m[1]);if(mo2)return mk(+m[3],mo2,+m[2]);}
    if((m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T]\d{1,2}:\d{2}(:\d{2})?.*)?$/))){var y=m[3].length===2?2000+Number(m[3]):+m[3];return MONTH_FIRST?mk(y,+m[1],+m[2]):mk(y,+m[2],+m[1]);}
    return null;
    function mk(y,mo,d){return y>1990&&y<2100&&mo>=1&&mo<=12&&d>=1&&d<=31?{y:y,m:mo-1,d:d}:null;}
  }

  /* ── Repérage des colonnes ─────────────────────────────────────────── */
  var H={
    date:/^(date( de l.?)?( ?operation| ?op)?|date operation|date comptable|date de comptabilisation|dateop|date op\.?|booking date|transaction date|date|datum|buchung|buchungstag|buchungsdatum|data mov\.?|data movimento|data lancamento|fecha movimiento|boekingsdatum|fecha|fecha operacion|fecha contable|data|data operazione|data contabile|data registrazione|posting date)$/,
    value:/date de valeur|dateval|value date|data valor|valuta|wertstellung|fecha valor|data valuta|valutadatum/,
    label:/libelle|description|detail|operation|nature|intitule|label|motif|beneficiaire|tiers|payee/,
    amount:/^montant|amount|somme|^(eur|usd|gbp|chf|cad|aud|sek|nok|dkk|pln)$|^value$|betrag|bedrag|importe|importo|^brut$|^gross$|^net$/,
    debit:/debit|paid out|money out|^sortie|^ausgang|^soll$|^debet|^cargo|^addebito|^uscite/,
    credit:/credit|paid in|money in|^entree|^eingang|^haben$|^abono|^accredito|^entrate/
  };
  function labelScore(c){
    if(!c||/date|datum|fecha|montant|amount|betrag|importe|importo|debit|credit|categor|kategorie|numero|^n( |$)|^no$|solde|balance|devise|currency|^type|pointage|statut|state|status|compte|account|iban|bic|exchange|fee|frais/.test(c))return 0;
    if(/libelle|intitule/.test(c))return 3;
    if(/description|label|payee|beneficiaire|counter ?party|contrepartie|tiers|merchant|commercant|^nom$|^name$|texte|buchungstext|^text$|notification|avis|empfanger|zahlungsempfanger|auftraggeber|naam|beneficiario|denominazione|descricao/.test(c))return 2;
    if(/detail|motif|reference|nature|operation|communication|transaction|transaktion|mitteilung|movimiento|operazione|verwendungszweck|omschrijving|mededeling|concepto|descripcion|descrizione|causale/.test(c))return 1;
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
        if(H.amount.test(c)&&!/date|orig|devise|foreign|fremd|extranjer|estero|currency|solde|balance|saldo|total fee|fee/.test(c)&&(cols.amount==null||(exact.test(c)&&!exact.test(cols.amountName)))){cols.amount=j;cols.amountName=c;}
        // « Débit/Crédit » ou « Sens » : colonne qui donne le signe, pas deux colonnes de montants
        if((H.debit.test(c)&&H.credit.test(c))||/^(sens|d ?c|af ?bij|soll ?haben|s ?h|debet ?credit|debit ?credit|dare ?avere)$/.test(c)){if(cols.sense==null)cols.sense=j;}
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
        if(cand.length){cols.label=cand[0][0];cols.alts=cand.slice(1).map(function(x){return x[0];});cols.extra=cand.slice(1).filter(function(x){return /detail|motif|reference|description|libelle|communication|transaction|texte|verwendungszweck|omschrijving|mededeling|concepto|descripcion|descrizione|causale/.test(x[2]);}).map(function(x){return x[0];});}
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
      if(c.sense!=null){var sv=norm(r[c.sense]).trim();if(/^(d|db|deb|debit|debet|-|af|s|soll|dr|out)$/.test(sv))amt=-Math.abs(amt);else if(/^(c|cr|cred|credit|\+|bij|h|haben|in)$/.test(sv))amt=Math.abs(amt);}
      var osrc=c.account!=null&&String(r[c.account]||"").trim()?hash(String(r[c.account]).trim()):"";
      if(c.state!=null&&NOT_DONE.test(norm(r[c.state]))){dropped.push({date:d,amount:Math.round(amt*100)/100,label:String(c.label!=null?r[c.label]:"").replace(/\s+/g," ").trim(),src:osrc,why:"pending"});continue;}
      var label=c.label!=null?(String(r[c.label]||"").trim()?r[c.label]:((c.alts||[]).map(function(j){return r[j];}).filter(function(x){return String(x||"").trim();})[0]||"")):r.filter(function(x,j){return j!==c.date&&j!==c.amount&&j!==c.debit&&j!==c.credit&&j!==c.state;}).join(" ");
      label=String(label||"").replace(/\s+/g," ").trim();
      var detail=(c.extra||[]).map(function(j){return String(r[j]||"").replace(/\s+/g," ").trim();}).filter(function(x){return x&&norm(label).indexOf(norm(x))<0;}).join(" ");
      if(!label&&detail){label=detail;detail="";}
      // Ligne de solde (« NOUVEAU SOLDE », ligne sans libellé en fin de relevé) : ce n'est pas une opération
      if(!label||/^(ancien |nouveau )?solde( (crediteur|debiteur|au|du|le|final|initial|comptable|disponible|en date du|en|eur|euros?))*[\s\d\/.,:-]*(eur)?$/.test(norm(label).replace(/€/g,"eur").trim()))continue;
      if(/\b(carte|cb)\b/.test(norm(label))&&!isDeferred(label))cards++;
      var op={date:d,amount:Math.round(amt*100)/100,label:label,src:osrc};if(detail)op.detail=detail;ops.push(op);
    }
    // Si le fichier détaille les paiements par carte, la ligne de total du débit différé ferait compter deux fois.
    if(cards>=3)ops=ops.filter(function(op){var drop=op.amount<0&&isDeferred(op.label);if(drop){op.why="deferred";dropped.push(op);}return !drop;});
    if(ops.length<(found.header>=0?1:2))return null;
    ops.dropped=dropped;// pour retirer du registre ce qui avait été compté lors d'un import précédent
    return ops;
  }

  /* ── Catégories ────────────────────────────────────────────────────── */
  // [libellé de ligne FR, EN, type, motifs]. L'ordre compte : le premier motif trouvé l'emporte.
  var CATS=[
    ["Épargne","Savings","Épargne",/livret|ldds|lep\b|\bpel\b|\bcel\b|epargne|assurance vie|\bpea\b|versement programme|savings plan|plan d.?epargne|sparplan|virement vers.*(livret|epargne)/],
    ["Salaire","Salary","Salaire",/salaire|salary|salario|nomina|stipendio|gehalt|\blohn\b|salaris|\bloon\b|\bwages?\b|retraite|pension(?! alimentaire)|carsat|\bcnav\b|agirc|arrco|paie\b|\bpaye\b|remuneration|payroll|traitement mensuel/],
    ["Aides (CAF)","Benefits (CAF)","Salaire",/\bcaf\b|\bcnaf\b|\bmsa\b|chomage|\bapl\b|allocation|pole emploi|france travail|\brsa\b|prime d.activite/],
    ["Crédits","Loans","Dépense",/echeance (de |du )?pret|\bpret (immo|perso|auto|etudiant)|credit (immo|conso|auto)|remboursement (de |du )?pret|cofidis|cetelem|sofinco|franfinance|younited|\boney\b|\bfloa\b|\bdiac\b|carrefour banque|\bpret\b(?! a porter)/],
    ["Loyer","Rent","Dépense",/loyer|miete|alquiler|affitto|foncia|nexity|bailleur|^(?!.*\b(carte|cb)\b).*habitat\b|action logement|immobiliere|\bopac\b|\bhlm\b/],
    // Carburant à part : « SNCF » ou « Uber » ne doivent jamais finir dans une ligne « Essence ».
    ["Carburant","Fuel","Dépense",/totalenergies station|total access|\besso\b|\bshell\b|\b(carte|cb)\b.*\b(bp|total ?energies)\b|\bavia\b|\bstation\b(?! f\b)|station.?service|carburant|essence|gazole|gasoil|\bsp ?9[58]\b|intermarche carbu|leclerc carbu|carrefour carbu|auchan carbu|super u carbu|dyneff|\beni\b|\bagip\b/],
    ["Courses","Groceries","Dépense",/carrefour|continente|pingo doce|minipreco|supermercad|supermarket|supermarkt|supermarche|tesco|sainsbury|asda\b|morrisons|waitrose|walmart|costco|rewe|edeka|kaufland|\bpenny\b|delhaize|colruyt|albert heijn|jumbo|mercadona|\bcoop\b|migros|\bmonop\b|leclerc|auchan|lidl|intermarche|super u|hyper u|\bu express|monoprix|franprix|\bcasino\b(?!.*(jeux|barriere|partouche|poker|\bbet\b|betclic|winamax))|\baldi\b|\bpicard\b|biocoop|netto|grand frais|naturalia|\bspar\b|\bmatch\b(?! (point|foot|de))|\bcora\b|g20|coccinelle|marche\b(?! (public|financier))/],
    ["Restaurants","Restaurants","Dépense",/restaurant|\bresto\b(?!s? du coeur)|mcdo|mc donald|mcdonald|burger king|\bkfc\b|uber\W*eats|deliveroo|just ?eat|starbucks|boulangerie|brasserie|sushi|pizza|kebab|cafe\b|bistro|o.?tacos|subway|five guys|\b(carte|cb)\b.*\bpaul\b/],
    ["Transports","Transport","Dépense",/sncf|\bg7\b|heetch|free ?now|\bratp\b|navigo|\buber\b|bolt|blablacar|\bstationnement\b|paybyphone|peage|autoroute|vinci|sanef|\baprr\b|parking|indigo|tisseo|\btcl\b|\brtm\b|keolis|transdev|\blime\b|velib|trainline|ouigo|tgv/],
    ["Abonnements","Subscriptions","Dépense",/abonnement(?!.*(edf|engie|gaz|electricite|\beau\b|energie))|\bovh\b|subscription|netflix|spotify|deezer|disney ?(\+|plus)|disneyplus|primevideo|canal\+?|amazon prime|prime video|apple\.com|icloud|google (one|storage|play)|youtube|free mobile|free telecom|freebox|\borange\b(?! ?(boutique|store|shop|magasin))|\bsosh\b|\bsfr\b|bouygues|b ?& ?you|red by|basic.?fit|fitness park|keep cool|crunch|audible|chatgpt|openai/],
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
  var OTHER_OUT=["Autres dépenses","Other expenses","Dépense"],OTHER_IN=["Autres revenus","Other income","Salaire"];
  // Virement entre tes propres comptes vers un livret / de l'épargne (PEL, LDDS, assurance-vie…) : il compte comme de l'épargne
  // (argent qui sort du compte courant = épargne qui monte). Un virement vers un compte courant ou joint n'est PAS de l'épargne : ignoré.
  var INTERNAL_SAV=["Épargne","Savings","Épargne",null,"internal"];
  var OWN_CURRENT=/(vir(ement)?|transfert( interne)?) (de|vers|depuis) (mon |ma |mes |l )?(autre )?compte (joint|courant|personnel|principal)|(vers|de|depuis) (mon |le )?compte (joint|courant|personnel|principal)\b|^(to|from) [a-z]{3} (current|checking|joint)|transfer (to|from) (my )?(joint|current|checking)/;
  var INTERNAL=/virement interne|vir(ement)? (de|vers) (mon|ma|mes) (livret|epargne|ldds|pel|assurance vie)\b|vir(ement)? (de|vers) compte epargne\b|\bcompte a compte\b|transfert interne|^(to|from) [a-z]{3} savings|(vers|de) (mon )?(autre )?compte epargne|own account transfer|transfer (to|from) (my )?(own|savings)/;
  // Simple mouvement de portefeuille (recharge, change) : ni dépense, ni revenu, ni épargne. Ignoré.
  var WALLET=/^top ?-?up\b|top ?-?up by|general card deposit|exchanged to|converted \d|^(to|from) [a-z]{3} (main|pocket)|recharge (depuis|par) (carte|cb)|virement bancaire sur le compte paypal|bank deposit to pp/;
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
  // Décision pour une opération : { c: catégorie } ou { ig: raison } quand elle est ignorée (« rule » : ton choix, « wallet » : recharge).
  function classify(op,rules){
    var m=merchantOf(op.label),r=rules&&m&&Object.prototype.hasOwnProperty.call(rules,m)?rules[m]:null;
    if(r){if(r[1]==="Ignorer")return{ig:"rule"};return{c:[r[0],r[0],r[1]],rule:true};}
    // « Caisse d'Épargne » est le nom d'une banque : son prêt ou ses frais ne sont pas de l'épargne.
    var l=norm(op.label+(op.detail?" "+op.detail:"")).replace(/caisse d.?epargne/g,"caisse banque");
    if(WALLET.test(l)&&!CATS[0][3].test(l))return{ig:"wallet"};
    if(OWN_CURRENT.test(l))return{ig:"wallet"};// compte courant / joint : un simple mouvement, pas de l'épargne
    if(INTERNAL.test(l))return{c:INTERNAL_SAV};
    // Un virement à une personne (« VIR SEPA M PICARD ») n'est pas un achat en magasin : seules les catégories
    // qui se paient par virement (loyer, épargne, salaire, aides, impôts, assurances, santé, énergie) restent possibles.
    var isTransfer=transferLabel(l);
    for(var i=0;i<CATS.length;i++){var c=CATS[i];if(c[3].test(l)){
      if(isTransfer&&!/^(Épargne|Salaire|Aides \(CAF\)|Crédits|Loyer|Impôts|Assurances|Santé|Énergie et eau|Abonnements)$/.test(c[0]))continue;
      if(op.amount>0&&c[2]==="Dépense")return{c:c}; // remboursement : vient en déduction de la catégorie
      if(op.amount>0&&c[2]==="Épargne")return{c:c}; // retrait d'épargne : diminue l'épargne du mois
      if(op.amount<0&&c[2]==="Salaire")continue; // un prélèvement « retraite » n'est pas un revenu : on cherche plus loin
      return{c:c};}}
    return{c:op.amount>0?OTHER_IN:OTHER_OUT};
  }
  function categorize(op,rules){var x=classify(op,rules);return x.ig?null:x.c;}
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
  /* Résumé d'un fichier : totaux par ligne et par mois, plus le détail opération par opération (rows) pour l'aperçu.
     extra : choix par marchand ; opt.ovr : choix pour une seule opération ; opt.inc : opérations déjà importées qu'on veut recompter. */
  function summarize(ops,extra,opt){
    opt=opt||{};var ovr=opt.ovr||{},inc=opt.inc||{};
    var groups={},months={},ignored=0,rules=learned(),rowsBy={},items=[],seenFp={},all=[],rows=[],unk={},led=ledger().m,drop=ops.dropped||[];
    var nWallet=0,nRule=0,nDup=0,nNew=0,nPending=0,nDeferred=0,bm={},from=null,to=null;
    var rowsOf=function(y){return rowsBy[y]||(rowsBy[y]=sheetRows(y));};
    Object.keys(extra||{}).forEach(function(k){rules[k]=extra[k];});
    // Empreinte de chaque opération du fichier, même ignorée : une opération désormais ignorée sort du registre.
    ops.concat(drop).forEach(function(op,i){
      var fp=fingerprint(op),n=seenFp[fp]=(seenFp[fp]||0)+1,mk0=op.date.y+"-"+op.date.m,real=i<ops.length;
      op._base=fp+"#"+n;var inLed=real&&!!(led[mk0]&&led[mk0][op._base]);
      op._dup=inLed&&!inc[op._base];op._fp=inLed&&inc[op._base]?op._base+"~":op._base;
      all.push({fp:op._fp,mk:mk0});
    });
    drop.forEach(function(op){if(op.why==="deferred")nDeferred++;else nPending++;});
    ops.forEach(function(op){
      var o=ovr[op._base],x=o?(o[1]==="Ignorer"?{ig:"rule"}:{c:[o[0],o[0],o[1]],rule:true}):classify(op,rules),c=x.c;
      var dkey=op.date.y*10000+op.date.m*100+op.date.d;if(from==null||dkey<from)from=dkey;if(to==null||dkey>to)to=dkey;
      var row={i:rows.length,fp:op._base,date:op.date,dkey:dkey,label:op.label,amount:op.amount,mkey:merchantOf(op.label),status:"ok",forced:op._fp!==op._base};rows.push(row);
      if(!c){ignored++;if(x.ig==="wallet")nWallet++;else nRule++;row.status="ignored";row.ig=x.ig;return;}
      var rws=rowsOf(op.date.y),mo=row.mkey,own=!x.rule&&c[2]==="Dépense"&&op.amount<0?merchantRow(mo,rws):null;
      if(!own&&c[2]==="Épargne")own=savingsRow(op,rws);
      var isOther=!own&&(c===OTHER_OUT||c===OTHER_IN),name=own||existingRow(en()?c[1]:c[0],rws,op.date.y)||existingRow(en()?c[0]:c[1],rws,op.date.y)||(en()?c[1]:c[0]),kind=c[2];
      // Dépenses et épargne comptées en positif ; un remboursement vient en déduction
      var v=kind==="Salaire"?op.amount:-op.amount,mk=op.date.y+"-"+op.date.m;
      row.name=name;row.kind=kind;row.v=v;row.mk=mk;row.internal=c===INTERNAL_SAV;row.rule=!!x.rule;
      items.push({fp:op._fp,mk:mk,name:name,cat:en()?c[1]:c[0],kind:kind,v:v,dup:op._dup});
      if(op._dup){nDup++;row.status="dup";return;}
      nNew++;
      var g=groups[name]||(groups[name]={name:name,kind:kind,count:0,total:0,byMonth:{},merchants:{}});if(isOther)g.other=true;
      g.count++;g.total+=v;g.byMonth[mk]=(g.byMonth[mk]||0)+v;months[mk]=op.date;
      var b=bm[mk]||(bm[mk]={"Salaire":0,"Dépense":0,"Épargne":0});b[kind]+=v;
      var mid=mo||norm(op.label).slice(0,24),mm=g.merchants[mid]||(g.merchants[mid]={key:mid,label:op.label,count:0,total:0});mm.count++;mm.total+=v;
      // Opération que Meuniance n'a pas su classer : à demander une par une (regroupées par marchand)
      if(isOther){row.unk=true;var gid=mo||"~"+norm(op.label).replace(/\s+/g," ").slice(0,30),u=unk[gid]||(unk[gid]={gid:gid,key:mo,label:op.label,count:0,total:0,fps:[],last:dkey});u.count++;u.total+=op.amount;u.fps.push(op._base);if(dkey>u.last)u.last=dkey;}
    });
    // Opérations en attente, refusées, annulées (ou total de carte différé) : jamais importées, mais visibles dans la liste
    drop.forEach(function(op){var dkey=op.date.y*10000+op.date.m*100+op.date.d;rows.push({i:rows.length,fp:op._base,date:op.date,dkey:dkey,label:op.label,amount:op.amount,mkey:"",status:"dropped",ig:op.why==="deferred"?"deferred":"pending"});});
    var list=Object.keys(groups).map(function(k){return groups[k];}).filter(function(g){return Math.abs(g.total)>=0.005;});
    var order={"Salaire":0,"Dépense":1,"Épargne":2};list.sort(function(a,b){return order[a.kind]-order[b.kind]||Math.abs(b.total)-Math.abs(a.total);});
    var mlist=Object.keys(months).map(function(k){return months[k];}).sort(function(a,b){return a.y-b.y||a.m-b.m;});
    var unknown=Object.keys(unk).map(function(k){return unk[k];}).sort(function(a,b){return Math.abs(b.total)-Math.abs(a.total);});
    var dk=function(k){return k==null?null:{y:Math.floor(k/10000),m:Math.floor(k/100)%100,d:k%100};};
    return{groups:list,months:mlist,count:ops.length-ignored,newCount:nNew,dupCount:nDup,ignored:ignored,items:items,all:all,rows:rows,unknown:unknown,
      wallet:nWallet,byRule:nRule,pending:nPending,deferred:nDeferred,monthKinds:bm,from:dk(from),to:dk(to)};
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
     sans perdre ni compter deux fois. Le libellé lui-même n'est pas gardé. 24 mois au moins, jusqu à 10 ans tant que le registre reste léger. */
  var LEDGER_KEY="personalFinanceDashboard.importLedger";
  function hash(t){var h=5381;for(var i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function fingerprint(op){return op.date.y+"-"+op.date.m+"-"+op.date.d+"|"+op.amount+"|"+hash(norm(op.label).replace(/\s+/g," ").trim())+(op.src?"|"+op.src:"");}
  function ledger(){try{var v=JSON.parse(window.safeStore&&window.safeStore.getItem(LEDGER_KEY)||"{}");return v&&v.m&&typeof v.m==="object"?v:{v:1,m:{}};}catch(e){return{v:1,m:{}};}}
  function saveLedger(L){
    // Les plus anciens mois sortent d'abord : 24 mois au moins, jusqu'à 10 ans tant que le registre reste léger (12 000 opérations).
    var ks=Object.keys(L.m).sort(function(a,b){var x=a.split("-"),y=b.split("-");return (x[0]*12+ +x[1])-(y[0]*12+ +y[1]);}),tot=0;
    ks.forEach(function(k){tot+=Object.keys(L.m[k]).length;});
    while(ks.length>24&&(ks.length>120||tot>12000)){var k=ks.shift();tot-=Object.keys(L.m[k]).length;delete L.m[k];}
    try{window.safeStore.setItem(LEDGER_KEY,JSON.stringify(L));}catch(e){}}
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
  function monthTitle(d){var s=monthLabel(d);return s.charAt(0).toUpperCase()+s.slice(1);}
  var NB=" ";
  function q(s){return t2("«"+NB+s+NB+"»","“"+s+"”");}
  function plural(n,fr1,frN,en1,enN){return n+NB+(n>1?t2(frN,enN):t2(fr1,en1));}
  function sgn(v){return (v<0?"−":"+")+eur(Math.abs(v));}
  // Montant d'une ligne selon son type : toujours le montant « naturel » (un loyer de 735 € s'écrit 735 €) ; « − » seulement pour un remboursement net.
  function signed(kind,v){return (v<0?"−":"")+eur(Math.abs(v));}
  function weekday(d){try{return new Date(d.y,d.m,d.d).toLocaleDateString(en()?"en-GB":"fr-FR",{weekday:"short"}).replace(/\.$/,"");}catch(e){return "";}}
  // Lignes proposées pour classer un marchand : catégories connues, lignes déjà dans ton tableur, « autres ».
  function targets(){
    var out=[],seen={};function add(name,kind,group){var k=key(name);if(!name||seen[k])return;seen[k]=1;out.push({name:name,kind:kind,group:group});}
    try{var snap=window.FinanceSheet&&window.FinanceSheet.getSnapshot&&window.FinanceSheet.getSnapshot();(snap&&snap.sheets||[]).slice().reverse().forEach(function(sh){(sh.rowHeaders||[]).forEach(function(h){h=String(h||"").trim();if(h&&!structural(h))add(h,kindOf(h),"sheet");});});}catch(e){}
    // Une catégorie déjà présente dans le tableur sous un autre nom (« Alimentation » pour Courses) n'est proposée qu'une fois.
    var rowsNow=sheetRows();CATS.forEach(function(c){if(existingRow(c[0],rowsNow)||existingRow(c[1],rowsNow))return;add(en()?c[1]:c[0],c[2],"cat");});
    add(en()?OTHER_OUT[1]:OTHER_OUT[0],"Dépense","other");add(en()?OTHER_IN[1]:OTHER_IN[0],"Salaire","other");
    return out;
  }
  // Libellé lisible d'une opération : le marchand sans le bruit bancaire, sinon le libellé tel quel.
  var ACR=/^(sncf|edf|caf|ratp|lcl|bnp|cic|ldds|pel|pea|hlm|tva|urssaf|cpam|axa|ovh|sfr|rsa|apl|cnav|cfe|sepa|atm|gab|dab|sas|sarl|cb|uk|usa|bp|ing|n26|ps)$/i,SMALL=/^(de|du|des|la|le|les|et|en|au|aux|sur|chez|d|l|by|of|the|and)$/i;
  function smartCase(s){
    if(/[a-zà-ÿ]/.test(s))return s;// déjà en minuscules et majuscules : on ne touche pas
    var i=0;return s.toLowerCase().replace(/[^\s\-\/'’*&.]+/g,function(w){var up=ACR.test(w);var out=up?w.toUpperCase():(i>0&&SMALL.test(w)?w:w.charAt(0).toUpperCase()+w.slice(1));i++;return out;});
  }
  var LEAD=/^(?:paiement par carte|paiement carte|paiement cb|achat cb|achat carte|carte bancaire|pr[ée]l[èe]vement sepa|prlv sepa|virement sepa(?: inst)?|vir sepa(?: inst)?|vir inst|virement|paiement|achat|carte|cb|prlv|pr[ée]l[èe]vement|pr[ée]lev|vir|sepa|retrait dab|retrait|dab|gab)\b[\s:.\-]*|^(?:\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?|x{2,}\d*|x\d{3,}|\*+\d+)(?=[\s:.\-]|$)[\s:.\-]*/i;
  // Libellé lisible d'une opération : sans le bruit bancaire du début (« CARTE 01/09 », « PRLV SEPA »), en minuscules/majuscules propres.
  function cleanLabel(r){
    var raw=String(r.label||"").replace(/\s+/g," ").trim();
    if(r.internal||r.ig==="wallet")return smartCase(raw);
    var t=raw,prev;do{prev=t;t=t.replace(LEAD,"");}while(t!==prev&&t);
    t=t.trim();return smartCase(t.length>1?t:raw);
  }
  function sheetOf(snap,y){return (snap.sheets||[]).filter(function(x){return String(x.name).trim()===String(y);})[0];}
  // Mois de l'import qui ont déjà des montants dans les lignes visées, avec les montants concernés.
  function conflictDetails(summary){
    var out=[],seen={};
    try{var FS=window.FinanceSheet,snap=FS.getSnapshot(),vals={};
      summary.groups.forEach(function(g){Object.keys(g.byMonth).forEach(function(mk){var p=mk.split("-"),sh=sheetOf(snap,p[0]);if(!sh)return;
        var r=(sh.rowHeaders||[]).findIndex(function(h){return key(h)===key(g.name);});if(r<0)return;var c=sh.cells&&sh.cells[r+","+p[1]];
        if(!c||String(c.raw||"").trim()==="")return;
        var e=seen[mk]||(seen[mk]={d:summary.months.filter(function(d){return d.y+"-"+d.m===mk;})[0]||{y:+p[0],m:+p[1]},rows:[]});
        var v=vals[sh.name]||(vals[sh.name]=FS.recompute?FS.recompute(sh.cells):{}),cur=v&&v[r+","+p[1]]&&typeof v[r+","+p[1]].value==="number"?v[r+","+p[1]].value:Number(String(c.raw).replace(",","."));
        e.rows.push({name:g.name,kind:g.kind,sheet:isFinite(cur)?cur:null,sign:signFor(snap,g.kind),stmt:g.byMonth[mk],raw:c.raw});});});
    }catch(e){}
    out=Object.keys(seen).map(function(k){return seen[k];});
    return out.sort(function(a,b){return a.d.y-b.d.y||a.d.m-b.d.m;});
  }
  function conflictMonths(summary){return conflictDetails(summary).map(function(e){return e.d;});}

  var PAGE=50;
  /* Assistant en étapes, une décision par écran. Rien n'est écrit dans le tableur avant « Importer » :
     1. relevé reconnu · 2. toutes les opérations · 3. à classer (une par une) · 4. mois déjà remplis · 5. résumé. */
  function preview(ops,fileName){
    return new Promise(function(resolve){
      var extra={},ovr={},inc={},ans={},mode=null,step="found",steps=[],conf=[],summary=null,rowMap={},T=targets(),rowsNow=sheetRows(),flashUndo=null;
      var dirty=true,query="",unkSnap=null,unkIdx=0,confOpen={};
      var KINDS=[["Salaire",t2("Revenus","Income")],["Dépense",t2("Dépenses","Expenses")],["Épargne",t2("Épargne","Savings")]],titles={};KINDS.forEach(function(k){titles[k[0]]=k[1];});
      var isNew=function(name){return !rowsNow.some(function(r){return key(r)===key(name);});};
      var ICON_OK='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      var d=el("dialog","gfh-dialog gfb-dialog gfb-wiz");d.setAttribute("aria-labelledby","gfbTitle");
      var head=el("div","gfb-head"),h=el("h2","",t2("Relevé bancaire","Bank statement"));h.id="gfbTitle";h.tabIndex=-1;
      var x=el("button","gfb-x");x.type="button";x.setAttribute("aria-label",t2("Fermer","Close"));x.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      head.append(h,x);
      var prog=el("div","gfb-progress"),stepTxt=el("p","gfb-step-txt"),bar=el("div","gfb-bar");stepTxt.setAttribute("aria-live","polite");bar.setAttribute("aria-hidden","true");prog.append(stepTxt,bar);

      var HEADS={found:t2("Voici ce que j’ai trouvé","Here’s what I found"),list:t2("Tes opérations","Your transactions"),unknown:t2("À classer","To sort"),months:t2("Mois déjà remplis","Months already filled"),confirm:t2("Résumé avant import","Summary before import")};
      var ORDER=["found","list","unknown","months","confirm"],P={};
      ORDER.forEach(function(id){var s=el("section","gfb-pane"),hh=el("h3","gfb-step-h",HEADS[id]);hh.tabIndex=-1;hh.id="gfbStep-"+id;s.setAttribute("aria-labelledby",hh.id);s.dataset.step=id;s.hidden=true;s.append(hh);s._h=hh;P[id]=s;});
      var badge=el("span","gfb-badge");badge.innerHTML=ICON_OK;P.found._h.prepend(badge);

      /* 1. Relevé reconnu */
      var fLead=el("p","gfb-lead"),fStats=el("div","gfb-stat3"),fList=el("ul","gfb-facts2");
      P.found.append(fLead,fStats,fList);

      /* 2. Tes opérations : deux blocs, ce qui sera importé puis ce qui ne le sera pas */
      var lLead=el("p","gfb-lead"),flash=el("p","gfb-flash"),tools=el("div","gfb-tools"),lEmpty=el("p","gfb-note gfb-empty");
      flash.setAttribute("role","status");flash.hidden=true;
      var sLab=el("label","gfb-search"),sIn=document.createElement("input");sIn.type="search";sIn.autocomplete="off";sIn.setAttribute("enterkeyhint","search");sIn.placeholder=t2("Chercher une opération","Search a transaction");sIn.setAttribute("aria-label",t2("Chercher une opération","Search a transaction"));sLab.append(sIn);
      tools.append(sLab);
      var blkIn=makeBlock(t2("Sera importé","Will be imported")),blkOut=makeBlock(t2("Ne sera pas importé","Will not be imported"));
      P.list.append(lLead,flash,tools,lEmpty,blkIn.box,blkOut.box);
      var st=null;sIn.addEventListener("input",function(){clearTimeout(st);st=setTimeout(function(){query=sIn.value;blkIn.shown=blkOut.shown=PAGE;paintList();},140);});

      /* 3. À classer */
      var uBody=el("div","gfb-unk");P.unknown.append(uBody);

      /* 4. Mois déjà remplis */
      var mLead=el("p","gfb-lead"),mList=el("div","gfb-conf"),modeBox=el("fieldset","gfb-mode"),legend=el("legend","",t2("Que faire de ces mois ?","What should happen to these months?")),mNeed=el("p","gfb-note gfb-need",t2("Choisis une option pour continuer.","Choose an option to continue."));modeBox.append(legend);
      var radios=[];
      [["add",t2("Ajouter seulement le nouveau","Add only what’s new"),t2("Tes chiffres actuels restent. Meuniance y ajoute seulement les opérations de ce relevé qu’il n’avait encore jamais importées.","Your current figures stay. Meuniance only adds the transactions from this statement it never imported before.")],
       ["replace",t2("Remplacer le mois","Replace the month"),t2("Ces lignes sont recalculées avec toutes les opérations déjà importées pour le mois, plus celles de ce relevé. Ce que tu avais tapé à la main dans ces lignes est effacé.","These rows are recalculated from every transaction already imported for the month, plus this statement’s. Anything you typed by hand in these rows is erased.")]].forEach(function(o){
        var lab=el("label","gfb-opt"),r=document.createElement("input"),txt=el("span","gfb-opt-txt");r.type="radio";r.name="gfbMode";r.value=o[0];radios.push(r);
        r.addEventListener("change",function(){if(r.checked){mode=o[0];updateOk();}});
        txt.append(el("strong","",o[1]),el("small","",o[2]));lab.append(r,txt);modeBox.append(lab);});
      P.months.append(mLead,mList,modeBox,mNeed);

      /* 5. Résumé */
      var kLead=el("p","gfb-lead"),kMonths=el("div","gfb-recap-m"),kH2=el("h4","gfb-sub"),recap=el("div","gfb-recap"),kNotes=el("ul","gfb-stats gfb-notes"),kAfter=el("p","gfb-note",t2("Tu pourras tout modifier ensuite dans le tableur, et annuler l’import pendant quelques secondes.","You can change anything afterwards in the spreadsheet, and undo the import for a few seconds."));
      P.confirm.append(kLead,kMonths,kH2,recap,kNotes,kAfter);

      /* ── Choix d'une ligne (liste de boutons) ── */
      function choiceBlock(cur,pick,sign,reco){
        var box=el("div","gfb-choices");
        function sec(label,arr,cls){if(!arr.length)return;box.append(el("p","gfb-ch-h",label));var w=el("div","gfb-ch-w"+(cls?" "+cls:""));
          arr.forEach(function(t){var b=el("button","gfb-choice"+(t.ignore?" is-ignore":""),t.name);b.type="button";b.setAttribute("translate","no");if(cur&&key(t.name)===key(cur.name||""))b.setAttribute("aria-pressed","true");if(t.ignore&&cur&&cur.ignore)b.setAttribute("aria-pressed","true");if(reco&&!t.ignore&&key(t.name)===key(reco)){b.classList.add("is-reco");b.append(el("small","gfb-reco",t2("Conseillé","Suggested")));}
            b.addEventListener("click",function(){pick(t.ignore?["","Ignorer"]:[t.name,t.kind]);});w.append(b);});box.append(w);}
        var sheet=T.filter(function(t){return t.group==="sheet";}),cats=T.filter(function(t){return t.group==="cat";}),oth=T.filter(function(t){return t.group==="other";});
        if(sign!=null)oth=oth.filter(function(t){return sign<0?t.kind==="Dépense":t.kind==="Salaire";}).concat(oth.filter(function(t){return sign<0?t.kind!=="Dépense":t.kind!=="Salaire";}));
        sec(t2("Tes lignes du tableur","Your spreadsheet rows"),sheet);
        sec(t2("Catégories","Categories"),cats);
        sec(t2("Autres","Other"),oth.concat([{name:t2("Ignorer","Ignore"),ignore:true}]));
        return box;
      }
      function curChoice(c){return c?(c[1]==="Ignorer"?{ignore:true}:{name:c[0]}):null;}

      /* ── Fenêtre « ranger cette opération » ── */
      function openPicker(r,focusBack){
        var rule=!!(r.mkey&&r.mkey.length>2&&!r.internal&&r.ig!=="wallet"),pd=el("dialog","gfh-dialog gfb-dialog gfb-pick");pd.setAttribute("aria-labelledby","gfbPickT");
        var ph=el("div","gfb-head"),pt=el("h2","",t2("Ranger cette opération","File this transaction"));pt.id="gfbPickT";pt.tabIndex=-1;
        var px=el("button","gfb-x");px.type="button";px.setAttribute("aria-label",t2("Fermer","Close"));px.innerHTML=x.innerHTML;ph.append(pt,px);
        var pb=el("div","gfb-body gfb-pick-body"),who=el("p","gfb-lead"),sub=el("p","gfb-note");
        var nm=el("strong","",cleanLabel(r));nm.setAttribute("translate","no");who.append(nm,document.createTextNode(" · "+sgn(r.amount)));
        sub.textContent=rule?t2("Tous les paiements de ce commerçant iront dans la ligne choisie. Meuniance s’en souviendra pour les prochains relevés.","All payments from this merchant will go into the chosen row. Meuniance will remember it for future statements."):t2("Ce choix ne concerne que cette opération.","This choice only applies to this transaction.");
        var cur=r.status==="ignored"?{ignore:true}:{name:r.name};
        pb.append(who,sub,choiceBlock(cur,function(ch){pd.close();apply(r,ch);},r.amount));
        var pf=el("div","gfb-actions"),pc=el("button","gfh-btn",t2("Fermer","Close"));pc.type="button";pf.append(pc);
        var fin=function(){pd.close();};pc.addEventListener("click",fin);px.addEventListener("click",fin);
        pd.addEventListener("keydown",function(e){e.stopPropagation();});
        pd.addEventListener("close",function(){pd.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();try{focusBack&&focusBack.focus({preventScroll:true});}catch(e){}});
        var fm=document.createElement("form");fm.className="gfb-form";fm.noValidate=true;fm.addEventListener("submit",function(e){e.preventDefault();});fm.append(ph,pb,pf);pd.append(fm);
        document.body.append(pd);pd.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();try{pt.focus({preventScroll:true});}catch(e){}
      }
      // Applique un choix à une opération de la liste : au marchand (retenu) ou à cette seule opération.
      function apply(r,ch){
        var rule=!!(r.mkey&&r.mkey.length>2&&!r.internal&&r.ig!=="wallet"),was,label=cleanLabel(r),to=ch[1]==="Ignorer"?t2("ignoré","ignored"):ch[0];
        dirty=true;
        if(rule){var had=Object.prototype.hasOwnProperty.call(extra,r.mkey);was=extra[r.mkey];extra[r.mkey]=ch;flashUndo=function(){if(had)extra[r.mkey]=was;else delete extra[r.mkey];};}
        else{var had2=Object.prototype.hasOwnProperty.call(ovr,r.fp),was2=ovr[r.fp];ovr[r.fp]=ch;flashUndo=function(){if(had2)ovr[r.fp]=was2;else delete ovr[r.fp];};}
        flash.replaceChildren(document.createTextNode(q(label)+" → "+to+" · "));
        var u=el("button","gfh-link gfb-undo",t2("Annuler","Undo"));u.type="button";u.addEventListener("click",function(){if(flashUndo)flashUndo();flashUndo=null;flash.hidden=true;dirty=true;draw(true);});flash.append(u);flash.hidden=false;
        draw(true);
        var again=P.list.querySelector('[data-fp="'+cssq(r.fp)+'"] .gfb-chip');try{again&&again.focus({preventScroll:true});}catch(e){}
      }
      function cssq(s){return String(s).replace(/(["\\])/g,"\\$1");}

      /* ── Liste : deux blocs, chacun avec sa pagination ── */
      function makeBlock(title){
        var b={box:el("section","gfb-blk"),cnt:el("span","gfb-blk-n"),sub:el("p","gfb-blk-sub"),list:el("div","gfb-ops"),emp:el("p","gfb-note gfb-empty"),more:el("button","gfh-btn gfb-more-btn"),live:el("p","gfb-sr"),view:[],rendered:0,shown:PAGE,lastMk:""};
        var hd=el("div","gfb-blk-h");hd.append(el("h4","",title),b.cnt);
        b.live.setAttribute("role","status");b.more.type="button";
        b.box.append(hd,b.sub,b.list,b.emp,b.more,b.live);
        b.more.addEventListener("click",function(){var from=b.rendered;b.shown=b.rendered+PAGE;appendRows(b,from,b.shown);moreState(b);b.live.textContent=t2((b.rendered-from)+" opérations de plus affichées.",(b.rendered-from)+" more transactions shown.");
          var first=b.list.querySelectorAll(".gfb-op")[from];try{first&&first.querySelector("button,input")&&first.querySelector("button,input").focus({preventScroll:false});}catch(e){}});
        b.list.addEventListener("click",function(e){var c=e.target.closest&&e.target.closest("[data-k=chip]");if(!c)return;var li=c.closest(".gfb-op"),r=rowMap[li.dataset.fp];if(r)openPicker(r,c);});
        b.list.addEventListener("change",function(e){var i=e.target;if(!i||i.dataset.k!=="sw")return;var li=i.closest(".gfb-op"),fp=li.dataset.fp;if(i.checked)inc[fp]=true;else delete inc[fp];flash.hidden=true;dirty=true;
          draw(true);var again=P.list.querySelector('[data-fp="'+cssq(fp)+'"] .gfb-swi');try{again&&again.focus({preventScroll:true});}catch(e2){}});
        return b;
      }
      function inImport(r){return r.status==="ok";}
      function visibleRows(wantIn){
        var qn=norm(query).trim();
        return summary.rows.filter(function(r){
          if(inImport(r)!==wantIn)return false;
          if(qn&&norm(r.label).indexOf(qn)<0&&norm(cleanLabel(r)).indexOf(qn)<0&&norm(r.name||"").indexOf(qn)<0)return false;
          return true;});
      }
      function rowNode(r){
        var dup=r.status==="dup",ign=r.status==="ignored",drp=r.status==="dropped",off=dup||ign||drp,li=el("div","gfb-op"+(off?" is-off":"")+(dup?" is-dup":"")+(r.unk?" is-todo":""));li.dataset.fp=r.fp;
        var dt=el("div","gfb-op-date");dt.append(el("b","",String(r.date.d)),el("span","",weekday(r.date)));
        var mid=el("div","gfb-op-mid"),nm=el("span","gfb-op-name",cleanLabel(r));nm.setAttribute("translate","no");nm.title=r.label;mid.append(nm);
        var meta=el("div","gfb-op-meta");
        if(drp){meta.append(el("span","gfb-tag",r.ig==="deferred"?t2("Total de carte différé : les paiements sont déjà comptés un par un.","Deferred card total: the payments are already counted one by one."):t2("En attente ou refusée : pas importée.","Pending or declined: not imported.")));mid.append(meta);}
        else if(dup){meta.append(el("span","gfb-tag",t2("Déjà importée.","Already imported.")));mid.append(meta);}
        else{
          var txt=ign?(r.ig==="wallet"?t2("Mouvement entre tes comptes : ignoré","Movement between your accounts: ignored"):t2("Tu l’as choisi : ignorée","Your choice: ignored")):r.unk?t2("À classer","To sort"):r.internal?t2("Virement interne → épargne","Own-account transfer → savings"):r.name;
          var chip=el("button","gfb-chip"+(r.unk?" is-todo":"")+(ign?" is-ign":"")+(r.internal?" is-int":""));chip.type="button";chip.dataset.k="chip";
          chip.setAttribute("aria-label",t2("Changer la catégorie de ","Change the category of ")+cleanLabel(r)+" ("+txt+")");
          chip.append(el("span","gfb-chip-t",txt),el("i","gfb-chip-c"));mid.append(meta);meta.append(chip);
          if(r.forced)meta.append(el("span","gfb-tag",t2("Importée quand même","Imported anyway")));
        }
        if(dup||r.forced){
          var sw=el("label","gfb-sw"),inp=document.createElement("input");inp.type="checkbox";inp.className="gfb-swi";inp.setAttribute("role","switch");inp.checked=!!r.forced;inp.dataset.k="sw";
          sw.append(inp,el("span","gfb-sw-ui"),el("span","gfb-sw-t",t2("Importer quand même","Import anyway")));
          li.append(dt,mid,sw);li.classList.add("has-sw");
        }else li.append(dt,mid);
        var am=el("b","gf-amount gfb-op-amt "+(r.amount<0?"is-out":"is-in"),sgn(r.amount));
        li.insertBefore(am,li.children[2]||null);
        return li;
      }
      function appendRows(b,from,to){
        var frag=document.createDocumentFragment();
        for(var i=from;i<to&&i<b.view.length;i++){var r=b.view[i],mk=r.date.y+"-"+r.date.m;
          if(mk!==b.lastMk){b.lastMk=mk;frag.append(el("h5","gfb-mh",monthTitle(r.date)));}
          frag.append(rowNode(r));}
        b.list.append(frag);b.rendered=Math.min(to,b.view.length);
      }
      function moreState(b){var left=b.view.length-b.rendered;b.more.hidden=left<=0;b.more.textContent=left>0?t2("Voir "+Math.min(PAGE,left)+" de plus ("+left+" restantes)","Show "+Math.min(PAGE,left)+" more ("+left+" left)"):"";}
      function paintBlock(b,wantIn){
        b.view=visibleRows(wantIn);b.lastMk="";b.list.replaceChildren();b.rendered=0;appendRows(b,0,b.shown);
        b.cnt.textContent=plural(b.view.length,"opération","opérations","transaction","transactions");
        b.emp.hidden=!!b.view.length;b.emp.textContent=b.view.length?"":(query?t2("Aucune opération ne correspond à cette recherche.","No transaction matches this search."):wantIn?t2("Rien de nouveau à importer.","Nothing new to import."):t2("Aucune opération laissée de côté.","No transaction left aside."));
        moreState(b);
      }
      function paintList(){
        paintBlock(blkIn,true);paintBlock(blkOut,false);
        var todo=summary.rows.filter(function(r){return r.unk;}).length;
        blkIn.sub.textContent=!blkIn.view.length&&!query?"":todo?t2("Les lignes jaunes seront à classer à l’étape suivante.","The yellow lines are for you to sort in the next step."):t2("Tout est classé.","Everything is sorted.");
        blkOut.sub.textContent=blkOut.view.length||query?t2("Je te dis pourquoi à chaque ligne. Rien n’est perdu : tu peux en rajouter.","Each line says why. Nothing is lost: you can add any of them."):"";
        blkOut.box.hidden=!summary.rows.some(function(r){return !inImport(r);});
      }

      /* ── À classer, une par une ── */
      function groupLabel(g){return String(g.label||"").replace(/\s+/g," ").trim().slice(0,90);}
      // Le choix se valide avec « Suivant » : toucher une catégorie la sélectionne, on peut en essayer plusieurs.
      var sel={};
      function commitUnknown(g,ch){
        ans[g.gid]=ch;dirty=true;
        if(g.key&&g.key.length>2)extra[g.key]=ch;else g.fps.forEach(function(fp){ovr[fp]=ch;});
      }
      var HINTS=[[/bricol|leroy|castorama|ikea|zara|kiabi|h&m|decathlon|amazon|fnac|cdiscount|boutique|vinted|zalando|action\b/,"Shopping"],
        [/pharmac|docteur|medecin|dentiste|optic|hopital|clinique|laboratoire|kine/,"Santé"],
        [/restaurant|resto|mcdo|mcdonald|burger|pizz|sushi|boulang|uber eats|deliveroo|brasserie|cafe\b|kebab|starbucks|kfc/,"Restaurants"],
        [/cinema|pathe|gaumont|steam|playstation|nintendo|bowling|concert|ticketmaster|fnac spectacle|spotify|deezer/,"Loisirs"],
        [/hotel|airbnb|booking|ryanair|easyjet|air france|volotea|trainline|blablacar/,"Voyages"],
        [/sncf|ratp|navigo|uber\b|bolt\b|taxi|peage|vinci autoroute|parking|velib|lime\b/,"Transports"],
        [/total ?energies|esso|shell|bp\b|carburant|station|intermarche station|leclerc station/,"Carburant"],
        [/carrefour|leclerc|lidl|aldi|auchan|intermarche|monoprix|casino|franprix|picard|biocoop|grand frais|supermarche/,"Courses"],
        [/assurance|maif|macif|matmut|axa|allianz|groupama/,"Assurances"],
        [/edf|engie|veolia|eau\b|gaz\b|electricite/,"Énergie et eau"]];
      function recommend(g){
        var name="";
        if(g.total>0){var inc=T.filter(function(t){return t.group==="sheet"&&t.kind==="Salaire";})[0];name=inc?inc.name:"";}
        else{var l=norm(g.label||"");for(var i=0;i<HINTS.length;i++){if(HINTS[i][0].test(l)){name=HINTS[i][1];break;}}}
        if(!name)return "";
        // Le nom d'une ligne déjà présente dans le tableur a priorité (« Alimentation » pour Courses, par exemple).
        var hit=T.filter(function(t){return key(t.name)===key(name);})[0]||T.filter(function(t){return t.group==="sheet"&&existingRow(name,[t.name]);})[0];
        return hit?hit.name:"";
      }
      function nextUnknown(){if(unkIdx<unkSnap.length-1){unkIdx++;draw(false);focusHead();}else{var i=steps.indexOf("unknown");go(steps[Math.min(i+1,steps.length-1)]);}}
      function drawUnknown(){
        var g=unkSnap[unkIdx],kids=[];
        var cnt=el("p","gfb-unk-n",unkIdx+1+NB+t2("sur","of")+NB+unkSnap.length);
        var pg=el("div","gfb-unk-bar");pg.setAttribute("aria-hidden","true");pg.append(el("span","gfb-unk-fill"));pg.firstChild.style.width=Math.round((unkIdx+1)/unkSnap.length*100)+"%";
        var qn=el("p","gfb-q"),lab=el("strong","",q(groupLabel(g)));lab.setAttribute("translate","no");
        qn.append(document.createTextNode(t2("Où ranger ","Where should ")),lab,document.createTextNode(" ("+(g.count>1?plural(g.count,"opération","opérations","transaction","transactions")+", ":"")+sgn(g.total)+")"+t2(NB+"?"," go?")));
        var note=el("p","gfb-note",g.key&&g.key.length>2?t2("Meuniance retiendra ton choix pour les prochains relevés.","Meuniance will remember your choice for future statements."):t2("Ce choix ne concerne que cette opération.","This choice only applies to this transaction."));
        kids.push(cnt,pg,qn,note,choiceBlock(curChoice(sel[g.gid]||ans[g.gid]),function(ch){sel[g.gid]=ch;drawUnknown();updateOk();},g.total,recommend(g)));
        uBody.replaceChildren.apply(uBody,kids);
      }

      /* ── Mois déjà remplis ── */
      function drawMonths(){
        var det=conflictDetails(summary);
        mLead.textContent=t2("Ton tableur contient déjà des montants pour "+(det.length>1?"ces mois":"ce mois")+", dans des lignes que ce relevé remplit aussi. Dis-nous quoi en faire"+NB+": rien n’est modifié sans ton accord.","Your spreadsheet already has amounts for "+(det.length>1?"these months":"this month")+" in rows this statement also fills. Tell us what to do: nothing changes without your say-so.");
        var nodes=det.map(function(e){
          var box=el("div","gfb-cm");box.append(el("h4","gfb-cm-h",monthTitle(e.d)));
          e.rows.slice(0,5).forEach(function(r){var row=el("div","gfb-cm-row"),nmn=el("span","gfb-name",r.name);
            var inSheet=r.sheet==null?String(r.raw):signed(r.kind,r.sheet/(r.sign||1));
            var b=el("span","gfb-cm-v");b.append(el("small","",t2("Tableur","Sheet")+NB+": "),el("b","gf-amount",inSheet),el("small","gfb-cm-sep"," → "),el("small","",t2("Ce relevé","This statement")+NB+": "),el("b","gf-amount",signed(r.kind,r.stmt)));
            row.append(nmn,b);box.append(row);});
          if(e.rows.length>5)box.append(el("p","gfb-note",t2("… et "+(e.rows.length-5)+" autre"+(e.rows.length-5>1?"s":"")+" ligne"+(e.rows.length-5>1?"s":""),"… and "+(e.rows.length-5)+" more row"+(e.rows.length-5>1?"s":""))));
          return box;});
        mList.replaceChildren.apply(mList,nodes);
        radios.forEach(function(r){r.checked=r.value===mode;});mNeed.hidden=!!mode;
      }

      /* ── Résumé ── */
      function drawConfirm(){
        var first=summary.months[0],yrs={};summary.months.forEach(function(m){yrs[m.y]=1;});var yl=Object.keys(yrs).join(", "),ny=Object.keys(yrs).length;
        if(!summary.newCount&&!summary.groups.length){
          kLead.textContent=t2("Rien de nouveau à importer"+NB+": toutes les opérations sont déjà importées ou ignorées.","Nothing new to import: every transaction is already imported or ignored.");
        }else kLead.textContent=(ny>1?t2("Meuniance va écrire ces totaux dans les feuilles "+yl,"Meuniance will write these totals into the "+yl+" sheets"):t2("Meuniance va écrire ces totaux dans la feuille "+yl,"Meuniance will write these totals into the "+yl+" sheet"))+(summary.months.length>1?t2(", mois par mois"+NB+":",", month by month:"):t2(NB+":",":"));
        // Par mois
        var mc={};summary.items.forEach(function(it){if(!it.dup)mc[it.mk]=(mc[it.mk]||0)+1;});
        var mn=summary.months.map(function(m,i){var k=m.y+"-"+m.m,b=summary.monthKinds[k]||{},det=document.createElement("details");det.className="gfb-group gfb-mdet";det.open=summary.months.length<=3||confOpen[k]===true||(confOpen[k]==null&&i===0);
          det.addEventListener("toggle",function(){confOpen[k]=det.open;});
          var sm=document.createElement("summary");sm.className="gfb-row";sm.append(el("span","gfb-name",monthTitle(m)),el("span","gfb-count",plural(mc[k]||0,"opération","opérations","transaction","transactions")));det.append(sm);
          var inner=el("div","gfb-merchants");KINDS.forEach(function(kd){var v=b[kd[0]]||0;if(Math.abs(v)<0.005)return;var r=el("div","gfb-merchant");r.append(el("span","gfb-mname",kd[1]),el("b","gf-amount",signed(kd[0],v)));inner.append(r);});det.append(inner);return det;});
        kMonths.replaceChildren.apply(kMonths,mn);kMonths.hidden=!mn.length;
        kH2.textContent=t2("Par catégorie","By category");kH2.hidden=!summary.groups.length;
        var rnodes=[],lastKind="";
        summary.groups.forEach(function(g){if(g.kind!==lastKind){rnodes.push(el("div","gfb-kind",titles[g.kind]));lastKind=g.kind;}
          var r=el("div","gfb-row gfb-rrow"),nm=el("span","gfb-name",g.name);if(isNew(g.name))nm.append(el("small","gfb-new",t2("nouvelle ligne","new row")));r.append(nm,el("b","gf-amount",signed(g.kind,g.total)));rnodes.push(r);});
        recap.replaceChildren.apply(recap,rnodes);recap.hidden=!rnodes.length;
        // Notes
        var notes=[];
        notes.push(t2(plural(summary.newCount,"opération sera importée","opérations seront importées","transaction will be imported","transactions will be imported")+".",plural(summary.newCount,"","","transaction will be imported","transactions will be imported")+"."));
        if(summary.dupCount)notes.push(t2(plural(summary.dupCount,"opération déjà importée n’est pas reprise","opérations déjà importées ne sont pas reprises","","")+".",plural(summary.dupCount,"","","transaction already imported is skipped","transactions already imported are skipped")+"."));
        var ig=[];if(summary.pending)ig.push(t2(plural(summary.pending,"en attente ou refusée","en attente, refusées ou annulées","pending or declined","pending, declined or cancelled"),plural(summary.pending,"pending or declined","pending, declined or cancelled","pending or declined","pending, declined or cancelled")));
        if(summary.wallet)ig.push(t2(plural(summary.wallet,"recharge ou mouvement interne","recharges ou mouvements internes","","")+" (hors épargne)",plural(summary.wallet,"","","top-up or internal movement","top-ups or internal movements")+" (not savings)"));
        if(summary.byRule)ig.push(t2(plural(summary.byRule,"choisie par toi","choisies par toi","",""),plural(summary.byRule,"","","chosen by you","chosen by you")));
        if(ig.length)notes.push(t2("Ignorées"+NB+": "+ig.join(", ")+".","Ignored: "+ig.join(", ")+"."));
        if(summary.deferred)notes.push(t2("Une ligne de total de carte à débit différé a été ignorée"+NB+": les paiements sont déjà comptés un par un.","A deferred-debit card total line was ignored: the payments are already counted one by one."));
        var conf0=conf.length&&mode;if(conf0)notes.push(mode==="add"?t2("Mois déjà remplis"+NB+": les nouvelles opérations s’ajoutent à tes chiffres.","Months already filled: new transactions are added to your figures."):t2("Mois déjà remplis"+NB+": ces lignes sont recalculées avec toutes les opérations importées.","Months already filled: these rows are recalculated from every imported transaction."));
        kNotes.replaceChildren.apply(kNotes,notes.map(function(n){return el("li","",n);}));
      }

      /* ── Pilotage ── */
      var acts=el("div","gfb-actions"),back=el("button","gfh-btn"),ok=el("button","gfh-btn is-primary");back.type="button";ok.type="submit";acts.append(back,ok);
      function focusHead(){var hh=P[step]._h;try{hh.focus({preventScroll:true});}catch(e){}}
      function updateOk(){
        var last=step===steps[steps.length-1];
        if(step==="unknown"){var g=unkSnap&&unkSnap[unkIdx];ok.textContent=g&&(sel[g.gid]||ans[g.gid])?(unkIdx===unkSnap.length-1?t2("Continuer","Continue"):t2("Suivant","Next")):t2("Passer","Skip");ok.disabled=false;}
        else{ok.textContent=last?t2("Importer","Import"):t2("Continuer","Continue");
          ok.disabled=(step==="months"&&!mode)||((step==="list"||step==="confirm")&&!summary.newCount);}
        ok.classList.toggle("is-primary",!(step==="unknown"&&ok.textContent===t2("Passer","Skip")));
      }
      function draw(keepPlace){
        var top=body.scrollTop;
        // Le résumé n'est recalculé que si un choix a changé (5 000 lignes : on évite de le refaire à chaque écran).
        if(dirty||!summary){summary=summarize(ops,extra,{ovr:ovr,inc:inc});rowMap={};summary.rows.forEach(function(r,i){r.i=i;rowMap[r.fp]=r;});
          summary.rows.sort(function(a,b){return b.dkey-a.dkey||a.i-b.i;});conf=conflictMonths(summary);dirty=false;}
        var hasUnk=unkSnap?unkSnap.length>0:summary.unknown.length>0;
        steps=["found","list"].concat(hasUnk?["unknown"]:[]).concat(conf.length?["months"]:[]).concat(["confirm"]);
        if(steps.indexOf(step)<0)step="list";
        var idx=steps.indexOf(step);
        stepTxt.textContent=t2("Étape "+(idx+1)+" sur "+steps.length,"Step "+(idx+1)+" of "+steps.length);
        bar.replaceChildren.apply(bar,steps.map(function(s,i){return el("span","gfb-seg"+(i<idx?" is-done":i===idx?" is-on":""));}));

        // 1
        fLead.textContent=fileName?t2("Relevé reconnu : ton fichier "+q(fileName)+".","Statement recognised: your file "+q(fileName)+"."):t2("Relevé reconnu.","Statement recognised.");
        var aside=summary.ignored+summary.pending+summary.deferred;
        fStats.replaceChildren.apply(fStats,[[summary.newCount,t2("à importer","to import")],[summary.dupCount,t2("déjà importée"+(summary.dupCount>1?"s":""),"already imported")],[aside,t2("laissée"+(aside>1?"s":"")+" de côté","left aside")]].map(function(x){var c=el("div","gfb-stat");c.append(el("b","",String(x[0])),el("span","",x[1]));return c;}));
        var yrs={};summary.rows.forEach(function(r){yrs[r.date.y]=1;});var yl=Object.keys(yrs).sort().join(", "),ny=Object.keys(yrs).length;
        function dayLabel(d){return d.d+NB+(en()?MN_EN[d.m]:MN[d.m]);}
        var same=summary.from&&summary.to&&summary.from.y===summary.to.y&&summary.from.m===summary.to.m;
        var facts=[];
        function fact(kind,nodes){var li=el("li","gfb-f2 is-"+kind),ic=el("span","gfb-f2-ic");ic.innerHTML=kind==="ok"?ICON_OK:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/></svg>';var tx=el("span","gfb-f2-t");nodes.forEach(function(n){tx.append(typeof n==="string"?document.createTextNode(n):n);});li.append(ic,tx);facts.push(li);}
        if(summary.from){
          fact("ok",same?[t2("Opérations de ","Transactions from "),el("b","",monthLabel(summary.from)),t2(", dans la feuille ",", in the ")+yl+t2("."," sheet.")]
            :[t2("Du ","From "),el("b","",dayLabel(summary.from)),t2(" au "," to "),el("b","",dayLabel(summary.to)+(summary.to.y!==summary.from.y?" "+summary.to.y:"")),t2(", importés mois par mois dans "+(ny>1?"les feuilles ":"la feuille ")+yl+".",", month by month into the "+yl+(ny>1?" sheets.":" sheet."))]);
        }
        if(summary.rows.some(function(r){return r.internal&&r.status==="ok";}))fact("ok",[t2("Les virements vers ton épargne comptent comme de l’épargne.","Transfers to your savings count as savings.")]);
        if(aside)fact("dot",[t2("Les opérations refusées ou en attente, et les virements entre tes comptes courants, sont laissés de côté.","Declined or pending transactions, and transfers between your current accounts, are left aside.")]);
        fact("dot",[t2("Ton fichier n’est pas conservé"+NB+": seuls les totaux arrivent dans ton tableur.","Your file is not kept: only the totals reach your spreadsheet.")]);
        fList.replaceChildren.apply(fList,facts);

        // Pane actif seulement
        Object.keys(P).forEach(function(id){P[id].hidden=id!==step;});
        if(step==="list"){
          lLead.textContent=t2("Touche une catégorie pour la changer.","Tap a category to change it.");
          lEmpty.textContent="";lEmpty.hidden=true;
          paintList();
          if(!summary.newCount)lLead.textContent+=" "+t2("Rien de nouveau à importer"+NB+": active « Importer quand même » sur une opération pour la recompter.","Nothing new to import: switch on “Import anyway” on a transaction to count it again.");
        }
        if(step==="unknown"&&unkSnap&&unkSnap.length)drawUnknown();
        if(step==="months")drawMonths();
        if(step==="confirm")drawConfirm();

        back.textContent=idx||(step==="unknown"&&unkIdx>0)?t2("Retour","Back"):t2("Annuler","Cancel");
        updateOk();
        if(keepPlace)body.scrollTop=top;
      }
      function go(id){
        var cur=steps.indexOf(step),tgt=steps.indexOf(id);
        if(id==="unknown"){
          // Nouvelle série de cartes en venant de la liste ; en revenant d'une étape suivante, on reprend à la dernière carte.
          if(tgt>cur||!unkSnap){unkSnap=summary.unknown.slice();unkIdx=0;}else unkIdx=Math.max(0,unkSnap.length-1);
        }
        if(id==="found"||id==="list")unkSnap=null;
        step=id;draw(false);body.scrollTop=0;focusHead();
      }
      var body=el("div","gfb-body");body.append(P.found,P.list,P.unknown,P.months,P.confirm);
      var form=document.createElement("form");form.className="gfb-form";form.noValidate=true;form.append(head,prog,body,acts);d.append(form);
      var done=false;function finish(v){if(done)return;done=true;d.close();resolve(v);}
      back.addEventListener("click",function(){
        if(step==="unknown"&&unkIdx>0){unkIdx--;draw(false);focusHead();body.scrollTop=0;return;}
        var i=steps.indexOf(step);if(i>0){
          // Retour depuis l'étape suivante vers les cartes : on retombe sur la dernière
          go(steps[i-1]);}else finish(null);});
      x.addEventListener("click",function(){finish(null);});
      // Les raccourcis du tableur (Entrée, flèches) écoutent le document : ils ne doivent pas agir sous la fenêtre.
      d.addEventListener("keydown",function(e){e.stopPropagation();if(e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"&&e.target.type==="search")e.preventDefault();});
      form.addEventListener("submit",function(e){e.preventDefault();if(ok.disabled)return;
        if(step==="unknown"){var cg=unkSnap&&unkSnap[unkIdx];if(cg&&sel[cg.gid]){commitUnknown(cg,sel[cg.gid]);delete sel[cg.gid];}nextUnknown();return;}
        var i=steps.indexOf(step);
        if(i<steps.length-1){go(steps[i+1]);return;}
        finish({mode:conf.length?mode:"replace",summary:summary,extra:extra});});
      d.addEventListener("close",function(){if(!done){done=true;resolve(null);}d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      draw();
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

  /* ── Fichier non reconnu : un guide pour télécharger le bon fichier ── */
  var GUIDE=[
    ["Boursorama, Fortuneo, Hello bank","Boursorama, Fortuneo, Hello bank","Ouvre ton compte et cherche Exporter ou Télécharger près de la liste des opérations. Choisis la période, puis le format CSV.","Open your account and look for Export or Download near the transactions list. Pick the period, then the CSV format."],
    ["Crédit Agricole","Crédit Agricole","Ouvre le compte et cherche Télécharger ou Exporter les opérations. Prends un format tableur (CSV ou Excel), pas le PDF.","Open the account and look for Download or Export transactions. Choose a spreadsheet format (CSV or Excel), not PDF."],
    ["LCL","LCL","Dans le détail du compte, cherche Télécharger (ou Exporter) les opérations. Choisis Excel ou CSV.","In the account details, look for Download (or Export) transactions. Choose Excel or CSV."],
    ["Caisse d’Épargne","Caisse d’Épargne","Ouvre le compte et cherche Télécharger ou Exporter. Choisis CSV (ou Excel) et la période voulue.","Open the account and look for Download or Export. Choose CSV (or Excel) and the period you want."],
    ["BNP Paribas","BNP Paribas","Ouvre le compte, cherche Télécharger (ou Exporter) les opérations. Choisis CSV ou Excel et la période.","Open the account and look for Download (or Export) transactions. Choose CSV or Excel and the period."],
    ["Société Générale","Société Générale","Ouvre le compte, cherche Télécharger ou Exporter. Préfère CSV (ou Excel) au PDF.","Open the account and look for Download or Export. Prefer CSV (or Excel) over PDF."],
    ["CIC, Crédit Mutuel","CIC, Crédit Mutuel","Ouvre le compte, cherche Télécharger ou Exporter. Choisis un format tableur (CSV ou Excel) et la période.","Open the account and look for Download or Export. Choose a spreadsheet format (CSV or Excel) and the period."],
    ["La Banque Postale","La Banque Postale","Ouvre le compte, cherche Télécharger ou Exporter. Choisis CSV (ou Excel) : le PDF n’est pas lu.","Open the account and look for Download or Export. Choose CSV (or Excel): PDF is not read."],
    ["Revolut","Revolut","Dans l’app ou sur le site, ouvre le compte et cherche Relevé (Statement). Choisis Excel ou CSV et la période, pas PDF.","In the app or on the website, open the account and look for Statement. Choose Excel or CSV and the period, not PDF."],
    ["N26","N26","Cherche l’export de tes transactions (Exporter, Télécharger) dans ton compte ou ses paramètres. Choisis CSV.","Look for your transactions export (Export, Download) in your account or its settings. Choose CSV."],
    ["Wise","Wise","Sur le site, ouvre l’historique du compte et cherche Relevé (Statements). Choisis CSV ou XLSX.","On the website, open the account history and look for Statements. Choose CSV or XLSX."],
    ["Autre banque","Another bank","Cherche Exporter, Télécharger ou Relevé dans la vue du compte, et choisis CSV ou Excel. Si tu n’as que le PDF, demande à ta banque l’export tableur.","Look for Export, Download or Statement in the account view and choose CSV or Excel. If you only have the PDF, ask your bank for the spreadsheet export."]
  ];
  // Fichier qui n'est pas un relevé : on explique comment télécharger le bon, et on propose de l'importer comme un simple tableau.
  function notStatement(empty){
    return new Promise(function(resolve){
      var d=el("dialog","gfh-dialog gfb-dialog gfb-guide");d.setAttribute("aria-labelledby","gfbNsTitle");
      var head=el("div","gfb-head"),h=el("h2","",t2("Comment télécharger le bon fichier","How to download the right file"));h.id="gfbNsTitle";h.tabIndex=-1;
      var x=el("button","gfb-x");x.type="button";x.setAttribute("aria-label",t2("Fermer","Close"));x.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';head.append(h,x);
      var body=el("div","gfb-body");
      body.append(el("p","gfb-lead",empty?t2("Le fichier ne contient aucune ligne. Télécharge à nouveau ton relevé depuis l’espace client de ta banque.","The file has no rows. Download your statement again from your bank’s website."):t2("Meuniance n’a pas trouvé de colonnes date, libellé et montant dans ce fichier.","Meuniance couldn’t find date, description and amount columns in this file.")));
      var gen=el("div","gfb-gen");gen.append(el("p","gfb-gen-t",t2("En général","In general")),el("p","gfb-lead",t2("Dans l’espace client de ta banque (site ou appli) : comptes › ton compte › télécharger ou exporter › format CSV ou Excel. Le PDF n’est pas lu.","In your bank’s online banking (website or app): accounts › your account › download or export › CSV or Excel format. PDF is not read.")));
      body.append(gen);
      var wrap=el("div","gfb-banks");
      GUIDE.forEach(function(b,i){var det=document.createElement("details");det.className="gfb-bank";var sm=document.createElement("summary");sm.className="gfb-bank-s";sm.append(el("span","",en()?b[1]:b[0]));det.append(sm);det.append(el("p","gfb-bank-p",en()?b[3]:b[2]));
        det.addEventListener("toggle",function(){if(det.open)wrap.querySelectorAll("details[open]").forEach(function(o){if(o!==det)o.open=false;});});wrap.append(det);});
      body.append(wrap,el("p","gfb-note",t2("Les intitulés peuvent varier selon ta banque.","Labels may vary depending on your bank.")));
      var acts=el("div","gfb-actions"),close=el("button","gfh-btn is-primary",t2("Fermer","Close"));close.type="button";acts.append(close);
      var asTable=null;if(!empty){asTable=el("button","gfh-btn",t2("L’importer comme tableau","Import it as a table"));asTable.type="button";acts.prepend(asTable);}
      var done=false;function finish(v){if(done)return;done=true;d.close();resolve(v);}
      close.addEventListener("click",function(){finish(true);});x.addEventListener("click",function(){finish(true);});if(asTable)asTable.addEventListener("click",function(){finish(false);});
      d.addEventListener("keydown",function(e){e.stopPropagation();});
      d.addEventListener("close",function(){if(!done){done=true;resolve(true);}d.remove();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();});
      var form=document.createElement("form");form.className="gfb-form";form.noValidate=true;form.addEventListener("submit",function(e){e.preventDefault();});form.append(head,body,acts);d.append(form);
      document.body.append(d);d.showModal();if(window.GFUI&&window.GFUI.syncModalLock)window.GFUI.syncModalLock();try{h.focus({preventScroll:true});}catch(e){}
    });
  }
  // Confirmations : le message commun du site (même place, même style, même durée que partout).
  function toast(text,ms){if(window.GFNotify)window.GFNotify.toast(text,{ms:ms});}
  // Message de fin avec « Annuler » (7 secondes).
  function undoToast(text,onUndo,ms){if(window.GFNotify)window.GFNotify.toast(text,{undo:onUndo,ms:ms||7000});}
  // Se place sur le dernier mois importé : bonne feuille (année) et bon mois.
  function showMonth(m){
    try{var FS=window.FinanceSheet,snap=FS.getSnapshot(),sh=sheetOf(snap,m.y);if(!sh)return;
      if(snap.activeSheetId!==sh.id){snap.activeSheetId=sh.id;FS.loadSnapshot(snap);}
      setTimeout(function(){try{var prev=document.querySelector(".sheet-mobile-month-button[aria-label]"),next=document.querySelectorAll(".sheet-mobile-month-button")[1],lab=document.querySelector(".sheet-mobile-month-label");
        if(prev&&next&&lab){for(var i=0;i<12&&norm(lab.textContent).indexOf(norm(MN[m.m]).slice(0,4))!==0;i++)next.click();}
        var td=document.querySelector('td.cell[data-c="'+m.m+'"]');if(td&&td.scrollIntoView)td.scrollIntoView({block:"nearest",inline:"center"});}catch(e){}},250);
    }catch(e){}
  }

  /* Renvoie true si le fichier était un relevé bancaire (importé ou annulé), false sinon. */
  function handle(file){
    var name=String(file&&file.name||""),excel=/\.(xlsx|xls|xlsm|ods)$/i.test(name);
    if(!file||!(excel||/\.(csv|tsv|txt)$/i.test(name)))return Promise.resolve(false);
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
      return preview(ops,name).then(function(res){
        if(!res)return true;
        var FS=window.FinanceSheet,keys=[LEDGER_KEY,RULES_KEY,"personalFinanceDashboard.categoryRules","personalFinanceDashboard.subscriptions"],before={},snapBefore=null;
        try{snapBefore=JSON.stringify(FS.getSnapshot());keys.forEach(function(k){before[k]=window.safeStore.getItem(k);});}catch(e){}
        // Les choix faits dans l'aperçu sont retenus pour les prochains imports.
        if(Object.keys(res.extra).length)saveLearned(res.extra);
        var summary=res.summary;
        if(write(summary,res.mode)){
          var subs=0;try{subs=window.GFSubs?window.GFSubs.ingest(ops):0;}catch(e){}
          var first=summary.months[0],last=summary.months[summary.months.length-1];
          var when=!first?"":first===last?monthLabel(first):t2("de ","from ")+monthLabel(first)+t2(" à "," to ")+monthLabel(last);
          var years={};summary.months.forEach(function(m){years[m.y]=1;});
          var msg=!summary.newCount?t2("Rien de nouveau : ces opérations étaient déjà importées.","Nothing new: these transactions were already imported.")
            :t2("Relevé importé : ","Statement imported: ")+plural(summary.newCount,"opération","opérations","transaction","transactions")+(when?", "+when:"")+t2(", dans la feuille ",", in the ")+Object.keys(years).join(", ")+t2("."," sheet.")+(summary.dupCount?t2(" "+plural(summary.dupCount,"déjà importée, non reprise","déjà importées, non reprises","","")+".", " "+plural(summary.dupCount,"","","already imported, skipped","already imported, skipped")+"."):"");
          msg+=(subs?t2(" "+subs+" abonnement"+(subs>1?"s":"")+" repéré"+(subs>1?"s":"")+" : retrouve-les sur l’accueil."," "+subs+" subscription"+(subs>1?"s":"")+" found: see them on Home."):"");
          if(window.setPage)window.setPage("sheet");
          if(last)showMonth(last);
          if(snapBefore)undoToast(msg,function(){
            try{FS.loadSnapshot(JSON.parse(snapBefore));try{FS.saveNow&&FS.saveNow();}catch(e){}
              keys.forEach(function(k){try{if(before[k]==null)window.safeStore.removeItem&&window.safeStore.removeItem(k);else window.safeStore.setItem(k,before[k]);}catch(e){}});
              try{window.syncDashboardFromFinanceSheet&&window.syncDashboardFromFinanceSheet({silent:true});}catch(e){}
              toast(t2("Import annulé : ton tableur est revenu comme avant.","Import undone: your spreadsheet is back as it was."),4000);}catch(e){}
          },7000);else toast(msg,7000);
        }
        return true;
      });
    });
  }

  window.GFBankImport={transferLabel:transferLabel,renameRow:renameRow,handle:handle,parse:parse,summarize:summarize,write:write,existingRow:existingRow,categorize:categorize,merchantOf:merchantOf,learned:learned,saveLearned:saveLearned,_decode:decode,_monthTable:looksLikeMonthTable,_amount:parseAmount,_preview:preview,_notStatement:notStatement,_conflicts:conflictDetails};
})();
