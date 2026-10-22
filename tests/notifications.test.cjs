// Messages du site : choix du message du haut (priorité), identifiants stables et mémoire des messages fermés.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'notifications.js'),'utf8');
function boot(mem={}){
  const safeStore={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];},financialOwner:()=>'anonymous'};
  const window={safeStore};
  vm.runInNewContext(source,{window,Date,JSON,Object,Array,Number,String,isFinite,setTimeout});
  return {N:window.GFNotify,mem,window};
}
const msg=(id,kind,extra)=>Object.assign({id,kind,title:id},extra||{});
const ids=list=>Array.from(list,m=>m.id);

test('Le message du haut suit l’ordre : plafond atteint > 80 % > bilan > abonnement > installation > rappels > nouveautés',()=>{
  const {N}=boot();
  [msg('news:x','news'),msg('reminders-invite','reminders'),msg('install','install'),msg('subs:netflix','subs'),msg('recap:2026-09','recap'),
   msg('budget:a:2026-10:80','budget',{priority:90}),msg('budget:b:2026-10:100','budget',{priority:100})].forEach(m=>N.push(m));
  const order=ids(N._select(N.list(),{}));
  assert.deepEqual(order,['budget:b:2026-10:100','budget:a:2026-10:80','recap:2026-09','subs:netflix','install','reminders-invite','news:x']);
});
test('Sans donnée (accueil vide), seuls les conseils passent : jamais devant « Pour commencer »',()=>{
  const {N}=boot();
  [msg('recap:2026-09','recap'),msg('budget:a:2026-10:100','budget',{priority:100}),msg('install','install'),msg('news:x','news')].forEach(m=>N.push(m));
  assert.deepEqual(ids(N._select(N.list(),{blank:true})),['install','news:x']);
});
test('Un message fermé ne revient jamais, même après rechargement',()=>{
  const first=boot();
  assert.equal(first.N.push(msg('recap:2026-09','recap')),true);
  first.N.dismiss('recap:2026-09');
  assert.deepEqual(ids(first.N.list()),[]);
  assert.equal(first.N.push(msg('recap:2026-09','recap')),false);
  const second=boot(first.mem);// autre ouverture du site, même compte
  assert.equal(second.N.push(msg('recap:2026-09','recap')),false);
  assert.equal(second.N.push(msg('recap:2026-10','recap')),true);// un autre mois est un autre message
  assert.deepEqual(ids(second.N.list()),['recap:2026-10']);
});
test('Lu : le message quitte le haut de l’accueil mais reste dans la cloche ; le compteur suit',()=>{
  const {N}=boot();
  N.push(msg('install','install'));N.push(msg('news:x','news'));
  assert.equal(N.unread(),2);
  N.markRead('install');
  assert.equal(N.unread(),1);
  assert.deepEqual(ids(N._select(N.list(),{})),['news:x']);
  assert.equal(N.list().length,2);
  N.markAllRead();
  assert.equal(N.unread(),0);assert.equal(N.list().length,2);
});
test('Un message épinglé (bilan toujours affiché) ne se ferme pas et reste en haut même lu',()=>{
  const {N}=boot();
  N.push(msg('recap:2026-09','recap',{sticky:true}));
  N.dismiss('recap:2026-09');
  assert.equal(N.list().length,1);
  N.markRead('recap:2026-09');
  assert.deepEqual(ids(N._select(N.list(),{})),['recap:2026-09']);
});
test('Réglages par famille : « Mes finances » et « Nouveautés et conseils »',()=>{
  const {N}=boot();
  N.setFamily('tips',false);
  N.push(msg('news:x','news'));N.push(msg('install','install'));N.push(msg('subs:a','subs'));
  assert.deepEqual(ids(N.list()),['subs:a']);
  N.setFamily('tips',true);
  assert.equal(N.list().length,3);
});
test('Ancien réglage migré : alertes et bilan tous deux coupés = « Mes finances » coupé',()=>{
  const {N}=boot({'personalFinanceDashboard.budgetAlertsOn':'0','personalFinanceDashboard.homeBlocks':JSON.stringify({recap:false})});
  assert.equal(N.familyOn('finance'),false);
  assert.equal(N.familyOn('tips'),true);
  const only=boot({'personalFinanceDashboard.budgetAlertsOn':'0'});
  assert.equal(only.N.familyOn('finance'),true);
});
test('Les messages se rangent du plus récent au plus ancien et les identifiants en double sont ignorés',()=>{
  const {N}=boot();
  N.push(msg('news:x','news'));
  const st=N._state();st.born['news:x']=Date.now()-5*864e5;
  N.push(msg('install','install'));N.push(msg('install','install'));
  assert.deepEqual(ids(N.list()),['install','news:x']);
});
test('L’état des messages est rangé par compte comme les autres états d’interface',()=>{
  const shim=fs.readFileSync(path.join(root,'store-shim.js'),'utf8');
  assert.ok(/"personalFinanceDashboard\.notifications":\s*true/.test(shim));
});
