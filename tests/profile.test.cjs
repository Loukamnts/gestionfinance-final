const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
let db;
const query=(sql,params=[])=>db.query(sql,params);
async function as(id){await db.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function value(sql,params=[]){return Object.values((await query(sql,params)).rows[0])[0];}
async function rejected(sql,params,pattern){await db.exec('savepoint rejected');try{await assert.rejects(query(sql,params),pattern);}finally{await db.exec('rollback to savepoint rejected; release savepoint rejected');}}
before(async()=>{
  db=new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key references auth.users(id),email text,display_name text,created_at timestamptz not null default now());
    create table public.friendships(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),friend_id uuid not null references auth.users(id),status text not null default 'pending',created_at timestamptz not null default now());
    grant select,insert,update,delete on public.profiles,public.friendships to authenticated;
    alter table public.profiles enable row level security;
    alter table public.friendships enable row level security;
    create policy old_profile on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);
    create policy friendship_select on public.friendships for select using(auth.uid()=owner_id or auth.uid()=friend_id);`);
  await db.exec(fs.readFileSync(path.join(__dirname,'..','supabase_profile_usernames.sql'),'utf8'));
});
beforeEach(async()=>{
  await db.exec('reset role; begin');
  await query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.test',now()),($2,'b@example.test',now())",[A,B]);
  await query("insert into public.profiles(id,email,display_name) values($1,'a@example.test','A'),($2,'b@example.test','B')",[A,B]);
});
afterEach(async()=>{await db.exec('reset role; rollback');});
after(async()=>{if(db)await db.close();});

test('A user has one unique username and cannot change it again for 30 days',async()=>{
  await as(A);
  assert.equal(await value('select username from public.set_my_username($1)',['Louka_1']),'louka_1');
  await rejected('select username from public.set_my_username($1)',['new-name'],/username_cooldown/);
  await as(B);
  await rejected('select username from public.set_my_username($1)',['LOUKA_1'],/username_taken/);
  assert.equal(await value('select username from public.set_my_username($1)',['friend_2']),'friend_2');
});
test('A client cannot edit username or its change date directly',async()=>{
  await as(A);
  await rejected("update public.profiles set username='bypass',username_changed_at=null where id=$1",[A],/permission denied/);
});
test('Invitation by username remains private until accepted',async()=>{
  await as(B);await query('select public.set_my_username($1)',['friend_2']);
  await as(A);const id=await value('select public.send_friend_request($1)',['FRIEND_2']);
  assert.equal(await value('select other_display_name from public.get_my_friendships()'),'Utilisateur Meuniance');
  await db.exec('reset role');await query("update public.friendships set status='accepted' where id=$1",[id]);
  await as(A);assert.equal(await value('select other_display_name from public.get_my_friendships()'),'friend_2');
});
test('A cancelled invitation cannot be resent to the same person for 24 hours',async()=>{
  await as(A);const id=await value('select public.send_friend_request($1)',['b@example.test']);
  await db.exec('reset role');await query('delete from public.friendships where id=$1',[id]);
  await as(A);await rejected('select public.send_friend_request_by_email($1)',['b@example.test'],/request_cooldown/);
});
