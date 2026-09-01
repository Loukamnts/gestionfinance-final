-- Correctif gestion des demandes d'amis Gestion Finance
-- A executer UNE fois dans Supabase Dashboard > SQL Editor > New query > Run.

create or replace function public.get_my_friendships()
returns table (
  friendship_id uuid, owner_id uuid, friend_id uuid, status text,
  created_at timestamptz, other_display_name text, other_email text
)
language sql security definer set search_path = '' as $$
  select f.id, f.owner_id, f.friend_id, f.status, f.created_at,
         p.display_name, p.email
  from public.friendships f
  left join public.profiles p
    on p.id = case when f.owner_id = auth.uid() then f.friend_id else f.owner_id end
  where f.owner_id = auth.uid() or f.friend_id = auth.uid()
  order by f.created_at desc;
$$;
revoke all on function public.get_my_friendships() from public;
grant execute on function public.get_my_friendships() to authenticated;

create or replace function public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  relation public.friendships%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into relation from public.friendships where id = p_friendship_id;
  if not found or relation.friend_id <> auth.uid() then raise exception 'friend_request_not_found'; end if;
  if relation.status <> 'pending' then raise exception 'friend_request_not_pending'; end if;
  if p_accept then
    update public.friendships set status = 'accepted' where id = p_friendship_id;
  else
    delete from public.friendships where id = p_friendship_id;
  end if;
  return true;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
