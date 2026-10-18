-- Dépenses partagées entre amis (19 octobre 2026), appliqué sur le projet Supabase.
-- Chaque ligne dit « debtor doit amount_cents à creditor ». Un remboursement est une ligne inverse.
-- Table fermée : tout passe par les fonctions ci-dessous, qui vérifient l'amitié acceptée.

create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  creditor_id uuid not null references auth.users(id) on delete cascade,
  debtor_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 1000000),
  total_cents integer check (total_cents is null or total_cents between 1 and 1000000),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  kind text not null check (kind in ('depense','remboursement')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (creditor_id <> debtor_id),
  check (created_by in (creditor_id, debtor_id))
);
create index if not exists shared_expenses_pair on public.shared_expenses (creditor_id, debtor_id) where deleted_at is null;
create index if not exists shared_expenses_pair_rev on public.shared_expenses (debtor_id, creditor_id) where deleted_at is null;
create index if not exists shared_expenses_author on public.shared_expenses (created_by, created_at);
alter table public.shared_expenses enable row level security;
revoke all on table public.shared_expenses from public, anon, authenticated;

-- Amitié acceptée entre deux comptes (dans un sens ou dans l'autre).
create or replace function public.shared_are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path to ''
as $f$
  select exists(select 1 from public.friendships f where f.status = 'accepted'
    and ((f.owner_id = a and f.friend_id = b) or (f.owner_id = b and f.friend_id = a)));
$f$;
revoke all on function public.shared_are_friends(uuid,uuid) from public, anon, authenticated;

-- Ajouter une dépense. p_payer : 'me' (j'ai payé) ou 'friend' (un seul ami a payé pour moi).
-- p_split : 'equal' (à parts égales entre les participants, moi compris) ou 'full' (l'autre doit tout ; un seul ami).
create or replace function public.add_shared_expense(p_friend_ids uuid[], p_total_cents integer, p_label text, p_payer text, p_split text)
returns integer language plpgsql security definer set search_path to ''
as $f$
declare me uuid := auth.uid(); n integer; share integer; f uuid; lbl text := btrim(coalesce(p_label,''));
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'invalid_label'; end if;
  if p_total_cents is null or p_total_cents < 1 or p_total_cents > 1000000 then raise exception 'invalid_amount'; end if;
  if p_payer not in ('me','friend') or p_split not in ('equal','full') then raise exception 'invalid_mode'; end if;
  n := coalesce(array_length(p_friend_ids,1),0);
  if n < 1 or n > 10 then raise exception 'invalid_friends'; end if;
  if (select count(distinct x) from unnest(p_friend_ids) x) <> n or me = any(p_friend_ids) then raise exception 'invalid_friends'; end if;
  if (p_payer = 'friend' or p_split = 'full') and n <> 1 then raise exception 'invalid_mode'; end if;
  foreach f in array p_friend_ids loop
    if not public.shared_are_friends(me, f) then raise exception 'not_friends'; end if;
  end loop;
  if (select count(*) from public.shared_expenses s where s.created_by = me and s.created_at > now() - interval '1 day') + n > 300 then
    raise exception 'too_many';
  end if;
  share := case when p_split = 'full' then p_total_cents else round(p_total_cents::numeric / (n + 1))::integer end;
  if share < 1 then raise exception 'invalid_amount'; end if;
  foreach f in array p_friend_ids loop
    if p_payer = 'me' then
      insert into public.shared_expenses(creditor_id, debtor_id, amount_cents, total_cents, label, kind, created_by)
      values (me, f, share, p_total_cents, lbl, 'depense', me);
    else
      insert into public.shared_expenses(creditor_id, debtor_id, amount_cents, total_cents, label, kind, created_by)
      values (f, me, share, p_total_cents, lbl, 'depense', me);
    end if;
  end loop;
  return n;
end;
$f$;

-- Solde avec chaque ami : positif = l'ami me doit, négatif = je dois à l'ami.
create or replace function public.get_shared_balances()
returns table(friend_id uuid, net_cents bigint, entries bigint, last_at timestamptz)
language sql stable security definer set search_path to ''
as $f$
  select other, sum(signed), count(*), max(created_at) from (
    select case when s.creditor_id = auth.uid() then s.debtor_id else s.creditor_id end as other,
           case when s.creditor_id = auth.uid() then s.amount_cents else -s.amount_cents end as signed, s.created_at
    from public.shared_expenses s
    where s.deleted_at is null and (s.creditor_id = auth.uid() or s.debtor_id = auth.uid())
  ) t
  where public.shared_are_friends(auth.uid(), other)
  group by other;
$f$;

-- Historique avec un ami (50 dernières lignes).
create or replace function public.get_shared_entries(p_friend_id uuid)
returns table(id uuid, label text, kind text, amount_cents integer, total_cents integer, owes_me boolean, mine boolean, created_at timestamptz)
language sql stable security definer set search_path to ''
as $f$
  select s.id, s.label, s.kind, s.amount_cents, s.total_cents, s.creditor_id = auth.uid(), s.created_by = auth.uid(), s.created_at
  from public.shared_expenses s
  where s.deleted_at is null and public.shared_are_friends(auth.uid(), p_friend_id)
    and ((s.creditor_id = auth.uid() and s.debtor_id = p_friend_id) or (s.creditor_id = p_friend_id and s.debtor_id = auth.uid()))
  order by s.created_at desc limit 50;
$f$;

-- Remettre le compte à zéro avec un ami : ajoute un remboursement du montant restant.
create or replace function public.settle_shared(p_friend_id uuid)
returns integer language plpgsql security definer set search_path to ''
as $f$
declare me uuid := auth.uid(); net bigint;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not public.shared_are_friends(me, p_friend_id) then raise exception 'not_friends'; end if;
  select coalesce(sum(case when s.creditor_id = me then s.amount_cents else -s.amount_cents end),0) into net
  from public.shared_expenses s where s.deleted_at is null
    and ((s.creditor_id = me and s.debtor_id = p_friend_id) or (s.creditor_id = p_friend_id and s.debtor_id = me));
  if net = 0 then raise exception 'nothing_to_settle'; end if;
  if abs(net) > 1000000 then raise exception 'invalid_amount'; end if;
  if net > 0 then
    -- L'ami me rembourse : ligne inverse « je dois net à l'ami », qui annule
    insert into public.shared_expenses(creditor_id, debtor_id, amount_cents, label, kind, created_by)
    values (p_friend_id, me, net::integer, 'Remboursement', 'remboursement', me);
  else
    insert into public.shared_expenses(creditor_id, debtor_id, amount_cents, label, kind, created_by)
    values (me, p_friend_id, (-net)::integer, 'Remboursement', 'remboursement', me);
  end if;
  return abs(net)::integer;
end;
$f$;

-- Retirer une ligne que j'ai ajoutée (30 jours au plus) : masquée, jamais effacée.
create or replace function public.remove_shared_entry(p_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $f$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.shared_expenses s set deleted_at = now()
  where s.id = p_id and s.created_by = auth.uid() and s.deleted_at is null and s.created_at > now() - interval '30 days';
  return found;
end;
$f$;

revoke all on function public.add_shared_expense(uuid[],integer,text,text,text) from public, anon;
revoke all on function public.get_shared_balances() from public, anon;
revoke all on function public.get_shared_entries(uuid) from public, anon;
revoke all on function public.settle_shared(uuid) from public, anon;
revoke all on function public.remove_shared_entry(uuid) from public, anon;
grant execute on function public.add_shared_expense(uuid[],integer,text,text,text) to authenticated;
grant execute on function public.get_shared_balances() to authenticated;
grant execute on function public.get_shared_entries(uuid) to authenticated;
grant execute on function public.settle_shared(uuid) to authenticated;
grant execute on function public.remove_shared_entry(uuid) to authenticated;
