// Production statique : liste blanche, scripts séparés et empreintes d'intégrité.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const marker = '.generated-by-gestion-finance';
if (fs.existsSync(output)) {
  if (fs.lstatSync(output).isSymbolicLink() || !fs.existsSync(path.join(output, marker))) {
    throw new Error('Refus de remplacer un dossier dist non généré par ce projet.');
  }
  fs.rmSync(output, { recursive: true });
}
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, marker), 'Generated output only.\n');
const put = (name, contents) => {
  const target = path.resolve(output, name);
  if (!target.startsWith(output + path.sep)) throw new Error('Invalid output path');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};
const copy = (from, to = from) => put(to, fs.readFileSync(path.join(root, from)));
const integrity = content => 'sha384-' + crypto.createHash('sha384').update(content).digest('base64');
const publicFiles = ['sheet.js','sheet.css','onboarding.js','onboarding.css','friends.js',
  'i18n.js','shared-dashboard.js','sharing.css','ui-controls.js','ui-polish.css',
  'store-shim.js','favicon.ico','supabase_config.json'];
for (const file of publicFiles) copy(file);
const config = JSON.parse(fs.readFileSync(path.join(root,'supabase_config.json'),'utf8'));
require('./public-config.cjs')(config);
const deployment=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const policy=deployment.headers.flatMap(group=>group.headers).find(header=>header.key==='Content-Security-Policy').value;
if(!policy.includes(' '+config.url+' '))throw new Error('Supabase origin and CSP must match');
const dependencies = [
  ['node_modules/chart.js/dist/chart.umd.min.js','vendor/chart.js'],
  ['node_modules/@supabase/supabase-js/dist/umd/supabase.js','vendor/supabase.js']
];
for (const [from,to] of dependencies) copy(from,to);
// Polices servies par le site : pas d'appel Google Fonts ni de CSS externe variable.
let fonts = '';
for (const [family,weights,styles] of [
  ['playfair-display',[400,900],['normal','italic']],
  ['space-grotesk',[400,500,600,700],['normal']],
  ['syne',[700,800],['normal']]
]) {
  for (const weight of weights) for (const style of styles) {
    const filename = `latin-${weight}${style==='italic'?'-italic':''}.css`;
    let css = fs.readFileSync(path.join(root,'node_modules/@fontsource',family,filename),'utf8');
    css = css.replace(/url\(\.\/files\/([^\)]+)\)/g,(_,file)=>{
      copy(`node_modules/@fontsource/${family}/files/${file}`,`vendor/fonts/${file}`);
      return `url(./fonts/${file})`;
    });
    fonts += css + '\n';
  }
  copy(`node_modules/@fontsource/${family}/LICENSE`,`vendor/licenses/${family}.txt`);
}
put('vendor/fonts.css',fonts);
copy('node_modules/chart.js/LICENSE.md','vendor/licenses/chart.txt');
copy('node_modules/@supabase/supabase-js/LICENSE','vendor/licenses/supabase.txt');
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html = html.replace(/\s*<link[^>]+https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g,'');
html = html.replace('</head>','<link rel="stylesheet" href="vendor/fonts.css">\n</head>');
html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^" ]+/g,'vendor/chart.js');
html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^" ]+/g,'vendor/supabase.js');
html = html.replace(/<script src="https:\/\/cdn\.sheetjs\.com\/[^" ]+"><\/script>/,
  '<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js" integrity="sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT" crossorigin="anonymous"></script>');
let inlineCount = 0;
html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,code)=>{
  if (/\bsrc\s*=/.test(attrs)) return tag;
  if (/application\/ld\+json/.test(attrs)) return tag;
  new vm.Script(code);
  const file = `app/inline-${++inlineCount}.js`;
  put(file,code);
  return `<script src="${file}"></script>`;
});
// Remplace les quatre anciens gestionnaires HTML sans autoriser unsafe-inline.
html = html.replace(/onclick="document\.getElementById\('(legalModal|privacyModal)'\)\.(showModal|close)\(\)"/g,
  (_,id,method)=>`data-dialog-target="${id}" data-dialog-action="${method}"`);
put('app/dialog-actions.js',`document.addEventListener('click',function(event){
  var button=event.target.closest('[data-dialog-target]'); if(!button)return;
  var dialog=document.getElementById(button.dataset.dialogTarget);
  if(!(dialog instanceof HTMLDialogElement))return;
  if(button.dataset.dialogAction==='showModal')dialog.showModal();
  else if(button.dataset.dialogAction==='close')dialog.close();
});\n`);
html = html.replace('</body>','<script src="app/dialog-actions.js"></script>\n</body>');
if (/\son[a-z]+\s*=/i.test(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''))) throw new Error('Inline event handler remains');
html = html.replace(/<script\b([^>]*?)\bsrc="([^"?#]+)([^" ]*)"([^>]*)><\/script>/g,(tag,before,src,query,after)=>{
  if (/^https:/.test(src)) return tag;
  const code = fs.readFileSync(path.join(output,src));
  new vm.Script(code.toString('utf8'),{filename:src});
  return `<script ${before}src="${src}${query}"${after} integrity="${integrity(code)}" crossorigin="anonymous"></script>`;
});
put('index.html',html);
// Contact facultatif tant que le propriétaire n'a pas choisi son adresse publique.
if (fs.existsSync(path.join(root,'.well-known/security.txt'))) copy('.well-known/security.txt');
console.log(`Build sécurisé : ${publicFiles.length} fichiers applicatifs, ${inlineCount} scripts séparés, aucun SQL publié.`);
