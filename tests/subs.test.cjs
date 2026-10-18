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
test('Un abonnement connu est repéré dès le premier mois ; réimporter ne double pas',()=>{
  const W=setup();const one='Date;Libellé;Montant\n07/10/2026;PRLV SEPA SPOTIFY;-11,12\n08/10/2026;CARTE 08/10 BOULANGERIE;-3,20\n';
  W.GFSubs.ingest(ops(W,one));W.GFSubs.ingest(ops(W,one));
  const l=W.GFSubs.list();assert.deepEqual(JSON.parse(JSON.stringify(l.map(i=>i.name))),['Spotify']);assert.equal(l[0].amount,11.12);
});
test('Un abonnement plus prélevé depuis 2 mois sort du total',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n05/06/2026;PRLV SEPA DEEZER;-10,99\n05/07/2026;PRLV SEPA DEEZER;-10,99\n05/10/2026;PRLV SEPA NETFLIX;-13,49\n'));
  const l=W.GFSubs.list();const dz=l.find(i=>i.name==='Deezer');assert.equal(dz.active,false);assert.equal(W.GFSubs.totals(l).month,13.49);
});
test('Le loyer, les impôts et l’épargne ne sont pas des abonnements',()=>{
  const W=setup();W.GFSubs.ingest(ops(W,'Date;Libellé;Montant\n04/09/2026;PRLV SEPA LOYER FONCIA;-850,00\n04/10/2026;PRLV SEPA LOYER FONCIA;-850,00\n15/09/2026;PRLV DGFIP IMPOT;-120,00\n15/10/2026;PRLV DGFIP IMPOT;-120,00\n20/09/2026;VIR VERS LIVRET A;-100,00\n20/10/2026;VIR VERS LIVRET A;-100,00\n06/09/2026;PRLV SEPA EDF CLIENTS;-64,00\n06/10/2026;PRLV SEPA EDF CLIENTS;-64,00\n'));
  assert.deepEqual(JSON.parse(JSON.stringify(W.GFSubs.list().map(i=>i.name))),['Edf Clients']);
});
