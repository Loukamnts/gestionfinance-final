// Chaque script du site doit se lire sans erreur de syntaxe : une virgule oubliée dans un module
// le désactive entièrement sans casser le reste, et passe facilement inaperçue.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.join(__dirname,'..');
const files=fs.readdirSync(root).filter(f=>f.endsWith('.js')&&!/\.min\.js$/.test(f));
test('les scripts du site sont syntaxiquement valides',()=>{
  assert.ok(files.length>10);
  for(const f of files){assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f}),f);}
});
