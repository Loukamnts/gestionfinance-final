// Parcours « Nouveautés » : chaque élément visé par un repère doit exister dans le code qui le dessine,
// sinon le repère se ferme aussitôt sans rien montrer.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const discover=fs.readFileSync(path.join(root,'discover.js'),'utf8');
const tours=discover.slice(discover.indexOf('var TOURS={'),discover.indexOf('function release()'));
// Tout le code de l'app sauf discover.js : index.html et les scripts à la racine.
const others=fs.readdirSync(root).filter(f=>/\.(js|html)$/.test(f)&&f!=='discover.js').map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
const helpers=discover.slice(discover.indexOf('function release()'));

function targets(){
  const ids=new Set(),classes=new Set();
  for(const m of (tours+helpers.slice(0,helpers.indexOf('function bottomBar'))).matchAll(/byId\("([\w-]+)"\)/g))ids.add(m[1]);
  for(const m of tours.matchAll(/querySelector(?:All)?\("([^"]+)"\)/g))for(const part of m[1].split(/[\s>]+/))for(const tok of part.split(/(?=[.#])/)){if(tok.startsWith('#'))ids.add(tok.slice(1));else if(tok.startsWith('.'))classes.add(tok.slice(1));}
  return{ids,classes};
}
test('Les identifiants visés par les repères existent ailleurs dans le code',()=>{
  const{ids}=targets();assert.ok(ids.size>5);
  for(const id of ids)assert.ok(new RegExp('id=["\']'+id+'["\']|\\.id=["\']'+id+'["\']|\\bid:"'+id+'"').test(others),'identifiant introuvable : #'+id);
});
test('Les classes visées par les repères existent ailleurs dans le code',()=>{
  const{classes}=targets();assert.ok(classes.size>5);
  for(const cls of classes){
    const dynamic=cls.match(/^is-(\w+)$/);// « is-budget » : construit avec le nom du type de notification
    const style=cls.match(/^sf-(\w+)$/);// « sf-primary » : construit par action(texte, …, "primary") dans friends.js
    assert.ok(others.includes(cls)||(dynamic&&others.includes('"is-"+k[0]')&&others.includes('["'+dynamic[1]+'",'))||(style&&others.includes('" sf-"+style')&&others.includes(',"'+style[1]+'"')),'classe introuvable : .'+cls);
  }
});
test('Le repère des alertes ne vise plus l’ancien bloc #gfrBudget',()=>{
  assert.ok(!/byId\("gfrBudget"\)/.test(discover));
  assert.ok(/getClientRects\(\)\.length\)\{if\(opts/.test(discover),'un repère sans élément visible doit passer sans bloquer');
});
