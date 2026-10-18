-- Notifications sur le téléphone (19 octobre 2026), appliqué sur le projet Supabase.
-- S'appuie sur les rappels (reminder_subscriptions = appareils abonnés, clés VAPID dans Vault).
-- Types : budget (plafonds 80/100 %), friends (amis, dépenses partagées), recaps (bilans du mois et de l'année),
-- goals (objectif atteint, dépenses fixes), reminder (rappel de saisie, déjà existant).
-- Tout passe par une file : chaque message est dédoublonné (tag), plafonné par jour, puis envoyé chaque minute.

create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder boolean not null default true,
  budget boolean not null default true,
  friends boolean not null default true,
  recaps boolean not null default true,
  goals boolean not null default true,
  lang text not null default 'fr' check (lang in ('fr','en')),
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on table public.notification_settings from public, anon, authenticated;

create table if not exists public.notification_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('budget','friends','recaps','goals')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 180),
  url text not null default '/accueil' check (url ~ '^/[A-Za-z0-9/?=&._-]{0,99}$'),
  tag text check (tag is null or char_length(tag) <= 80),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_queue_pending on public.notification_queue (id) where sent_at is null;
create index if not exists notification_queue_user on public.notification_queue (user_id, created_at);
create index if not exists notification_queue_tag on public.notification_queue (user_id, tag);
alter table public.notification_queue enable row level security;
revoke all on table public.notification_queue from public, anon, authenticated;

-- Langue et préférence d'un compte (valeurs par défaut s'il n'a rien réglé).
create or replace function public.notif_lang(u uuid)
returns text language sql stable security definer set search_path to ''
as $f$ select coalesce((select s.lang from public.notification_settings s where s.user_id = u), 'fr'); $f$;
create or replace function public.notif_wanted(u uuid, k text)
returns boolean language sql stable security definer set search_path to ''
as $f$
  select exists(select 1 from public.reminder_subscriptions r where r.user_id = u)
     and coalesce((select case k when 'budget' then s.budget when 'friends' then s.friends when 'recaps' then s.recaps
                                 when 'goals' then s.goals when 'reminder' then s.reminder end
                   from public.notification_settings s where s.user_id = u), true);
$f$;

-- Mise en file : seulement si le compte a un appareil abonné et le type activé ; pas deux fois le même tag
-- (sur 40 jours) ; au plus 30 messages par jour et par compte.
create or replace function public.queue_notification(u uuid, k text, p_title text, p_body text, p_url text, p_tag text)
returns boolean language plpgsql security definer set search_path to ''
as $f$
begin
  if u is null or not public.notif_wanted(u, k) then return false; end if;
  if p_tag is not null and exists(select 1 from public.notification_queue q where q.user_id = u and q.tag = p_tag and q.created_at > now() - interval '40 days') then return false; end if;
  if (select count(*) from public.notification_queue q where q.user_id = u and q.created_at > now() - interval '1 day') >= 30 then return false; end if;
  insert into public.notification_queue(user_id, kind, title, body, url, tag)
  values (u, k, left(btrim(p_title), 80), left(btrim(p_body), 180), coalesce(p_url, '/accueil'), left(p_tag, 80));
  return true;
end;
$f$;

-- Côté site : lire et régler ses préférences.
create or replace function public.get_notification_settings()
returns jsonb language sql stable security definer set search_path to ''
as $f$
  select jsonb_build_object(
    'reminder', coalesce(s.reminder, true), 'budget', coalesce(s.budget, true), 'friends', coalesce(s.friends, true),
    'recaps', coalesce(s.recaps, true), 'goals', coalesce(s.goals, true),
    'devices', (select count(*) from public.reminder_subscriptions r where r.user_id = auth.uid()))
  from (select 1) one left join public.notification_settings s on s.user_id = auth.uid()
  where auth.uid() is not null;
$f$;
create or replace function public.set_notification_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $f$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_settings'; end if;
  insert into public.notification_settings(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.notification_settings s set
    reminder = case when jsonb_typeof(p->'reminder') = 'boolean' then (p->>'reminder')::boolean else s.reminder end,
    budget   = case when jsonb_typeof(p->'budget')   = 'boolean' then (p->>'budget')::boolean   else s.budget end,
    friends  = case when jsonb_typeof(p->'friends')  = 'boolean' then (p->>'friends')::boolean  else s.friends end,
    recaps   = case when jsonb_typeof(p->'recaps')   = 'boolean' then (p->>'recaps')::boolean   else s.recaps end,
    goals    = case when jsonb_typeof(p->'goals')    = 'boolean' then (p->>'goals')::boolean    else s.goals end,
    lang     = case when p->>'lang' in ('fr','en') then p->>'lang' else s.lang end,
    updated_at = now()
  where s.user_id = auth.uid();
  return public.get_notification_settings();
end;
$f$;

-- Côté site : événements repérés sur l'appareil (plafond atteint, objectif atteint), envoyés à tous ses appareils.
create or replace function public.notify_me(p_kind text, p_tag text, p_title text, p_body text, p_url text)
returns boolean language plpgsql security definer set search_path to ''
as $f$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('budget','goals') then raise exception 'invalid_kind'; end if;
  if p_tag is null or char_length(p_tag) not between 3 and 80 then raise exception 'invalid_tag'; end if;
  if char_length(coalesce(p_title,'')) not between 1 and 80 or char_length(coalesce(p_body,'')) not between 1 and 180 then raise exception 'invalid_text'; end if;
  if p_url is not null and p_url !~ '^/[A-Za-z0-9/?=&._-]{0,99}$' then raise exception 'invalid_url'; end if;
  return public.queue_notification(auth.uid(), p_kind, p_title, p_body, coalesce(p_url, '/accueil'), 'me:' || p_tag);
end;
$f$;

-- Nom affiché d'un compte dans une notification (pseudo, sinon début de l'e-mail).
create or replace function public.notif_name(u uuid)
returns text language sql stable security definer set search_path to ''
as $f$ select coalesce('@' || nullif(p.username, ''), nullif(p.display_name, ''), split_part(p.email, '@', 1), 'Un ami') from public.profiles p where p.id = u; $f$;
create or replace function public.notif_money(cents bigint, lang text)
returns text language sql immutable set search_path to ''
as $f$ select case when lang = 'en' then '€' || to_char(cents / 100.0, 'FM999999990.00')
                   else replace(to_char(cents / 100.0, 'FM999999990.00'), '.', ',') || ' €' end; $f$;

-- Amis : demande reçue, demande acceptée.
create or replace function public.notif_friendships()
returns trigger language plpgsql security definer set search_path to ''
as $f$
declare l text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    l := public.notif_lang(new.friend_id);
    perform public.queue_notification(new.friend_id, 'friends',
      case when l = 'en' then 'New friend request' else 'Nouvelle demande d’ami' end,
      public.notif_name(new.owner_id) || case when l = 'en' then ' wants to add you as a friend.' else ' veut t’ajouter en ami.' end,
      '/partage', 'friend-req:' || new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    l := public.notif_lang(new.owner_id);
    perform public.queue_notification(new.owner_id, 'friends',
      case when l = 'en' then 'Friend request accepted' else 'Demande d’ami acceptée' end,
      public.notif_name(new.friend_id) || case when l = 'en' then ' accepted your friend request.' else ' a accepté ta demande d’ami.' end,
      '/partage', 'friend-ok:' || new.id);
  end if;
  return null;
end;
$f$;
drop trigger if exists notif_friendships on public.friendships;
create trigger notif_friendships after insert or update of status on public.friendships
for each row execute function public.notif_friendships();

-- Dépenses partagées : l'autre personne est prévenue (dépense ajoutée, remboursement noté).
create or replace function public.notif_shared_expenses()
returns trigger language plpgsql security definer set search_path to ''
as $f$
declare other uuid; l text; who text; owes_me boolean;
begin
  other := case when new.created_by = new.creditor_id then new.debtor_id else new.creditor_id end;
  l := public.notif_lang(other); who := public.notif_name(new.created_by);
  owes_me := new.creditor_id = other; -- vu par l'autre : on lui doit ?
  if new.kind = 'depense' then
    perform public.queue_notification(other, 'friends',
      who || case when l = 'en' then ' added an expense' else ' a ajouté une dépense' end,
      '« ' || new.label || ' » · ' || case when owes_me
        then who || (case when l = 'en' then ' owes you ' else ' te doit ' end) || public.notif_money(new.amount_cents, l)
        else (case when l = 'en' then 'you owe ' else 'tu dois ' end) || public.notif_money(new.amount_cents, l) || (case when l = 'en' then ' to ' else ' à ' end) || who end,
      '/partage', 'split:' || new.id);
  else
    perform public.queue_notification(other, 'friends',
      case when l = 'en' then 'All settled' else 'Comptes réglés' end,
      who || case when l = 'en' then ' marked your shared expenses as paid back.' else ' a marqué vos comptes comme réglés.' end,
      '/partage', 'split:' || new.id);
  end if;
  return null;
end;
$f$;
drop trigger if exists notif_shared_expenses on public.shared_expenses;
create trigger notif_shared_expenses after insert on public.shared_expenses
for each row execute function public.notif_shared_expenses();

-- Tâche du matin (8 h UTC) : bilan du mois (le 1er), bilan de l'année (1er décembre),
-- dépenses fixes à noter (le 25). Seulement pour les comptes qui ont des chiffres récents.
create or replace function public.queue_scheduled_notifications()
returns integer language plpgsql security definer set search_path to ''
as $f$
declare d date := (now() at time zone 'Europe/Paris')::date; r record; n integer := 0; l text; pm date; nm date;
  fr text[] := array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  en text[] := array['January','February','March','April','May','June','July','August','September','October','November','December'];
begin
  pm := (date_trunc('month', d) - interval '1 month')::date; nm := (date_trunc('month', d) + interval '1 month')::date;
  for r in select distinct s.user_id from public.reminder_subscriptions s
           join public.finance_snapshots f on f.owner_id = s.user_id and f.updated_at > now() - interval '60 days' loop
    l := public.notif_lang(r.user_id);
    if extract(day from d) = 1 then
      if public.queue_notification(r.user_id, 'recaps',
        case when l = 'en' then 'Your ' || en[extract(month from pm)::int] || ' recap is ready' else 'Ton bilan ' || case when extract(month from pm)::int in (4,8,10) then 'd’' else 'de ' end || fr[extract(month from pm)::int] || ' est prêt' end,
        case when l = 'en' then 'What you kept, your savings and your biggest expense.' else 'Ce qui t’est resté, ton épargne et ta plus grosse dépense.' end,
        '/accueil', 'recap:' || to_char(pm, 'YYYY-MM')) then n := n + 1; end if;
      if extract(month from d) = 12 and public.queue_notification(r.user_id, 'recaps',
        case when l = 'en' then 'Your ' || extract(year from d) || ' in review is ready' else 'Ton bilan ' || extract(year from d) || ' est prêt' end,
        case when l = 'en' then 'Your year in a few screens, with your own numbers.' else 'Ton année en quelques écrans, avec tes propres chiffres.' end,
        '/accueil?bilan=' || extract(year from d), 'year:' || extract(year from d)) then n := n + 1; end if;
    elsif extract(day from d) = 25 then
      if public.queue_notification(r.user_id, 'goals',
        case when l = 'en' then 'Next month’s fixed expenses' else 'Tes dépenses fixes de ' || fr[extract(month from nm)::int] end,
        case when l = 'en' then 'Rent, subscriptions… add them now so your ' || en[extract(month from nm)::int] || ' is ready.' else 'Loyer, abonnements… note-les maintenant, ton mois sera prêt.' end,
        '/accueil', 'fixed:' || to_char(nm, 'YYYY-MM')) then n := n + 1; end if;
    end if;
  end loop;
  return n;
end;
$f$;

-- Côté serveur (fonction d'envoi) : messages en attente, par appareil, puis marqués envoyés.
create or replace function public.due_notifications(p_limit integer default 300)
returns table(qid bigint, sub_id bigint, endpoint text, p256dh text, auth_key text, title text, body text, url text, tag text)
language sql stable security definer set search_path to ''
as $f$
  select q.id, r.id, r.endpoint, r.p256dh, r.auth_key, q.title, q.body, q.url, coalesce(q.tag, 'meuniance-' || q.kind)
  from (select * from public.notification_queue where sent_at is null and created_at > now() - interval '2 days' order by id limit least(greatest(coalesce(p_limit,300),1),1000)) q
  left join public.reminder_subscriptions r on r.user_id = q.user_id
  order by q.id;
$f$;
create or replace function public.mark_notifications_sent(p_ids bigint[])
returns void language sql security definer set search_path to ''
as $f$ update public.notification_queue set sent_at = now() where id = any(p_ids) or (sent_at is null and created_at <= now() - interval '2 days'); $f$;

-- Le rappel de saisie respecte maintenant la préférence « reminder ».
create or replace function public.due_reminders(p_limit integer default 500)
returns table(id bigint, endpoint text, p256dh text, auth_key text, every_days integer)
language sql stable security definer set search_path to ''
as $f$
  select r.id, r.endpoint, r.p256dh, r.auth_key, r.every_days
  from public.reminder_subscriptions r
  left join public.finance_snapshots s on s.owner_id = r.user_id
  left join public.notification_settings ns on ns.user_id = r.user_id
  where coalesce(ns.reminder, true)
    and (r.last_sent_at is null or r.last_sent_at < now() - make_interval(days => r.every_days))
    and greatest(coalesce(s.updated_at, r.created_at), r.created_at) < now() - make_interval(days => r.every_days)
  order by r.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$f$;

revoke all on function public.notif_lang(uuid) from public, anon, authenticated;
revoke all on function public.notif_wanted(uuid,text) from public, anon, authenticated;
revoke all on function public.queue_notification(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.notif_name(uuid) from public, anon, authenticated;
revoke all on function public.notif_money(bigint,text) from public, anon, authenticated;
revoke all on function public.notif_friendships() from public, anon, authenticated;
revoke all on function public.notif_shared_expenses() from public, anon, authenticated;
revoke all on function public.queue_scheduled_notifications() from public, anon, authenticated;
revoke all on function public.due_notifications(integer) from public, anon, authenticated;
revoke all on function public.mark_notifications_sent(bigint[]) from public, anon, authenticated;
revoke all on function public.due_reminders(integer) from public, anon, authenticated;
revoke all on function public.get_notification_settings() from public, anon;
revoke all on function public.set_notification_settings(jsonb) from public, anon;
revoke all on function public.notify_me(text,text,text,text,text) from public, anon;
grant execute on function public.get_notification_settings() to authenticated;
grant execute on function public.set_notification_settings(jsonb) to authenticated;
grant execute on function public.notify_me(text,text,text,text,text) to authenticated;
grant execute on function public.due_notifications(integer) to service_role;
grant execute on function public.mark_notifications_sent(bigint[]) to service_role;
grant execute on function public.due_reminders(integer) to service_role;
grant execute on function public.queue_scheduled_notifications() to service_role;

-- Tâches planifiées : envoi de la file chaque minute, messages du matin à 8 h UTC.
select cron.schedule('meuniance-notifs', '* * * * *', $c$
  select net.http_post(
    url := 'https://agbogjpwnzkwrnsjfpkc.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret',(select decrypted_secret from vault.decrypted_secrets where name='reminders_cron_secret')),
    body := '{"mode":"queue"}'::jsonb, timeout_milliseconds := 30000)
  where exists (select 1 from public.notification_queue where sent_at is null);
$c$);
select cron.schedule('meuniance-notifs-matin', '0 8 * * *', $c$ select public.queue_scheduled_notifications(); $c$);
