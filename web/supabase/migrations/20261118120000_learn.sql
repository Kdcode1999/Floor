-- Learn: lessons in modules, hosted video, each member's progress. And the two protection
-- switches a mentor controls.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Lessons are VIP content. Hosted video costs money for every minute watched, and Floor's fee
-- does not count free members, so free teaching goes out as a YouTube embed in a free post.
-- A free member sees the outline (module and lesson titles), which shows what VIP holds.

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null
    constraint modules_title check (char_length(btrim(title)) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index modules_space_idx on public.modules (space_id, position);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null
    constraint lessons_title check (char_length(btrim(title)) between 1 and 120),
  description text
    constraint lessons_description check (description is null or char_length(description) <= 4000),
  position integer not null default 0,
  -- Null while the lesson is a draft only staff can see.
  published_at timestamptz,

  -- The video lives with a video host. Floor keeps the host's name and the video's id there.
  video_provider text
    constraint lessons_video_provider check (video_provider is null or video_provider in ('bunny')),
  video_id text
    constraint lessons_video_id check (video_id is null or char_length(video_id) between 1 and 100),
  -- none: no video. uploading: the file is on its way. processing: the host is preparing it.
  -- ready: it can be played. failed: the host could not use the file.
  video_status text not null default 'none'
    constraint lessons_video_status check (video_status in ('none', 'uploading', 'processing', 'ready', 'failed')),
  duration_seconds integer
    constraint lessons_duration check (duration_seconds is null or duration_seconds between 0 and 86400),
  -- upload: the mentor uploaded it. recording: it is the recording of a live session.
  source text not null default 'upload'
    constraint lessons_source check (source in ('upload', 'recording')),

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint lessons_video check ((video_status = 'none') = (video_id is null)),
  constraint lessons_video_pair check ((video_id is null) = (video_provider is null))
);
create index lessons_module_idx on public.lessons (module_id, position);
create index lessons_space_idx on public.lessons (space_id, published_at desc);
create unique index lessons_video_idx on public.lessons (video_provider, video_id) where video_id is not null;

-- How far each member has got in each lesson.
create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  seconds integer not null default 0
    constraint lesson_progress_seconds check (seconds between 0 and 86400),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;

create policy "modules: members read"
  on public.modules for select to authenticated
  using (private.has_access(space_id));

-- A lesson is read only with VIP, and a draft only by staff.
create policy "lessons: VIP read published lessons, staff read all"
  on public.lessons for select to authenticated
  using (
    private.is_staff(space_id)
    or (
      published_at is not null
      and video_status in ('none', 'ready')
      and private.has_access(space_id, true)
    )
  );

create policy "lesson_progress: read own"
  on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.modules, public.lessons, public.lesson_progress to authenticated;
grant all on public.modules, public.lessons, public.lesson_progress to service_role;

-- ---------------------------------------------------------------------------
-- Protection: the two switches a mentor controls
-- ---------------------------------------------------------------------------
-- One login at a time and one phone per account are always on. These two can be switched off:
-- blocking screenshots and screen recording, and showing the viewer's name on paid video.

alter table public.space_settings
  add column block_capture boolean not null default true,
  add column watermark boolean not null default true;

grant update (block_capture, watermark) on public.space_settings to authenticated;

-- The app needs both switches the moment it opens a space, so they come with the space. So
-- does the name the person goes by, which is what is shown on paid video.
drop function public.my_spaces();

create function public.my_spaces()
returns table (
  id uuid, slug text, name text, theme text, logo_path text, status text,
  role text, vip_until timestamptz, block_capture boolean, watermark boolean, display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.name, s.theme, s.logo_path, s.status, m.role, m.vip_until,
         t.block_capture, t.watermark, p.display_name
    from public.memberships m
    join public.spaces s on s.id = m.space_id
    join public.space_settings t on t.space_id = s.id
    join public.profiles p on p.id = m.user_id
   where m.user_id = (select auth.uid()) and m.status = 'active'
   order by m.joined_at, s.id;
$$;

revoke all on function public.my_spaces() from public, anon, authenticated;
grant execute on function public.my_spaces() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Building the course: staff only
-- ---------------------------------------------------------------------------

-- Adds a module at the end, or renames one. Returns its id.
create function public.save_module(p_space uuid, p_title text, p_module uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_module is null then
    insert into public.modules (space_id, title, position)
    values (
      p_space, btrim(p_title),
      (select coalesce(max(m.position), 0) + 1 from public.modules m where m.space_id = p_space)
    )
    returning id into v_id;
  else
    update public.modules m set title = btrim(p_title)
     where m.id = p_module and m.space_id = p_space
     returning m.id into v_id;
    if not found then
      raise exception 'module_not_found';
    end if;
  end if;
  return v_id;
end;
$$;

-- Queues the removal of a lesson's video from the video host.
create function private.forget_video(p_space uuid, p_provider text, p_video_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_video_id is not null then
    perform private.enqueue('video_delete', p_space, jsonb_build_object('provider', p_provider, 'video_id', p_video_id));
  end if;
end;
$$;

-- Removes a module with every lesson in it.
create function public.delete_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
  v_lesson record;
begin
  select m.space_id into v_space from public.modules m where m.id = p_module;
  if not found then
    raise exception 'module_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  for v_lesson in select l.video_provider, l.video_id from public.lessons l where l.module_id = p_module loop
    perform private.forget_video(v_space, v_lesson.video_provider, v_lesson.video_id);
  end loop;
  delete from public.modules m where m.id = p_module;
end;
$$;

-- Puts a space's modules in the order given. Every module must be named, once.
create function public.reorder_modules(p_space uuid, p_modules uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.modules m where m.space_id = p_space) <> coalesce(cardinality(p_modules), 0)
     or exists (select 1 from public.modules m where m.space_id = p_space and not (m.id = any (p_modules))) then
    raise exception 'bad_order';
  end if;
  update public.modules m set position = o.place
    from unnest(p_modules) with ordinality as o(id, place)
   where m.id = o.id and m.space_id = p_space;
end;
$$;

-- Adds a lesson at the end of a module as a draft, or changes one's words. Returns its id.
create function public.save_lesson(
  p_module uuid,
  p_title text,
  p_description text default null,
  p_lesson uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
  v_id uuid;
  v_words text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select m.space_id into v_space from public.modules m where m.id = p_module;
  if not found then
    raise exception 'module_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_lesson is null then
    insert into public.lessons (space_id, module_id, title, description, position, created_by)
    values (
      v_space, p_module, btrim(p_title), v_words,
      (select coalesce(max(l.position), 0) + 1 from public.lessons l where l.module_id = p_module),
      (select auth.uid())
    )
    returning id into v_id;
  else
    -- Naming another module of the same space moves the lesson there, to the end.
    update public.lessons l
       set title = btrim(p_title),
           description = v_words,
           module_id = p_module,
           position = case
             when l.module_id = p_module then l.position
             else (select coalesce(max(o.position), 0) + 1 from public.lessons o where o.module_id = p_module)
           end
     where l.id = p_lesson and l.space_id = v_space
     returning l.id into v_id;
    if not found then
      raise exception 'lesson_not_found';
    end if;
  end if;
  return v_id;
end;
$$;

-- Puts a module's lessons in the order given. Every lesson in it must be named, once.
create function public.reorder_lessons(p_module uuid, p_lessons uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select m.space_id into v_space from public.modules m where m.id = p_module;
  if not found then
    raise exception 'module_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.lessons l where l.module_id = p_module) <> coalesce(cardinality(p_lessons), 0)
     or exists (select 1 from public.lessons l where l.module_id = p_module and not (l.id = any (p_lessons))) then
    raise exception 'bad_order';
  end if;
  update public.lessons l set position = o.place
    from unnest(p_lessons) with ordinality as o(id, place)
   where l.id = o.id and l.module_id = p_module;
end;
$$;

-- Shows a lesson to VIP members, or takes it back to a draft.
-- A lesson whose video is not ready cannot be published: members would open it to nothing.
-- The first time a lesson is published, an alert is queued for VIP members.
create function public.publish_lesson(p_lesson uuid, p_published boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson for update;
  if not found then
    raise exception 'lesson_not_found';
  end if;
  if not private.is_staff(v_lesson.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not coalesce(p_published, true) then
    update public.lessons l set published_at = null where l.id = p_lesson;
    return;
  end if;
  if v_lesson.video_status not in ('none', 'ready') then
    raise exception 'video_not_ready';
  end if;
  if v_lesson.video_status = 'none' and v_lesson.description is null then
    raise exception 'lesson_empty';
  end if;
  if v_lesson.published_at is null then
    update public.lessons l set published_at = now() where l.id = p_lesson;
    perform private.enqueue('alert', v_lesson.space_id, jsonb_build_object(
      'type', 'lesson', 'lesson_id', p_lesson, 'title', v_lesson.title
    ));
  end if;
end;
$$;

create function public.delete_lesson(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  if not found then
    raise exception 'lesson_not_found';
  end if;
  if not private.is_staff(v_lesson.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.forget_video(v_lesson.space_id, v_lesson.video_provider, v_lesson.video_id);
  delete from public.lessons l where l.id = p_lesson;
end;
$$;

-- ---------------------------------------------------------------------------
-- Video: what Floor's server asks and tells
-- ---------------------------------------------------------------------------

-- Before the server hands out an upload address it asks, as the person uploading, whether
-- they may add a video to this lesson. Staff of the lesson's space only.
create function public.lesson_for_upload(p_lesson uuid)
returns table (space_id uuid, title text, video_provider text, video_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select l.space_id, l.title, l.video_provider, l.video_id
      from public.lessons l
     where l.id = p_lesson and private.is_staff(l.space_id);
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- Before the server signs a playback address it asks, as the person watching, whether they
-- may watch this lesson: VIP that has not run out and the account's one login, or staff.
create function public.lesson_playback(p_lesson uuid)
returns table (space_id uuid, video_provider text, video_id text, duration_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select l.space_id, l.video_provider, l.video_id, l.duration_seconds
      from public.lessons l
     where l.id = p_lesson
       and l.video_status = 'ready'
       and (
         private.is_staff(l.space_id)
         or (l.published_at is not null and private.has_access(l.space_id, true))
       );
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- The server records where a lesson's video is and how it is doing. Secret key only.
create function public.set_lesson_video(
  p_lesson uuid,
  p_provider text,
  p_video_id text,
  p_status text,
  p_duration integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lessons l
     set video_provider = case when p_status = 'none' then null else p_provider end,
         video_id = case when p_status = 'none' then null else p_video_id end,
         video_status = p_status,
         duration_seconds = case when p_status = 'none' then null else coalesce(p_duration, l.duration_seconds) end,
         -- A lesson whose video is replaced or lost goes back to a draft until it can be played.
         published_at = case when p_status in ('ready', 'none') then l.published_at else null end
   where l.id = p_lesson;
  if not found then
    raise exception 'lesson_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------

-- A member's place in a lesson. Called every few seconds while a video plays.
-- Finishing is kept: watching a lesson again does not un-finish it.
create function public.save_progress(p_lesson uuid, p_seconds integer, p_completed boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.lessons l
     where l.id = p_lesson
       and (private.is_staff(l.space_id) or (l.published_at is not null and private.has_access(l.space_id, true)))
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, seconds, completed_at)
  values (v_uid, p_lesson, greatest(coalesce(p_seconds, 0), 0), case when p_completed then now() end)
  on conflict (user_id, lesson_id) do update
     set seconds = excluded.seconds,
         completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
         updated_at = now();
end;
$$;

-- A space's course for the person asking: every module with its lessons, in order.
-- * Staff get everything, drafts and empty modules included.
-- * A VIP member gets the published lessons that can be opened, with their own progress.
-- * A free member gets the same outline with every lesson locked: titles and lengths only.
create function public.learn_outline(p_space uuid)
returns table (
  module_id uuid, module_title text, lesson_id uuid, lesson_title text,
  duration_seconds integer, has_video boolean, video_status text, published boolean,
  locked boolean, seconds integer, completed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_staff boolean := private.is_staff(p_space);
  v_vip boolean;
begin
  if not private.has_access(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_vip := private.has_access(p_space, true);

  return query
    select
      m.id, m.title, l.id, l.title,
      l.duration_seconds,
      l.video_id is not null,
      case when v_staff then l.video_status end,
      l.published_at is not null,
      l.id is not null and not v_vip,
      case when v_vip then coalesce(p.seconds, 0) else 0 end,
      v_vip and p.completed_at is not null
    from public.modules m
    left join public.lessons l
      on l.module_id = m.id
     and (v_staff or (l.published_at is not null and l.video_status in ('none', 'ready')))
    left join public.lesson_progress p on p.lesson_id = l.id and p.user_id = v_uid
    where m.space_id = p_space
      and (v_staff or l.id is not null)
    order by m.position, m.created_at, m.id, l.position, l.created_at, l.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- New lessons in the Feed
-- ---------------------------------------------------------------------------
-- A published lesson shows up in the Feed as a note, at the time it was published. To someone
-- without VIP it is locked, like any other VIP post.

create or replace function public.feed(p_space uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (
  id uuid, kind text, audience text, locked boolean, title text, body text,
  image_path text, image_width integer, image_height integer, embed_url text,
  pair text, side text, entry text, stop text, targets text[],
  update_note text, update_at timestamptz, closed boolean,
  link_url text, link_label text, created_at timestamptz, edited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vip boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if not private.has_access(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_vip := private.has_access(p_space, true);

  return query
    with offers as (
      select p.*, (p.audience = 'vip' and not v_vip) as is_locked
        from public.posts p
       where p.space_id = p_space and p.deleted_at is null and p.kind = 'offer' and p_before is null
    ),
    posts as (
      select p.*, (p.audience = 'vip' and not v_vip) as is_locked
        from public.posts p
       where p.space_id = p_space and p.deleted_at is null and p.kind <> 'offer'
         and (p_before is null or p.created_at < p_before)
       order by p.created_at desc
       limit v_limit
    ),
    notes as (
      select l.id, l.title, l.published_at
        from public.lessons l
       where l.space_id = p_space and l.published_at is not null and l.video_status in ('none', 'ready')
         and (p_before is null or l.published_at < p_before)
       order by l.published_at desc
       limit v_limit
    ),
    merged as (
      select
        0 as part, s.id, s.kind, s.audience, s.is_locked,
        s.title, s.body, s.image_path, s.image_width, s.image_height, s.embed_url,
        s.pair, s.side, s.entry, s.stop, s.targets, s.update_note, s.update_at,
        s.closed_at is not null as is_closed, s.link_url, s.link_label, s.created_at,
        s.edited_at is not null as is_edited
      from offers s
      union all
      (
        select
          1, s.id, s.kind, s.audience, s.is_locked,
          case when s.is_locked and s.kind <> 'post' then null else s.title end,
          case when s.is_locked then null else s.body end,
          case when s.is_locked then null else s.image_path end,
          case when s.is_locked then null else s.image_width end,
          case when s.is_locked then null else s.image_height end,
          case when s.is_locked then null else s.embed_url end,
          s.pair,
          case when s.is_locked then null else s.side end,
          case when s.is_locked then null else s.entry end,
          case when s.is_locked then null else s.stop end,
          case when s.is_locked then null else s.targets end,
          case when s.is_locked then null else s.update_note end,
          case when s.is_locked then null else s.update_at end,
          s.closed_at is not null, s.link_url, s.link_label, s.created_at,
          s.edited_at is not null
        from posts s
        union all
        select
          1, n.id, 'lesson', 'vip', not v_vip,
          n.title, null, null, null, null, null,
          null, null, null, null, null, null, null,
          false, null, null, n.published_at, false
        from notes n
        order by 22 desc
        limit v_limit
      )
    )
    select
      g.id, g.kind, g.audience, g.is_locked, g.title, g.body,
      g.image_path, g.image_width, g.image_height, g.embed_url,
      g.pair, g.side, g.entry, g.stop, g.targets,
      g.update_note, g.update_at, g.is_closed,
      g.link_url, g.link_label, g.created_at, g.is_edited
    from merged g
    order by g.part, g.created_at desc;
end;
$$;

revoke all on function public.save_module(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.forget_video(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_module(uuid) from public, anon, authenticated;
revoke all on function public.reorder_modules(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.save_lesson(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reorder_lessons(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.publish_lesson(uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_lesson(uuid) from public, anon, authenticated;
revoke all on function public.lesson_for_upload(uuid) from public, anon, authenticated;
revoke all on function public.lesson_playback(uuid) from public, anon, authenticated;
revoke all on function public.set_lesson_video(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.save_progress(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.learn_outline(uuid) from public, anon, authenticated;

grant execute on function public.save_module(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.delete_module(uuid) to authenticated, service_role;
grant execute on function public.reorder_modules(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.save_lesson(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.reorder_lessons(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.publish_lesson(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_lesson(uuid) to authenticated, service_role;
grant execute on function public.lesson_for_upload(uuid) to authenticated, service_role;
grant execute on function public.lesson_playback(uuid) to authenticated, service_role;
grant execute on function public.set_lesson_video(uuid, text, text, text, integer) to service_role;
grant execute on function public.save_progress(uuid, integer, boolean) to authenticated, service_role;
grant execute on function public.learn_outline(uuid) to authenticated, service_role;
