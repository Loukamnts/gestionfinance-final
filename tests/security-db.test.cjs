const {test,before,after,beforeEach,afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const C='10000000-0000-4000-8000-000000000003';
let db;
const rules=[{year:2026,month:1,row_key:'2026:0'}];
const sheet={v:'shared-sheet-v2',sheets:[{rows:1,cols:1,cells:{'0,0':{raw:'120'}}}]};
const dashboard={v:'shared-dashboard-v2',months:[{salary:120}]};
const query=(sql,params=[])=>db.query(sql,params);
async function as(id,role='authenticated'){
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
  await db.exec('set role '+role);
}
async function value(sql,params=[]){return Object.values((await query(sql,params)).rows[0])[0];}
async function denied(sql,params,pattern=/permission denied|not_authenticated|friend_request_not_found|friend_request_not_pending/){
  await db.exec('savepoint expected_denial');
  try {await assert.rejects(query(sql,params),pattern);}
  finally {await db.exec('rollback to savepoint expected_denial; release savepoint expected_denial');}
}
async function friendship(){
  await as(A);const id=await value('select public.send_friend_request_by_email($1)',['b@example.test']);
  await as(B);await query('select public.respond_to_friend_request($1,true)',[id]);return id;
}
async function share(owner,friend,enabled=true){
  await as(owner);await query('select public.save_friend_share_config($1,$2,$2,$3,$4,$5)',
    [friend,enabled,JSON.stringify(enabled?rules:[]),JSON.stringify(sheet),JSON.stringify(dashboard)]);
}
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;`);
  for(const file of ['supabase_schema.sql','supabase_granular_friend_sharing.sql',
    'supabase_fix_secure_sharing_access.sql','supabase_fix_shared_snapshot_read.sql',
    'supabase_security_hardening.sql','supabase_security_hardening.sql']){
    await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  }
});
beforeEach(async()=>{
  await db.exec('reset role; begin');
  await query(`insert into auth.users(id,email,email_confirmed_at) values
    ($1,'a@example.test',now()),($2,'b@example.test',now()),($3,'c@example.test',now())`,[A,B,C]);
});
afterEach(async()=>{await db.exec('reset role; rollback');});
after(async()=>{if(db)await db.close();});

test('Anonymous role cannot read any personal or shared table',async()=>{
  await as(null,'anon');
  for(const table of ['profiles','friendships','share_permissions','finance_rows','finance_cells',
    'finance_snapshots','finance_dashboard_snapshots','finance_shared_sheet_snapshots','finance_shared_dashboard_snapshots']){
    await denied('select * from public.'+table,[]);
  }
});
test('Cannot manufacture an already accepted friendship through a direct INSERT',async()=>{
  await as(A);await denied("insert into public.friendships(owner_id,friend_id,status) values($1,$2,'accepted')",[A,B]);
});
test('Cannot rewrite the identity or status of a friendship directly',async()=>{
  const id=await friendship();await as(B);
  await denied('update public.friendships set owner_id=$1 where id=$2',[C,id]);
  await denied('delete from public.friendships where id=$1',[id]);
});
test('Only the recipient can accept a pending invitation',async()=>{
  await as(A);const id=await value('select public.send_friend_request_by_email($1)',['b@example.test']);
  await denied('select public.respond_to_friend_request($1,true)',[id]);
  await as(C);await denied('select public.respond_to_friend_request($1,true)',[id]);
  await as(B);assert.equal(await value('select public.respond_to_friend_request($1,true)',[id]),true);
});
test('Friend invitation resolves verified Auth email, not an editable profile email',async()=>{
  await as(C);await query("update public.profiles set email='b@example.test' where id=$1",[C]);
  await as(A);const id=await value('select public.send_friend_request_by_email($1)',[' B@example.test ']);
  assert.equal(await value('select friend_id from public.friendships where id=$1',[id]),B);
});
test('An unconfirmed email cannot be invited',async()=>{
  await query('update auth.users set email_confirmed_at=null where id=$1',[B]);await as(A);
  await denied('select public.send_friend_request_by_email($1)',['b@example.test'],/user_not_found/);
});
test('Accepting an invitation grants no access by default',async()=>{
  await friendship();await as(B);
  assert.equal(await value('select count(*)::int from public.share_permissions'),0);
  assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),0);
});
test('Recipient sees only filtered copies; stranger and full snapshot stay private',async()=>{
  await friendship();await share(A,B);
  await query('insert into public.finance_snapshots(owner_id,payload) values($1,$2)',[A,JSON.stringify({private:'not shared'})]);
  await as(B);
  assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),1);
  assert.equal(await value('select count(*)::int from public.finance_shared_dashboard_snapshots'),1);
  assert.equal(await value('select count(*)::int from public.finance_snapshots'),0);
  await as(C);
  assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),0);
  assert.equal(await value('select count(*)::int from public.finance_shared_dashboard_snapshots'),0);
});
test('Neither owner nor recipient can bypass controlled share writes',async()=>{
  await friendship();await share(A,B);
  for(const id of [A,B]){await as(id);
    await denied('update public.share_permissions set allowed=true',[]);
    await denied("update public.finance_shared_sheet_snapshots set payload='{}'",[]);
  }
});
test('Revocation prevents a stale background refresh from reactivating access',async()=>{
  await friendship();await share(A,B);await share(A,B,false);
  assert.equal(await value('select public.refresh_friend_share_snapshots($1,$2,$3,$4)',
    [B,JSON.stringify(rules),JSON.stringify(sheet),JSON.stringify(dashboard)]),false);
  await as(B);assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),0);
});
test('A stale month selection is rejected without changing a current snapshot',async()=>{
  await friendship();await share(A,B);
  assert.equal(await value('select public.refresh_friend_share_snapshots($1,$2,$3,$4)',
    [B,JSON.stringify([{...rules[0],month:2}]),JSON.stringify(sheet),JSON.stringify(dashboard)]),false);
});
test('Invalid save leaves the existing share intact',async()=>{
  await friendship();await share(A,B);
  await denied('select public.save_friend_share_config($1,true,true,$2,$3,$4)',
    [B,JSON.stringify([{...rules[0],month:13}]),JSON.stringify(sheet),JSON.stringify(dashboard)],/invalid_share_rules/);
  await as(B);assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),1);
});
test('A third person cannot remove an existing relationship',async()=>{
  const id=await friendship();await as(C);await denied('select public.remove_friendship($1)',[id]);
  await as(A);assert.equal(await value('select count(*)::int from public.friendships'),1);
});
test('Removal revokes both directions; reacceptance never resurrects old permissions',async()=>{
  const id=await friendship();await share(A,B);await share(B,A);await as(A);
  assert.equal(await value('select public.remove_friendship($1)',[id]),true);
  assert.equal(await value('select public.remove_friendship($1)',[id]),true);
  await db.exec('reset role');
  for(const table of ['share_permissions','finance_shared_sheet_snapshots','finance_shared_dashboard_snapshots']){
    assert.equal(await value('select count(*)::int from public.'+table),0);
  }
  await friendship();await as(A);assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),0);
  await as(B);assert.equal(await value('select count(*)::int from public.finance_shared_dashboard_snapshots'),0);
});
test('Administrative friendship removal also triggers bilateral revocation',async()=>{
  const id=await friendship();await share(A,B);await share(B,A);await db.exec('reset role');
  await query('delete from public.friendships where id=$1',[id]);
  assert.equal(await value('select count(*)::int from public.share_permissions'),0);
});
test('Historical inverse duplicates cannot preserve a relationship after removal',async()=>{
  const id=await friendship();await db.exec('reset role');
  await query("insert into public.friendships(owner_id,friend_id,status) values($1,$2,'accepted')",[B,A]);
  await share(A,B);await share(B,A);await as(A);
  assert.equal(await value('select public.remove_friendship($1)',[id]),true);
  await db.exec('reset role');
  assert.equal(await value('select count(*)::int from public.friendships'),0);
  assert.equal(await value('select count(*)::int from public.share_permissions'),0);
  await as(B);assert.equal(await value('select count(*)::int from public.profiles where id=$1',[A]),0);
});
test('Declining a redundant old invitation preserves an existing accepted share',async()=>{
  await friendship();await db.exec('reset role');
  const id=await value("insert into public.friendships(owner_id,friend_id,status) values($1,$2,'pending') returning id",[B,A]);
  await share(A,B);
  await query('select public.respond_to_friend_request($1,false)',[id]);
  await as(B);
  assert.equal(await value('select count(*)::int from public.finance_shared_sheet_snapshots'),1);
  assert.equal(await value("select count(*)::int from public.friendships where status='accepted'"),1);
});
