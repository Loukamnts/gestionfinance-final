-- Avatars (18 octobre 2026), appliqué sur le projet Supabase.
-- Pas de photos envoyées : un avatar est choisi dans une liste fermée de médailles finance Meuniance.
-- La base n'accepte que ces noms ; aucune image n'est stockée.

alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar is null or avatar in
  ('piece','tirelire','croissance','coffre','billet','portefeuille','carte','lingots','epargne','diamant','maison','objectif'));

-- Choisir (ou retirer, avec null) son avatar.
create or replace function public.set_my_avatar(p_avatar text)
returns text language plpgsql security definer set search_path to ''
as $f$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_avatar is not null and p_avatar not in ('piece','tirelire','croissance','coffre','billet','portefeuille','carte','lingots','epargne','diamant','maison','objectif') then
    raise exception 'invalid_avatar';
  end if;
  update public.profiles set avatar = p_avatar where id = auth.uid();
  return p_avatar;
end;
$f$;

-- Mon avatar et ceux de mes amis acceptés uniquement (jamais celui d'un inconnu).
create or replace function public.get_avatars()
returns table(user_id uuid, avatar text)
language sql stable security definer set search_path to ''
as $f$
  select p.id, p.avatar from public.profiles p where p.id = auth.uid()
  union all
  select p.id, p.avatar
  from public.friendships f
  join public.profiles p on p.id = case when f.owner_id = auth.uid() then f.friend_id else f.owner_id end
  where f.status = 'accepted' and (f.owner_id = auth.uid() or f.friend_id = auth.uid());
$f$;

revoke all on function public.set_my_avatar(text) from public, anon;
revoke all on function public.get_avatars() from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
grant execute on function public.get_avatars() to authenticated;
