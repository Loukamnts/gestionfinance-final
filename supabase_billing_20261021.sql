-- Abonnements Stripe (fonction Supabase « billing ») : l'accès payé s'arrête de lui-même 3 jours après la fin
-- de la période payée si l'abonnement n'a pas été relu chez Stripe entre-temps (relu à chaque ouverture du site).
-- Les accès offerts (billing_grants) restent prioritaires. Appliqué le 21/10/2026.
create or replace function public.get_my_profile()
 returns table(username text, username_changed_at timestamptz, created_at timestamptz, plan text, subscription_started_at timestamptz)
 language plpgsql security definer set search_path to ''
as $function$
declare current_user_record auth.users%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into current_user_record from auth.users where id=auth.uid();
  if not found then raise exception 'not_authenticated'; end if;
  insert into public.profiles(id,email,display_name,created_at)
    values(current_user_record.id,current_user_record.email,
      split_part(coalesce(current_user_record.email,''),'@',1),current_user_record.created_at)
    on conflict (id) do nothing;
  return query
    with b as (
      select s.plan, s.subscription_started_at,
        (s.access_granted and s.status in ('active','trialing')
          and (s.current_period_end is null or s.current_period_end > now() - interval '3 days')) as ok
      from public.billing_subscriptions s where s.user_id=auth.uid()
    )
    select p.username,p.username_changed_at,current_user_record.created_at,
      case
        when g.plan='pro' then 'pro'
        when b.ok and b.plan='pro' then 'pro'
        when g.plan='plus' then 'plus'
        when b.ok and b.plan='plus' then 'plus'
        else 'free'
      end,
      case
        when g.plan='pro' or (g.plan='plus' and not coalesce(b.ok and b.plan='pro',false)) then g.starts_at
        when b.ok then b.subscription_started_at
        else null
      end
    from public.profiles p
    left join b on true
    left join lateral (
      select bg.plan,bg.starts_at,bg.ends_at
      from public.billing_grants bg
      where bg.user_id=p.id and bg.revoked_at is null and bg.starts_at<=now() and bg.ends_at>now()
      order by case bg.plan when 'pro' then 2 else 1 end desc,bg.ends_at desc
      limit 1
    ) g on true
    where p.id=auth.uid();
end;
$function$;
