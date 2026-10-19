-- Rappel de saisie dans la langue choisie (notification_settings.lang).
-- Postgres refuse de changer les colonnes renvoyées par due_reminders sans DROP :
-- on ajoute donc une fonction voisine, que send-reminders utilise si elle existe
-- (sinon il reprend due_reminders, en français).
create or replace function public.due_reminders_lang(p_limit integer default 500)
returns table(id bigint, endpoint text, p256dh text, auth_key text, every_days integer, lang text)
language sql stable security definer set search_path to ''
as $f$
  select r.id, r.endpoint, r.p256dh, r.auth_key, r.every_days,
         case when ns.lang = 'en' then 'en' else 'fr' end
  from public.reminder_subscriptions r
  left join public.finance_snapshots s on s.owner_id = r.user_id
  left join public.notification_settings ns on ns.user_id = r.user_id
  where coalesce(ns.reminder, true)
    and (r.last_sent_at is null or r.last_sent_at < now() - make_interval(days => r.every_days))
    and greatest(coalesce(s.updated_at, r.created_at), r.created_at) < now() - make_interval(days => r.every_days)
  order by r.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$f$;
revoke all on function public.due_reminders_lang(integer) from public, anon, authenticated;
grant execute on function public.due_reminders_lang(integer) to service_role;
