-- Gestion Finance - Schema Supabase (tables + RLS + RPC securise)
-- A executer UNE fois dans : Supabase Dashboard -> SQL Editor -> New query -> Run
-- Commentaires en ASCII pur (pas de caracteres speciaux).

-- 1) Profils (1 par compte, auto-crees a l'inscription)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

-- Mise a niveau sans risque d'une table profiles creee par une ancienne version.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles alter column created_at set default now();
update public.profiles set created_at = now() where created_at is null;
alter table public.profiles alter column created_at set not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Le profil est pratique pour les amis, mais il ne doit jamais empecher
  -- Supabase Auth de creer un compte si une ancienne table est mal configuree.
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
exception when others then
  raise warning 'Profile creation skipped for auth user %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- 2) Lignes du tableur (1 ligne = 1 categorie pour 1 annee)
create table if not exists public.finance_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  row_key text not null,
  row_label text not null,
  row_order int not null default 0,
  rule text,
  created_at timestamptz not null default now(),
  unique (owner_id, year, row_key)
);

-- 3) Cellules (valeur par mois)
create table if not exists public.finance_cells (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.finance_rows(id) on delete cascade,
  month int not null check (month between 1 and 12),
  value numeric not null default 0,
  unique (row_id, month)
);

-- 4) Amities (par email, bidirectionnelles)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  unique (owner_id, friend_id),
  check (owner_id <> friend_id)
);

-- 5) Permissions de partage (granularite annee / mois / ligne)
--    NULL = "tout" pour cette dimension. Par defaut RIEN n'est partage (securite).
create table if not exists public.share_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  year int,
  month int,
  row_key text,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, friend_id, year, month, row_key)
);

-- Permissions simples utilisées par l'interface de partage actuelle.
-- Les colonnes sont ajoutées sans casser une base déjà créée.
alter table public.share_permissions
  add column if not exists can_view_dashboard boolean not null default false,
  add column if not exists can_view_sheet boolean not null default false,
  add column if not exists can_view_categories boolean not null default false;

-- 6) Snapshot complet du tableur pour la synchronisation multi-appareils
create table if not exists public.finance_snapshots (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Index
create index if not exists idx_finance_rows_owner on public.finance_rows(owner_id, year);
create index if not exists idx_finance_cells_row on public.finance_cells(row_id);
create index if not exists idx_friendships_owner on public.friendships(owner_id);
create index if not exists idx_friendships_friend on public.friendships(friend_id);
create index if not exists idx_share_perm_friend on public.share_permissions(friend_id);

-- ============================================================
-- Row Level Security - la securite est appliquee par la base
-- ============================================================
alter table public.profiles enable row level security;
alter table public.finance_rows enable row level security;
alter table public.finance_cells enable row level security;
alter table public.friendships enable row level security;
alter table public.share_permissions enable row level security;
alter table public.finance_snapshots enable row level security;

-- Profils : chacun lit le sien et celui de ses amis acceptés uniquement.
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_or_friend_select" on public.profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.owner_id = auth.uid() and f.friend_id = profiles.id)
        or (f.friend_id = auth.uid() and f.owner_id = profiles.id))
  )
);
create policy "profiles_self_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- Lignes : le proprietaire a tous les droits ; les autres n'ont RIEN
create policy "rows_owner_all" on public.finance_rows
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Cellules : via la ligne proprietaire
create policy "cells_owner_all" on public.finance_cells
  for all using (exists (select 1 from public.finance_rows r where r.id = finance_cells.row_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.finance_rows r where r.id = finance_cells.row_id and r.owner_id = auth.uid()));

-- Amitiés : seul l'émetteur crée une demande et seul le destinataire l'accepte.
drop policy if exists "friendships_parties_all" on public.friendships;
create policy "friendships_parties_select" on public.friendships
  for select using (auth.uid() = owner_id or auth.uid() = friend_id);
create policy "friendships_owner_insert" on public.friendships
  for insert with check (auth.uid() = owner_id);
create policy "friendships_recipient_update" on public.friendships
  for update using (auth.uid() = friend_id)
  with check (auth.uid() = friend_id);
create policy "friendships_parties_delete" on public.friendships
  for delete using (auth.uid() = owner_id or auth.uid() = friend_id);

-- Permissions : seul le proprietaire gere
create policy "share_perm_owner_all" on public.share_permissions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "share_perm_friend_select" on public.share_permissions
  for select using (auth.uid() = friend_id);

-- Snapshot : le propriétaire écrit; un ami accepté ne lit qu'avec l'autorisation Tableur.
create policy "snapshots_owner_write" on public.finance_snapshots
  for insert with check (auth.uid() = owner_id);
create policy "snapshots_owner_update" on public.finance_snapshots
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "snapshots_owner_delete" on public.finance_snapshots
  for delete using (auth.uid() = owner_id);
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
        and f.owner_id = finance_snapshots.owner_id
        and f.friend_id = auth.uid()
    )
  );

-- ============================================================
-- RPC securise : vue de l'ami
-- NE renvoie QUE les lignes/cellules explicitement autorisees.
-- Les donnees non autorisees ne quittent JAMAIS la base.
-- ============================================================
create or replace function public.shared_rows_for_me(p_year int default null)
returns table (
  owner_id uuid, owner_email text, year int, row_key text, row_label text,
  row_order int, rule text, month int, value numeric
)
language sql security definer set search_path = public as $$
  with accepted as (
    select f.owner_id as oid, p.email as oemail
    from public.friendships f
    join public.profiles p on p.id = f.owner_id
    where f.friend_id = auth.uid() and f.status = 'accepted'
  )
  select r.owner_id, a.oemail, r.year, r.row_key, r.row_label, r.row_order, r.rule, c.month, c.value
  from accepted a
  join public.finance_rows r on r.owner_id = a.oid
  join public.finance_cells c on c.row_id = r.id
  where (p_year is null or r.year = p_year)
    and exists (
      select 1 from public.share_permissions sp
      where sp.owner_id = r.owner_id and sp.friend_id = auth.uid() and sp.allowed = true
        and (sp.year is null or sp.year = r.year)
        and (sp.month is null or sp.month = c.month)
        and (sp.row_key is null or sp.row_key = r.row_key)
    )
  order by a.oemail, r.year, r.row_order, c.month;
$$;

grant execute on function public.shared_rows_for_me(int) to authenticated;
