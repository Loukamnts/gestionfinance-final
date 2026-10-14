-- Durcissement Supabase du 14 octobre 2026 (appliqué via la migration « hardening_20261014 »).
-- Aucune donnée n'est modifiée ; seuls des droits, des limites et un compteur anti-abus sont ajoutés.

-- 1. Fonction de l'ancien partage ligne par ligne : plus utilisée par le site, et trop large si une
--    autorisation globale venait à être ouverte. On la ferme à tous les rôles publics.
revoke execute on function public.shared_rows_for_me(integer) from public, anon, authenticated;

-- 2. Déclencheur d'événement interne : jamais appelable utilement depuis l'API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 3. Droits de table inutiles pour les rôles de l'API (TRUNCATE ignore la RLS, TRIGGER/REFERENCES ne servent pas).
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- 4. Limite de taille des sauvegardes personnelles (5 Mo ; un tableur réel pèse quelques Ko).
alter table public.finance_snapshots
  add constraint finance_snapshots_payload_size check (octet_length(payload::text) <= 5242880);
alter table public.finance_dashboard_snapshots
  add constraint finance_dashboard_snapshots_payload_size check (octet_length(payload::text) <= 5242880);

-- 5. Cohérence des autorisations de partage.
alter table public.share_permissions
  add constraint share_permissions_month_range check (month is null or month between 1 and 12),
  add constraint share_permissions_year_range check (year is null or year between 1900 and 2200),
  add constraint share_permissions_row_key_length check (row_key is null or char_length(row_key) <= 200);

-- 6. Anti-énumération : au plus 30 recherches d'amis par heure et par compte
--    (empêche de tester en masse si une adresse e-mail possède un compte).
create table if not exists public.friend_request_attempts (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists friend_request_attempts_sender_time on public.friend_request_attempts (sender_id, attempted_at desc);
alter table public.friend_request_attempts enable row level security;
revoke all on table public.friend_request_attempts from public, anon, authenticated;

create or replace function public.send_friend_request(p_identifier text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_target_id uuid; relation public.friendships%rowtype; request_id uuid; ident text; recent integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Compteur anti-abus : chaque recherche compte, qu'elle trouve un compte ou non.
  delete from public.friend_request_attempts where sender_id = auth.uid() and attempted_at < now() - interval '1 day';
  select count(*) into recent from public.friend_request_attempts
    where sender_id = auth.uid() and attempted_at > now() - interval '1 hour';
  if recent >= 30 then raise exception 'too_many_friend_requests'; end if;
  insert into public.friend_request_attempts(sender_id) values (auth.uid());
  ident:=lower(btrim(coalesce(p_identifier,'')));
  -- Introuvable : on renvoie NULL au lieu d'une erreur, pour que la tentative reste comptée
  -- (une erreur annulerait toute la transaction, compteur compris). Le site affiche « Aucun compte trouvé ».
  if length(ident)<3 or length(ident)>254 then return null; end if;
  if position('@' in ident)>0 then
    select u.id into v_target_id from auth.users u where lower(u.email)=ident and u.email_confirmed_at is not null limit 1;
  else
    select p.id into v_target_id from public.profiles p join auth.users u on u.id=p.id
      where lower(p.username)=ident and u.email_confirmed_at is not null limit 1;
  end if;
  if v_target_id is null then return null; end if;
  if v_target_id=auth.uid() then raise exception 'cannot_add_self'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(auth.uid()::text,v_target_id::text)||':'||greatest(auth.uid()::text,v_target_id::text),0));
  select * into relation from public.friendships f
    where (f.owner_id=auth.uid() and f.friend_id=v_target_id) or (f.owner_id=v_target_id and f.friend_id=auth.uid()) limit 1 for update;
  if found then
    if relation.status='accepted' then raise exception 'already_friends'; end if;
    if relation.status='pending' and relation.owner_id=auth.uid() then raise exception 'request_already_sent'; end if;
    if relation.status='pending' then raise exception 'request_already_received'; end if;
    raise exception 'friend_request_blocked';
  end if;
  if exists(select 1 from public.friend_request_cooldowns c
    where c.sender_id=auth.uid() and c.target_id=v_target_id and c.last_sent_at>now()-interval '24 hours') then
    raise exception 'request_cooldown';
  end if;
  insert into public.friendships(owner_id,friend_id,status) values(auth.uid(),v_target_id,'pending') returning id into request_id;
  insert into public.friend_request_cooldowns(sender_id,target_id,last_sent_at) values(auth.uid(),v_target_id,now())
    on conflict(sender_id,target_id) do update set last_sent_at=excluded.last_sent_at;
  return request_id;
end;
$function$;
