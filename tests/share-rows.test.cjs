// Partage avec un ami : une ligne partagée est suivie par son nom, jamais par sa seule position.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
function load(){const ctx={window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;}},console,setTimeout,clearTimeout};ctx.window.document=ctx.document;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','friends.js'),'utf8'),ctx);return ctx.window.FriendsSystem._rules;}
const sheet=rows=>({sheets:[{id:'s1',name:'2026',rowHeaders:rows,cells:{}}]});
test('Après un import qui insère une ligne, l’ami voit toujours « Loisirs » et pas la ligne arrivée à sa place',()=>{
  const R=load();const before=sheet(['Salaire','Loyer','Courses','Loisirs','Livret A']);
  const rules=R.build(before,{s1:{months:new Set([8]),rows:new Set([3])}});
  assert.equal(rules[0].row_key,'s1:3:loisirs');
  const after=sheet(['Salaire','Loyer','Courses','Santé','Loisirs','Livret A']);
  const sel=R.select(after,rules);assert.deepEqual([...sel.s1.rows],[4]);
  const gone=sheet(['Salaire','Loyer','Courses','Livret A']);assert.equal(R.select(gone,rules).s1.rows.size,0);
});
test('Anciennes règles sans nom : seulement si le nom était déjà partagé',()=>{
  const R=load();const legacyRules=[{year:2026,month:9,row_key:'s1:3',allowed:true}];
  const after=sheet(['Salaire','Loyer','Courses','Livret A','Loisirs']);
  assert.equal(R.select(after,legacyRules,{'2026':new Set(['loisirs'])}).s1.rows.size,0);// la ligne 3 est maintenant « Livret A »
  const same=sheet(['Salaire','Loyer','Courses','Loisirs']);
  assert.deepEqual([...R.select(same,legacyRules,{'2026':new Set(['loisirs'])}).s1.rows],[3]);
});
