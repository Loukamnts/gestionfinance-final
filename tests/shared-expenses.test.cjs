// Dépenses partagées : saisie du montant et calcul des parts.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
function load(){const ctx={window:{},document:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','shared-expenses.js'),'utf8'),ctx);return ctx.window.GFSplit._calc;}
test('Montant saisi à la française ou à l’anglaise, en centimes',()=>{
  const {parseCents}=load();
  assert.equal(parseCents('12,50'),1250);assert.equal(parseCents('12.5'),1250);assert.equal(parseCents('30'),3000);
  assert.equal(parseCents(' 1 234,56 € '),123456);assert.equal(parseCents('0,01'),1);assert.equal(parseCents('10000'),1000000);
});
test('Montants refusés : vide, négatif, trop grand, texte, trois décimales',()=>{
  const {parseCents}=load();
  for(const v of ['','0','0,00','-5','10000,01','abc','1,234','1e3','12,5,0'])assert.equal(parseCents(v),0,v);
});
test('Parts égales, moi compris, ou totalité pour un seul ami',()=>{
  const {shareOf,effect}=load();
  assert.equal(shareOf(3000,1,'equal'),1500);assert.equal(shareOf(1000,2,'equal'),333);assert.equal(shareOf(1000,1,'full'),1000);
  assert.equal(effect(3000,1,'me','equal'),1500);assert.equal(effect(3000,2,'me','equal'),2000);assert.equal(effect(1000,1,'friend','full'),-1000);
  assert.equal(effect(3000,1,'me','equal')+effect(1000,1,'friend','full'),500);
});
