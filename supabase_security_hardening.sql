-- Gestion Finance — durcissement du 9 septembre 2026.
-- Appliquer APRES les migrations de partage et supabase_fix_shared_snapshot_read.sql.
-- Réexécutable. Ne supprime aucun compte ni tableur personnel.
-- Désactive les anciens droits sans amitié acceptée, sans effacer les copies existantes.
begin;

-- Les RPC contrôlées sont la seule porte d'écriture des relations et partages.
revoke all on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;
revoke all on public.share_permissions, public.finance_shared_sheet_snapshots,
  public.finance_shared_dashboard_snapshots from public, anon, authenticated;
grant select on public.share_permissions, public.finance_shared_sheet_snapshots,
  public.finance_shared_dashboard_snapshots to authenticated;
revoke all on public.profiles, public.finance_rows, public.finance_cells,
  public.finance_snapshots, public.finance_dashboard_snapshots from public, anon;
drop policy if exists friendships_owner_insert on public.friendships;
drop policy if exists friendships_recipient_update on public.friendships;

create schema if not exists finance_private;
revoke all on schema finance_private from public, anon;

-- Défense supplémentaire, même pour une suppression depuis l'administration.
create or replace function finance_private.revoke_friendship_shares()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.owner_id = old.owner_id and new.friend_id = old.friend_id
       and (new.status = 'accepted' or old.status <> 'accepted') then return new; end if;
  end if;
  -- Refuser une invitation historique redondante ne coupe pas une amitié
  -- déjà acceptée. remove_friendship retire, lui, toute la paire atomiquement.
  if exists (select 1 from public.friendships f where f.status='accepted'
    and ((f.owner_id=old.owner_id and f.friend_id=old.friend_id)
      or (f.owner_id=old.friend_id and f.friend_id=old.owner_id))) then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;
  delete from public.share_permissions
    where (owner_id=old.owner_id and friend_id=old.friend_id)
       or (owner_id=old.friend_id and friend_id=old.owner_id);
  delete from public.finance_shared_sheet_snapshots
    where (owner_id=old.owner_id and friend_id=old.friend_id)
       or (owner_id=old.friend_id and friend_id=old.owner_id);
  delete from public.finance_shared_dashboard_snapshots
    where (owner_id=old.owner_id and friend_id=old.friend_id)
       or (owner_id=old.friend_id and friend_id=old.owner_id);
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function finance_private.revoke_friendship_shares() from public, anon, authenticated;
drop trigger if exists revoke_friendship_shares on public.friendships;
create trigger revoke_friendship_shares after delete or update on public.friendships
  for each row execute function finance_private.revoke_friendship_shares();

create or replace function public.remove_friendship(p_friendship_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare relation public.friendships%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into relation from public.friendships where id=p_friendship_id;
  if not found then return true; end if; -- répétition sans effet
  if auth.uid() <> relation.owner_id and auth.uid() <> relation.friend_id then
    raise exception 'friend_request_not_found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(relation.owner_id::text,relation.friend_id::text)||':'||greatest(relation.owner_id::text,relation.friend_id::text),0));
  -- Des versions anciennes pouvaient créer deux relations inverses.
  -- Verrouiller puis retirer toute la paire empêche un ancien doublon de survivre.
  perform 1 from public.friendships f
    where (f.owner_id=relation.owner_id and f.friend_id=relation.friend_id)
       or (f.owner_id=relation.friend_id and f.friend_id=relation.owner_id)
    order by f.id for update;
  delete from public.friendships f
    where (f.owner_id=relation.owner_id and f.friend_id=relation.friend_id)
       or (f.owner_id=relation.friend_id and f.friend_id=relation.owner_id);
  return true;
end;
$$;
revoke all on function public.remove_friendship(uuid) from public, anon;
grant execute on function public.remove_friendship(uuid) to authenticated;

-- L'adresse destinataire vient d'Auth, jamais d'un profil modifiable.
create or replace function public.send_friend_request_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid; relation public.friendships%rowtype; request_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_email is null or length(btrim(p_email)) > 254 then raise exception 'user_not_found'; end if;
  select u.id into target_id from auth.users u
    where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null limit 1;
  if target_id is null then raise exception 'user_not_found'; end if;
  if target_id=auth.uid() then raise exception 'cannot_add_self'; end if;
  -- Sérialise les deux directions, y compris deux invitations simultanées.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(auth.uid()::text,target_id::text)||':'||greatest(auth.uid()::text,target_id::text),0));
  select * into relation from public.friendships f
    where (f.owner_id=auth.uid() and f.friend_id=target_id)
       or (f.owner_id=target_id and f.friend_id=auth.uid()) limit 1 for update;
  if found then
    if relation.status='accepted' then raise exception 'already_friends'; end if;
    if relation.status='pending' and relation.owner_id=auth.uid() then raise exception 'request_already_sent'; end if;
    if relation.status='pending' then raise exception 'request_already_received'; end if;
    raise exception 'friend_request_blocked';
  end if;
  insert into public.friendships(owner_id,friend_id,status)
    values(auth.uid(),target_id,'pending') returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.send_friend_request_by_email(text) from public, anon;
grant execute on function public.send_friend_request_by_email(text) to authenticated;

create or replace function public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare relation public.friendships%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_accept is null then raise exception 'invalid_friend_response'; end if;
  select * into relation from public.friendships where id=p_friendship_id for update;
  if not found or relation.friend_id<>auth.uid() then raise exception 'friend_request_not_found'; end if;
  if relation.status<>'pending' then raise exception 'friend_request_not_pending'; end if;
  if p_accept then update public.friendships set status='accepted' where id=p_friendship_id;
  else delete from public.friendships where id=p_friendship_id; end if;
  return true;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid,boolean) from public, anon;
grant execute on function public.respond_to_friend_request(uuid,boolean) to authenticated;

-- Les anciennes autorisations orphelines ne doivent pas revivre à la réinvitation.
update public.share_permissions p
set allowed=false, can_view_sheet=false, can_view_dashboard=false, can_view_categories=false
where not exists (
  select 1 from public.friendships f where f.status='accepted'
    and ((f.owner_id=p.owner_id and f.friend_id=p.friend_id)
      or (f.owner_id=p.friend_id and f.friend_id=p.owner_id)));

-- Réaffirme que les instantanés complets restent exclusivement personnels.
drop policy if exists snapshots_owner_or_authorized_friend_select on public.finance_snapshots;
drop policy if exists dashboard_snapshots_authorized_friend_select on public.finance_dashboard_snapshots;

-- Même ordre de verrouillage partout : relation, puis permissions.
-- Une synchronisation concurrente ne peut pas remettre des copies après le retrait.
create or replace function public.valid_shared_sheet_payload(p_payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  total_cells integer := 0;
  row_count integer;
  col_count integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 524288
    or jsonb_typeof(p_payload->'sheets') <> 'array' then return false; end if;
  if jsonb_array_length(p_payload->'sheets') not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(p_payload->'sheets') loop
    if jsonb_typeof(item) <> 'object'
      or coalesce(item->>'rows','') !~ '^[0-9]{1,3}$'
      or coalesce(item->>'cols','') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(item->'headers') <> 'array'
      or jsonb_typeof(item->'rowHeaders') <> 'array'
      or jsonb_typeof(item->'cells') <> 'object' then return false; end if;
    row_count := (item->>'rows')::integer;
    col_count := (item->>'cols')::integer;
    if row_count > 500 or col_count < 1 or col_count > 12
      or jsonb_array_length(item->'headers') > 12
      or jsonb_array_length(item->'rowHeaders') > 500 then return false; end if;
    total_cells := total_cells + row_count * col_count;
    if total_cells > 6000 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.valid_shared_sheet_payload(jsonb) from public, anon;
grant execute on function public.valid_shared_sheet_payload(jsonb) to authenticated;

create or replace function public.valid_shared_dashboard_payload(p_payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  total_details integer := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 524288
    or jsonb_typeof(p_payload->'months') <> 'array' then return false; end if;
  if jsonb_array_length(p_payload->'months') > 240 then return false; end if;
  for item in select value from jsonb_array_elements(p_payload->'months') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if item ? 'details' then
      if jsonb_typeof(item->'details') <> 'array' then return false; end if;
      total_details := total_details + jsonb_array_length(item->'details');
      if total_details > 6000 then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.valid_shared_dashboard_payload(jsonb) from public, anon;
grant execute on function public.valid_shared_dashboard_payload(jsonb) to authenticated;

-- L'ancien RPC de cellules doit suivre la même autorisation globale que les copies filtrées.
create or replace function public.shared_rows_for_me(p_year int default null)
returns table (owner_id uuid, owner_email text, year int, row_key text, row_label text,
  row_order int, rule text, month int, value numeric)
language sql security definer set search_path = '' as $$
  with accepted as (
    select f.owner_id as oid, p.email as oemail
    from public.friendships f join public.profiles p on p.id = f.owner_id
    where f.friend_id = auth.uid() and f.status = 'accepted'
      and exists (select 1 from public.share_permissions access
        where access.owner_id=f.owner_id and access.friend_id=auth.uid()
          and access.year is null and access.month is null and access.row_key is null
          and access.can_view_sheet=true)
  )
  select r.owner_id,a.oemail,r.year,r.row_key,r.row_label,r.row_order,r.rule,c.month,c.value
  from accepted a join public.finance_rows r on r.owner_id=a.oid
    join public.finance_cells c on c.row_id=r.id
  where (p_year is null or r.year=p_year)
    and exists (select 1 from public.share_permissions sp
      where sp.owner_id=r.owner_id and sp.friend_id=auth.uid() and sp.allowed=true
        and (sp.year is null or sp.year=r.year)
        and (sp.month is null or sp.month=c.month)
        and (sp.row_key is null or sp.row_key=r.row_key))
  order by a.oemail,r.year,r.row_order,c.month;
$$;
revoke all on function public.shared_rows_for_me(int) from public, anon;
grant execute on function public.shared_rows_for_me(int) to authenticated;

create or replace function public.save_friend_share_config(
  p_friend_id uuid,
  p_can_view_dashboard boolean,
  p_can_view_sheet boolean,
  p_rules jsonb,
  p_sheet_payload jsonb,
  p_dashboard_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_friend_id is null or p_friend_id = auth.uid() then
    raise exception 'invalid_share_recipient';
  end if;

  perform 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.owner_id = auth.uid() and f.friend_id = p_friend_id)
        or (f.friend_id = auth.uid() and f.owner_id = p_friend_id))
    order by f.id for update;
  if not found then
    raise exception 'friendship_not_accepted';
  end if;

  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_share_rules';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb)) as r(year integer, month integer, row_key text)
    where r.year is null
       or r.month is null or r.month not between 1 and 12
       or nullif(btrim(r.row_key), '') is null
  ) then
    raise exception 'invalid_share_rules';
  end if;

  select count(*) into selected_count
  from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb)) as r(year integer, month integer, row_key text);

  if (coalesce(p_can_view_dashboard, false) or coalesce(p_can_view_sheet, false)) and selected_count = 0 then
    raise exception 'share_selection_required';
  end if;

  if p_can_view_sheet and p_sheet_payload is null then
    raise exception 'missing_sheet_payload';
  end if;
  if p_can_view_sheet and not public.valid_shared_sheet_payload(p_sheet_payload) then
    raise exception 'invalid_sheet_payload';
  end if;
  if p_can_view_dashboard and p_dashboard_payload is null then
    raise exception 'missing_dashboard_payload';
  end if;
  if p_can_view_dashboard and not public.valid_shared_dashboard_payload(p_dashboard_payload) then
    raise exception 'invalid_dashboard_payload';
  end if;

  delete from public.share_permissions
  where owner_id = auth.uid() and friend_id = p_friend_id;

  insert into public.share_permissions (
    owner_id, friend_id, can_view_dashboard, can_view_sheet, can_view_categories,
    year, month, row_key, allowed
  ) values (
    auth.uid(), p_friend_id, coalesce(p_can_view_dashboard, false),
    coalesce(p_can_view_sheet, false), false, null, null, null, false
  );

  insert into public.share_permissions (
    owner_id, friend_id, can_view_dashboard, can_view_sheet, can_view_categories,
    year, month, row_key, allowed
  )
  select auth.uid(), p_friend_id, false, false, false, r.year, r.month, r.row_key, true
  from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb)) as r(year integer, month integer, row_key text)
  on conflict do nothing;

  if coalesce(p_can_view_sheet, false) then
    insert into public.finance_shared_sheet_snapshots (owner_id, friend_id, payload, updated_at)
    values (auth.uid(), p_friend_id, p_sheet_payload, now())
    on conflict (owner_id, friend_id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at;
  else
    delete from public.finance_shared_sheet_snapshots
    where owner_id = auth.uid() and friend_id = p_friend_id;
  end if;

  if coalesce(p_can_view_dashboard, false) then
    insert into public.finance_shared_dashboard_snapshots (owner_id, friend_id, payload, updated_at)
    values (auth.uid(), p_friend_id, p_dashboard_payload, now())
    on conflict (owner_id, friend_id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at;
  else
    delete from public.finance_shared_dashboard_snapshots
    where owner_id = auth.uid() and friend_id = p_friend_id;
  end if;
end;
$$;

revoke all on function public.save_friend_share_config(uuid, boolean, boolean, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_friend_share_config(uuid, boolean, boolean, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.refresh_friend_share_snapshots(
  p_friend_id uuid, p_rules jsonb, p_sheet_payload jsonb, p_dashboard_payload jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare rights record;
begin
  if auth.uid() is null or auth.uid() = p_friend_id then return false; end if;
  perform 1 from public.friendships f where f.status='accepted'
    and ((f.owner_id=auth.uid() and f.friend_id=p_friend_id)
      or (f.friend_id=auth.uid() and f.owner_id=p_friend_id)) order by f.id for update;
  if not found then return false; end if;
  select * into rights from public.share_permissions
    where owner_id=auth.uid() and friend_id=p_friend_id
      and year is null and month is null and row_key is null for update;
  if not found or not (rights.can_view_sheet or rights.can_view_dashboard) then return false; end if;
  if jsonb_typeof(p_rules) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_rules)=0 then return false; end if;
  if (rights.can_view_sheet and p_sheet_payload is null)
    or (rights.can_view_dashboard and p_dashboard_payload is null) then return false; end if;
  if rights.can_view_sheet and not public.valid_shared_sheet_payload(p_sheet_payload) then return false; end if;
  if rights.can_view_dashboard and not public.valid_shared_dashboard_payload(p_dashboard_payload) then return false; end if;
  -- Refuse un instantané calculé à partir d'une ancienne sélection.
  if exists (
    (select year,month,row_key from public.share_permissions
      where owner_id=auth.uid() and friend_id=p_friend_id and allowed
        and year is not null and month is not null and row_key is not null
     except select year,month,row_key from jsonb_to_recordset(p_rules) as r(year integer,month integer,row_key text))
    union all
    (select year,month,row_key from jsonb_to_recordset(p_rules) as r(year integer,month integer,row_key text)
     except select year,month,row_key from public.share_permissions
      where owner_id=auth.uid() and friend_id=p_friend_id and allowed
        and year is not null and month is not null and row_key is not null)
  ) then return false; end if;
  if rights.can_view_sheet then
    insert into public.finance_shared_sheet_snapshots(owner_id,friend_id,payload,updated_at)
      values(auth.uid(),p_friend_id,p_sheet_payload,now())
      on conflict(owner_id,friend_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  end if;
  if rights.can_view_dashboard then
    insert into public.finance_shared_dashboard_snapshots(owner_id,friend_id,payload,updated_at)
      values(auth.uid(),p_friend_id,p_dashboard_payload,now())
      on conflict(owner_id,friend_id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  end if;
  return true;
end;
$$;
revoke all on function public.refresh_friend_share_snapshots(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.refresh_friend_share_snapshots(uuid,jsonb,jsonb,jsonb) to authenticated;


commit;
