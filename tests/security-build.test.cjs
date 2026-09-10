const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
execFileSync(process.execPath,['scripts/build.cjs'],{cwd:root});
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
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
    if(src[1].startsWith('https:')){
      assert.equal(src[1],'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');continue;
    }
    const bytes=fs.readFileSync(path.join(root,'dist',src[1]));
    assert.equal(sri[1],'sha384-'+crypto.createHash('sha384').update(bytes).digest('base64'));
    new vm.Script(bytes.toString());
  }
});
test('Fonts, Chart.js and Supabase are served locally',()=>{
  assert(!/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/.test(html));
  for(const file of ['vendor/fonts.css','vendor/chart.js','vendor/supabase.js'])assert(html.includes(file));
});
test('SQL, tests, package sources and credentials are absent from public output',()=>{
  for(const name of ['supabase_schema.sql','supabase_security_hardening.sql','.git','.env',
    'tests','scripts','node_modules','package.json','package-lock.json','AUDIT_SECURITE.md']){
    assert(!fs.existsSync(path.join(root,'dist',name)),name);
  }
});
test('The public vulnerability contact is deployed in RFC 9116 format',()=>{
  const source=fs.readFileSync(path.join(root,'.well-known/security.txt'),'utf8');
  const published=fs.readFileSync(path.join(root,'dist/.well-known/security.txt'),'utf8');
  assert.equal(published,source);
  assert.match(source,/^Contact: mailto:louka\.meunier1@gmail\.com$/m);
  assert.match(source,/^Expires: 2027-03-10T23:59:59Z$/m);
  assert.match(source,/^Canonical: https:\/\/gestion-finance-coral\.vercel\.app\/\.well-known\/security\.txt$/m);
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
test('Dialog controls use external listeners rather than CSP exemptions',()=>{
  assert.equal([...html.matchAll(/data-dialog-target=/g)].length,4);
  const source=fs.readFileSync(path.join(root,'dist/app/dialog-actions.js'),'utf8');
  assert(source.includes('instanceof HTMLDialogElement'));
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
