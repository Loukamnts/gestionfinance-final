// Sur écran tactile, :hover reste « collé » après un toucher (couleurs bizarres sur iPhone).
// Toute règle de survol doit donc être dans un bloc @media (hover:hover).
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
// Retire les blocs @media (hover…) en suivant les accolades, puis les commentaires.
function stripHoverMedia(css){let out='',i=0;const re=/@media[^{]*\(\s*hover\s*:[^{]*\{/g;let m;
  while((m=re.exec(css))){out+=css.slice(i,m.index);let depth=1,j=m.index+m[0].length;while(j<css.length&&depth){if(css[j]==='{')depth++;else if(css[j]==='}')depth--;j++;}i=j;re.lastIndex=j;}
  return (out+css.slice(i)).replace(/\/\*[\s\S]*?\*\//g,'');}
function sources(){const list=fs.readdirSync(root).filter(f=>f.endsWith('.css')).map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]);
  for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(path.join(root,f),'utf8');html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g,(m,b)=>{list.push([f,b]);return m;});}
  return list;}
test('les effets de survol sont réservés aux appareils avec souris',()=>{
  const bad=[];for(const [f,css] of sources()){const rest=stripHoverMedia(css);const hits=rest.match(/[^{}]*:hover[^{}]*\{/g)||[];hits.forEach(h=>bad.push(f+' → '+h.trim().slice(0,90)));}
  assert.deepStrictEqual(bad,[]);
});
