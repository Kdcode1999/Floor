-- Live: classes on a schedule, and the live room.
--
-- A class is something the mentor says will happen at a time. A session is the mentor being
-- live. They are the same row: a class becomes a session when the mentor starts it, and a
-- mentor can also go live with nothing scheduled.
--
-- The live room is for VIP members, like lessons. A free member sees that a class is coming
-- or that the mentor is live, and nothing more.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null
    constraint live_sessions_title check (char_length(btrim(title)) between 1 and 120),
  about text
    constraint live_sessions_about check (about is null or char_length(about) <= 500),
  -- When the class is due. For a session started with nothing scheduled, the moment it started.
  starts_at timestamptz not null,
  status text not null default 'scheduled'
    constraint live_sessions_status check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  -- Who is broadcasting, and when their app last said it still was. A session whose
  -- broadcaster has been quiet for three minutes counts as over: see private.live_on.
  host_id uuid references auth.users (id) on delete set null,
  host_seen_at timestamptz,
  -- Whether the mentor wants the session kept as a lesson, and how that is going.
  record boolean not null default true,
  recording_status text not null default 'none'
    constraint live_sessions_recording_status check (recording_status in ('none', 'recording', 'saving', 'saved', 'failed')),
  egress_id text
    constraint live_sessions_egress_id check (egress_id is null or char_length(egress_id) <= 100),
  -- Where the recording's file waits in the "recordings" store until the video host has it.
  recording_path text
    constraint live_sessions_recording_path check (recording_path is null or char_length(recording_path) <= 300),
  lesson_id uuid references public.lessons (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint live_sessions_times check (
    case status
      when 'scheduled' then started_at is null and ended_at is null
      when 'live' then started_at is not null and ended_at is null and host_seen_at is not null
      when 'ended' then started_at is not null and ended_at is not null
      else true
    end
  )
);
create index live_sessions_space_idx on public.live_sessions (space_id, status, starts_at);
-- A space has one live session at a time.
create unique index live_sessions_one_live on public.live_sessions (space_id) where status = 'live';

alter table public.live_sessions enable row level security;

create policy "live_sessions: VIP members and staff read"
  on public.live_sessions for select to authenticated
  using (private.has_access(space_id, true));

grant select on public.live_sessions to authenticated;
grant all on public.live_sessions to service_role;

-- A session's chat is a group of its own, made when the session starts. It is for the same
-- people as the room, never shows in the list of groups, and goes when the session's row does.
-- Everything chat already does (the filter, mute, report, block, delete) works in it unchanged.
alter table public.groups add column session_id uuid references public.live_sessions (id) on delete cascade;
create unique index groups_session_idx on public.groups (session_id) where session_id is not null;

-- Where a recording's file waits. Nobody reads it but Floor's server: no rule opens it.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True while a session is really on: started, not ended, and its broadcaster heard from in the
-- last three minutes. A laptop that was closed mid-session stops counting by itself.
create function private.live_on(p_status text, p_seen timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_status = 'live' and p_seen > now() - interval '3 minutes', false);
$$;

-- Ends a session. Its chat stays to be read, and nobody but staff can add to it.
create function private.live_close(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  update public.live_sessions l
     set status = 'ended',
         ended_at = now(),
         -- A recording under way is finished off by the video service, which reports back.
         recording_status = case when l.recording_status = 'recording' then 'saving' else l.recording_status end
   where l.id = p_session and l.status = 'live'
   returning l.space_id into v_space;
  if v_space is null then
    return;
  end if;
  update public.groups g set posting = 'staff' where g.session_id = p_session;
  -- The chats of sessions that ended more than a week ago are thrown away.
  delete from public.groups g
   using public.live_sessions l
   where g.session_id = l.id and l.space_id = v_space and l.status = 'ended' and l.ended_at < now() - interval '7 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------

-- The mentor or an admin puts a class on the schedule, or changes one that has not started.
-- VIP members are reminded a quarter of an hour before it is due.
create function public.save_class(
  p_space uuid,
  p_title text,
  p_starts_at timestamptz,
  p_about text default null,
  p_record boolean default true,
  p_session uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
  v_before timestamptz;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '366 days' then
    raise exception 'bad_time';
  end if;

  if p_session is null then
    if (select count(*) from public.live_sessions l where l.space_id = p_space and l.status = 'scheduled') >= 60 then
      raise exception 'too_many_classes';
    end if;
    insert into public.live_sessions (space_id, title, about, starts_at, record, created_by)
    values (p_space, v_title, v_about, p_starts_at, coalesce(p_record, true), (select auth.uid()))
    returning id into v_id;
  else
    select l.starts_at into v_before
      from public.live_sessions l
     where l.id = p_session and l.space_id = p_space and l.status = 'scheduled'
       for update;
    if not found then
      raise exception 'session_not_found';
    end if;
    update public.live_sessions l
       set title = v_title, about = v_about, starts_at = p_starts_at, record = coalesce(p_record, l.record)
     where l.id = p_session;
    v_id := p_session;
  end if;

  -- The reminder waits in the queue until a quarter of an hour before. One is queued when the
  -- class is new or its time moved. A reminder for a time the class no longer has is dropped
  -- when its turn comes: see live_for_alert.
  if (v_before is null or v_before <> p_starts_at) and p_starts_at > now() + interval '20 minutes' then
    perform private.enqueue(
      'alert', p_space,
      jsonb_build_object('type', 'class', 'session_id', v_id, 'audience', 'vip', 'starts_at', p_starts_at),
      p_starts_at - interval '15 minutes'
    );
  end if;
  return v_id;
end;
$$;

-- Takes a class off the schedule.
create function public.cancel_class(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select l.space_id into v_space from public.live_sessions l where l.id = p_session and l.status = 'scheduled';
  if not found then
    raise exception 'session_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.live_sessions l set status = 'cancelled' where l.id = p_session;
end;
$$;

-- What is on: the live session if there is one, then the classes to come. Everyone in the
-- space may ask. Someone without VIP is told a class's title and time and that it is locked.
-- Staff also see the classes whose time has passed, and for two weeks the sessions that ended,
-- with what became of each recording.
create function public.live_schedule(p_space uuid)
returns table (
  id uuid, title text, about text, starts_at timestamptz, state text,
  started_at timestamptz, ended_at timestamptz, locked boolean,
  record boolean, recording_status text, lesson_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.is_staff(p_space);
  v_vip boolean;
begin
  if not private.has_access(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_vip := private.has_access(p_space, true);

  return query
    select s.id, s.title, case when v_vip then s.about end, s.starts_at, s.state,
           s.started_at, s.ended_at, not v_vip,
           s.record, case when v_staff then s.recording_status end, case when v_staff then s.lesson_id end
      from (
        select l.*,
               case
                 when private.live_on(l.status, l.host_seen_at) then 'live'
                 -- Started, and the broadcaster has gone quiet: over, as far as anyone can tell.
                 when l.status = 'live' then 'ended'
                 else l.status
               end as state
          from public.live_sessions l
         where l.space_id = p_space and l.status <> 'cancelled'
      ) s
     where s.state = 'live'
        or (s.state = 'scheduled' and (v_staff or s.starts_at > now() - interval '1 hour'))
        or (s.state = 'ended' and v_staff and coalesce(s.ended_at, s.host_seen_at) > now() - interval '14 days')
     order by
       case s.state when 'live' then 0 when 'scheduled' then 1 else 2 end,
       case when s.state = 'scheduled' then s.starts_at end,
       coalesce(s.ended_at, s.host_seen_at) desc,
       s.id
     limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- Going live
-- ---------------------------------------------------------------------------

-- The mentor or an admin goes live: with a class from the schedule, or with a title and
-- nothing scheduled. Answers with the session. VIP members are alerted, and the space's
-- Telegram channel is told if the mentor has that switched on.
--
-- Calling it again for the session that is already on is how a broadcaster comes back after a
-- reload or a dropped connection, and how an admin takes over from the mentor.
create function public.live_start(
  p_space uuid,
  p_title text default null,
  p_session uuid default null,
  p_record boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_live public.live_sessions%rowtype;
  v_id uuid;
  v_title text;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.space_is_active(p_space) then
    raise exception 'space_unavailable';
  end if;

  select * into v_live from public.live_sessions l where l.space_id = p_space and l.status = 'live' for update;
  if found then
    if p_session is not null and v_live.id = p_session then
      update public.live_sessions l set host_id = v_uid, host_seen_at = now() where l.id = v_live.id;
      return v_live.id;
    end if;
    if private.live_on(v_live.status, v_live.host_seen_at) then
      raise exception 'already_live';
    end if;
    -- The last session was never ended and its broadcaster is long gone.
    perform private.live_close(v_live.id);
  end if;

  if p_session is not null then
    update public.live_sessions l
       set status = 'live', started_at = now(), host_id = v_uid, host_seen_at = now(),
           record = coalesce(p_record, l.record)
     where l.id = p_session and l.space_id = p_space and l.status = 'scheduled'
     returning l.id, l.title into v_id, v_title;
    if v_id is null then
      raise exception 'session_not_found';
    end if;
  else
    v_title := btrim(coalesce(p_title, ''));
    insert into public.live_sessions (space_id, title, starts_at, status, started_at, host_id, host_seen_at, record, created_by)
    values (p_space, v_title, now(), 'live', now(), v_uid, now(), coalesce(p_record, true), v_uid)
    returning id into v_id;
  end if;

  insert into public.groups (space_id, name, audience, posting, position, session_id)
  values (p_space, left('Live: ' || v_title, 40), 'vip', 'all', 0, v_id);

  perform private.enqueue('alert', p_space, jsonb_build_object('type', 'live', 'session_id', v_id, 'audience', 'vip'));
  if exists (
    select 1 from public.telegram_links t where t.space_id = p_space and t.chat_id is not null and t.tease_live
  ) then
    perform private.enqueue('telegram', p_space, jsonb_build_object('type', 'live', 'session_id', v_id));
  end if;
  return v_id;
end;
$$;

-- The broadcaster's app says it is still there, every half minute. Answers with where the
-- session stands, so a broadcaster learns that it was ended from somewhere else.
create function public.live_heartbeat(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.live_sessions l
     set host_seen_at = now()
   where l.id = p_session and l.status = 'live' and l.host_id = (select auth.uid()) and private.is_staff(l.space_id)
   returning l.status into v_status;
  if v_status is not null then
    return v_status;
  end if;
  select l.status into v_status
    from public.live_sessions l
   where l.id = p_session and private.is_staff(l.space_id);
  if v_status is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Still on, with someone else broadcasting now.
  return case when v_status = 'live' then 'taken_over' else v_status end;
end;
$$;

-- The mentor or an admin ends the session.
create function public.live_end(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select l.space_id into v_space from public.live_sessions l where l.id = p_session;
  if v_space is null or not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.live_close(p_session);
end;
$$;

-- Someone opens the live room. The database says whether they may: VIP that has not run out
-- and the account's one login, or staff. Floor's server asks this, as the person, before it
-- gives out a way into the room.
create function public.live_join(p_session uuid)
returns table (
  space_id uuid, title text, started_at timestamptz, group_id uuid,
  is_host boolean, is_staff boolean, viewer_name text, record boolean, recording_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.live_sessions%rowtype;
begin
  select * into v_session from public.live_sessions l where l.id = p_session;
  if not found or not private.has_access(v_session.space_id, true) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.live_on(v_session.status, v_session.host_seen_at) then
    raise exception 'not_live';
  end if;
  return query
    select v_session.space_id, v_session.title, v_session.started_at,
           (select g.id from public.groups g where g.session_id = v_session.id),
           v_session.host_id = v_uid,
           private.is_staff(v_session.space_id),
           coalesce((select f.display_name from public.profiles f where f.id = v_uid), 'Member'),
           v_session.record, v_session.recording_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- For Floor's server only
-- ---------------------------------------------------------------------------

-- The video service says the room has emptied and closed.
create function public.live_finish(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.live_close(p_session);
$$;

-- How a session's recording is going: started, being saved, saved or failed.
create function public.live_recording(
  p_session uuid,
  p_status text,
  p_egress text default null,
  p_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.live_sessions l
     set recording_status = p_status,
         egress_id = coalesce(p_egress, l.egress_id),
         recording_path = case when p_status in ('saved', 'failed', 'none') then null else coalesce(p_path, l.recording_path) end
   where l.id = p_session;
  if not found then
    raise exception 'session_not_found';
  end if;
end;
$$;

-- Makes the draft lesson a recording becomes, in a module of its own called "Live recordings",
-- and ties it to the session. The mentor names it, moves it and publishes it like any lesson.
-- Asked for twice, it answers with the same lesson.
create function public.live_recording_lesson(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.live_sessions%rowtype;
  v_module uuid;
  v_lesson uuid;
begin
  select * into v_session from public.live_sessions l where l.id = p_session for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.lesson_id is not null then
    return v_session.lesson_id;
  end if;

  select m.id into v_module
    from public.modules m
   where m.space_id = v_session.space_id and m.title = 'Live recordings'
   order by m.created_at
   limit 1;
  if v_module is null then
    insert into public.modules (space_id, title, position)
    values (
      v_session.space_id, 'Live recordings',
      (select coalesce(max(m.position), 0) + 1 from public.modules m where m.space_id = v_session.space_id)
    )
    returning id into v_module;
  end if;

  insert into public.lessons (space_id, module_id, title, description, position, source, created_by)
  values (
    v_session.space_id, v_module, v_session.title, v_session.about,
    (select coalesce(max(l.position), 0) + 1 from public.lessons l where l.module_id = v_module),
    'recording', v_session.host_id
  )
  returning id into v_lesson;

  update public.live_sessions l set lesson_id = v_lesson where l.id = p_session;
  return v_lesson;
end;
$$;

-- Whether an alert about a session is still worth sending when its turn comes, and the title
-- to send it with. A reminder is dropped if the class was cancelled, has started, or was moved
-- to another time. "Live now" is dropped if the session is already over.
create function public.live_for_alert(p_session uuid, p_starts_at timestamptz default null)
returns table (title text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.title
    from public.live_sessions l
   where l.id = p_session
     and case
           when p_starts_at is null then private.live_on(l.status, l.host_seen_at)
           else l.status = 'scheduled' and l.starts_at = p_starts_at and l.starts_at > now() - interval '5 minutes'
         end;
$$;

-- ---------------------------------------------------------------------------
-- Groups, now that a session has one of its own
-- ---------------------------------------------------------------------------

-- As before, without the groups that belong to live sessions.
create or replace function public.my_groups(p_space uuid)
returns table (
  id uuid, name text, about text, audience text, posting text,
  can_open boolean, can_post boolean,
  last_at timestamptz, last_name text, last_body text, last_has_image boolean,
  unread integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_staff boolean := private.is_staff(p_space);
  v_muted boolean;
  v_joined timestamptz;
begin
  if not v_staff and not private.has_access(p_space, false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select coalesce(m.muted_until > now(), false), m.joined_at into v_muted, v_joined
    from public.memberships m where m.space_id = p_space and m.user_id = v_uid;

  return query
    select g.id, g.name, g.about, g.audience, g.posting,
           o.can_open,
           o.can_open and (v_staff or (g.posting = 'all' and not coalesce(v_muted, false))),
           l.created_at, l.name, l.body, l.has_image,
           case when o.can_open then (
             select count(*)::integer from (
               select 1 from public.messages m
                where m.group_id = g.id and m.deleted_at is null and m.user_id <> v_uid
                  and m.created_at > greatest(
                        coalesce((select r.read_at from public.group_reads r where r.group_id = g.id and r.user_id = v_uid), g.created_at),
                        coalesce(v_joined, g.created_at)
                      )
                  and not exists (select 1 from public.blocks b where b.user_id = v_uid and b.blocked_id = m.user_id)
                limit 100
             ) unread
           ) else 0 end
      from public.groups g
      cross join lateral (select private.can_read_group(g.id) as can_open) o
      left join lateral (
        select m.created_at, coalesce(f.display_name, 'Member') as name, left(m.body, 120) as body, m.image_path is not null as has_image
          from public.messages m
          left join public.profiles f on f.id = m.user_id
         where o.can_open and m.group_id = g.id and m.deleted_at is null
           and not exists (select 1 from public.blocks b where b.user_id = v_uid and b.blocked_id = m.user_id)
         order by m.created_at desc
         limit 1
      ) l on true
     where g.space_id = p_space
       and g.session_id is null
       and (o.can_open or g.audience = 'vip')
     order by g.position, g.created_at;
end;
$$;

-- As before. A live session's group does not count towards the thirty, and is not changed here.
create or replace function public.save_group(
  p_space uuid,
  p_name text,
  p_about text default null,
  p_audience text default 'everyone',
  p_posting text default 'all',
  p_group uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_group is not null then
    update public.groups g
       set name = v_name, about = v_about, audience = p_audience, posting = p_posting
     where g.id = p_group and g.space_id = p_space and g.session_id is null
     returning g.id into v_id;
    if v_id is null then
      raise exception 'group_not_found';
    end if;
    return v_id;
  end if;
  if (select count(*) from public.groups g where g.space_id = p_space and g.session_id is null) >= 30 then
    raise exception 'too_many_groups';
  end if;
  insert into public.groups (space_id, name, about, audience, posting, position)
  values (
    p_space, v_name, v_about, p_audience, p_posting,
    coalesce((select max(g.position) + 1 from public.groups g where g.space_id = p_space and g.session_id is null), 0)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- As before. A live session's group goes with its session, not by hand.
create or replace function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select g.space_id into v_space from public.groups g where g.id = p_group and g.session_id is null;
  if v_space is null or not private.is_mentor(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.enqueue_files('chat', array(
    select m.image_path from public.messages m where m.group_id = p_group and m.image_path is not null
  ));
  delete from public.groups g where g.id = p_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function private.live_on(text, timestamptz) from public, anon, authenticated;
revoke all on function private.live_close(uuid) from public, anon, authenticated;

revoke all on function public.save_class(uuid, text, timestamptz, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.cancel_class(uuid) from public, anon, authenticated;
revoke all on function public.live_schedule(uuid) from public, anon, authenticated;
revoke all on function public.live_start(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.live_heartbeat(uuid) from public, anon, authenticated;
revoke all on function public.live_end(uuid) from public, anon, authenticated;
revoke all on function public.live_join(uuid) from public, anon, authenticated;
revoke all on function public.live_finish(uuid) from public, anon, authenticated;
revoke all on function public.live_recording(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.live_recording_lesson(uuid) from public, anon, authenticated;
revoke all on function public.live_for_alert(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.save_class(uuid, text, timestamptz, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.cancel_class(uuid) to authenticated, service_role;
grant execute on function public.live_schedule(uuid) to authenticated, service_role;
grant execute on function public.live_start(uuid, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.live_heartbeat(uuid) to authenticated, service_role;
grant execute on function public.live_end(uuid) to authenticated, service_role;
grant execute on function public.live_join(uuid) to authenticated, service_role;
grant execute on function public.live_finish(uuid) to service_role;
grant execute on function public.live_recording(uuid, text, text, text) to service_role;
grant execute on function public.live_recording_lesson(uuid) to service_role;
grant execute on function public.live_for_alert(uuid, timestamptz) to service_role;
