-- Gestion Finance — partage granulaire et sécurisé (à exécuter une seule fois).
-- Chaque ami ne lit qu'une copie filtrée par mois et par ligne.

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

alter table public.finance_shared_sheet_snapshots enable row level security;
alter table public.finance_shared_dashboard_snapshots enable row level security;

-- Une configuration issue de l'ancien écran ne donne jamais un accès implicite.
delete from public.share_permissions
where year is not null or month is not null or row_key is not null;

update public.share_permissions
set can_view_dashboard = false,
    can_view_sheet = false,
    can_view_categories = false,
    allowed = false
where year is null and month is null and row_key is null;

-- Empêche les doublons dans les nouvelles règles précises (mois + ligne).
create unique index if not exists idx_share_permissions_granular_unique
  on public.share_permissions(owner_id, friend_id, coalesce(year, -1), coalesce(month, -1), coalesce(row_key, ''))
  where year is not null or month is not null or row_key is not null;

-- L'ami peut savoir si un accès global lui a été donné, sans pouvoir lire
-- les règles précises de l'autre personne.
drop policy if exists "share_perm_friend_select" on public.share_permissions;
create policy "share_perm_friend_global_select" on public.share_permissions
  for select using (
    auth.uid() = friend_id
    and year is null and month is null and row_key is null
  );

-- Le snapshot complet reste exclusivement privé. Il ne peut plus être lu
-- par un ami : seul le snapshot filtré ci-dessus sera accessible.
drop policy if exists "snapshots_owner_or_authorized_friend_select" on public.finance_snapshots;
drop policy if exists "snapshots_owner_select" on public.finance_snapshots;
create policy "snapshots_owner_select" on public.finance_snapshots
  for select using (auth.uid() = owner_id);

-- L'ancien dashboard global reste privé lui aussi : il peut contenir des
-- montants qui ne font pas partie de la sélection ligne/mois.
drop policy if exists "dashboard_snapshots_authorized_friend_select" on public.finance_dashboard_snapshots;

drop policy if exists "shared_sheet_owner_all" on public.finance_shared_sheet_snapshots;
drop policy if exists "shared_sheet_recipient_select" on public.finance_shared_sheet_snapshots;
create policy "shared_sheet_owner_all" on public.finance_shared_sheet_snapshots
  for all using (auth.uid() = owner_id)
  with check (
    auth.uid() = finance_shared_sheet_snapshots.owner_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_sheet_snapshots.owner_id and f.friend_id = finance_shared_sheet_snapshots.friend_id)
          or (f.friend_id = finance_shared_sheet_snapshots.owner_id and f.owner_id = finance_shared_sheet_snapshots.friend_id))
    )
  );
create policy "shared_sheet_recipient_select" on public.finance_shared_sheet_snapshots
  for select using (
    auth.uid() = finance_shared_sheet_snapshots.friend_id
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
drop policy if exists "shared_dashboard_recipient_select" on public.finance_shared_dashboard_snapshots;
create policy "shared_dashboard_owner_all" on public.finance_shared_dashboard_snapshots
  for all using (auth.uid() = owner_id)
  with check (
    auth.uid() = finance_shared_dashboard_snapshots.owner_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.owner_id = finance_shared_dashboard_snapshots.owner_id and f.friend_id = finance_shared_dashboard_snapshots.friend_id)
          or (f.friend_id = finance_shared_dashboard_snapshots.owner_id and f.owner_id = finance_shared_dashboard_snapshots.friend_id))
    )
  );
create policy "shared_dashboard_recipient_select" on public.finance_shared_dashboard_snapshots
  for select using (
    auth.uid() = finance_shared_dashboard_snapshots.friend_id
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

commit;

