-- Gestion Finance — partage bidirectionnel et sécurisé
-- À exécuter une seule fois dans Supabase > SQL Editor.

begin;

-- Les anciennes bases pouvaient contenir plusieurs permissions globales car
-- PostgreSQL considère plusieurs NULL comme distincts dans une contrainte UNIQUE.
delete from public.share_permissions older
using public.share_permissions newer
where older.owner_id = newer.owner_id
  and older.friend_id = newer.friend_id
  and older.year is null and older.month is null and older.row_key is null
  and newer.year is null and newer.month is null and newer.row_key is null
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index if not exists idx_share_permissions_global_unique
  on public.share_permissions(owner_id, friend_id)
  where year is null and month is null and row_key is null;

drop policy if exists "profiles_self_or_friend_select" on public.profiles;
create policy "profiles_self_or_friend_select" on public.profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.owner_id = auth.uid() and f.friend_id = profiles.id)
        or (f.friend_id = auth.uid() and f.owner_id = profiles.id))
  )
);

create table if not exists public.finance_dashboard_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_dashboard_snapshots enable row level security;

drop policy if exists "snapshots_owner_or_authorized_friend_select" on public.finance_snapshots;
create policy "snapshots_owner_or_authorized_friend_select" on public.finance_snapshots
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.friendships f
      join public.share_permissions p
        on p.owner_id = finance_snapshots.owner_id
       and p.friend_id = auth.uid()
       and p.year is null and p.month is null and p.row_key is null
       and p.can_view_sheet = true
      where f.status = 'accepted'
        and ((f.owner_id = finance_snapshots.owner_id and f.friend_id = auth.uid())
          or (f.friend_id = finance_snapshots.owner_id and f.owner_id = auth.uid()))
    )
  );

drop policy if exists "dashboard_snapshots_owner_all" on public.finance_dashboard_snapshots;
drop policy if exists "dashboard_snapshots_authorized_friend_select" on public.finance_dashboard_snapshots;
create policy "dashboard_snapshots_owner_all" on public.finance_dashboard_snapshots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "dashboard_snapshots_authorized_friend_select" on public.finance_dashboard_snapshots
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.friendships f
      join public.share_permissions p
        on p.owner_id = finance_dashboard_snapshots.owner_id
       and p.friend_id = auth.uid()
       and p.year is null and p.month is null and p.row_key is null
       and p.can_view_dashboard = true
      where f.status = 'accepted'
        and ((f.owner_id = finance_dashboard_snapshots.owner_id and f.friend_id = auth.uid())
          or (f.friend_id = finance_dashboard_snapshots.owner_id and f.owner_id = auth.uid()))
    )
  );

commit;
