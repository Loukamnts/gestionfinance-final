-- Rappels de saisie (14 octobre 2026), appliqué sur le projet Supabase.
-- Aucune clé n'apparaît ici : le secret de la tâche planifiée est généré dans la base, et les clés de
-- notification (VAPID) sont créées par la fonction send-reminders au premier appel ; tout reste dans Vault.

create table if not exists public.reminder_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth_key text not null check (char_length(auth_key) between 10 and 100),
  every_days integer not null default 7 check (every_days in (3,7,14,30)),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists reminder_subscriptions_user on public.reminder_subscriptions(user_id);
alter table public.reminder_subscriptions enable row level security;
revoke all on table public.reminder_subscriptions from public, anon, authenticated;
grant select, delete on table public.reminder_subscriptions to service_role;

-- Côté site (compte connecté) : s'abonner (5 appareils au plus), se désabonner, lire la clé publique.
create or replace function public.save_reminder_subscription(p_endpoint text, p_p256dh text, p_auth text, p_every_days integer)
returns void language plpgsql security definer set search_path to ''
as $f$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then raise exception 'invalid_subscription'; end if;
  select count(*) into n from public.reminder_subscriptions r where r.user_id = auth.uid() and r.endpoint <> p_endpoint;
  if n >= 5 then raise exception 'too_many_devices'; end if;
  insert into public.reminder_subscriptions(user_id, endpoint, p256dh, auth_key, every_days)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_every_days, 7))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key,
        every_days = excluded.every_days, last_sent_at = null;
end;
$f$;
create or replace function public.remove_reminder_subscription(p_endpoint text)
returns void language sql security definer set search_path to ''
as $f$ delete from public.reminder_subscriptions r where r.user_id = auth.uid() and r.endpoint = p_endpoint; $f$;
create or replace function public.reminder_public_key()
returns text language sql stable security definer set search_path to ''
as $f$ select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vapid_public'; $f$;
revoke all on function public.save_reminder_subscription(text,text,text,integer) from public, anon;
revoke all on function public.remove_reminder_subscription(text) from public, anon;
revoke all on function public.reminder_public_key() from public, anon;
grant execute on function public.save_reminder_subscription(text,text,text,integer) to authenticated;
grant execute on function public.remove_reminder_subscription(text) to authenticated;
grant execute on function public.reminder_public_key() to authenticated;

-- Côté serveur uniquement (service_role) : qui doit recevoir un rappel, marquer l'envoi, clés et secret.
create or replace function public.due_reminders(p_limit integer default 500)
returns table(id bigint, endpoint text, p256dh text, auth_key text, every_days integer)
language sql stable security definer set search_path to ''
as $f$
  select r.id, r.endpoint, r.p256dh, r.auth_key, r.every_days
  from public.reminder_subscriptions r
  left join public.finance_snapshots s on s.owner_id = r.user_id
  where (r.last_sent_at is null or r.last_sent_at < now() - make_interval(days => r.every_days))
    and greatest(coalesce(s.updated_at, r.created_at), r.created_at) < now() - make_interval(days => r.every_days)
  order by r.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$f$;
create or replace function public.mark_reminders_sent(p_ids bigint[])
returns void language sql security definer set search_path to ''
as $f$ update public.reminder_subscriptions set last_sent_at = now() where id = any(p_ids); $f$;
create or replace function public.reminder_cron_check(p_secret text)
returns boolean language sql stable security definer set search_path to ''
as $f$ select exists(select 1 from vault.decrypted_secrets where name = 'reminders_cron_secret' and decrypted_secret = p_secret and length(coalesce(p_secret,'')) >= 32); $f$;
create or replace function public.reminder_vapid_keys()
returns jsonb language sql stable security definer set search_path to ''
as $f$ select jsonb_build_object(
  'public', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vapid_public'),
  'private', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vapid_private')); $f$;
create or replace function public.reminder_vapid_init(p_public text, p_private text)
returns boolean language plpgsql security definer set search_path to ''
as $f$
begin
  if exists(select 1 from vault.secrets where name = 'reminders_vapid_public') then return false; end if;
  if p_public !~ '^[A-Za-z0-9_-]{80,100}$' or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then raise exception 'invalid_keys'; end if;
  perform vault.create_secret(p_public, 'reminders_vapid_public', 'Clé publique des notifications');
  perform vault.create_secret(p_private, 'reminders_vapid_private', 'Clé privée des notifications');
  return true;
end; $f$;
revoke all on function public.due_reminders(integer) from public, anon, authenticated;
revoke all on function public.mark_reminders_sent(bigint[]) from public, anon, authenticated;
revoke all on function public.reminder_cron_check(text) from public, anon, authenticated;
revoke all on function public.reminder_vapid_keys() from public, anon, authenticated;
revoke all on function public.reminder_vapid_init(text,text) from public, anon, authenticated;
grant execute on function public.due_reminders(integer) to service_role;
grant execute on function public.mark_reminders_sent(bigint[]) to service_role;
grant execute on function public.reminder_cron_check(text) to service_role;
grant execute on function public.reminder_vapid_keys() to service_role;
grant execute on function public.reminder_vapid_init(text,text) to service_role;

-- Secret de la tâche planifiée, généré dans la base.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'reminders_cron_secret', 'Protège la fonction send-reminders')
where not exists (select 1 from vault.secrets where name = 'reminders_cron_secret');

-- Envoi chaque jour à 17 h UTC (19 h l'été, 18 h l'hiver à Paris).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('meuniance-rappels', '0 17 * * *', $c$
  select net.http_post(
    url := 'https://agbogjpwnzkwrnsjfpkc.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret',(select decrypted_secret from vault.decrypted_secrets where name='reminders_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$c$);
