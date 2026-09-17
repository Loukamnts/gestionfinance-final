-- Gestion Finance — synchronisation privée multi-appareils.
-- Migration idempotente : elle ne supprime et ne modifie aucune donnée.
-- Le snapshot complet contient le tableur, les notes et les objectifs ; seul
-- son propriétaire doit pouvoir le lire. Les amis consultent uniquement les
-- copies filtrées finance_shared_* générées par le système de partage.

begin;

alter table public.finance_snapshots enable row level security;

revoke all on table public.finance_snapshots from public, anon;
grant select, insert, update, delete on table public.finance_snapshots to authenticated;

drop policy if exists "snapshots_owner_or_authorized_friend_select" on public.finance_snapshots;
drop policy if exists "snapshots_select_owner_or_shared" on public.finance_snapshots;
drop policy if exists "snapshots_owner_select" on public.finance_snapshots;
drop policy if exists "snapshots_owner_insert" on public.finance_snapshots;
drop policy if exists "snapshots_owner_write" on public.finance_snapshots;
drop policy if exists "snapshots_owner_update" on public.finance_snapshots;
drop policy if exists "snapshots_owner_delete" on public.finance_snapshots;

create policy "snapshots_owner_select" on public.finance_snapshots
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "snapshots_owner_write" on public.finance_snapshots
  for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "snapshots_owner_update" on public.finance_snapshots
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "snapshots_owner_delete" on public.finance_snapshots
  for delete to authenticated
  using (auth.uid() = owner_id);

commit;
