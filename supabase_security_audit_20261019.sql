-- Audit de sécurité (19 octobre 2026), appliqué sur le projet Supabase.
-- 1. Demande d'ami : la notification ne montre que le pseudo (« @pseudo ») ou « Quelqu'un », jamais un nom libre
--    choisi à l'inscription ni le début de l'e-mail (pas de texte piégé, pas d'identité dévoilée avant acceptation).
-- 2. Inscription : le nom affiché n'est plus pris dans les métadonnées envoyées par le navigateur.
-- 3. Dépenses partagées : seule la personne à qui l'argent est dû peut marquer le compte comme remboursé.
-- 4. Notifications : seuls les services de notification des navigateurs sont acceptés comme adresse d'envoi.
-- 5. Lien d'une notification : chemin du site seulement (« //site.fr » refusé).

create or replace function public.notif_handle(u uuid)
returns text language sql stable security definer set search_path to ''
as $f$ select coalesce((select '@' || nullif(p.username, '') from public.profiles p where p.id = u), 'Quelqu’un'); $f$;
revoke all on function public.notif_handle(uuid) from public, anon, authenticated;

create or replace function public.notif_friendships()
returns trigger language plpgsql security definer set search_path to ''
as $f$
declare l text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    l := public.notif_lang(new.friend_id);
    perform public.queue_notification(new.friend_id, 'friends',
      case when l = 'en' then 'New friend request' else 'Nouvelle demande d’ami' end,
      public.notif_handle(new.owner_id) || case when l = 'en' then ' wants to add you as a friend.' else ' veut t’ajouter en ami.' end,
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
revoke all on function public.notif_friendships() from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, left(split_part(coalesce(new.email, ''), '@', 1), 40))
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
exception when others then
  -- Un profil incomplet ne doit jamais bloquer la création du compte Auth.
  raise warning 'Profile creation skipped for auth user %: %', new.id, sqlerrm;
  return new;
end;
$$;

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
  -- Seule la personne remboursée confirme : celle qui doit ne peut pas effacer sa dette.
  if net < 0 then raise exception 'only_creditor'; end if;
  if net > 1000000 then raise exception 'invalid_amount'; end if;
  insert into public.shared_expenses(creditor_id, debtor_id, amount_cents, label, kind, created_by)
  values (p_friend_id, me, net::integer, 'Remboursement', 'remboursement', me);
  return net::integer;
end;
$f$;
revoke all on function public.settle_shared(uuid) from public, anon;
grant execute on function public.settle_shared(uuid) to authenticated;

create or replace function public.save_reminder_subscription(p_endpoint text, p_p256dh text, p_auth text, p_every_days integer)
returns void language plpgsql security definer set search_path to ''
as $f$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Services de notification des navigateurs (Chrome, Safari, Firefox, Edge) seulement.
  if p_endpoint is null or char_length(p_endpoint) > 1000
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' then
    raise exception 'invalid_subscription';
  end if;
  if p_p256dh is null or char_length(p_p256dh) > 200 or p_auth is null or char_length(p_auth) > 100 then raise exception 'invalid_subscription'; end if;
  select count(*) into n from public.reminder_subscriptions r where r.user_id = auth.uid() and r.endpoint <> p_endpoint;
  if n >= 5 then raise exception 'too_many_devices'; end if;
  insert into public.reminder_subscriptions(user_id, endpoint, p256dh, auth_key, every_days)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_every_days, 7))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key,
        every_days = excluded.every_days, last_sent_at = null;
end;
$f$;
revoke all on function public.save_reminder_subscription(text, text, text, integer) from public, anon;
grant execute on function public.save_reminder_subscription(text, text, text, integer) to authenticated;

create or replace function public.notify_me(p_kind text, p_tag text, p_title text, p_body text, p_url text)
returns boolean language plpgsql security definer set search_path to ''
as $f$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('budget','goals') then raise exception 'invalid_kind'; end if;
  if p_tag is null or char_length(p_tag) not between 3 and 80 then raise exception 'invalid_tag'; end if;
  if char_length(coalesce(p_title,'')) not between 1 and 80 or char_length(coalesce(p_body,'')) not between 1 and 180 then raise exception 'invalid_text'; end if;
  if p_url is not null and (p_url !~ '^/[A-Za-z0-9/?=&._-]{0,99}$' or p_url ~ '^//') then raise exception 'invalid_url'; end if;
  return public.queue_notification(auth.uid(), p_kind, p_title, p_body, coalesce(p_url, '/accueil'), 'me:' || p_tag);
end;
$f$;
revoke all on function public.notify_me(text, text, text, text, text) from public, anon;
grant execute on function public.notify_me(text, text, text, text, text) to authenticated;
