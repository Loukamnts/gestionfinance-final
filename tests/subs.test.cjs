// Abonnements détectés dans les relevés importés.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
function setup(){const mem={};const ctx={window:{safeStore:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);}}},TextDecoder,Intl,document:{}};vm.createContext(ctx);
  for(const f of ['bank-import.js','subs.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);return ctx.window;}
const enc=s=>new TextEncoder().encode(s).buffer;
function ops(W,csv){return W.GFBankImport.parse(W.GFBankImport._decode(enc(csv)));}
const CSV='Date;Libellé;Montant\n'+
 '05/08/2026;PRLV SEPA NETFLIX;-13,49\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n05/10/2026;PRLV SEPA NETFLIX;-15,99\n'+
 '10/08/2026;PRLV SEPA SALLE MOVE CLUB;-29,90\n10/09/2026;PRLV SEPA SALLE MOVE CLUB;-29,90\n10/10/2026;PRLV SEPA SALLE MOVE CLUB;-29,90\n'+
 '02/09/2026;CARTE 02/09 LIDL;-45,20\n09/09/2026;CARTE 09/09 LIDL;-38,10\n03/10/2026;CARTE 03/10 LIDL;-52,10\n'+
 '01/09/2026;CARTE 01/09 BOUTIQUE UNIQUE;-80,00\n'+
 '03/09/2026;VIR SEPA SALAIRE ACME;2150,00\n03/10/2026;VIR SEPA SALAIRE ACME;2150,00\n';
test('Prélèvements réguliers détectés, courses et achats ponctuels écartés',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,CSV));const l=W.GFSubs.list();const names=JSON.parse(JSON.stringify(l.map(i=>i.name).sort()));
  assert.deepEqual(names,['Netflix','Salle Move Club']);
  const nf=l.find(i=>i.name==='Netflix');assert.equal(nf.amount,15.99);assert.equal(nf.rise,2.5);assert.equal(nf.yearly,191.88);
  const t=W.GFSubs.totals(l);assert.equal(t.month,45.89);assert.equal(t.count,2);
});
test('Retirer un abonnement le sort de la liste et du total',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,CSV));W.GFSubs.setHidden('salle move club',true);
  assert.deepEqual(JSON.parse(JSON.stringify(W.GFSubs.list().map(i=>i.name))),['Netflix']);assert.equal(W.GFSubs.totals(W.GFSubs.list()).month,15.99);
  assert.equal(W.GFSubs.list(true).length,2);
});
test('Un seul prélèvement ne suffit pas, même d’un service connu ; réimporter ne double pas',()=>{
  const W=setup();const one='Date;Libellé;Montant\n07/10/2026;PRLV SEPA SPOTIFY;-11,12\n08/10/2026;CARTE 08/10 ORANGE BOUTIQUE;-29,00\n';
  W.GFSubs.ingest(ops(W,one));assert.equal(W.GFSubs.list().length,0);
  const two='Date;Libellé;Montant\n07/09/2026;PRLV SEPA SPOTIFY;-11,12\n'+one.split('\n').slice(1).join('\n');
  W.GFSubs.ingest(ops(W,two));W.GFSubs.ingest(ops(W,two));
  const l=W.GFSubs.list();assert.deepEqual(JSON.parse(JSON.stringify(l.map(i=>i.name))),['Spotify']);assert.equal(l[0].amount,11.12);
});
test('Une référence qui change chaque mois ne crée pas de doublon',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/08/2026;PRLV SEPA NETFLIX.COM 8YHZQ;-13,49\n05/09/2026;CB NETFLIX.COM AMSTERDAM KQPLW;-13,49\n05/10/2026;PRLV NETFLIX INTERNATIONAL BV MZRT;-13,49\n'));
  const l=W.GFSubs.list();assert.deepEqual(JSON.parse(JSON.stringify(l.map(i=>i.name))),['Netflix']);assert.equal(l[0].since,3);
});
test('Achats répétés au même endroit : pas des abonnements',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n'+
    '12/08/2026;CARTE BOULANGERIE DUPONT;-4,20\n12/09/2026;CARTE BOULANGERIE DUPONT;-4,20\n12/10/2026;CARTE BOULANGERIE DUPONT;-4,20\n'+// restaurants
    '15/08/2026;CARTE TOTAL ACCESS;-60,00\n15/09/2026;CARTE TOTAL ACCESS;-60,00\n15/10/2026;CARTE TOTAL ACCESS;-60,00\n'+// essence
    '20/09/2026;CARTE LIBRAIRIE MOLLAT;-18,00\n20/10/2026;CARTE LIBRAIRIE MOLLAT;-18,00\n'+// 2 mois seulement
    '03/08/2026;CARTE CAVISTE NICOLAS;-25,00\n03/09/2026;CARTE CAVISTE NICOLAS;-41,00\n03/10/2026;CARTE CAVISTE NICOLAS;-12,00\n'));// montant qui change
  assert.equal(W.GFSubs.list().length,0);
});
test('Ancienne mémoire : doublons fusionnés, choix « retiré » gardé',()=>{
  const W=setup();W.safeStore.setItem('personalFinanceDashboard.subscriptions',JSON.stringify({v:1,items:{
    'netflix com':{name:'Netflix Com',known:true,months:{'24320':[13.49,1]},hidden:false},
    'netflix':{name:'Netflix',known:true,months:{'24321':[13.49,1]},hidden:false},
    'orange':{name:'Orange',known:true,months:{'24321':[29,1]},hidden:true}}}));
  const l=W.GFSubs.list(true);assert.deepEqual(JSON.parse(JSON.stringify(l.map(i=>i.name))),['Netflix']);assert.equal(l[0].since,2);
});
test('Un abonnement plus prélevé depuis 2 mois sort du total',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/06/2026;PRLV SEPA DEEZER;-10,99\n05/07/2026;PRLV SEPA DEEZER;-10,99\n05/09/2026;PRLV SEPA NETFLIX;-13,49\n05/10/2026;PRLV SEPA NETFLIX;-13,49\n'));
  const l=W.GFSubs.list();const dz=l.find(i=>i.name==='Deezer');assert.equal(dz.active,false);assert.equal(W.GFSubs.totals(l).month,13.49);
});
test('Le loyer, les impôts et l’épargne ne sont pas des abonnements',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n04/09/2026;PRLV SEPA LOYER FONCIA;-850,00\n04/10/2026;PRLV SEPA LOYER FONCIA;-850,00\n15/09/2026;PRLV DGFIP IMPOT;-120,00\n15/10/2026;PRLV DGFIP IMPOT;-120,00\n20/09/2026;VIR VERS LIVRET A;-100,00\n20/10/2026;VIR VERS LIVRET A;-100,00\n06/08/2026;PRLV SEPA EDF CLIENTS;-64,00\n06/09/2026;PRLV SEPA EDF CLIENTS;-64,00\n06/10/2026;PRLV SEPA EDF CLIENTS;-64,00\n'));
  assert.deepEqual(JSON.parse(JSON.stringify(W.GFSubs.list().map(i=>i.name))),['Edf Clients']);
});
test('Un virement régulier à une personne n’est pas un abonnement',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n15/08/2026;VIR SEPA EMIS VERS PAUL DURAND;-40,00\n15/09/2026;VIR SEPA EMIS VERS PAUL DURAND;-40,00\n15/10/2026;VIR SEPA EMIS VERS PAUL DURAND;-40,00\n'));
  assert.equal(W.GFSubs.list().length,0);
});
test('Apple : iCloud, Music et TV sont trois abonnements',()=>{
  const W=setup();let csv='Date;Libellé;Montant\n';for(const m of ['08','09','10'])csv+=`02/${m}/2026;APPLE.COM/BILL ICLOUD;-2,99\n03/${m}/2026;APPLE.COM/BILL MUSIC;-10,99\n04/${m}/2026;APPLE.COM/BILL TV;-9,99\n`;
  W.GFSubs.ingest(ops(W,csv));assert.deepEqual(JSON.parse(JSON.stringify(W.GFSubs.list().map(i=>i.name).sort())),['Apple Music','Apple TV','Apple iCloud']);
});
test('Achat en boutique Orange : ni abonnement, ni frein pour le vrai forfait',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/09/2026;PRLV SEPA ORANGE;-20,00\n05/10/2026;PRLV SEPA ORANGE;-20,00\n12/09/2026;CARTE ORANGE BOUTIQUE;-299,00\n12/10/2026;CARTE ORANGE BOUTIQUE;-15,00\n'));
  const l=W.GFSubs.list();assert.deepEqual(JSON.parse(JSON.stringify(l.map(i=>i.name))),['Orange']);assert.equal(l[0].amount,20);
});
test('Marchand rangé dans une ligne à moi : détectable ; ancien bruit de courses écarté',()=>{
  const W=setup();W.GFBankImport.saveLearned({'salle escalade':['Sport','Dépense']});
  W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/08/2026;PRLV SALLE ESCALADE;-45,00\n05/09/2026;PRLV SALLE ESCALADE;-45,00\n05/10/2026;PRLV SALLE ESCALADE;-45,00\n'));
  assert.deepEqual(JSON.parse(JSON.stringify(W.GFSubs.list().map(i=>i.name))),['Salle Escalade']);
  const W2=setup();W2.safeStore.setItem('personalFinanceDashboard.subscriptions',JSON.stringify({v:1,items:{'boulangerie dupont':{name:'Boulangerie Dupont',known:false,months:{'24319':[4.2,1],'24320':[4.2,1],'24321':[4.2,1]},hidden:false}}}));
  assert.equal(W2.GFSubs.list().length,0);
});
test('Abonnement arrêté : plus actif quand le relevé suivant ne le contient pas',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/08/2026;PRLV SEPA SPOTIFY;-11,12\n05/09/2026;PRLV SEPA SPOTIFY;-11,12\n'));
  W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/12/2026;CARTE LIDL;-30,00\n06/12/2026;CARTE LIDL;-20,00\n'));
  const l=W.GFSubs.list();assert.equal(l[0].active,false);assert.equal(W.GFSubs.totals(l).month,0);
});
test('Apple sans nom de produit : un seul abonnement, hausse de prix repérée ; achats ponctuels écartés',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n02/08/2026;PRLV APPLE.COM/BILL;-9,99\n02/09/2026;PRLV APPLE.COM/BILL;-9,99\n02/10/2026;PRLV APPLE.COM/BILL;-10,99\n02/11/2026;PRLV APPLE.COM/BILL;-10,99\n'));
  const l=W.GFSubs.list(true);assert.equal(l.length,1);assert.equal(l[0].name,'Apple');assert.equal(l[0].active,true);
  const W2=setup();W2.GFSubs.ingest(ops(W2,'Date;Libellé;Montant\n12/08/2026;APPLE.COM/BILL;-4,99\n14/09/2026;APPLE.COM/BILL;-4,99\n'));
  assert.equal(W2.GFSubs.list().length,0);
});
test('Ancien choix « ce n’est pas un abonnement » gardé pour Apple / Canal+',()=>{
  const W=setup();W.safeStore.setItem('personalFinanceDashboard.subscriptions',JSON.stringify({v:1,items:{'apple com bill':{name:'Apple Com Bill',known:true,months:{'24319':[2.99,1]},hidden:true},'canal':{name:'Canal',known:true,months:{'24319':[24.99,1]},hidden:true}}}));
  let csv='Date;Libellé;Montant\n';for(const m of ['08','09','10'])csv+=`02/${m}/2026;APPLE.COM/BILL;-2,99\n03/${m}/2026;PRLV CANAL+ FRANCE;-24,99\n`;
  W.GFSubs.ingest(ops(W,csv));assert.equal(W.GFSubs.list().length,0);assert.equal(W.GFSubs.list(true).length,2);
});
test('Sans le module d’import, l’ancienne mémoire n’est pas figée',()=>{
  const mem={'personalFinanceDashboard.subscriptions':JSON.stringify({v:1,items:{'boulangerie dupont':{name:'Boulangerie Dupont',known:false,months:{'24319':[4.2,1]},hidden:false}}})};
  const ctx={window:{safeStore:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);}}},TextDecoder,Intl,document:{}};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','subs.js'),'utf8'),ctx);ctx.window.GFSubs.setHidden('boulangerie dupont',true);
  assert.equal(JSON.parse(mem['personalFinanceDashboard.subscriptions']).v,1);
});
