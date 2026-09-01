-- Correctif demandes d'amis Gestion Finance
-- A executer UNE fois dans Supabase Dashboard > SQL Editor > New query > Run.

drop policy if exists "profiles_self_or_friend_select" on public.profiles;
create policy "profiles_self_or_friend_select" on public.profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from public.friendships f
    where (f.owner_id = auth.uid() and f.friend_id = profiles.id)
       or (f.friend_id = auth.uid() and f.owner_id = profiles.id)
  )
);

create or replace function public.send_friend_request_by_email(p_email text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  relation public.friendships%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select p.id into target_id
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;
  if target_id is null then raise exception 'user_not_found'; end if;
  if target_id = auth.uid() then raise exception 'cannot_add_self'; end if;

  select * into relation from public.friendships f
  where (f.owner_id = auth.uid() and f.friend_id = target_id)
     or (f.owner_id = target_id and f.friend_id = auth.uid())
  limit 1;
  if found then
    if relation.status = 'accepted' then raise exception 'already_friends'; end if;
    if relation.status = 'pending' and relation.owner_id = auth.uid() then raise exception 'request_already_sent'; end if;
    if relation.status = 'pending' then raise exception 'request_already_received'; end if;
    raise exception 'friend_request_blocked';
  end if;

  insert into public.friendships (owner_id, friend_id, status)
  values (auth.uid(), target_id, 'pending')
  returning id into request_id;
  return request_id;
end;
$$;

revoke all on function public.send_friend_request_by_email(text) from public;
grant execute on function public.send_friend_request_by_email(text) to authenticated;
