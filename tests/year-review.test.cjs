// Bilan de l'année : chiffres calculés à partir des mois de l'utilisateur.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
function load(){const ctx={window:{},document:{},Intl};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','year-review.js'),'utf8'),ctx);return ctx.window.GFYear;}
const J=x=>JSON.parse(JSON.stringify(x));
function months(year,list){return list.map((m,i)=>m&&{year,mi:i,salary:m[0],expenses:m[1],savings:m[2],cats:m[3]||[]}).filter(Boolean);}
test('Épargne, meilleur mois, catégories et comparaison avec l’année d’avant',()=>{
  const Y=load();
  const data=months(2026,[[2000,1500,200,[{name:'Loyer',value:-800},{name:'Courses',value:-300}]],[2000,1400,250,[{name:'Loyer',value:-800},{name:'Loisirs',value:-200}]],[2000,1900,0],[2100,1200,400]]);
  const r=Y.compute(data,2026,{prevSaved:600,goals:[{title:'Voyage',target:1000,current:1000},{title:'Apport',target:5000,current:3100}],entries:42});
  assert.equal(r.active,4);assert.equal(r.saved,850);assert.equal(r.income,8100);
  assert.equal(r.best.mi,3);assert.equal(r.best.kept,900);
  assert.equal(Math.round(r.delta),42);
  assert.deepEqual(J(r.cats.map(c=>c.name)),['Loyer','Courses','Loisirs']);
  assert.equal(r.reached,1);assert.equal(r.goals[1].pc,62);
  assert.equal(r.regular,3);assert.deepEqual(J(r.cumul.slice(0,4)),[200,450,450,850]);assert.equal(r.cumul[4],null);
  assert.equal(r.entries,42);
});
test('Les mois d’une autre année et les mois vides sont ignorés',()=>{
  const Y=load();
  const data=months(2025,[[1000,900,50]]).concat(months(2026,[null,[0,0,0],[1500,1000,100]]));
  const r=Y.compute(data,2026,{});assert.equal(r.active,1);assert.equal(r.months[2].salary,1500);assert.equal(r.delta,null);
  assert.equal(Y.compute(months(2024,[[1,1,1]]),2026,{}),null);
});
test('Sans revenus, le meilleur mois est celui où l’on a le plus épargné',()=>{
  const Y=load();const r=Y.compute(months(2026,[[0,300,50],[0,200,120],[0,250,80]]),2026,{});
  assert.equal(r.best.mi,1);assert.equal(r.best.saved,120);assert.equal(r.best.kept,undefined);
});
test('Profils : régulier, gros épargnant, mois serrés',()=>{
  const Y=load();
  const steady=months(2026,Array.from({length:10},()=>[2000,1850,100]));assert.equal(Y.compute(steady,2026,{}).profile,'squirrel');
  const builder=months(2026,Array.from({length:6},()=>[2000,1200,600]));assert.equal(Y.compute(builder,2026,{}).profile,'builder');
  const tight=months(2026,[[1500,1700,0],[1500,1800,0],[1500,1400,0],[1500,1600,0]]);assert.equal(Y.compute(tight,2026,{}).profile,'tightrope');
  const fun=months(2026,[[2000,1500,0,[{name:'Restaurants',value:-500},{name:'Loyer',value:-700}]],[2000,1500,0,[{name:'Loyer',value:-700}]],[2000,1500,50]]);assert.equal(Y.compute(fun,2026,{}).profile,'bonvivant');
});
test('La carte de l’accueil n’existe qu’en décembre et en janvier',()=>{
  const Y=load();
  assert.equal(Y.seasonYear(new Date(2026,11,3)),2026);assert.equal(Y.seasonYear(new Date(2027,0,20)),2026);
  assert.equal(Y.seasonYear(new Date(2026,9,19)),null);assert.equal(Y.seasonYear(new Date(2027,1,1)),null);
});
