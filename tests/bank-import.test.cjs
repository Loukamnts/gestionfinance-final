// Analyse des relevés bancaires CSV : formats courants des banques françaises.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ctx={window:{},TextDecoder,Intl,document:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','bank-import.js'),'utf8'),ctx);
const B=ctx.window.GFBankImport;
const enc=s=>new TextEncoder().encode(s).buffer;
function sum(csv){const ops=B.parse(B._decode(enc(csv)));assert(ops,'relevé non reconnu');return {ops,s:B.summarize(ops)};}
const total=(s,name)=>Math.round((s.groups.find(g=>g.name===name)||{total:0}).total*100)/100;

test('Boursorama : point-virgule, montants à virgule',()=>{
  const {ops,s}=sum('dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance\n2026-09-02;2026-09-02;"CARTE 01/09/26 CARREFOUR CITY";"Alimentation";"Vie quotidienne";"carrefour";-45,20;;0001;Compte;1000\n2026-09-03;2026-09-03;"VIR SEPA SALAIRE ACME";"Salaires";"Revenus";"";2 150,00;;0001;Compte;3000\n2026-09-05;2026-09-05;"PRLV SEPA NETFLIX";"Abonnements";"Loisirs";"netflix";-13,49;;0001;Compte;2900\n2026-10-01;2026-10-01;"VIR VERS LIVRET A";"Epargne";"Epargne";"";-200,00;;0001;Compte;2700');
  assert.equal(ops.length,4);
  assert.equal(total(s,'Courses'),45.2);assert.equal(total(s,'Salaire'),2150);assert.equal(total(s,'Abonnements'),13.49);assert.equal(total(s,'Épargne'),200);
  assert.equal(s.months.length,2);
});
test('Crédit Agricole : colonnes Débit / Crédit séparées et lignes d\'en-tête',()=>{
  const {s}=sum('Téléchargement du 14/10/2026\nCompte de Dépôt\n\nDate;Libellé;Débit euros;Crédit euros;\n03/09/2026;"PAIEMENT PAR CARTE LIDL 0209";32,15;;\n04/09/2026;"VIREMENT EN VOTRE FAVEUR CAF ALLOCATIONS";;180,00;\n06/09/2026;"PRELEVEMENT EDF CLIENTS";64,00;;\n');
  assert.equal(total(s,'Courses'),32.15);assert.equal(total(s,'Aides (CAF)'),180);assert.equal(total(s,'Énergie et eau'),64);
});
test('Société Générale : en-tête après plusieurs lignes, encodage Windows-1252',()=>{
  const text='="0001234"\nSolde au 14/10/2026;1 234,56\n\nDate de l\'opération;Libellé;Détail de l\'écriture;Montant de l\'opération;Devise\n08/09/2026;CARTE X1234 UBER EATS;UBER EATS PARIS;-24,90;EUR\n09/09/2026;RETRAIT DAB;RETRAIT 08/09;-40,00;EUR\n10/09/2026;REMBOURSEMENT AMAZON;AMAZON EU;19,99;EUR\n11/09/2026;CARTE AMAZON;AMAZON MKTP;-59,99;EUR\n';
  const latin=Buffer.from(text,'latin1');const ops=B.parse(B._decode(latin.buffer.slice(latin.byteOffset,latin.byteOffset+latin.length)));
  const s=B.summarize(ops);
  assert.equal(total(s,'Restaurants'),24.9);assert.equal(total(s,'Retraits'),40);assert.equal(total(s,'Shopping'),40);
});
test('Sans en-tête (LCL) : colonnes devinées sur le contenu',()=>{
  const {s}=sum('02/09/2026;-12,50;Carte;;SNCF INTERNET;\n05/09/2026;-850,00;Prélèvement;;LOYER FONCIA;\n07/09/2026;-9,99;Carte;;SPOTIFY;\n');
  assert.equal(total(s,'Transports'),12.5);assert.equal(total(s,'Loyer'),850);assert.equal(total(s,'Abonnements'),9.99);
});
test('Virgule anglaise, dates ISO, virement interne vers l’épargne = épargne',()=>{
  const {s}=sum('Date,Description,Amount\n2026-09-01,"Transfert interne vers compte epargne",-300.00\n2026-09-02,"Boulangerie Paul",-6.40\n2026-09-03,"Unknown shop",-15.00\n');
  assert.equal(s.ignored,0);assert.equal(total(s,'Épargne'),300);assert.equal(total(s,'Restaurants'),6.4);assert.equal(total(s,'Autres dépenses'),15);
});
test('Virement vers un compte courant ou joint : ce n’est pas de l’épargne, il est ignoré',()=>{
  const {s}=sum('Date,Description,Amount\n2026-09-01,"Transfert interne vers compte joint",-300.00\n2026-09-02,"VIR VERS COMPTE COURANT",-120.00\n2026-09-03,"To EUR Current",-80.00\n2026-09-04,"Boulangerie Paul",-6.40\n2026-09-05,"VIR VERS MON LIVRET A",-50.00\n');
  assert.equal(s.ignored,3);assert.equal(total(s,'Épargne'),50);assert.equal(total(s,'Restaurants'),6.4);
});
test('Un fichier qui n\'est pas un relevé n\'est pas pris pour un relevé',()=>{
  assert.equal(B.parse(B._decode(enc('Ligne;Janvier;Février\nSalaire;2000;2000\nLoyer;-700;-700\n'))),null);
});
test('Marchand : libellé bancaire sans le bruit',()=>{
  assert.equal(B.merchantOf('CARTE 01/09/26 CARREFOUR CITY'),'carrefour city');
  assert.equal(B.merchantOf('PRLV SEPA NETFLIX'),'netflix');
  assert.equal(B.merchantOf('CARTE X1234 UBER EATS'),'uber eats');
});
test('Un choix fait une fois classe le marchand aux imports suivants',()=>{
  const csv='Date,Description,Amount\n2026-09-02,"CARTE 02/09 CHEZ MARCEL",-15.00\n2026-10-02,"CARTE 02/10 CHEZ MARCEL",-18.00\n2026-09-05,"VIR SEPA M DUPONT REMBOURSEMENT",-100.00\n';
  const ops=B.parse(B._decode(enc(csv)));
  // Sans règle : « Autres dépenses »
  assert.equal(total(B.summarize(ops),'Autres dépenses'),133);
  // Choix dans l'aperçu : Marcel → Restaurants, le virement → ignoré
  const extra={[B.merchantOf('CARTE 02/09 CHEZ MARCEL')]:['Restaurants','Dépense'],[B.merchantOf('VIR SEPA M DUPONT REMBOURSEMENT')]:['','Ignorer']};
  const s=B.summarize(ops,extra);assert.equal(total(s,'Restaurants'),33);assert.equal(s.ignored,1);
  // Mémorisé : le prochain import le refait tout seul
  const mem={};ctx.window.safeStore={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);}};
  B.saveLearned(extra);const s2=B.summarize(ops);assert.equal(total(s2,'Restaurants'),33);assert.equal(s2.ignored,1);
  delete ctx.window.safeStore;
});

test('Ligne déjà dans le tableur : pas de deuxième « Abonnements »',()=>{
  const c2={window:{FinanceSheet:{getSnapshot:()=>({sheets:[{name:'2026',rowHeaders:['Salaire','Abonnement','Alimentation','Netflix']}]})}},TextDecoder,Intl,document:{}};vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','bank-import.js'),'utf8'),c2);const B2=c2.window.GFBankImport;
  const s=B2.summarize(B2.parse(B2._decode(enc('Date;Libellé;Montant\n05/09/2026;PRLV SEPA SPOTIFY;-11,12\n06/09/2026;PRLV SEPA NETFLIX.COM;-13,49\n07/09/2026;CARTE LIDL;-30,00\n08/09/2026;VIR SALAIRE ACME;2000,00\n'))));
  const names=s.groups.map(g=>g.name).sort();
  assert.deepEqual(JSON.parse(JSON.stringify(names)),['Abonnement','Alimentation','Netflix','Salaire']);
  assert.equal(B2.existingRow('Abonnements',['Abos']),'Abos');assert.equal(B2.existingRow('Courses',['Loyer']),null);
  assert.equal(B2.existingRow('Abonnements',['Abonnements streaming et musique']),'Abonnements streaming et musique');
  assert.equal(B2.existingRow('Abonnements',['Abonnements TV','Abonnements sport']),null);
});

// ── Fiabilité : catégories, dates, relevés qui se chevauchent ──
function setupSheet(rows){const mem={};let snap={sheets:[{id:'y',name:'2026',cells:{},rowHeaders:rows||[],rows:9,cols:12}]};
  const c={window:{safeStore:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);}},FinanceSheet:{getSnapshot:()=>snap,loadSnapshot:s=>{snap=s;}}},TextDecoder,Intl,document:{}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','bank-import.js'),'utf8'),c);
  const B=c.window.GFBankImport;const imp=(csv,mode)=>{const s=B.summarize(B.parse(B._decode(enc(csv))));B.write(s,mode||'replace');return s;};
  const cell=(name,mi)=>{const sh=snap.sheets.find(x=>x.name==='2026');const r=sh.rowHeaders.indexOf(name);const v=sh.cells[r+','+mi];return v?Number(v.raw):null;};
  return {B,imp,cell,snap:()=>snap};}
test('Libellés piégeux : bonne catégorie',()=>{
  const cat=l=>{const c=B.categorize({label:l,amount:-10},{});return c?c[0]:null;};
  assert.equal(cat('VIR SEPA PAUL DURAND'),'Autres dépenses');
  assert.equal(cat('CARTE 12/09 PAUL GARE DE LYON'),'Restaurants');
  assert.equal(cat('PRLV BP ECHEANCE PRET'),'Crédits');
  assert.equal(cat('CARTE 03/09 BP STATION A6'),'Carburant');
  assert.equal(cat('CARTE 05/09 TOTALENERGIES PARIS'),'Carburant');
  assert.equal(cat('CARTE 12/09 SNCF CONNECT'),'Transports');
  assert.equal(cat('PRLV TOTALENERGIES ELECTRICITE'),'Énergie et eau');
  assert.equal(cat('CARTE 06/09 HABITAT PARIS'),'Autres dépenses');
  assert.equal(cat('PRLV OPH HABITAT 75'),'Loyer');
  assert.equal(cat('CARTE KINEPOLIS LOMME'),'Autres dépenses');
  assert.equal(cat('CARTE GERALDINE COIFFURE'),'Autres dépenses');
  assert.equal(cat('VIR RESTOS DU COEUR DON'),'Autres dépenses');
  assert.equal(cat('CARTE SEPHORA EAU DE PARFUM'),'Shopping');
  assert.equal(cat('COTISATION MUTUELLE HARMONIE'),'Santé');
  assert.equal(cat('COTISATION CARTE VISA PREMIER'),'Frais bancaires');
  assert.equal(cat('CARTE AMAZON FRAIS DE PORT'),'Shopping');
});
test('Dates avec heure, format mois/jour, opérations annulées',()=>{
  const ops=B.parse(B._decode(enc('Type,Started Date,Description,Amount,State\nCARD_PAYMENT,2026-09-05 10:12:33,Lidl,-20.00,COMPLETED\nCARD_PAYMENT,2026-09-06 11:00:00,Zara,-50.00,REVERTED\nCARD_PAYMENT,2026-09-07 09:00:00,Fnac,-30.00,PENDING\nTOPUP,2026-09-08 09:00:00,Top-up,100.00,COMPLETED\n')));
  assert.equal(ops.length,2);assert.equal(ops[0].date.d,5);
  const us=B.parse(B._decode(enc('Date,Description,Amount\n09/25/2026,Lidl,-20.00\n10/02/2026,Fnac,-30.00\n')));
  assert.equal(us[0].date.m,8);assert.equal(us[0].date.d,25);assert.equal(us[1].date.m,9);
});
test('Débit différé : le total carte n’est pas compté en plus des paiements',()=>{
  const ops=B.parse(B._decode(enc('Date;Libellé;Montant\n02/09/2026;CARTE 01/09 LIDL;-40,00\n03/09/2026;CARTE 02/09 FNAC;-60,00\n04/09/2026;CARTE 03/09 SNCF;-50,00\n30/09/2026;FACTURE CARTE DU 30/09;-150,00\n')));
  assert.equal(ops.length,3);
});
test('Relevés qui se chevauchent : ni perte ni double compte',()=>{
  const {imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-40,00\n20/09/2026;CARTE LIDL;-60,00\n05/10/2026;CARTE LIDL;-10,00\n');
  assert.equal(cell('Courses',8),100);
  // 2e relevé : du 15 septembre au 31 octobre (septembre partiel)
  const s=imp('Date;Libellé;Montant\n20/09/2026;CARTE LIDL;-60,00\n05/10/2026;CARTE LIDL;-10,00\n25/10/2026;CARTE LIDL;-30,00\n');
  assert.equal(cell('Courses',8),100);assert.equal(cell('Courses',9),40);assert.equal(s.dup,2);
  // Mode « Ajouter » : seules les nouvelles opérations s'ajoutent
  imp('Date;Libellé;Montant\n25/10/2026;CARTE LIDL;-30,00\n28/10/2026;CARTE LIDL;-5,00\n','add');
  assert.equal(cell('Courses',9),45);
});
test('Marchand déplacé puis relevé réimporté : l’ancienne ligne est vidée',()=>{
  const {B,imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n06/09/2026;CARTE LIDL;-20,00\n');
  assert.equal(cell('Abonnements',8),13.49);
  B.saveLearned({'netflix':['Loisirs','Dépense']});
  imp('Date;Libellé;Montant\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n06/09/2026;CARTE LIDL;-20,00\n');
  assert.equal(cell('Loisirs',8),13.49);assert.equal(cell('Abonnements',8),null);assert.equal(cell('Courses',8),20);
});
test('BNP : colonne « Libellé opération » (pas « Catégorie »), paiements « FACTURE CARTE DU … » gardés',()=>{
  const {s,ops}=sum('Compte de chèques ****1234;Solde au 14/10/2026;1234,56\n\nDate opération;Catégorie opération;Sous Catégorie opération;Libellé opération;Montant opération;Pointage opération\n02/09/2026;Alimentation;Supermarché;FACTURE CARTE DU 010926 CARREFOUR MARKET CARTE 4974XXXXXXXX1234;-45,20;0\n03/09/2026;Alimentation;Supermarché;FACTURE CARTE DU 020926 LIDL CARTE 4974XXXXXXXX1234;-30,00;0\n04/09/2026;Transports;Train;FACTURE CARTE DU 030926 SNCF CARTE 4974XXXXXXXX1234;-25,00;0\n05/09/2026;Revenus;Salaire;VIR SEPA RECU /DE ACME SAS /MOTIF SALAIRE SEPT;2 150,00;0\n');
  assert.equal(ops.length,4);assert.equal(total(s,'Courses'),75.2);assert.equal(total(s,'Transports'),25);assert.equal(total(s,'Salaire'),2150);
});
test('Caisse d’Épargne : « Numéro d’opération » n’est pas le libellé ; N26 : la référence complète le libellé',()=>{
  const ce=sum("Date;Numéro d'opération;Libellé;Débit;Crédit;Détail;\n02/09/26;123;CB AUCHAN FACT 010926;-58,30;;CB AUCHAN\n03/09/26;124;VIR SEPA SALAIRE;;2000,00;VIR\n");
  assert.equal(total(ce.s,'Courses'),58.3);assert.equal(total(ce.s,'Salaire'),2000);
  const n26=sum('"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)"\n"2026-09-03","ACME SAS","FR76","Income","Salaire septembre","2000.0"\n"2026-09-05","Spotify","","MasterCard Payment","","-11.12"\n');
  assert.equal(total(n26.s,'Salaire'),2000);assert.equal(total(n26.s,'Abonnements'),11.12);
  assert.equal(n26.ops[0].label,'ACME SAS');
});
test('Débit différé : seules les lignes de total sans commerçant sont écartées',()=>{
  const T=l=>B.parse(B._decode(enc('Date;Libellé;Montant\n02/09/2026;CARTE 01/09 LIDL;-40,00\n03/09/2026;CARTE 02/09 FNAC;-60,00\n04/09/2026;CARTE 03/09 SNCF;-50,00\n30/09/2026;'+l+';-150,00\n'))).length;
  assert.equal(T('RELEVE CARTE 30/09'),3);assert.equal(T('FACTURES CARTES DEBIT DIFFERE'),3);assert.equal(T('TOTAL OPERATIONS CARTE VISA AU 30/09/2026'),3);
  assert.equal(T('FACTURE CARTE DU 290926 DECATHLON'),4);assert.equal(T('CARTE 29/09 TOTAL ACCESS'),4);
});

// ── Points relevés par la relecture ──
test('Total du débit différé : noms courts gardés, mois et « différé » reconnus',()=>{
  const base='Date;Libellé;Montant\n02/09/2026;CARTE 01/09 LIDL;-40,00\n03/09/2026;CARTE 02/09 FNAC;-60,00\n04/09/2026;CARTE 03/09 SNCF;-50,00\n';
  const n=l=>B.parse(B._decode(enc(base+'30/09/2026;'+l+';-150,00\n'))).length;
  assert.equal(n('FACTURE CARTE DU 010926 BP CARTE 4974XXXXXXXX1234'),4);assert.equal(n('FACTURE CARTE DU 020926 H&M CARTE 4974XXXXXXXX1234'),4);
  assert.equal(n('RELEVE CARTE SEPTEMBRE'),3);assert.equal(n('RELEVE DIFFERE CARTE 4974XXXXXXXX1234'),3);
});
test('Catégories qui marchaient avant',()=>{
  const cat=(l,a)=>{const c=B.categorize({label:l,amount:a||-10},{});return c?c[0]:null;};
  assert.equal(cat('CARTE SUPERMARCHE DU CENTRE'),'Courses');assert.equal(cat('CARTE 12/09 CASINO BETHUNE'),'Courses');assert.equal(cat('CB PETIT CASINO BETTON'),'Courses');
  assert.equal(cat('CARTE PAYBYPHONE STATIONNEMENT'),'Transports');assert.equal(cat('PRLV SEPA COTISATION EUROCOMPTE CONFORT'),'Frais bancaires');
  assert.equal(cat('COTISATION VISA PREMIER'),'Frais bancaires');assert.equal(cat('COTISATION JAZZ'),'Frais bancaires');
  assert.equal(cat('CARTE CABINET KINESITHERAPIE'),'Santé');assert.equal(cat('CARTE ESCAPE HUNT'),'Loisirs');assert.equal(cat('VIR SEPA FREE MOBILE'),'Abonnements');
});
test('Dates : ordre lu sur la colonne de date seulement ; heure avec fuseau',()=>{
  const o=B.parse(B._decode(enc('Date,Description,Amount\n09/05/2026,"12/25/2026 order",-10\n10/05/2026,shop,-5\n')));
  assert.equal(o[0].date.m,4);assert.equal(o[0].date.d,9);
  const t=B.parse(B._decode(enc('Date;Libellé;Montant\n03/09/2026T10:22:33Z;A;-1\n01/09/2026 10:00:00 +0200;B;-2\n')));
  assert.equal(t.length,2);
});
test('BNP « Libellé court » + « Libellé opération » : le libellé détaillé est choisi',()=>{
  const o=B.parse(B._decode(enc('Date operation;Libelle court;Type operation;Libelle operation;Montant operation\n02/09/2026;FACTURE CARTE;CB;FACTURE CARTE DU 010926 LIDL CARTE 4974XXXX;-40,00\n03/09/2026;FACTURE CARTE;CB;FACTURE CARTE DU 020926 FNAC CARTE 4974XXXX;-60,00\n')));
  assert.match(o[0].label,/LIDL/);
});
test('Ligne de revenu au nom d’un marchand : pas utilisée pour une dépense',()=>{
  const {imp,cell}=setupSheet(['Salaire','Prime','Courses']);
  imp('Date;Libellé;Montant\n05/09/2026;PRLV SEPA PRIME VIDEO;-6,99\n06/09/2026;CARTE LIDL;-20,00\n');
  assert.equal(cell('Prime',8),null);assert.equal(cell('Abonnements',8),6.99);
});
test('Remplacer : une opération désormais ignorée sort du total',()=>{
  const {B,imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA M DUPONT;-100,00\n06/09/2026;CARTE LIDL;-20,00\n');
  assert.equal(cell('Autres dépenses',8),100);
  assert.equal(B.merchantOf('VIR SEPA M DUPONT'),'dupont');B.saveLearned({'dupont':['','Ignorer']});
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA M DUPONT;-100,00\n06/09/2026;CARTE LIDL;-20,00\n');
  assert.equal(cell('Autres dépenses',8),null);assert.equal(cell('Courses',8),20);
});
test('Ligne renommée dans le tableur : pas recréée au prochain import',()=>{
  const env=setupSheet();
  env.imp('Date;Libellé;Montant\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n06/09/2026;PRLV SEPA SPOTIFY;-11,12\n');
  const sh=env.snap().sheets[0];sh.rowHeaders[sh.rowHeaders.indexOf('Abonnements')]='Abos';
  env.imp('Date;Libellé;Montant\n06/09/2026;PRLV SEPA SPOTIFY;-11,12\n07/09/2026;PRLV SEPA DEEZER;-10,99\n');
  assert.deepEqual(JSON.parse(JSON.stringify(env.snap().sheets[0].rowHeaders)),['Abos']);
  assert.equal(env.cell('Abos',8),35.6);
});

// ── Deuxième relecture ──
test('Deux comptes, même mois, mode Remplacer : rien n’est effacé',()=>{
  const {imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n01/09/2026;PRLV SEPA LOYER FONCIA;-850,00\n15/09/2026;CB LIDL;-40,00\n30/09/2026;CB FNAC;-25,00\n');
  imp('Date;Libellé;Montant\n02/09/2026;CB CARREFOUR;-60,00\n28/09/2026;PRLV SEPA NETFLIX;-13,49\n');
  assert.equal(cell('Courses',8),100);assert.equal(cell('Loyer',8),850);assert.equal(cell('Shopping',8),25);
  // export « cartes seulement » du même mois : le loyer reste
  imp('Date;Libellé;Montant\n15/09/2026;CB LIDL;-40,00\n30/09/2026;CB FNAC;-25,00\n');
  assert.equal(cell('Loyer',8),850);assert.equal(cell('Courses',8),100);
});
test('Débit différé : carte masquée « X1234 » et mois abrégé',()=>{
  const base='Date;Libellé;Montant\n02/09/2026;CB LIDL;-40,00\n03/09/2026;CB FNAC;-60,00\n04/09/2026;CB SNCF;-50,00\n';
  const n=l=>B.parse(B._decode(enc(base+'30/09/2026;'+l+';-300,00\n'))).length;
  assert.equal(n('RELEVE CARTE X1234'),3);assert.equal(n('FACTURE CARTE X4567 DU 30/09'),3);assert.equal(n('DEBIT DIFFERE CARTE X1234 SEPT'),3);
  assert.equal(n('CB XEFI INFORMATIQUE'),4);
});
test('Ligne du marchand supprimée par toi : pas recréée, va dans sa catégorie',()=>{
  const env=setupSheet(['Netflix','Abonnements']);
  env.imp('Date;Libellé;Montant\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n06/09/2026;CB LIDL;-20,00\n');
  assert.equal(env.cell('Netflix',8),13.49);
  const sh=env.snap().sheets[0];const ci=sh.rowHeaders.indexOf('Courses');sh.rowHeaders=['Abonnements','Courses'];sh.cells={'0,8':{raw:'-24.61'},'1,8':sh.cells[ci+',8']};
  env.imp('Date;Libellé;Montant\n20/09/2026;PRLV SEPA DEEZER;-10,99\n21/09/2026;CB LIDL;-5,00\n');
  assert.deepEqual(JSON.parse(JSON.stringify(env.snap().sheets[0].rowHeaders)),['Abonnements','Courses']);
  assert.equal(env.cell('Abonnements',8),24.48);
});

// ── Tableur propre ──
test('Épargne : le virement va dans la ligne « Livret A » existante',()=>{
  const {imp,cell,snap}=setupSheet(['Salaire','Courses','Livret A']);
  imp('Date;Libellé;Montant\n20/09/2026;VIR VERS LIVRET A;-100,00\n21/09/2026;CB LIDL;-20,00\n');
  assert.equal(cell('Livret A',8),100);assert.equal(snap().sheets[0].rowHeaders.includes('Épargne'),false);
});
test('Nouvelles lignes rangées : revenus en haut, dépenses avant l’épargne, formules décalées',()=>{
  const {imp,snap}=setupSheet(['Salaire','Courses','Livret A']);
  const sh0=snap().sheets[0];sh0.cells={'1,0':{raw:'-30'},'2,0':{raw:'-50'},'3,0':{raw:'=A2+A3'}};sh0.rowHeaders.push('Total');
  imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-15,00\n06/09/2026;VIR CAF ALLOCATIONS;100,00\n07/09/2026;CB LIDL;-20,00\n');
  const sh=snap().sheets[0];
  assert.deepEqual(JSON.parse(JSON.stringify(sh.rowHeaders)),['Salaire','Aides (CAF)','Courses','Restaurants','Livret A','Total']);
  assert.equal(sh.cells['5,0'].raw,'=A3+A5');// « =A2+A3 » suit Courses (ligne 3) et Livret A (ligne 5)
  assert.equal(sh.cells['4,0'].raw,'-50');
  // tableur vide : salaire en premier, épargne en dernier
  const e=setupSheet();e.imp('Date;Libellé;Montant\n05/09/2026;VIR VERS LIVRET A;-100,00\n06/09/2026;CB LIDL;-20,00\n07/09/2026;VIR SEPA SALAIRE ACME;2000,00\n08/09/2026;CB UBER EATS;-35,00\n');
  assert.deepEqual(JSON.parse(JSON.stringify(e.snap().sheets[0].rowHeaders)),['Salaire','Restaurants','Courses','Épargne']);
});
test('Total différé déjà importé : retiré quand il est écarté au relevé suivant',()=>{
  const {imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n30/09/2026;RELEVE CARTE;-60,00\n12/09/2026;CB LIDL;-20,00\n15/09/2026;CB FNAC;-40,00\n');
  assert.equal(cell('Autres dépenses',8),60);
  imp('Date;Libellé;Montant\n30/09/2026;RELEVE CARTE;-60,00\n12/09/2026;CB LIDL;-20,00\n15/09/2026;CB FNAC;-40,00\n20/09/2026;CB LIDL;-0,01\n');
  assert.equal(cell('Autres dépenses',8),null);
});
test('Même opération sur deux comptes (colonne compte) : comptée deux fois',()=>{
  const {imp,cell}=setupSheet();
  const f=acc=>'dateOp;label;amount;accountNum\n05/09/2026;PRLV SEPA SPOTIFY;-11,12;'+acc+'\n06/09/2026;CB LIDL;-1,00;'+acc+'\n';
  imp(f('0001'));imp(f('0002'));
  assert.equal(cell('Abonnements',8),22.24);
  imp(f('0001'));assert.equal(cell('Abonnements',8),22.24);
});
test('Ligne renommée librement : les opérations la suivent',()=>{
  const env=setupSheet(['Alimentation']);
  env.imp('Date;Libellé;Montant\n05/09/2026;CB LIDL;-20,00\n06/09/2026;CB AUCHAN;-1,00\n');
  const sh=env.snap().sheets[0];sh.rowHeaders[0]='Bouffe';env.B.renameRow('Alimentation','Bouffe','2026');
  env.imp('Date;Libellé;Montant\n15/09/2026;CB LIDL;-5,00\n16/09/2026;CB LIDL;-6,00\n');
  assert.deepEqual(JSON.parse(JSON.stringify(env.snap().sheets[0].rowHeaders)),['Bouffe']);assert.equal(env.cell('Bouffe',8),32);
});

// ── Quatrième relecture ──
test('Même relevé, en-tête différent : pas compté deux fois',()=>{
  const {imp,cell}=setupSheet();
  imp('Date;Libellé;Montant\n05/09/2026;CB LIDL;-20,00\n06/09/2026;CB FNAC;-30,00\n');
  imp('"Date";"Libellé";"Montant";"Solde"\n05/09/2026;CB LIDL;-20,00;100\n06/09/2026;CB FNAC;-30,00;70\n');
  assert.equal(cell('Courses',8),20);assert.equal(cell('Shopping',8),30);
});
test('Ligne « Total dépenses » : la nouvelle ligne de dépense entre dans sa somme',()=>{
  const {imp,snap}=setupSheet(['Salaire','Loyer','Courses','Total dépenses']);
  const sh0=snap().sheets[0];sh0.cells={'1,8':{raw:'-800'},'2,8':{raw:'-100'},'3,8':{raw:'=SUM(I2:I3)'},'0,8':{raw:'2000'}};
  imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-30,00\n06/09/2026;CB LIDL;-100,00\n');
  const sh=snap().sheets[0];
  assert.deepEqual(JSON.parse(JSON.stringify(sh.rowHeaders)),['Salaire','Loyer','Courses','Restaurants','Total dépenses']);
  assert.equal(sh.cells['4,8'].raw,'=SUM(I2:I4)');
});
test('Formules : références et plages décalées une seule fois',()=>{
  const {imp,snap}=setupSheet(['Salaire','Courses','Livret A','Reste']);
  const sh0=snap().sheets[0];sh0.cells={'0,0':{raw:'2000'},'1,0':{raw:'-50'},'2,0':{raw:'-100'},'3,0':{raw:'=A1+SUM(A2:A3)-a3'}};
  imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-30,00\n06/09/2026;CB LIDL;-10,00\n');
  // Restaurants arrive après Courses (ligne 3) : Livret A passe en 4, Reste en 5
  const sh=snap().sheets[0];assert.equal(sh.rowHeaders.indexOf('Restaurants'),2);
  assert.equal(sh.cells['4,0'].raw,'=A1+SUM(A2:A4)-A4');
});
test('« Péage » n’est pas une ligne d’épargne ; « CEL » ne trouve pas « Céline »',()=>{
  const {imp,cell,snap}=setupSheet(['Salaire','Péage','Loyer']);
  imp('Date;Libellé;Montant\n20/09/2026;VIR VERS LIVRET A;-200,00\n21/09/2026;CB LIDL;-1,00\n');
  assert.equal(cell('Péage',8),null);assert.equal(cell('Épargne',8),200);
  const e=setupSheet(['Salaire','CEL']);e.imp('Date;Libellé;Montant\n20/09/2026;VIR VERS EPARGNE CELINE;-50,00\n21/09/2026;CB LIDL;-1,00\n');
  assert.equal(e.cell('CEL',8),null);
});
test('Renommer une ligne en 2026 ne touche pas 2025 ; renommer vers un nom existant ne compte pas deux fois',()=>{
  const env=setupSheet(['Alimentation']);const sn=env.snap();sn.sheets.push({id:'y25',name:'2025',cells:{},rowHeaders:['Alimentation'],rows:9,cols:12});
  env.imp('Date;Libellé;Montant\n05/09/2026;CB LIDL;-20,00\n06/09/2025;CB LIDL;-7,00\n');
  sn.sheets[0].rowHeaders[0]='Bouffe';env.B.renameRow('Alimentation','Bouffe','2026');
  env.imp('Date;Libellé;Montant\n15/09/2025;CB LIDL;-10,00\n16/09/2025;CB AUCHAN;-0,50\n');
  const s25=env.snap().sheets.find(s=>s.name==='2025');assert.deepEqual(JSON.parse(JSON.stringify(s25.rowHeaders)),['Alimentation']);
  assert.equal(Number(s25.cells['0,8'].raw),17.5);
  const d=setupSheet(['Courses','Restaurants']);d.imp('Date;Libellé;Montant\n05/09/2026;CB LIDL;-20,00\n06/09/2026;CB UBER EATS;-30,00\n');
  d.snap().sheets[0].rowHeaders[0]='Restaurants';d.B.renameRow('Courses','Restaurants','2026');
  d.imp('Date;Libellé;Montant\n15/09/2026;CB LIDL;-5,00\n16/09/2026;CB LIDL;-6,00\n');
  const sh=d.snap().sheets[0];const total=[0,1].reduce((t,i)=>t+Number((sh.cells[i+',8']||{raw:0}).raw),0);
  assert.equal(Math.round(total*100)/100,61);
});

// ── Cinquième relecture ──
test('Ligne de sous-total ou « Dépenses globales » : la nouvelle ligne va au-dessus et entre dans la somme',()=>{
  const {imp,snap}=setupSheet(['Salaire','Loyer','Courses','Dépenses globales']);
  snap().sheets[0].cells={'0,8':{raw:'2000'},'1,8':{raw:'-800'},'2,8':{raw:'-100'},'3,8':{raw:'=SUM(I2:I3)'}};
  imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-30,00\n06/09/2026;CB LIDL;-100,00\n');
  let sh=snap().sheets[0];assert.deepEqual(JSON.parse(JSON.stringify(sh.rowHeaders)),['Salaire','Loyer','Courses','Restaurants','Dépenses globales']);assert.equal(sh.cells['4,8'].raw,'=SUM(I2:I4)');
  const e=setupSheet(['Courses','Sous-total dépenses','Livret A']);e.snap().sheets[0].cells={'0,8':{raw:'-100'},'1,8':{raw:'=SUM(I1:I1)'}};
  e.imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-30,00\n06/09/2026;CB LIDL;-100,00\n');
  sh=e.snap().sheets[0];assert.equal(sh.rowHeaders.indexOf('Restaurants'),1);assert.equal(sh.cells['2,8'].raw,'=SUM(I1:I2)');
});
test('Deux lignes du même nom de types différents : la dépense va dans la ligne de dépense, l’autre n’est pas effacée',()=>{
  const env=setupSheet(['Salaire','Divers','Loyer','Divers']);
  env.snap().sheets[0].cells={'1,8':{raw:'50'},'3,8':{raw:'-40'}};
  env.B.saveLearned({'chez marcel':['Divers','Dépense']});
  const rules={};rules['divers']='Dépense';
  env.imp('Date;Libellé;Montant\n05/09/2026;CARTE CHEZ MARCEL;-15,00\n06/09/2026;CB LIDL;-1,00\n');
  const sh=env.snap().sheets[0];assert.equal(sh.cells['1,8'].raw,'50');
});
test('Nouvelle année sans feuille : suit le renommage de la dernière année',()=>{
  const env=setupSheet(['Alimentation']);
  env.imp('Date;Libellé;Montant\n05/09/2026;CB LIDL;-20,00\n06/09/2026;CB AUCHAN;-1,00\n');
  env.snap().sheets[0].rowHeaders[0]='Bouffe';env.B.renameRow('Alimentation','Bouffe','2026');
  env.imp('Date;Libellé;Montant\n05/01/2027;CB LIDL;-9,00\n06/01/2027;CB AUCHAN;-1,00\n');
  const s27=env.snap().sheets.find(s=>s.name==='2027');assert.deepEqual(JSON.parse(JSON.stringify(s27.rowHeaders)),['Bouffe']);
});
test('« Total Energies » est un fournisseur, pas une ligne de total',()=>{
  const {imp,snap}=setupSheet(['Salaire','Total Energies','Courses','Total dépenses']);
  imp('Date;Libellé;Montant\n05/09/2026;CB UBER EATS;-30,00\n06/09/2026;CB LIDL;-10,00\n');
  assert.deepEqual(JSON.parse(JSON.stringify(snap().sheets[0].rowHeaders)),['Salaire','Total Energies','Courses','Restaurants','Total dépenses']);
});

// ── Audit CSV (toutes banques, toutes situations) ──
test('Argent reçu d’un proche, retraites, Caisse d’Épargne, prêts',()=>{
  const cat=(l,a)=>{const c=B.categorize({label:l,amount:a},{});return c?c[0]:'(ignoré)';};
  assert.equal(cat('VIREMENT DE MAMAN',100),'Autres revenus');assert.equal(cat('VIR DE MARIE DUPONT',50),'Autres revenus');
  assert.equal(cat('VIR VERS MATHIEU',-30),'Autres dépenses');assert.equal(cat('VIR VERS MON LIVRET A',-100),'Épargne');
  assert.equal(cat('VIREMENT DE MON COMPTE COURANT',200),'(ignoré)');// compte courant : pas de l'épargne, ignoré
  assert.equal(cat('AGIRC ARRCO RETRAITE COMPLEMENTAIRE',412),'Salaire');assert.equal(cat('CARSAT PENSION RETRAITE',1200),'Salaire');
  assert.equal(cat('RETRAIT DAB 12/09',-40),'Retraits');assert.equal(cat('PRLV PENSION ALIMENTAIRE',-300),'Autres dépenses');
  assert.equal(cat('PRLV SEPA CAISSE D EPARGNE ECHEANCE PRET',-350),'Crédits');assert.equal(cat('FRAIS CAISSE D EPARGNE COTISATION',-12),'Frais bancaires');
  assert.equal(cat('PRLV COFIDIS',-250),'Crédits');assert.equal(cat('COTISATION URSSAF',-412),'Impôts');assert.equal(cat('PRLV SEPA TAXE HABITATION',-600),'Impôts');
  assert.equal(cat('CB UBER *EATS',-20),'Restaurants');assert.equal(cat('CB DISNEYLAND PARIS',-90),'Loisirs');assert.equal(cat('PRLV ACTION LOGEMENT',-150),'Loyer');
  assert.equal(cat('AMZN MKTP FR',-30),'Shopping');assert.equal(cat('VIR CPAM REMBOURSEMENT',25),'Santé');assert.equal(cat('VIR SALARY ACME',2000),'Salaire');
  assert.equal(cat('Top-Up by *1234',100),'(ignoré)');assert.equal(cat('Savings plan execution',-950),'Épargne');
});
test('Guillemet seul dans un libellé : la suite du fichier est gardée',()=>{
  const o=B.parse(B._decode(enc('Date;Libellé;Montant\n04/09/2026;CB BRICO 1/2" RACCORD;-12,00\n05/09/2026;PRLV EDF;-60,00\n06/09/2026;PRLV LOYER;-850,00\n07/09/2026;"CB LIDL ""PROMO""";-20,00\n')));
  assert.equal(o.length,4);assert.equal(o[3].label,'CB LIDL "PROMO"');
});
test('Devises, apostrophes suisses, signe moins typographique, sens D/C',()=>{
  const B2=B;assert.equal(B2.parse(B2._decode(enc('Date,Description,Amount\n09/25/2026,Lidl,"$1,234.56"\n09/26/2026,Fnac,-$45.20\n')))[1].amount,-45.2);
  const ch=B2.parse(B2._decode(enc("Date;Texte;Montant\n02.09.2026;Salaire;6'500.00\n03.09.2026;Loyer;-1'850.00\n")));assert.equal(ch[1].amount,-1850);
  const mn=B2.parse(B2._decode(enc('Date;Libellé;Montant\n02/09/2026;CB LIDL;−45,20\n03/09/2026;CB FNAC;-1,00\n')));assert.equal(mn[0].amount,-45.2);
  const dc=B2.parse(B2._decode(enc('Date;Libellé;Montant;Sens\n02/09/2026;CB LIDL;45,20;D\n03/09/2026;VIR SALAIRE;2000,00;C\n')));assert.equal(dc[0].amount,-45.2);assert.equal(dc[1].amount,2000);
});
test('KBC « Valeur » est une date, Revolut Business prend le montant en euros, PayPal « Brut »',()=>{
  const k=B.parse(B._decode(enc('Date;Valeur;Montant;Description\n02/09/2026;02/09/2026;-12,50;DELHAIZE\n03/09/2026;03/09/2026;2000,00;SALAIRE\n')));assert.equal(k.length,2);assert.equal(k[0].amount,-12.5);
  const rb=B.parse(B._decode(enc('Date started (UTC),Description,Orig amount,Orig currency,Amount,Payment currency\n2026-09-02,AWS,-120.00,USD,-110.50,EUR\n2026-09-03,Client,500.00,EUR,500.00,EUR\n')));assert.equal(rb[0].amount,-110.5);
  const pp=B.parse(B._decode(enc('"Date","Heure","Nom","Type","État","Devise","Brut"\n"02/09/2026","10:00","Steam","Paiement Express Checkout","Terminé","EUR","-19,99"\n"03/09/2026","10:00","Vinted","Paiement","Refusé","EUR","-30,00"\n"04/09/2026","10:00","","Virement bancaire sur le compte PayPal","Terminé","EUR","25,00"\n')));
  assert.equal(pp.length,1);assert.equal(pp[0].label,'Steam');assert.equal(pp.dropped.length,1);
});
test('Ligne de solde ignorée ; relevé d’une seule opération accepté ; UTF-16 BE',()=>{
  assert.equal(B.parse(B._decode(enc('Date;Libellé;Montant\n02/09/2026;CB LIDL;-20,00\n30/09/2026;NOUVEAU SOLDE;1234,56\n'))).length,1);
  assert.equal(B.parse(B._decode(enc('Date;Libellé;Montant\n02/09/2026;CB LIDL;-20,00\n'))).length,1);
  const txt='Date;Libellé;Montant\n02/09/2026;CB LIDL;-20,00\n03/09/2026;CB FNAC;-5,00\n';const be=Buffer.alloc(2+txt.length*2);be[0]=0xFE;be[1]=0xFF;for(let i=0;i<txt.length;i++)be.writeUInt16BE(txt.charCodeAt(i),2+i*2);
  assert.equal(B.parse(B._decode(be.buffer.slice(be.byteOffset,be.byteOffset+be.length))).length,2);
});
test('Tableau de budget par mois : importé comme tableau, sans fenêtre « pas un relevé »',async()=>{
  const c2={window:{},TextDecoder,Intl,document:{}};vm.createContext(c2);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','bank-import.js'),'utf8'),c2);
  const f={name:'budget.csv',size:40,arrayBuffer:async()=>enc('Ligne;Janvier;Février\nSalaire;2000;2000\nLoyer;-700;-700\n')};
  assert.equal(await c2.window.GFBankImport.handle(f),false);
});
test('Revue finale : soldes, sens +/-, montants, virements, prêts',()=>{
  const cat=(l,a=-10)=>{const c=B.categorize({label:l,amount:a},{});return c?c[0]:null;};
  // « Solde » seul ou avec une date : ligne de solde ; un libellé qui commence par « solde » mais parle d'autre chose est gardé
  const {ops}=sum('Date;Libellé;Montant\n01/09/2026;SOLDE AU 01/09/2026;1200,00\n02/09/2026;SOLDES ETE ZARA;-30,00\n03/09/2026;CARTE MONOPRIX;-12,00\n30/09/2026;NOUVEAU SOLDE EN EUR;1158,00');
  assert.equal(JSON.stringify(ops.map(o=>o.label)),JSON.stringify(['SOLDES ETE ZARA','CARTE MONOPRIX']));
  const s2=sum('Date;Libellé;Montant;Sens\n02/09/2026;CARTE FNAC;25,00;-\n03/09/2026;VIR SALAIRE ACME;1800,00;+').ops;
  assert.equal(JSON.stringify(s2.map(o=>o.amount)),'[-25,1800]');
  assert.equal(B._amount('0,500'),0.5);assert.equal(B._amount('1.234,50'),1234.5);assert.equal(B._amount('1,234.50'),1234.5);

  assert.notEqual(cat('CARTE 05/09 PRET A PORTER LYON'),'Crédits');
  assert.equal(cat('PRLV ECHEANCE PRET IMMO HABITAT'),'Crédits');
  assert.equal(cat('VIR SEPA COMPTE A COMPTE'),'Épargne');
  assert.equal(cat('VIR VERS COMPTE JOINT'),null);// compte joint : ignoré
  assert.notEqual(cat('VIR SEPA VERS COMPTE DUPONT'),null);// un virement à quelqu'un n'est pas un transfert interne
  assert.notEqual(cat('CARTE TOP UP FITNESS'),null);
  assert.equal(cat('Top-up by *1234',50),null);
  assert.equal(cat('General Card Deposit',50),null);
  assert.notEqual(cat('PRLV CAISSE RETRAITE COMPLEMENTAIRE'),'Salaire');
});
test('Tableau de budget repéré par des cellules de mois entières, pas par un libellé',()=>{
  assert.equal(B._monthTable('Ligne;Janvier;Février;Mars\nLoyer;700;700;700'),true);
  assert.equal(B._monthTable('Category;Jan 2026;Feb 2026\nRent;700;700'),true);
  assert.equal(B._monthTable('Date;Libellé;Montant\n02/05/2026;CARTE MAISON DU MONDE MAI;-20\n03/05/2026;DECATHLON MARSEILLE;-30'),false);
});
test('Lignes existantes : « Revenu » reçoit les autres revenus, « Essence » ne reçoit que le carburant',()=>{
  const env=setupSheet(['Revenu','Essence','Courses']);
  const s=env.imp('Date;Libellé;Montant\n05/09/2026;VIR M DUPONT REMBOURSEMENT;120,00\n06/09/2026;CARTE SNCF CONNECT;-45,00\n07/09/2026;CARTE TOTALENERGIES STATION;-60,00\n08/09/2026;VIR SALAIRE ACME;1500,00\n');
  const names=s.groups.map(g=>g.name);
  assert.ok(!names.includes('Autres revenus'));assert.ok(names.includes('Revenu'));
  assert.equal(total(s,'Revenu'),1620);assert.equal(total(s,'Essence'),60);assert.equal(total(s,'Transports'),45);
  const env2=setupSheet(['Salaire','Transport']);
  const s2=env2.imp('Date;Libellé;Montant\n07/09/2026;CARTE ESSO EXPRESS;-50,00\n08/09/2026;CARTE SNCF;-20,00\n');
  assert.equal(total(s2,'Transport'),70);// pas de ligne « Essence » : le carburant va dans « Transport »
});

// ── Assistant d'import : virements entre comptes, doublons, opérations à classer, mois déjà remplis ──
test('Virement entre tes comptes : compte comme de l’épargne (sortie = +, retour = −) ; recharges ignorées',()=>{
  const {B,imp,cell}=setupSheet(['Salaire','Courses','Épargne']);
  const s=imp('Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-20,00\n05/09/2026;VIREMENT INTERNE VERS COMPTE EPARGNE;-300,00\n09/09/2026;VIR DE MON LIVRET A;100,00\n10/09/2026;TOP-UP BY *1234;50,00\n11/09/2026;Exchanged to USD;-40,00\n12/09/2026;VIREMENT DE MON COMPTE COURANT;80,00\n');
  assert.equal(total(s,'Épargne'),200);// 300 − 100 (le retour depuis le compte courant n'est pas de l'épargne : ignoré)
  assert.equal(s.wallet,3);assert.equal(s.ignored,3);
  assert.equal(cell('Épargne',8),200);// même sens que le reste du tableur (montants positifs)
  const rows=s.rows;
  assert.equal(rows.filter(r=>r.internal).length,2);// les deux virements vers / depuis l'épargne
  assert.equal(rows.filter(r=>r.status==='ignored'&&r.ig==='wallet').length,3);
  // Choisir « Ignorer » pour ce virement le sort du total
  const fp=rows.find(r=>/INTERNE/.test(r.label)).fp;
  const B2=setupSheet([]).B;const s2=B2.summarize(B2.parse(B2._decode(enc('Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-20,00\n05/09/2026;VIREMENT INTERNE VERS COMPTE EPARGNE;-300,00\n'))),{},{ovr:{[fp]:['','Ignorer']}});
  assert.equal(total(s2,'Épargne'),0);assert.equal(s2.byRule,1);
  // Ou le ranger ailleurs
  const s3=B2.summarize(B2.parse(B2._decode(enc('Date;Libellé;Montant\n05/09/2026;VIREMENT INTERNE VERS COMPTE EPARGNE;-300,00\n'))),{},{ovr:{[fp]:['Loisirs','Dépense']}});
  assert.equal(total(s3,'Loisirs'),300);
});
test('Doublons : repérés, non repris par défaut, recomptés si on le demande',()=>{
  const {B,imp,cell}=setupSheet(['Salaire','Courses']);
  imp('Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-20,00\n05/09/2026;VIR SALAIRE ACME;1500,00\n');
  const csv='Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-20,00\n05/09/2026;VIR SALAIRE ACME;1500,00\n07/09/2026;CARTE LIDL;-30,00\n';
  const ops=B.parse(B._decode(enc(csv)));
  const s=B.summarize(ops);
  assert.equal(s.dupCount,2);assert.equal(s.newCount,1);
  assert.equal(s.rows.map(r=>r.status).sort().join(),'dup,dup,ok');
  assert.equal(total(s,'Courses'),30);// seul le nouveau est affiché dans les totaux
  // Forcer l'import d'une opération déjà importée
  const dupFp=s.rows.find(r=>r.status==='dup'&&/LIDL/.test(r.label)).fp;
  const s2=B.summarize(B.parse(B._decode(enc(csv))),{},{inc:{[dupFp]:true}});
  assert.equal(s2.dupCount,1);assert.equal(s2.newCount,2);assert.equal(total(s2,'Courses'),50);
  assert.equal(s2.rows.find(r=>r.fp===dupFp).forced,true);
  // Écrit en mode Ajouter : le doublon forcé s'ajoute, l'autre non
  B.write(s2,'add');assert.equal(cell('Courses',8),70);// −20 déjà là, + −20 forcé, + −30 nouveau
});
test('À classer : opérations inconnues regroupées par marchand, choix par marchand ou par opération',()=>{
  const {B}=setupSheet(['Salaire','Courses']);
  const csv='Date;Libellé;Montant\n02/09/2026;CARTE BOUTIQUE XYZ;-25,00\n09/09/2026;CARTE BOUTIQUE XYZ 0909;-12,00\n10/09/2026;VIR M DUPONT;120,00\n11/09/2026;CARTE LIDL;-10,00\n';
  const s=B.summarize(B.parse(B._decode(enc(csv))));
  assert.equal(s.unknown.length,2);
  const x=s.unknown.find(u=>/XYZ/.test(u.label));assert.equal(x.count,2);assert.equal(x.total,-37);assert.equal(x.fps.length,2);
  assert.equal(s.rows.filter(r=>r.unk).length,3);assert.ok(!s.rows.find(r=>/LIDL/.test(r.label)).unk);
  // Un choix par marchand règle toutes ses opérations
  const s2=B.summarize(B.parse(B._decode(enc(csv))),{[x.key]:['Loisirs','Dépense']});
  assert.equal(s2.unknown.length,1);assert.equal(total(s2,'Loisirs'),37);
  // Ignorer
  const s3=B.summarize(B.parse(B._decode(enc(csv))),{[x.key]:['','Ignorer']});
  assert.equal(s3.unknown.length,1);assert.equal(s3.ignored,2);
});
test('En attente / annulée / total différé : comptés à part, jamais importés',()=>{
  const {B}=setupSheet([]);
  const s=B.summarize(B.parse(B._decode(enc('Date;Libellé;Montant;Statut\n02/09/2026;CARTE LIDL;-20,00;\n03/09/2026;CARTE FNAC;-30,00;EN ATTENTE\n04/09/2026;CARTE ZARA;-40,00;REFUSÉ\n05/09/2026;CARTE SNCF;-15,00;\n06/09/2026;CARTE LIDL;-12,00;\n07/09/2026;FACTURE CARTE DU 30/09;-47,00;\n'))));
  assert.equal(s.pending,2);assert.equal(s.deferred,1);assert.equal(s.rows.length,6);assert.equal(s.rows.filter(r=>r.status==="dropped").length,3);
});
test('Mois déjà remplis : montants du tableur et du relevé pour chaque ligne concernée',()=>{
  const env=setupSheet(['Salaire','Courses','Loyer']);
  env.imp('Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-40,00\n03/09/2026;VIR SALAIRE ACME;1800,00\n');
  const s=env.B.summarize(env.B.parse(env.B._decode(enc('Date;Libellé;Montant\n10/09/2026;CARTE LIDL;-25,00\n01/10/2026;PRLV LOYER FONCIA;-700,00\n'))));
  const c=env.B._conflicts(s);
  assert.equal(c.length,1);assert.equal(c[0].d.m,8);// septembre seulement : octobre est vide
  assert.equal(c[0].rows.length,1);assert.equal(c[0].rows[0].name,'Courses');assert.equal(c[0].rows[0].stmt,25);
  assert.equal(c[0].rows[0].sheet,40);assert.equal(c[0].rows[0].sign,1);
});
test('Plusieurs mois et plusieurs années : une feuille par année, créée si besoin',()=>{
  const {B,snap}=setupSheet(['Salaire','Courses']);
  const s=B.summarize(B.parse(B._decode(enc('Date;Libellé;Montant\n15/12/2025;CARTE LIDL;-40,00\n20/01/2026;CARTE LIDL;-50,00\n20/03/2027;CARTE LIDL;-60,00\n'))));
  assert.equal(s.months.length,3);B.write(s,'replace');
  assert.equal(snap().sheets.map(x=>x.name).sort().join(),'2025,2026,2027');
});
test('Devise étrangère : seul le montant en euros compte',()=>{
  const {B}=setupSheet([]);
  const s=B.summarize(B.parse(B._decode(enc('Date;Libellé;Montant (EUR);Montant (devise);Devise\n02/09/2026;CARTE TESCO LONDON;-23,50;-20,00;GBP\n'))));
  assert.equal(total(s,'Courses'),23.5);
});
test('Confidentialité : le registre des doublons ne garde aucun libellé',()=>{
  const mem={};const c={window:{safeStore:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);}},FinanceSheet:{getSnapshot:()=>({sheets:[{id:'y',name:'2026',cells:{},rowHeaders:[],rows:9,cols:12}]}),loadSnapshot:()=>{}}},TextDecoder,Intl,document:{}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','bank-import.js'),'utf8'),c);const B2=c.window.GFBankImport;
  B2.write(B2.summarize(B2.parse(B2._decode(enc('Date;Libellé;Montant\n02/09/2026;CARTE BOUTIQUE SECRETE DUPONT;-25,00\n')))),'replace');
  const all=Object.values(mem).join('|');assert.ok(!/SECRETE|DUPONT|secrete|dupont/i.test(all),'un libellé est resté dans le stockage');
});

test('Un choix retenu vaut pour tout le commerçant, même avec une autre ville ou un autre numéro',()=>{
  const {B}=setupSheet(['Loisirs']);
  const parse=(c)=>B.parse(B._decode(enc(c)));
  const extra={'qwerty shop':['Loisirs','Loisirs','Dépense']};
  const s=B.summarize(parse('Date;Libellé;Montant\n11/11/2026;CARTE QWERTY SHOP LYON;-9,00\n12/11/2026;CARTE QWERTY SHOP PARIS 15;-4,00\n13/11/2026;CARTE AUTRE TRUC;-3,00\n'),extra);
  const lo=s.groups.find(g=>g.name==='Loisirs');
  assert.equal(lo&&lo.count,2);
  assert.equal(s.unknown.length,1);
  // Un même commerçant n'est demandé qu'une fois, quelle que soit la ville
  const u=B.summarize(parse('Date;Libellé;Montant\n11/11/2026;CARTE ZORBA GRILL LYON;-9,00\n12/11/2026;CARTE ZORBA GRILL NICE;-4,00\n'));
  assert.equal(u.unknown.length,1);assert.equal(u.unknown[0].count,2);
});

test('Tout réimporter en mode Remplacer : le mois reste égal au fichier, rien n’est compté deux fois',()=>{
  const {B,imp,cell}=setupSheet(['Salaire','Courses']);
  const csv='Date;Libellé;Montant\n02/09/2026;CARTE LIDL;-20,00\n05/09/2026;VIR SALAIRE ACME;1600,00\n07/09/2026;CARTE LIDL;-30,00\n';
  imp(csv);assert.equal(cell('Salaire',8),1600);assert.equal(cell('Courses',8),50);
  const ops=()=>B.parse(B._decode(enc(csv)));
  const s0=B.summarize(ops());const inc={};s0.rows.forEach(r=>{if(r.status==='dup')inc[r.fp]=true;});
  assert.equal(Object.keys(inc).length,3);
  const s=B.summarize(ops(),{},{inc});B.write(s,'replace');
  assert.equal(cell('Salaire',8),1600,'salaire non doublé');assert.equal(cell('Courses',8),50,'courses non doublées');
  // Et le relevé suivant reste correct (le registre n'a pas gardé de doublon)
  imp(csv);assert.equal(cell('Salaire',8),1600);assert.equal(cell('Courses',8),50);
});

test('Repartir de ce relevé : un salaire importé deux fois par deux exports différents n\u2019est plus compté deux fois',()=>{
  const {B,imp,cell}=setupSheet(['Salaire']);
  // Deux exports du même mois avec des libellés différents : deux empreintes, donc deux opérations dans le registre
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA SALAIRE ACME;1600,00\n');
  imp('Date;Libellé;Montant\n05/09/2026;VIREMENT SALAIRE ACME SAS;1600,00\n','add');
  assert.equal(cell('Salaire',8),3200);
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA SALAIRE ACME;1600,00\n','replace');
  assert.equal(cell('Salaire',8),3200,'Remplacer garde les anciennes opérations du registre');
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA SALAIRE ACME;1600,00\n','fresh');
  assert.equal(cell('Salaire',8),1600,'Repartir de ce relevé efface le doublon');
  imp('Date;Libellé;Montant\n05/09/2026;VIR SEPA SALAIRE ACME;1600,00\n','replace');
  assert.equal(cell('Salaire',8),1600);
});
