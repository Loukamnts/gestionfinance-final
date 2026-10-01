-- Profil, pseudo unique et invitations par pseudo ou e-mail.
-- A appliquer dans l'editeur SQL Supabase apres les migrations existantes.
-- Les donnees financieres et les amities existantes ne sont pas modifiees.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists username_changed_at timestamptz;
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,23}$');
  end if;
end $$;

-- Aucune ecriture directe : le client ne peut pas falsifier la date de changement.
revoke insert, update, delete on public.profiles from public, authenticated, anon;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists "profiles_self_or_friend_select" on public.profiles;
create policy "profiles_self_or_friend_select" on public.profiles for select using (
  auth.uid()=id or exists(select 1 from public.friendships f
    where f.status='accepted' and
      ((f.owner_id=auth.uid() and f.friend_id=profiles.id)
        or (f.friend_id=auth.uid() and f.owner_id=profiles.id)))
);

create or replace function public.get_my_profile()
returns table(username text, username_changed_at timestamptz, created_at timestamptz, plan text, subscription_started_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare current_user_record auth.users%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into current_user_record from auth.users where id=auth.uid();
  if not found then raise exception 'not_authenticated'; end if;
  insert into public.profiles(id,email,display_name,created_at)
    values(current_user_record.id,current_user_record.email,
      split_part(coalesce(current_user_record.email,''),'@',1),current_user_record.created_at)
    on conflict (id) do nothing;
  return query select p.username,p.username_changed_at,current_user_record.created_at,
    'free'::text,null::timestamptz from public.profiles p where p.id=auth.uid();
end;
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.set_my_username(p_username text)
returns table(username text, username_changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare desired text; profile_record public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  desired:=lower(btrim(coalesce(p_username,'')));
  if desired !~ '^[a-z0-9][a-z0-9._-]{2,23}$' then raise exception 'invalid_username'; end if;
  -- Verrou d'une ligne : deux appels simultanes ne contournent pas le delai.
  perform public.get_my_profile();
  select * into profile_record from public.profiles where id=auth.uid() for update;
  if profile_record.username=desired then
    return query select profile_record.username,profile_record.username_changed_at;
    return;
  end if;
  if profile_record.username_changed_at is not null
     and profile_record.username_changed_at > now()-interval '30 days' then
    raise exception 'username_cooldown';
  end if;
  if exists(select 1 from public.profiles p where lower(p.username)=desired and p.id<>auth.uid()) then
    raise exception 'username_taken';
  end if;
  update public.profiles p set username=desired,username_changed_at=now(),display_name=desired
    where p.id=auth.uid();
  return query select p.username,p.username_changed_at from public.profiles p where p.id=auth.uid();
exception when unique_violation then
  raise exception 'username_taken';
end;
$$;
revoke all on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;

create table if not exists public.friend_request_cooldowns (
  sender_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  last_sent_at timestamptz not null default now(),
  primary key(sender_id,target_id)
);
alter table public.friend_request_cooldowns enable row level security;
revoke all on public.friend_request_cooldowns from public, anon, authenticated;
revoke insert, update, delete on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;
drop policy if exists friendships_owner_insert on public.friendships;
drop policy if exists friendships_recipient_update on public.friendships;

create or replace function public.send_friend_request(p_identifier text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_target_id uuid; relation public.friendships%rowtype; request_id uuid; ident text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  ident:=lower(btrim(coalesce(p_identifier,'')));
  if length(ident)<3 or length(ident)>254 then raise exception 'user_not_found'; end if;
  if position('@' in ident)>0 then
    select u.id into v_target_id from auth.users u
      where lower(u.email)=ident and u.email_confirmed_at is not null limit 1;
  else
    select p.id into v_target_id from public.profiles p join auth.users u on u.id=p.id
      where lower(p.username)=ident and u.email_confirmed_at is not null limit 1;
  end if;
  if v_target_id is null then raise exception 'user_not_found'; end if;
  if v_target_id=auth.uid() then raise exception 'cannot_add_self'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(auth.uid()::text,v_target_id::text)||':'||greatest(auth.uid()::text,v_target_id::text),0));
  select * into relation from public.friendships f
    where (f.owner_id=auth.uid() and f.friend_id=v_target_id)
       or (f.owner_id=v_target_id and f.friend_id=auth.uid()) limit 1 for update;
  if found then
    if relation.status='accepted' then raise exception 'already_friends'; end if;
    if relation.status='pending' and relation.owner_id=auth.uid() then raise exception 'request_already_sent'; end if;
    if relation.status='pending' then raise exception 'request_already_received'; end if;
    raise exception 'friend_request_blocked';
  end if;
  if exists(select 1 from public.friend_request_cooldowns c
    where c.sender_id=auth.uid() and c.target_id=v_target_id
      and c.last_sent_at>now()-interval '24 hours') then
    raise exception 'request_cooldown';
  end if;
  insert into public.friendships(owner_id,friend_id,status)
    values(auth.uid(),v_target_id,'pending') returning id into request_id;
  insert into public.friend_request_cooldowns(sender_id,target_id,last_sent_at)
    values(auth.uid(),v_target_id,now())
    on conflict(sender_id,target_id) do update set last_sent_at=excluded.last_sent_at;
  return request_id;
end;
$$;
revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

-- L'ancien point d'entree ne doit pas permettre de contourner le delai.
create or replace function public.send_friend_request_by_email(p_email text)
returns uuid language sql security definer set search_path = '' as $$
  select public.send_friend_request(p_email);
$$;
revoke all on function public.send_friend_request_by_email(text) from public, anon;
grant execute on function public.send_friend_request_by_email(text) to authenticated;

-- Ne divulgue le pseudo qu'une fois l'amitie acceptee.
create or replace function public.get_my_friendships()
returns table(friendship_id uuid,owner_id uuid,friend_id uuid,status text,created_at timestamptz,other_display_name text,other_email text)
language sql security definer set search_path = '' as $$
  select f.id,f.owner_id,f.friend_id,f.status,f.created_at,
    case when f.status='accepted' then coalesce(p.username,p.display_name)
      else 'Utilisateur Meuniance' end,
    case when f.status='accepted' then p.email else null end
  from public.friendships f
  left join public.profiles p on p.id=case when f.owner_id=auth.uid() then f.friend_id else f.owner_id end
  where f.owner_id=auth.uid() or f.friend_id=auth.uid()
  order by f.created_at desc;
$$;
revoke all on function public.get_my_friendships() from public, anon;
grant execute on function public.get_my_friendships() to authenticated;
