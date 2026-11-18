-- Safety: Floor's own tools for reports and suspension, and deleting an account.

-- Link words that are routes of the web app, so no space may claim them. The list has grown
-- with the pages added since, and holds a few that are likely to come.
create or replace function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_slug, ''))) in (
    'about', 'account', 'admin', 'api', 'app', 'auth', 'contact', 'delete', 'download', 'floor',
    'help', 'join', 'legal', 'live', 'login', 'logout', 'mentor', 'new', 'pay', 'privacy',
    'report', 'settings', 'signup', 'status', 'support', 'terms', 'www'
  );
$$;

-- ---------------------------------------------------------------------------
-- Suspension
-- ---------------------------------------------------------------------------

-- What Floor told the mentor when it suspended their space. The space's own staff may read
-- it, so the app can show it to them. Nobody else can: it is not for the public.
create table public.suspensions (
  space_id uuid primary key references public.spaces (id) on delete cascade,
  note text not null
    constraint suspensions_note check (char_length(btrim(note)) between 1 and 500),
  suspended_at timestamptz not null default now(),
  suspended_by uuid references auth.users (id) on delete set null
);
alter table public.suspensions enable row level security;

create policy "suspensions: the space's staff and Floor read"
  on public.suspensions for select to authenticated
  using (private.is_staff(space_id) or private.is_platform_admin());

grant select on public.suspensions to authenticated;
grant all on public.suspensions to service_role;

-- Whether the caller is one of Floor's own people. The admin page asks, to know what to show.
-- Every function below checks again for itself.
create function public.floor_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

-- Floor suspends a space, with a note for its mentor. Members can no longer open it, nobody
-- can join it or pay for it, and its join page says it is not available.
create function public.suspend_space(p_space uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 500 then
    raise exception 'note_needed';
  end if;
  update public.spaces s set status = 'suspended' where s.id = p_space;
  if not found then
    raise exception 'space_not_found';
  end if;
  insert into public.suspensions (space_id, note, suspended_by)
  values (p_space, btrim(p_note), (select auth.uid()))
  on conflict (space_id) do update
    set note = excluded.note, suspended_at = now(), suspended_by = excluded.suspended_by;
end;
$$;

-- Floor opens a suspended space again.
create function public.restore_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.spaces s set status = 'active' where s.id = p_space;
  if not found then
    raise exception 'space_not_found';
  end if;
  delete from public.suspensions u where u.space_id = p_space;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports, for Floor's own page
-- ---------------------------------------------------------------------------

-- The reports nobody has dealt with yet, newest first, with the space each is about and the
-- name the reporter goes by. Never their email: Floor judges the space, not the reporter.
create function public.admin_reports()
returns table (
  id uuid, space_id uuid, space_name text, slug text, space_status text,
  reason text, details text, reporter text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select r.id, s.id, s.name, s.slug, s.status, r.reason, r.details, coalesce(f.display_name, 'Member'), r.created_at
      from public.reports r
      join public.spaces s on s.id = r.space_id
      left join public.profiles f on f.id = r.reporter_id
     where r.status = 'open'
     order by r.created_at desc
     limit 500;
end;
$$;

-- Floor has looked at a space's reports. They leave the list, and each reporter can report
-- again later if there is something new.
create function public.close_reports(p_space uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.reports r set status = 'closed' where r.space_id = p_space and r.status = 'open';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Finds spaces by name or link word, with what Floor needs to judge one: its size, its open
-- reports, and whether it is suspended and why. With nothing to search for, the newest spaces.
create function public.admin_spaces(p_search text default null)
returns table (
  id uuid, slug text, name text, status text, created_at timestamptz,
  members bigint, vip bigint, open_reports bigint, note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- What was typed, with the characters that mean "anything" to a search made plain.
  v_search text := replace(replace(replace(lower(btrim(coalesce(p_search, ''))), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select s.id, s.slug, s.name, s.status, s.created_at,
           (select count(*) from public.memberships m where m.space_id = s.id and m.status = 'active'),
           (select count(*) from public.memberships m where m.space_id = s.id and m.status = 'active' and m.role = 'member' and m.vip_until > now()),
           (select count(*) from public.reports r where r.space_id = s.id and r.status = 'open'),
           (select u.note from public.suspensions u where u.space_id = s.id)
      from public.spaces s
     where v_search = '' or s.slug like '%' || v_search || '%' or lower(s.name) like '%' || v_search || '%'
     order by s.created_at desc
     limit 50;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting an account
-- ---------------------------------------------------------------------------

-- What deleting the caller's account would take with it. The apps show this before they ask
-- "are you sure". A mentor's account takes their space with it, and everything in the space.
create function public.account_summary()
returns table (user_id uuid, email text, space_id uuid, space_name text, members bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, s.id, s.name,
         case when s.id is not null then
           (select count(*) from public.memberships m where m.space_id = s.id and m.status = 'active' and m.user_id <> u.id)
         end
    from auth.users u
    left join public.spaces s on s.owner_id = u.id
   where u.id = (select auth.uid());
$$;

-- Queues the removal of files from the file store, a few hundred at a time. The rows that
-- point at files go with the account or the space. The files themselves have to be removed
-- through the store's own door, which only Floor's server can use.
create function private.enqueue_files(p_bucket text, p_paths text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from integer := 1;
  v_count integer := coalesce(array_length(p_paths, 1), 0);
begin
  while v_from <= v_count loop
    perform private.enqueue('files_delete', null, jsonb_build_object('bucket', p_bucket, 'paths', to_jsonb(p_paths[v_from:v_from + 199])));
    v_from := v_from + 200;
  end loop;
end;
$$;

-- Floor's server calls this just before it deletes the account itself. It clears what the
-- account's deletion would not: the space the person owns, with everything in it, and every
-- file and video that belonged to them or to that space. Secret key only.
--
-- The jobs it queues belong to no space, so they outlive the space being deleted.
create function public.erase_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
  v_video record;
begin
  select s.id into v_space from public.spaces s where s.owner_id = p_user;

  -- The proofs this person uploaded, in any space: <space>/<member>/<file>.
  perform private.enqueue_files('proofs', array(
    select o.name from storage.objects o
     where o.bucket_id = 'proofs' and split_part(o.name, '/', 2) = p_user::text
  ));

  if v_space is not null then
    -- Everything kept under the space's own folder in each store.
    perform private.enqueue_files('proofs', array(
      select o.name from storage.objects o
       where o.bucket_id = 'proofs' and split_part(o.name, '/', 1) = v_space::text and split_part(o.name, '/', 2) <> p_user::text
    ));
    perform private.enqueue_files('posts', array(
      select o.name from storage.objects o where o.bucket_id = 'posts' and split_part(o.name, '/', 1) = v_space::text
    ));
    perform private.enqueue_files('logos', array(
      select o.name from storage.objects o where o.bucket_id = 'logos' and split_part(o.name, '/', 1) = v_space::text
    ));
    for v_video in
      select l.video_provider, l.video_id from public.lessons l where l.space_id = v_space and l.video_id is not null
    loop
      perform private.enqueue('video_delete', null, jsonb_build_object('provider', v_video.video_provider, 'video_id', v_video.video_id));
    end loop;

    -- The space goes, and with it its members' places, posts, lessons, payments and the rest.
    delete from public.spaces s where s.id = v_space;
  end if;
end;
$$;

revoke all on function public.floor_admin() from public, anon, authenticated;
revoke all on function public.suspend_space(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_space(uuid) from public, anon, authenticated;
revoke all on function public.admin_reports() from public, anon, authenticated;
revoke all on function public.close_reports(uuid) from public, anon, authenticated;
revoke all on function public.admin_spaces(text) from public, anon, authenticated;
revoke all on function public.account_summary() from public, anon, authenticated;
revoke all on function private.enqueue_files(text, text[]) from public, anon, authenticated;
revoke all on function public.erase_account(uuid) from public, anon, authenticated;

grant execute on function public.floor_admin() to authenticated, service_role;
grant execute on function public.suspend_space(uuid, text) to authenticated, service_role;
grant execute on function public.restore_space(uuid) to authenticated, service_role;
grant execute on function public.admin_reports() to authenticated, service_role;
grant execute on function public.close_reports(uuid) to authenticated, service_role;
grant execute on function public.admin_spaces(text) to authenticated, service_role;
grant execute on function public.account_summary() to authenticated, service_role;
grant execute on function public.erase_account(uuid) to service_role;
