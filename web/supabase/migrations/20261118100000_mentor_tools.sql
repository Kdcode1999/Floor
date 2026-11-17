-- What the mentor's tools in the phone app need on top of the foundation.

-- ---------------------------------------------------------------------------
-- A space's logo
-- ---------------------------------------------------------------------------
-- The logo is a file in Floor's own store, never a link to somewhere else. A link could point
-- at anything, and could change after the fact. So `logo_url` gives way to `logo_path`, the
-- file's place in the "logos" bucket, always inside the space's own folder.

alter table public.spaces drop column logo_url;
alter table public.spaces
  add column logo_path text
  constraint spaces_logo_path check (
    logo_path is null
    or (char_length(logo_path) <= 200 and position(id::text || '/' in logo_path) = 1)
  );

grant update (logo_path) on public.spaces to authenticated;

-- Anyone may see a logo: it is on the public join page. Only the space's mentor may change it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "logos: the mentor adds their space's logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and private.is_mentor(private.try_uuid((storage.foldername(name))[1]))
  );

create policy "logos: the mentor replaces their space's logo"
  on storage.objects for update to authenticated
  using (bucket_id = 'logos' and private.is_mentor(private.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'logos' and private.is_mentor(private.try_uuid((storage.foldername(name))[1])));

create policy "logos: the mentor removes their space's logo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and private.is_mentor(private.try_uuid((storage.foldername(name))[1])));

create policy "logos: anyone signed in can list them"
  on storage.objects for select to authenticated
  using (bucket_id = 'logos');

-- ---------------------------------------------------------------------------
-- Removing someone from a space
-- ---------------------------------------------------------------------------
-- A banned member loses the space at once and cannot rejoin through the join link, a proof or
-- an invite code. The mentor may ban anyone but themselves. An admin may ban members only.
-- Banning ends VIP and takes away an admin's role, so lifting the ban never hands either back.

create function public.ban_member(p_space uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.role into v_role
    from public.memberships m where m.space_id = p_space and m.user_id = p_user for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  if v_role = 'mentor' or (v_role = 'admin' and not private.is_mentor(p_space)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.memberships m
     set status = 'banned', role = 'member', vip_until = null
   where m.space_id = p_space and m.user_id = p_user;
  -- Anything they were waiting on is closed, so it does not sit in the queue.
  update public.access_requests r
     set status = 'declined', decided_by = (select auth.uid()), decided_at = now(), decline_reason = 'Removed from the space'
   where r.space_id = p_space and r.user_id = p_user and r.status = 'pending';
end;
$$;

-- Lets a banned person back in, as a free member.
create function public.unban_member(p_space uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.memberships m
     set status = 'active'
   where m.space_id = p_space and m.user_id = p_user and m.status = 'banned';
  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

revoke all on function public.ban_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unban_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ban_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.unban_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reads that need more than one table
-- ---------------------------------------------------------------------------
-- The apps read one table at a time, with plain filters. Anything that needs two tables is a
-- function here, so the join is written once, in one place, and tested with the rest of the
-- rules. Each function checks for itself who is asking.

-- Every space the caller belongs to, with their place in it. A suspended space is included,
-- with its status, so the app can say why it will not open.
create function public.my_spaces()
returns table (
  id uuid, slug text, name text, theme text, logo_path text, status text,
  role text, vip_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.name, s.theme, s.logo_path, s.status, m.role, m.vip_until
    from public.memberships m
    join public.spaces s on s.id = m.space_id
   where m.user_id = (select auth.uid()) and m.status = 'active'
   order by m.joined_at, s.id;
$$;

-- The approval queue with each person's name, oldest first. Staff only.
create function public.list_requests(p_space uuid)
returns table (
  id uuid, kind text, name text, note text, days integer, proof_path text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select r.id, r.kind, p.display_name, r.note, r.days, r.proof_path, r.created_at
      from public.access_requests r
      join public.profiles p on p.id = r.user_id
     where r.space_id = p_space and r.status = 'pending'
     order by r.created_at, r.id
     limit 200;
end;
$$;

-- The people in a space, by name. Staff only.
-- Those whose VIP is about to end come first, then VIP, the mentor, admins, free members and,
-- last, people who were removed. p_user asks for one person. "vip" says whether their VIP is
-- running right now.
create function public.list_members(
  p_space uuid,
  p_search text default null,
  p_limit integer default 50,
  p_user uuid default null
)
returns table (
  user_id uuid, name text, role text, status text, vip_until timestamptz, vip boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name, m.role, m.status, m.vip_until,
           -- Whether VIP is running is the database's call, by its own clock.
           coalesce(m.status = 'active' and m.vip_until > now(), false),
           m.joined_at
      from public.memberships m
      join public.profiles p on p.id = m.user_id
     where m.space_id = p_space
       and (p_user is null or m.user_id = p_user)
       and (v_search = '' or position(v_search in lower(p.display_name)) > 0)
     order by
       case
         when m.status = 'banned' then 5
         when m.role = 'mentor' then 2
         when m.role = 'admin' then 3
         when m.vip_until > now() and m.vip_until <= now() + interval '5 days' then 0
         when m.vip_until > now() then 1
         else 4
       end,
       m.vip_until nulls last,
       lower(p.display_name),
       m.user_id
     limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;

-- How many people are in a space, counted by the system. Staff only.
create function public.member_counts(p_space uuid)
returns table (members bigint, vip bigint, expiring bigint, removed bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select
      count(*) filter (where m.status = 'active'),
      count(*) filter (where m.status = 'active' and m.role = 'member' and m.vip_until > now()),
      count(*) filter (
        where m.status = 'active' and m.role = 'member'
          and m.vip_until > now() and m.vip_until <= now() + interval '5 days'
      ),
      count(*) filter (where m.status = 'banned')
    from public.memberships m
    where m.space_id = p_space;
end;
$$;

revoke all on function public.my_spaces() from public, anon, authenticated;
revoke all on function public.list_requests(uuid) from public, anon, authenticated;
revoke all on function public.list_members(uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.member_counts(uuid) from public, anon, authenticated;
grant execute on function public.my_spaces() to authenticated, service_role;
grant execute on function public.list_requests(uuid) to authenticated, service_role;
grant execute on function public.list_members(uuid, text, integer, uuid) to authenticated, service_role;
grant execute on function public.member_counts(uuid) to authenticated, service_role;
