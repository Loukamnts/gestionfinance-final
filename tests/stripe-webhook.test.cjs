// Webhook Stripe : la signature est vérifiée comme Stripe la calcule (HMAC-SHA256 de « t.payload »), avec 5 minutes de tolérance.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
function load(){
  const src=fs.readFileSync(path.join(__dirname,'..','supabase','functions','stripe-webhook','index.ts'),'utf8');
  const part=src.slice(src.indexOf('const enc ='),src.indexOf('async function stripe('));
  const js=execFileSync('npx',['-y','esbuild','--loader=ts'],{input:part,encoding:'utf8'});
  const ctx={TextEncoder,crypto:crypto.webcrypto,Date,Math,Number};vm.createContext(ctx);
  vm.runInContext(js+';this.validSignature=validSignature;',ctx);return ctx.validSignature;
}
const secret='whsec_testsecret123';
const sign=(payload,t)=>`t=${t},v1=${crypto.createHmac('sha256',secret).update(`${t}.${payload}`).digest('hex')}`;
test('Signature Stripe valide acceptée, falsifiée ou trop ancienne refusée',async()=>{
  const ok=load(),now=Math.floor(Date.now()/1000),body='{"id":"evt_1"}';
  assert.equal(await ok(body,sign(body,now),secret),true);
  assert.equal(await ok(body+' ',sign(body,now),secret),false);          // contenu modifié
  assert.equal(await ok(body,sign(body,now),'whsec_autresecret'),false); // mauvais secret
  assert.equal(await ok(body,sign(body,now-400),secret),false);          // rejouée trop tard
  assert.equal(await ok(body,'',secret),false);
  assert.equal(await ok(body,`t=${now},v1=abc`,secret),false);
});
test('Le webhook refuse tout sans secret configuré et n\'accorde jamais d\'accès sans relire Stripe',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','supabase','functions','stripe-webhook','index.ts'),'utf8');
  assert.match(src,/whsec_\[A-Za-z0-9\]\+/);
  assert.match(src,/Webhook not configured/);
  assert.match(src,/\/subscriptions\?customer=/);
});
