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
test('Virgule anglaise, dates ISO, virement interne ignoré',()=>{
  const {s}=sum('Date,Description,Amount\n2026-09-01,"Transfert interne vers compte joint",-300.00\n2026-09-02,"Boulangerie Paul",-6.40\n2026-09-03,"Unknown shop",-15.00\n');
  assert.equal(s.ignored,1);assert.equal(total(s,'Restaurants'),6.4);assert.equal(total(s,'Autres dépenses'),15);
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
