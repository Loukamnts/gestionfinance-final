-- Avatars : nouveaux styles de lettre (19 octobre 2026), appliqué sur le projet Supabase.
-- Affirmée devient Condensée, Technique devient Machine à écrire ; arrivent Calligraphie et Gothique.
-- Les anciennes valeurs déjà enregistrées sont converties ; set_my_avatar convertit aussi celles qu'enverrait
-- une ancienne version du site encore en cache.

alter table public.profiles drop constraint if exists profiles_avatar_check;
update public.profiles set avatar = regexp_replace(avatar, '\.affirmee$', '.condensee') where avatar like '%.affirmee';
update public.profiles set avatar = regexp_replace(avatar, '\.technique$', '.machine') where avatar like '%.technique';
alter table public.profiles add constraint profiles_avatar_check check (avatar is null or avatar ~ '^(seigle|ble|creme|sauge|terre|encre|sable|prune)\.(moderne|condensee|classique|italique|machine|calligraphie|gothique)$');

create or replace function public.set_my_avatar(p_avatar text)
returns text language plpgsql security definer set search_path to ''
as $f$
declare v text := p_avatar;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v is not null then
    v := regexp_replace(regexp_replace(v, '\.affirmee$', '.condensee'), '\.technique$', '.machine');
    if v !~ '^(seigle|ble|creme|sauge|terre|encre|sable|prune)\.(moderne|condensee|classique|italique|machine|calligraphie|gothique)$' then
      raise exception 'invalid_avatar';
    end if;
  end if;
  update public.profiles set avatar = v where id = auth.uid();
  return v;
end;
$f$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
