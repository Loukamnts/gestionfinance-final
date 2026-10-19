// Sauvegarde : seules les données reconnues et saines sont restaurées.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ctx={window:{},document:{readyState:'complete',querySelector:()=>null,getElementById:()=>null},URL,Blob:class{},location:{}};ctx.window.addEventListener=()=>{};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','backup.js'),'utf8'),ctx);
const B=ctx.window.GFBackup;
const sheet={id:'s1',name:'2026',cells:{'0,0':{raw:'2000'},'1,0':{raw:'=A1*2'}},rowHeaders:['Salaire','Loyer'],rows:9,cols:12};
test('une sauvegarde valide est relue',()=>{
  const b=B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,creeLe:'2026-10-15T10:00:00Z',tableur:{feuilles:[sheet],feuilleActive:'s1'},reglages:{'personalFinanceDashboard.mode':'dark','personalFinanceDashboard.setupProfile':{objectives:[]}}}));
  assert.equal(b.sheets.length,1);assert.equal(b.sheets[0].cells['1,0'].raw,'=A1*2');assert.equal(b.settings['personalFinanceDashboard.mode'],'dark');assert.equal(b.date,'2026-10-15');
});
test('une clé inconnue n’est jamais restaurée',()=>{
  const b=B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,reglages:{'sb-xyz-auth-token':'vol','personalFinanceDashboard.mode':'light'}}));
  assert.deepEqual(Object.keys(b.settings),['personalFinanceDashboard.mode']);
});
test('les fichiers étrangers ou abîmés sont refusés',()=>{
  assert.throws(()=>B.parse('pas du json'));
  assert.throws(()=>B.parse(JSON.stringify({format:'autre',version:1})));
  assert.throws(()=>B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:99})));
  assert.throws(()=>B.parse('{"format":"meuniance-sauvegarde","version":1,"tableur":{"feuilles":[{"name":"x","cells":{"__proto__":{"raw":"1"}}}]}}'));
  assert.throws(()=>B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,tableur:{feuilles:[{name:'x',cells:{'A1':{raw:'1'}}}]}})));
  assert.throws(()=>B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,tableur:{feuilles:[{name:'x',cells:{'0,0':{raw:'x'.repeat(3000)}}}]}})));
});
test('une feuille large garde ses colonnes et ses en-têtes',()=>{
  const wide={id:'w',name:'Large',cells:{'0,14':{raw:'5'}},headers:['Jan','Fév','','Projet'],rowHeaders:['A'],rows:3,cols:16};
  const s=B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,tableur:{feuilles:[wide]}})).sheets[0];
  assert.equal(s.cols,16);assert.deepEqual(Array.from(s.headers),['Jan','Fév','','Projet']);
  const narrow=B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,tableur:{feuilles:[{name:'x',cells:{'0,30':{raw:'1'}},cols:4,headers:[1,2]}]}})).sheets[0];
  assert.equal(narrow.cols,31);assert.deepEqual(Array.from(narrow.headers),[]);// en-têtes non textuels ignorés
  const huge=B.parse(JSON.stringify({format:'meuniance-sauvegarde',version:1,tableur:{feuilles:[{name:'x',cells:{},cols:5000}]}})).sheets[0];
  assert.equal(huge.cols,100);
});
