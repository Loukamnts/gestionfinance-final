-- Gestion Finance — lecture des partages reçus (8 septembre 2026).
-- Corrige une vérification RLS qui masquait tous les snapshots au destinataire.
-- Ne modifie ni les autorisations enregistrées, ni les données financières.
begin;

create schema if not exists finance_private;
revoke all on schema finance_private from public;
grant usage on schema finance_private to authenticated;

-- Ce helper ne renvoie qu'un booléen pour le destinataire connecté.
-- Le schéma privé n'est pas exposé à PostgREST.
create or replace function finance_private.can_read_share(p_owner_id uuid, p_kind text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_owner_id <> auth.uid()
    and p_kind in ('sheet', 'dashboard')
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = p_owner_id and f.friend_id = auth.uid())
          or (f.friend_id = p_owner_id and f.owner_id = auth.uid()))
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = p_owner_id and p.friend_id = auth.uid()
        and p.year is null and p.month is null and p.row_key is null
        and case p_kind when 'sheet' then p.can_view_sheet
                        when 'dashboard' then p.can_view_dashboard else false end
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = p_owner_id and p.friend_id = auth.uid()
        and p.allowed = true and p.year is not null
        and p.month between 1 and 12 and nullif(btrim(p.row_key), '') is not null
    );
$$;
revoke all on function finance_private.can_read_share(uuid, text) from public, anon;
grant execute on function finance_private.can_read_share(uuid, text) to authenticated;

alter policy shared_sheet_recipient_select on public.finance_shared_sheet_snapshots
  to authenticated
  using (auth.uid() = friend_id and finance_private.can_read_share(owner_id, 'sheet'));
alter policy shared_dashboard_recipient_select on public.finance_shared_dashboard_snapshots
  to authenticated
  using (auth.uid() = friend_id and finance_private.can_read_share(owner_id, 'dashboard'));

-- La synchronisation ne doit jamais réactiver un accès retiré depuis un autre appareil.
create or replace function public.refresh_friend_share_snapshots(
  p_friend_id uuid, p_rules jsonb, p_sheet_payload jsonb, p_dashboard_payload jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare rights record;
begin
  if auth.uid() is null or auth.uid() = p_friend_id then return false; end if;
  if not exists (select 1 from public.friendships f where f.status='accepted'
    and ((f.owner_id=auth.uid() and f.friend_id=p_friend_id)
      or (f.friend_id=auth.uid() and f.owner_id=p_friend_id))) then return false; end if;
  select * into rights from public.share_permissions
    where owner_id=auth.uid() and friend_id=p_friend_id
      and year is null and month is null and row_key is null for update;
  if not found or not (rights.can_view_sheet or rights.can_view_dashboard) then return false; end if;
  if jsonb_typeof(p_rules) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_rules)=0 then return false; end if;
  if (rights.can_view_sheet and p_sheet_payload is null)
    or (rights.can_view_dashboard and p_dashboard_payload is null) then return false; end if;
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
