// Formules Free / Plus / Pro : règles de plans.js, et limites de partage côté serveur (supabase_plans_enforcement_20261021.sql).
const {test,before,after,beforeEach,afterEach}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function loadPlans(billing){
  const noop=()=>{};const doc={readyState:'loading',addEventListener:noop,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]};
  const ctx={window:{MEUNIANCE_BILLING:billing,addEventListener:noop,location:{hash:''},safeStore:{getItem:()=>null}},document:doc,Intl,URL,Event:function(){}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'plans.js'),'utf8'),ctx);return ctx.window.GFSubscriptions;
}

test('Partage : aucun en Free, un seul ami en Plus, sans limite en Pro',()=>{
  const R=loadPlans()._rules;
  assert.equal(R.shareFeature('free',0),'share');
  assert.equal(R.shareFeature('plus',0),null);
  assert.equal(R.shareFeature('plus',1),'share_multi');
  assert.equal(R.shareFeature('pro',5),null);
  assert.equal(R.shareFeature('premium',3),null);// ancien nom de Pro
  assert.equal(R.shareFeature('',0),'share');// formule inconnue = Free
});
test('Objectifs : un seul actif en Free, illimités dès Plus',()=>{
  const R=loadPlans()._rules;
  assert.equal(R.goalFeature('free',0),null);
  assert.equal(R.goalFeature('free',1),'goals_unlimited');
  assert.equal(R.goalFeature('plus',12),null);
  assert.equal(R.goalFeature('pro',12),null);
});
test('Import : CSV gratuit (relevé ou tableau), classeurs Excel et ODS dans Plus',()=>{
  const R=loadPlans()._rules;
  for(const n of ['releve.csv','RELEVE.CSV','budget.tsv','export.txt'])assert.equal(R.fileFeature(n),null,n);
  for(const n of ['budget.xlsx','releve-ca.xls','macro.xlsm','libre.ods','A.XLSX'])assert.equal(R.fileFeature(n),'excel',n);
});
test('Période de lancement : tout reste ouvert ; abonnement actif : Free est limité',()=>{
  const open=loadPlans();
  for(const f of ['excel','goals_unlimited','trends','share','share_multi','avatar_pro'])assert.equal(open.can(f),true,f);
  assert.equal(open.allowsShare(3),true);
  const on=loadPlans({enforce:true});
  assert.equal(on.can('excel'),false);assert.equal(on.can('trends'),false);assert.equal(on.can('share'),false);
  assert.equal(on.allowsShare(0),false);
  assert.equal(on.can('nouvelle_fonction_inconnue'),true);// ce qui n’est pas listé reste gratuit
});
test('Les offres affichées correspondent aux fonctions bloquées',()=>{
  const plans=loadPlans().plans;const text=id=>plans.find(p=>p.id===id).features.map(f=>f[0]).join(' | ');
  assert.match(text('plus'),/Excel/);assert.match(text('plus'),/Objectifs illimités/);assert.match(text('plus'),/1 personne/);assert.match(text('plus'),/Évolution mensuelle/);
  assert.match(text('pro'),/plusieurs personnes/);
  // Fonctions annoncées mais pas encore livrées : marquées « bientôt ».
  const soon=plans.find(p=>p.id==='pro').features.filter(f=>f[3]).map(f=>f[0]);
  assert.equal(soon.length,3);
  assert.match(text('free'),/Export et suppression/);
});
test('Partage côté navigateur : les autres amis qui voient déjà mes données',()=>{
  const ctx={window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;}},console,setTimeout,clearTimeout};ctx.window.document=ctx.document;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'friends.js'),'utf8'),ctx);const other=ctx.window.FriendsSystem._rules.otherActive;
  const list=[{friendId:'a',permissions:{can_view_sheet:true}},{friendId:'b',permissions:{can_view_dashboard:true}},{friendId:'c',permissions:{}}];
  assert.equal(other('a',list),1);assert.equal(other('c',list),2);assert.equal(other('z',[]),0);
});

/* ── Serveur ─────────────────────────────────────── */
const {PGlite}=require('@electric-sql/pglite');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
const rules=[{year:2026,month:1,row_key:'2026:0'}];
const sheet={v:'shared-sheet-v2',sheets:[{name:'2026',headers:['Janvier'],rowHeaders:['Salaire'],rows:1,cols:1,cells:{'0,0':{raw:'120'}}}]};
const dashboard={v:'shared-dashboard-v2',months:[{salary:120}]};
let db;
const query=(sql,params=[])=>db.query(sql,params);
async function as(id){await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');}
async function value(sql,params=[]){return Object.values((await query(sql,params)).rows[0])[0];}
async function befriend(x,emailY,y){await as(x);const id=await value('select public.send_friend_request_by_email($1)',[emailY]);await as(y);await query('select public.respond_to_friend_request($1,true)',[id]);}
const save=(friend,on)=>query('select public.save_friend_share_config($1,$2,$2,$3,$4,$5)',[friend,on,JSON.stringify(on?rules:[]),JSON.stringify(sheet),JSON.stringify(dashboard)]);
const refresh=friend=>value('select public.refresh_friend_share_snapshots($1,$2,$3,$4)',[friend,JSON.stringify(rules),JSON.stringify(sheet),JSON.stringify(dashboard)]);
async function rejects(run,pattern){await db.exec('savepoint x');try{await assert.rejects(run(),pattern);}finally{await db.exec('rollback to savepoint x; release savepoint x');}}
async function enforce(){await db.exec('reset role');await db.exec("create or replace function public.billing_enforced() returns boolean language sql stable set search_path = '' as $$ select true $$");}
async function grant(user,plan){await db.exec('reset role');await query("insert into public.billing_grants(user_id,plan,starts_at,ends_at) values($1,$2,now()-interval '1 day',now()+interval '30 days')",[user,plan]);}

before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;`);
  for(const file of ['supabase_schema.sql','supabase_granular_friend_sharing.sql','supabase_fix_secure_sharing_access.sql','supabase_fix_shared_snapshot_read.sql','supabase_security_hardening.sql'])
    await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  // Tables de facturation telles qu’en production (écrites par le webhook Stripe, service_role seulement).
  await db.exec(`create table public.billing_subscriptions(user_id uuid primary key,plan text,status text,access_granted boolean default false,subscription_started_at timestamptz);
    create table public.billing_grants(id bigserial primary key,user_id uuid,plan text,starts_at timestamptz,ends_at timestamptz,revoked_at timestamptz);
    alter table public.billing_subscriptions enable row level security;alter table public.billing_grants enable row level security;
    revoke all on public.billing_subscriptions,public.billing_grants from anon,authenticated;`);
  await db.exec(fs.readFileSync(path.join(root,'supabase_plans_enforcement_20261021.sql'),'utf8'));
});
beforeEach(async()=>{
  await db.exec('reset role; begin');
  await query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now()),($2,'b@example.test',now()),($3,'c@example.test',now())",[A,B,C]);
  await befriend(A,'b@example.test',B);await befriend(A,'c@example.test',C);
});
afterEach(async()=>{await db.exec('reset role; rollback');});
after(async()=>{if(db)await db.close();});

test('Serveur, lancement : interrupteur coupé, partager avec plusieurs amis reste possible en Free',async()=>{
  await as(A);await save(B,true);await save(C,true);assert.equal(await refresh(C),true);
});
test('Serveur, abonnement actif : Free ne peut ouvrir aucun accès, mais peut toujours en retirer',async()=>{
  await as(A);await save(B,true);// ouvert pendant le lancement
  await enforce();await as(A);
  await rejects(()=>save(C,true),/plan_share_required/);
  assert.equal(await refresh(B),false);// figé, pas supprimé
  await db.exec('reset role');assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots where owner_id=$1 and friend_id=$2',[A,B]),1);
  await as(A);await save(B,false);
  await db.exec('reset role');assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots where owner_id=$1',[A]),0);
});
test('Serveur, Plus : un seul ami ; Pro : plusieurs',async()=>{
  await enforce();await grant(A,'plus');await as(A);
  await save(B,true);await save(B,true);// modifier le même partage reste possible
  assert.equal(await refresh(B),true);
  await rejects(()=>save(C,true),/plan_share_multi_required/);
  await grant(A,'pro');await as(A);await save(C,true);assert.equal(await refresh(C),true);
});
test('Serveur : un utilisateur ne peut ni lire ni écrire sa formule, ni appeler les fonctions internes',async()=>{
  await as(A);
  await rejects(()=>query("insert into public.billing_grants(user_id,plan,starts_at,ends_at) values($1,'pro',now(),now()+interval '1 year')",[A]),/permission denied/);
  await rejects(()=>query('select * from public.billing_subscriptions'),/permission denied/);
  await rejects(()=>query('select public.effective_plan($1)',[A]),/permission denied/);
  await rejects(()=>query('select public.billing_enforced()'),/permission denied/);
  await rejects(()=>query('select public.share_plan_block($1,$2)',[A,B]),/permission denied/);
});
