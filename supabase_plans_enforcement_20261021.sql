-- Limites des formules côté serveur pour le partage (Free / Plus / Pro).
-- Elles ne s'appliquent qu'une fois les ventes ouvertes : la fonction « billing » appelle set_billing_live(true)
-- dès que la clé Stripe est enregistrée (et false si elle est retirée). Avant cela, rien ne change pour personne.
--
-- Règles (identiques à plans.js, shareFeature) :
--   Free : aucun partage sortant actif ;
--   Plus : un seul ami peut voir une partie de mes données ;
--   Pro  : autant d'amis que voulu.
-- Retirer un accès reste toujours possible. Après un retour à une formule inférieure, rien n'est supprimé :
-- les derniers instantanés partagés restent lisibles par l'ami, mais ne sont plus mis à jour
-- (refresh renvoie false) et ne peuvent plus être modifiés tant qu'il y a trop de partages actifs.
--
-- La formule est lue dans billing_subscriptions / billing_grants (écrits uniquement par service_role),
-- avec la même logique que get_my_profile(). Aucune suppression d'objet (pas de DROP).

-- 1. Interrupteur : ventes ouvertes ou non (une seule ligne, modifiable seulement par le serveur).
create table if not exists public.billing_settings (
  id boolean primary key default true check (id),
  live boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.billing_settings enable row level security;
revoke all on table public.billing_settings from public, anon, authenticated;
insert into public.billing_settings(id, live) values (true, false) on conflict (id) do nothing;

create or replace function public.billing_enforced()
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.live from public.billing_settings s where s.id), false)
$$;
revoke all on function public.billing_enforced() from public, anon, authenticated;

create or replace function public.set_billing_live(p_live boolean)
returns void
language sql security definer set search_path = '' as $$
  update public.billing_settings set live = coalesce(p_live, false), updated_at = now()
  where id and live is distinct from coalesce(p_live, false)
$$;
revoke all on function public.set_billing_live(boolean) from public, anon, authenticated;
grant execute on function public.set_billing_live(boolean) to service_role;

-- 2. Formule effective d'un compte (free / plus / pro), lue côté serveur seulement.
create or replace function public.effective_plan(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare g_plan text; s_plan text;
begin
  if p_user_id is null then return 'free'; end if;
  select bg.plan into g_plan from public.billing_grants bg
    where bg.user_id = p_user_id and bg.revoked_at is null and bg.starts_at <= now() and bg.ends_at > now()
    order by case bg.plan when 'pro' then 2 else 1 end desc, bg.ends_at desc limit 1;
  select s.plan into s_plan from public.billing_subscriptions s
    where s.user_id = p_user_id and s.access_granted and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days');
  if g_plan = 'pro' or s_plan = 'pro' then return 'pro'; end if;
  if g_plan = 'plus' or s_plan = 'plus' then return 'plus'; end if;
  return 'free';
end;
$$;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

-- 3. Code d'erreur si ce partage (de p_owner vers p_friend) dépasse la formule, sinon null.
create or replace function public.share_plan_block(p_owner uuid, p_friend uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_plan text; v_others integer;
begin
  if not public.billing_enforced() then return null; end if;
  v_plan := public.effective_plan(p_owner);
  if v_plan = 'pro' then return null; end if;
  if v_plan = 'free' then return 'plan_share_required'; end if;
  select count(distinct sp.friend_id) into v_others from public.share_permissions sp
    where sp.owner_id = p_owner and sp.friend_id <> p_friend
      and sp.year is null and sp.month is null and sp.row_key is null
      and (sp.can_view_sheet or sp.can_view_dashboard);
  if v_others >= 1 then return 'plan_share_multi_required'; end if;
  return null;
end;
$$;
revoke all on function public.share_plan_block(uuid, uuid) from public, anon, authenticated;

-- 4. Enregistrement d'un partage : identique à la version en production, plus la vérification de formule
--    quand l'accès est ouvert (le retrait d'un accès n'est jamais bloqué).
create or replace function public.save_friend_share_config(p_friend_id uuid, p_can_view_dashboard boolean, p_can_view_sheet boolean, p_rules jsonb, p_sheet_payload jsonb, p_dashboard_payload jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare selected_count integer; plan_block text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_friend_id is null or p_friend_id = auth.uid() then raise exception 'invalid_share_recipient'; end if;
  perform 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.owner_id = auth.uid() and f.friend_id = p_friend_id)
        or (f.friend_id = auth.uid() and f.owner_id = p_friend_id))
    order by f.id for update;
  if not found then raise exception 'friendship_not_accepted'; end if;
  if coalesce(p_can_view_dashboard, false) or coalesce(p_can_view_sheet, false) then
    -- Deux enregistrements simultanés vers deux amis différents ne doivent pas passer la limite Plus ensemble.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('share_plan:' || auth.uid()::text, 0));
    plan_block := public.share_plan_block(auth.uid(), p_friend_id);
    if plan_block is not null then raise exception '%', plan_block; end if;
  end if;
  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then raise exception 'invalid_share_rules'; end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb)) as r(year integer, month integer, row_key text)
    where r.year is null or r.month is null or r.month not between 1 and 12
      or nullif(btrim(r.row_key), '') is null
  ) then raise exception 'invalid_share_rules'; end if;
  select count(*) into selected_count
  from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb)) as r(year integer, month integer, row_key text);
  if (coalesce(p_can_view_dashboard, false) or coalesce(p_can_view_sheet, false)) and selected_count = 0 then
    raise exception 'share_selection_required';
  end if;
  if p_can_view_sheet and p_sheet_payload is null then raise exception 'missing_sheet_payload'; end if;
  if p_can_view_sheet and not public.valid_shared_sheet_payload(p_sheet_payload) then raise exception 'invalid_sheet_payload'; end if;
  if p_can_view_dashboard and p_dashboard_payload is null then raise exception 'missing_dashboard_payload'; end if;
  if p_can_view_dashboard and not public.valid_shared_dashboard_payload(p_dashboard_payload) then raise exception 'invalid_dashboard_payload'; end if;
  delete from public.share_permissions where owner_id = auth.uid() and friend_id = p_friend_id;
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
$function$;
revoke all on function public.save_friend_share_config(uuid, boolean, boolean, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_friend_share_config(uuid, boolean, boolean, jsonb, jsonb, jsonb) to authenticated;

-- 5. Mise à jour automatique des instantanés : figée (sans rien supprimer) quand le partage dépasse la formule.
create or replace function public.refresh_friend_share_snapshots(p_friend_id uuid, p_rules jsonb, p_sheet_payload jsonb, p_dashboard_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare rights record;
begin
  if auth.uid() is null or auth.uid() = p_friend_id then return false; end if;
  perform 1 from public.friendships f where f.status='accepted'
    and ((f.owner_id=auth.uid() and f.friend_id=p_friend_id)
      or (f.friend_id=auth.uid() and f.owner_id=p_friend_id)) order by f.id for update;
  if not found then return false; end if;
  if public.share_plan_block(auth.uid(), p_friend_id) is not null then return false; end if;
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
$function$;
revoke all on function public.refresh_friend_share_snapshots(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.refresh_friend_share_snapshots(uuid, jsonb, jsonb, jsonb) to authenticated;
