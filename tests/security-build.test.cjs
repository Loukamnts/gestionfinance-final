const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// Construction dans une copie temporaire : jamais dans dist/, qu'un autre build peut écrire en même temps.
const os=require('node:os');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'gf-build-'));
fs.cpSync(root,work,{recursive:true,filter:src=>!/^(\.git|dist|node_modules|\.claude)$/.test(path.relative(root,src).split(path.sep)[0])});
fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
process.on('exit',()=>{try{fs.rmSync(work,{recursive:true,force:true});}catch(e){}});
execFileSync(process.execPath,[path.join(work,'scripts/build.cjs')],{cwd:work});
const dist=path.join(work,'dist');
const html=fs.readFileSync(path.join(dist,'app.html'),'utf8');
// Les scripts en ligne sont extraits vers dist/app/ : on les inclut pour les
// verifications de contenu (URLs des bibliotheques, absence de CDN externes).
const appDir=path.join(dist,'app');
const inlineScripts=fs.existsSync(appDir)
  ? fs.readdirSync(appDir).filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(appDir,f),'utf8')).join('\n')
  : '';
const published=html+'\n'+inlineScripts;
const headers=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'))).headers[0].headers;
const csp=headers.find(h=>h.key==='Content-Security-Policy').value;
test('Public configuration rejects encoded service-role credentials and unexpected fields',()=>{
  const validate=require('../scripts/public-config.cjs');
  const url='https://testproject.supabase.co';
  const jwt=role=>'header.'+Buffer.from(JSON.stringify({role,exp:4102444800})).toString('base64url')+'.signature';
  assert.throws(()=>validate({url,anonKey:jwt('service_role')}));
  assert.throws(()=>validate({url,anonKey:'sb_secret_example'}));
  assert.throws(()=>validate({url,anonKey:'sb_publishable_example',password:'secret'}));
  assert.doesNotThrow(()=>validate({url,anonKey:jwt('anon')}));
  assert.doesNotThrow(()=>validate({url,anonKey:'sb_publishable_example'}));
});
test('Production has no executable inline scripts or HTML event handlers',()=>{
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    assert(/\bsrc=/.test(match[1])||/application\/ld\+json/.test(match[1]));
  }
  assert(!/\son[a-z]+\s*=/i.test(html));
  assert(!/javascript:/i.test(html));
});
test('CSP refuses arbitrary inline code, eval and foreign Supabase projects',()=>{
  const script=csp.match(/script-src ([^;]+)/)[1];
  assert(!/unsafe-inline|unsafe-eval|\*/.test(script));
  assert(csp.includes("script-src-attr 'none'"));
  assert(!csp.includes('*.supabase.co'));
  assert(csp.includes("frame-ancestors 'none'"));
});
test('Every script is integrity checked and every local digest matches the built bytes',()=>{
  for(const tag of html.matchAll(/<script\b([^>]*)>/gi)){
    const src=tag[1].match(/\bsrc="([^"?]+)(?:[^" ]*)"/);if(!src)continue;
    const sri=tag[1].match(/integrity="(sha384-[^"]+)"/);assert(sri,src[1]);
    assert(tag[1].includes('crossorigin="anonymous"'));
    assert(!src[1].startsWith('https:'),'script tiers : '+src[1]);
    const bytes=fs.readFileSync(path.join(dist,src[1]));
    assert.equal(sri[1],'sha384-'+crypto.createHash('sha384').update(bytes).digest('base64'));
    new vm.Script(bytes.toString());
  }
});
test('Fonts, Chart.js, Supabase and SheetJS are served locally',()=>{
  assert(!/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdn\.sheetjs/.test(published));
  for(const file of ['vendor/fonts.css','vendor/chart.js','vendor/supabase.js','vendor/xlsx.js'])assert(published.includes(file),file);
  const xlsx=fs.readFileSync(path.join(dist,'vendor/xlsx.js'));
  assert.equal('sha384-'+crypto.createHash('sha384').update(xlsx).digest('base64'),'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT');
});
test('The branded 404 page is included with a working route back to the app',()=>{
  const page=fs.readFileSync(path.join(dist,'404.html'),'utf8');
  assert.match(page,/<title>Page introuvable \| Meuniance<\/title>/);
  assert.match(page,/href="\/accueil"/);
  assert.match(page,/href="\/"/);
});
test('SQL, tests, package sources and credentials are absent from public output',()=>{
  for(const name of ['supabase_schema.sql','supabase_security_hardening.sql','.git','.env',
    'tests','scripts','node_modules','package.json','package-lock.json','AUDIT_SECURITE.md']){
    assert(!fs.existsSync(path.join(dist,name)),name);
  }
});
test('The public vulnerability contact is deployed in RFC 9116 format',()=>{
  const source=fs.readFileSync(path.join(root,'.well-known/security.txt'),'utf8');
  const published=fs.readFileSync(path.join(dist,'.well-known/security.txt'),'utf8');
  assert.equal(published,source);
  assert.match(source,/^Contact: https:\/\/meuniance\.vercel\.app\/confidentialite$/m);
  assert.match(source,/^Expires: 2027-03-10T23:59:59Z$/m);
  assert.match(source,/^Canonical: https:\/\/meuniance\.vercel\.app\/\.well-known\/security\.txt$/m);
});
test('Vercel is explicitly configured to publish only the generated public directory',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json')));
  assert.equal(config.outputDirectory,'dist');assert.equal(config.buildCommand,'npm run build');
  assert.equal(config.installCommand,'npm ci --ignore-scripts --include=dev');
});
test('All direct dependency versions are exact and package lock is present',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  for(const version of Object.values({...pkg.dependencies,...pkg.devDependencies}))assert(/^\d+\.\d+\.\d+$/.test(version));
  assert(fs.existsSync(path.join(root,'package-lock.json')));
});
test('No inline event handlers and no leftover dialog shim',()=>{
  assert(!/\son[a-z]+\s*=/i.test(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')));
  assert(!fs.existsSync(path.join(dist,'app/dialog-actions.js')));
});
test('Friend removal uses one atomic RPC and never falls back to direct deletes',async()=>{
  const source=fs.readFileSync(path.join(root,'friends.js'),'utf8');
  const code=source.slice(source.indexOf('  async function removeFriend(id){'),source.indexOf('  async function loadRules('));
  const calls=[];let fail=false;
  const context={sb:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error:fail?new Error('offline'):null};},
    from:()=>{throw new Error('Direct write attempted');}}),user:()=>({id:'A'}),friendsList:[{friendshipId:'r',friendId:'B'}],
    pendingRequests:[],sentRequests:[],invalidate(){},errorText:()=> 'Échec'};
  vm.createContext(context);vm.runInContext(code,context);
  assert((await context.removeFriend('r')).success);
  assert.equal(calls[0].name,'remove_friendship');assert.equal(calls[0].args.p_friendship_id,'r');
  fail=true;assert((await context.removeFriend('r')).error);assert.equal(calls.length,2);
});
test('Offline service worker: versioned, same-origin only, network first',()=>{
  const sw=fs.readFileSync(path.join(dist,'sw.js'),'utf8');
  assert(!sw.includes('__BUILD_VERSION__')&&!sw.includes('__PRECACHE_LIST__'));
  const list=JSON.parse(sw.match(/var PRECACHE = (\[[^\]]*\])/)[1]);
  assert(list.length>10);
  for(const url of list){assert(url.startsWith('/')&&!url.startsWith('//'),url);assert(!/supabase\.co|xlsx\.js/.test(url),url);}
  assert(sw.includes('url.origin !== self.location.origin'));
  assert(sw.includes('request.method !== "GET"'));
  assert(/event\.respondWith\(fetch\(request\)/.test(sw),'network first');
  assert(sw.includes('caches.delete'),'old versions are removed');
});
