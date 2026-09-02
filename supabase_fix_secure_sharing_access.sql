-- Gestion Finance — correctif définitif du partage entre amis.
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Cette migration est idempotente et n'accorde jamais d'accès par défaut.

begin;

create table if not exists public.finance_shared_sheet_snapshots (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);

create table if not exists public.finance_shared_dashboard_snapshots (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);

alter table public.share_permissions
  add column if not exists can_view_dashboard boolean not null default false,
  add column if not exists can_view_sheet boolean not null default false,
  add column if not exists can_view_categories boolean not null default false;

alter table public.share_permissions enable row level security;
alter table public.finance_shared_sheet_snapshots enable row level security;
alter table public.finance_shared_dashboard_snapshots enable row level security;

-- Les droits SQL sont nécessaires à PostgREST ; les policies RLS ci-dessous
-- restent la véritable barrière de sécurité.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.share_permissions to authenticated;
grant select, insert, update, delete on table public.finance_shared_sheet_snapshots to authenticated;
grant select, insert, update, delete on table public.finance_shared_dashboard_snapshots to authenticated;
grant select, delete on table public.friendships to authenticated;

-- Le propriétaire peut lire et retirer ses propres réglages. Une création ou
-- mise à jour exige obligatoirement une amitié déjà acceptée.
drop policy if exists "share_perm_owner_all" on public.share_permissions;
create policy "share_perm_owner_all" on public.share_permissions
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = share_permissions.owner_id and f.friend_id = share_permissions.friend_id)
          or (f.friend_id = share_permissions.owner_id and f.owner_id = share_permissions.friend_id))
    )
  );

-- L'ami ne peut voir que le drapeau global, jamais le détail des lignes.
drop policy if exists "share_perm_friend_select" on public.share_permissions;
drop policy if exists "share_perm_friend_global_select" on public.share_permissions;
create policy "share_perm_friend_global_select" on public.share_permissions
  for select to authenticated
  using (
    auth.uid() = friend_id
    and year is null and month is null and row_key is null
  );

drop policy if exists "shared_sheet_owner_all" on public.finance_shared_sheet_snapshots;
create policy "shared_sheet_owner_all" on public.finance_shared_sheet_snapshots
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_sheet_snapshots.owner_id and f.friend_id = finance_shared_sheet_snapshots.friend_id)
          or (f.friend_id = finance_shared_sheet_snapshots.owner_id and f.owner_id = finance_shared_sheet_snapshots.friend_id))
    )
  );

drop policy if exists "shared_sheet_recipient_select" on public.finance_shared_sheet_snapshots;
create policy "shared_sheet_recipient_select" on public.finance_shared_sheet_snapshots
  for select to authenticated
  using (
    auth.uid() = friend_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_sheet_snapshots.owner_id and f.friend_id = finance_shared_sheet_snapshots.friend_id)
          or (f.friend_id = finance_shared_sheet_snapshots.owner_id and f.owner_id = finance_shared_sheet_snapshots.friend_id))
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = finance_shared_sheet_snapshots.owner_id
        and p.friend_id = auth.uid()
        and p.year is null and p.month is null and p.row_key is null
        and p.can_view_sheet = true
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = finance_shared_sheet_snapshots.owner_id
        and p.friend_id = auth.uid()
        and p.allowed = true
        and p.year is not null and p.month is not null and p.row_key is not null
    )
  );

drop policy if exists "shared_dashboard_owner_all" on public.finance_shared_dashboard_snapshots;
create policy "shared_dashboard_owner_all" on public.finance_shared_dashboard_snapshots
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_dashboard_snapshots.owner_id and f.friend_id = finance_shared_dashboard_snapshots.friend_id)
          or (f.friend_id = finance_shared_dashboard_snapshots.owner_id and f.owner_id = finance_shared_dashboard_snapshots.friend_id))
    )
  );

drop policy if exists "shared_dashboard_recipient_select" on public.finance_shared_dashboard_snapshots;
create policy "shared_dashboard_recipient_select" on public.finance_shared_dashboard_snapshots
  for select to authenticated
  using (
    auth.uid() = friend_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_dashboard_snapshots.owner_id and f.friend_id = finance_shared_dashboard_snapshots.friend_id)
          or (f.friend_id = finance_shared_dashboard_snapshots.owner_id and f.owner_id = finance_shared_dashboard_snapshots.friend_id))
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = finance_shared_dashboard_snapshots.owner_id
        and p.friend_id = auth.uid()
        and p.year is null and p.month is null and p.row_key is null
        and p.can_view_dashboard = true
    )
    and exists (
      select 1 from public.share_permissions p
      where p.owner_id = finance_shared_dashboard_snapshots.owner_id
        and p.friend_id = auth.uid()
        and p.allowed = true
        and p.year is not null and p.month is not null and p.row_key is not null
    )
  );

-- Écriture atomique : aucune ancienne autorisation n'est effacée si une des
-- vérifications suivantes échoue. La fonction ne peut cibler qu'un ami accepté.
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

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.owner_id = auth.uid() and f.friend_id = p_friend_id)
        or (f.friend_id = auth.uid() and f.owner_id = p_friend_id))
  ) then
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
  if p_can_view_dashboard and p_dashboard_payload is null then
    raise exception 'missing_dashboard_payload';
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

commit;

