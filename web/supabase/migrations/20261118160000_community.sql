-- Community: groups to talk in, inside a space. Several per space, each open to everyone, to
-- VIP members, or to the members staff invite. There are no private messages: every message is
-- in a group the space's staff can see, which is what keeps impersonators out.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A member staff have muted can read but not write, in every group of the space, until then.
alter table public.memberships add column muted_until timestamptz;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null
    constraint groups_name check (char_length(btrim(name)) between 1 and 40),
  about text
    constraint groups_about check (about is null or char_length(about) <= 200),
  -- Who may open the group.
  audience text not null default 'everyone'
    constraint groups_audience check (audience in ('everyone', 'vip', 'invited')),
  -- Who may write in it: every member who can open it, or only the mentor and admins.
  posting text not null default 'all'
    constraint groups_posting check (posting in ('all', 'staff')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index groups_space_idx on public.groups (space_id, position, created_at);

-- Who is in a group that is by invitation.
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- A message. Deleting one empties it and keeps the row, so phones that already hold it learn
-- that it went. A person's messages go with their account.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text
    constraint messages_body check (body is null or char_length(body) between 1 and 2000),
  image_path text
    constraint messages_image_path check (image_path is null or char_length(image_path) <= 300),
  image_width integer,
  image_height integer,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Moves whenever the message changes, so a phone can ask for "everything since".
  changed_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint messages_not_empty check (deleted_at is not null or body is not null or image_path is not null),
  constraint messages_image check (
    image_path is null or coalesce(image_width between 1 and 10000 and image_height between 1 and 10000, false)
  )
);
create index messages_group_idx on public.messages (group_id, created_at desc);
create index messages_changed_idx on public.messages (group_id, changed_at);
create index messages_user_idx on public.messages (user_id, created_at desc);

-- How far each person has read each group, for the count of unread messages.
create table public.group_reads (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- A person who has blocked another no longer sees that person's messages, in any group.
create table public.blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  constraint blocks_not_self check (user_id <> blocked_id)
);

-- A member telling the space's staff that a message should not be there.
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'open'
    constraint message_reports_status check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
create index message_reports_space_idx on public.message_reports (space_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Who may open a group, and who may write in it
-- ---------------------------------------------------------------------------

-- Staff open every group in their space. A member needs what every other piece of content
-- needs (their one login, an open space, VIP for a VIP group) and, for a group by invitation,
-- to have been added to it.
create function private.can_read_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
     where g.id = p_group
       and (
         private.is_staff(g.space_id)
         or (
           private.has_access(g.space_id, g.audience = 'vip')
           and (
             g.audience <> 'invited'
             or exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = (select auth.uid()))
           )
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- The link and number filter
-- ---------------------------------------------------------------------------
-- Only the mentor and admins may post links or phone numbers. A member who could would be the
-- "admin" who messages everyone a WhatsApp number. The app checks before sending, to say so
-- at once. This is the check that counts.

-- A web address, an email address, or an @name on another app.
create function private.has_link(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
       p_text ~* '(https?://|www\.)'
    or p_text ~* '(^|[^a-z0-9])(t\.me|wa\.me|bit\.ly|discord\.gg|chat\.whatsapp\.com|tinyurl\.com)([^a-z0-9]|$)'
    or p_text ~* '(^|[^a-z0-9@.])[a-z0-9-]{2,}\.(com|net|org|io|ng|app|xyz|info|biz|ly|gg|ai|uk|za|ke|gh|dev|page)(/|[^a-z0-9]|$)'
    or p_text ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}'
    or p_text ~ '(^|[^A-Za-z0-9_@])@[A-Za-z0-9_]{4,}',
    false);
$$;

-- A phone number: a plus sign and nine or more digits, a number that starts with 0 and has ten
-- or more, or ten or more digits in one unbroken run. Spaces, dashes and brackets inside the
-- number do not hide it. A dot ends a number, so prices such as "1.08500 1.09000" pass, and so
-- do levels listed side by side such as "44250 44300".
create function private.has_phone(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
       p_text ~ '\+([ ()-]{0,2}[0-9]){9,}'
    or p_text ~ '(^|[^0-9.,])0([ ()-]{0,2}[0-9]){9,}'
    or p_text ~ '(^|[^0-9.,])[0-9]{10,}',
    false);
$$;

-- ---------------------------------------------------------------------------
-- Groups (the mentor and admins)
-- ---------------------------------------------------------------------------

-- Creates a group, or changes one when p_group is given. A space can have thirty.
create function public.save_group(
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
     where g.id = p_group and g.space_id = p_space
     returning g.id into v_id;
    if v_id is null then
      raise exception 'group_not_found';
    end if;
    return v_id;
  end if;
  if (select count(*) from public.groups g where g.space_id = p_space) >= 30 then
    raise exception 'too_many_groups';
  end if;
  insert into public.groups (space_id, name, about, audience, posting, position)
  values (
    p_space, v_name, v_about, p_audience, p_posting,
    coalesce((select max(g.position) + 1 from public.groups g where g.space_id = p_space), 0)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Deletes a group with everything said in it. Only the mentor: it cannot be undone.
create function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select g.space_id into v_space from public.groups g where g.id = p_group;
  if v_space is null or not private.is_mentor(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform private.enqueue_files('chat', array(
    select m.image_path from public.messages m where m.group_id = p_group and m.image_path is not null
  ));
  delete from public.groups g where g.id = p_group;
end;
$$;

-- Puts a space's groups in the order given.
create function public.reorder_groups(p_space uuid, p_groups uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.groups g
     set position = o.place
    from unnest(p_groups) with ordinality as o (id, place)
   where g.id = o.id and g.space_id = p_space;
end;
$$;

-- Adds members to a group that is by invitation, and takes others out. Only people who are
-- in the space can be added.
create function public.set_group_members(p_group uuid, p_add uuid[] default '{}', p_remove uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select g.space_id into v_space from public.groups g where g.id = p_group;
  if v_space is null or not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.group_members gm where gm.group_id = p_group and gm.user_id = any (coalesce(p_remove, '{}'));
  insert into public.group_members (group_id, user_id, added_by)
  select p_group, m.user_id, (select auth.uid())
    from public.memberships m
   where m.space_id = v_space and m.status = 'active' and m.user_id = any (coalesce(p_add, '{}'))
  on conflict do nothing;
end;
$$;

-- Who is in a group that is by invitation. For staff.
create function public.group_member_ids(p_group uuid)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select g.space_id into v_space from public.groups g where g.id = p_group;
  if v_space is null or not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query select gm.user_id from public.group_members gm where gm.group_id = p_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- The list of groups
-- ---------------------------------------------------------------------------

-- A space's groups as this person sees them. A VIP group shows to a free member, locked: what
-- VIP holds. A group by invitation shows only to the people in it. For a group the person can
-- open: the newest message and how many they have not read.
create function public.my_groups(p_space uuid)
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
                  -- What was said before a person joined is theirs to read, but is not counted as waiting for them.
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
       -- A group by invitation is not shown to those outside it. Nor is anything else about it.
       and (o.can_open or g.audience = 'vip')
     order by g.position, g.created_at;
end;
$$;

-- The person has read the group up to its newest message. The mark is that message's own
-- stamp, not the clock: whatever is written next is stamped later, so it counts as unread.
create function public.mark_read(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_read_group(p_group) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.group_reads (group_id, user_id, read_at)
  select g.id, (select auth.uid()), coalesce(g.last_message_at, g.created_at)
    from public.groups g where g.id = p_group
  on conflict (group_id, user_id) do update set read_at = greatest(public.group_reads.read_at, excluded.read_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading messages
-- ---------------------------------------------------------------------------

-- One message as the apps show it: who wrote it and their place in the space, and a line of
-- the message it answers. A deleted message comes back empty. A message from someone this
-- person has blocked is left out by the callers, unless staff wrote it.
create function private.message_rows(p_ids uuid[])
returns table (
  id uuid, user_id uuid, name text, role text, body text,
  image_path text, image_width integer, image_height integer,
  reply_to uuid, reply_name text, reply_body text,
  created_at timestamptz, changed_at timestamptz, deleted boolean, mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.user_id, coalesce(f.display_name, 'Member'),
         (select ms.role from public.memberships ms where ms.space_id = m.space_id and ms.user_id = m.user_id and ms.status = 'active'),
         case when m.deleted_at is null then m.body end,
         case when m.deleted_at is null then m.image_path end,
         case when m.deleted_at is null then m.image_width end,
         case when m.deleted_at is null then m.image_height end,
         m.reply_to,
         (select coalesce(rf.display_name, 'Member') from public.messages r left join public.profiles rf on rf.id = r.user_id where r.id = m.reply_to),
         (select case when r.deleted_at is null then left(coalesce(r.body, 'Picture'), 120) end from public.messages r where r.id = m.reply_to),
         m.created_at, m.changed_at, m.deleted_at is not null, m.user_id = (select auth.uid())
    from public.messages m
    left join public.profiles f on f.id = m.user_id
   where m.id = any (p_ids);
$$;

-- Messages a person does not see: those from someone they blocked, unless that someone is the
-- space's mentor or an admin. Staff are never hidden: what they say is the space speaking.
create function private.hidden_from_me(p_space uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks b where b.user_id = (select auth.uid()) and b.blocked_id = p_author)
     and not exists (
       select 1 from public.memberships ms
        where ms.space_id = p_space and ms.user_id = p_author and ms.status = 'active' and ms.role in ('mentor', 'admin')
     );
$$;

-- A page of a group's messages, newest first: the newest, or those before a given moment.
create function public.chat_page(p_group uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (
  id uuid, user_id uuid, name text, role text, body text,
  image_path text, image_width integer, image_height integer,
  reply_to uuid, reply_name text, reply_body text,
  created_at timestamptz, changed_at timestamptz, deleted boolean, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_group(p_group) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select r.* from private.message_rows(array(
      select m.id from public.messages m
       where m.group_id = p_group
         and (p_before is null or m.created_at < p_before)
         -- A message that was deleted before anyone here saw it is not worth a line.
         and m.deleted_at is null
         and not private.hidden_from_me(m.space_id, m.user_id)
       order by m.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    )) r
    order by r.created_at desc;
end;
$$;

-- Everything in a group that is new or changed since a moment: new messages, and messages
-- deleted since, so a phone that holds them can take them off the screen.
create function public.chat_changes(p_group uuid, p_since timestamptz)
returns table (
  id uuid, user_id uuid, name text, role text, body text,
  image_path text, image_width integer, image_height integer,
  reply_to uuid, reply_name text, reply_body text,
  created_at timestamptz, changed_at timestamptz, deleted boolean, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_group(p_group) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select r.* from private.message_rows(array(
      select m.id from public.messages m
       where m.group_id = p_group
         and m.changed_at > coalesce(p_since, now())
         and not private.hidden_from_me(m.space_id, m.user_id)
       order by m.changed_at
       limit 200
    )) r
    order by r.changed_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing messages
-- ---------------------------------------------------------------------------

-- Pictures in groups. Only staff can post one: a picture can carry a link or a phone number
-- that no filter reads. Kept under <space>/<group>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "chat files: staff add"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and private.is_staff(private.try_uuid((storage.foldername(name))[1])));

create policy "chat files: read in groups you can open"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat' and private.can_read_group(private.try_uuid((storage.foldername(name))[2])));

create policy "chat files: staff remove"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and private.is_staff(private.try_uuid((storage.foldername(name))[1])));

-- Sends a message. Answers with its id.
create function public.send_message(
  p_group uuid,
  p_body text default null,
  p_reply_to uuid default null,
  p_image_path text default null,
  p_image_width integer default null,
  p_image_height integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group public.groups%rowtype;
  v_staff boolean;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_id uuid;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_group from public.groups g where g.id = p_group;
  if not found or not private.can_read_group(p_group) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_staff := private.is_staff(v_group.space_id);

  if not v_staff then
    if v_group.posting = 'staff' then
      raise exception 'staff_only';
    end if;
    if exists (
      select 1 from public.memberships m
       where m.space_id = v_group.space_id and m.user_id = v_uid and m.muted_until > now()
    ) then
      raise exception 'muted';
    end if;
    if p_image_path is not null then
      raise exception 'pictures_staff_only';
    end if;
    if private.has_link(v_body) then
      raise exception 'no_links';
    end if;
    if private.has_phone(v_body) then
      raise exception 'no_numbers';
    end if;
    -- Twenty messages a minute is a lively talker. More is a flood.
    if (select count(*) from public.messages m where m.user_id = v_uid and m.created_at > now() - interval '1 minute') >= 20 then
      raise exception 'slow_down';
    end if;
  end if;

  if v_body is null and p_image_path is null then
    raise exception 'message_empty';
  end if;
  if char_length(coalesce(v_body, '')) > 2000 then
    raise exception 'message_too_long';
  end if;
  if p_image_path is not null and p_image_path not like v_group.space_id::text || '/' || p_group::text || '/%' then
    raise exception 'bad_picture';
  end if;

  -- Messages in a group are stamped one after another, never two at the same instant and never
  -- out of the order they were saved in: whoever writes holds the group's row until their
  -- message is in. That is what lets a phone ask for "everything after this one" and miss none.
  update public.groups g
     set last_message_at = greatest(clock_timestamp(), coalesce(g.last_message_at, g.created_at) + interval '1 microsecond')
   where g.id = p_group
   returning g.last_message_at into v_at;

  insert into public.messages (group_id, space_id, user_id, body, image_path, image_width, image_height, reply_to, created_at, changed_at)
  values (
    p_group, v_group.space_id, v_uid, v_body, p_image_path, p_image_width, p_image_height,
    -- An answer has to be to a message in the same group.
    (select r.id from public.messages r where r.id = p_reply_to and r.group_id = p_group),
    v_at, v_at
  )
  returning id into v_id;

  -- What a person has just written, they have read.
  insert into public.group_reads (group_id, user_id, read_at) values (p_group, v_uid, v_at)
  on conflict (group_id, user_id) do update set read_at = excluded.read_at;
  return v_id;
end;
$$;

-- Deletes a message: your own, or any message if you are staff, except that an admin cannot
-- delete what the mentor wrote. It is emptied, not removed, so every phone that holds it learns
-- that it went.
create function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
begin
  select * into v_message from public.messages m where m.id = p_message;
  if not found or not (
    private.is_mentor(v_message.space_id)
    or (v_message.user_id = (select auth.uid()) and private.can_read_group(v_message.group_id))
    or (
      private.is_staff(v_message.space_id)
      and not exists (
        select 1 from public.memberships m
         where m.space_id = v_message.space_id and m.user_id = v_message.user_id and m.role = 'mentor'
      )
    )
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_message.deleted_at is not null then
    return;
  end if;
  if v_message.image_path is not null then
    perform private.enqueue_files('chat', array[v_message.image_path]);
  end if;
  update public.messages m
     set body = null, image_path = null, image_width = null, image_height = null,
         deleted_at = now(), deleted_by = (select auth.uid()), changed_at = now()
   where m.id = p_message;
  -- Whatever was reported about it has been dealt with.
  update public.message_reports r set status = 'closed' where r.message_id = p_message and r.status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

-- Staff stop a member writing for a number of hours, in every group of the space. Zero hours
-- lifts it. Staff cannot be muted: the mentor takes an admin's role away first.
create function public.mute_member(p_space uuid, p_user uuid, p_hours integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_hours is null or p_hours < 0 or p_hours > 24 * 365 then
    raise exception 'bad_hours';
  end if;
  update public.memberships m
     set muted_until = case when p_hours = 0 then null else now() + make_interval(hours => p_hours) end
   where m.space_id = p_space and m.user_id = p_user and m.role = 'member' and m.status = 'active'
   returning m.muted_until into v_until;
  if not found then
    raise exception 'member_not_found';
  end if;
  return v_until;
end;
$$;

-- A member reports a message to the space's staff. Once per message.
create function public.report_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_uid uuid := (select auth.uid());
begin
  select * into v_message from public.messages m where m.id = p_message and m.deleted_at is null;
  if not found or not private.can_read_group(v_message.group_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_message.user_id = v_uid then
    raise exception 'own_message';
  end if;
  insert into public.message_reports (message_id, space_id, reporter_id)
  values (p_message, v_message.space_id, v_uid)
  on conflict (message_id, reporter_id) do nothing;
  -- The first report of a message tells the mentor and admins. Later ones add to the count only.
  if found and (select count(*) from public.message_reports r where r.message_id = p_message and r.status = 'open') = 1 then
    perform private.enqueue('alert', v_message.space_id, jsonb_build_object(
      'type', 'report',
      'message_id', p_message,
      'group', (select g.name from public.groups g where g.id = v_message.group_id)
    ));
  end if;
end;
$$;

-- An alert about a reported message goes to the mentor and admins. Everything else is as before.
create or replace function public.alert_recipients(
  p_space uuid,
  p_type text,
  p_vip_only boolean default true,
  p_except uuid default null
)
returns table (token text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.token
    from public.memberships m
    join public.push_tokens t on t.user_id = m.user_id
    join public.spaces s on s.id = m.space_id
   where m.space_id = p_space
     and m.status = 'active'
     and s.status = 'active'
     and (p_except is null or m.user_id <> p_except)
     and (p_type not in ('payment', 'payment_problem') or m.role = 'mentor')
     and (p_type <> 'staff' or m.role in ('mentor', 'admin'))
     and case p_type
           when 'setup' then m.alert_setups
           when 'lesson' then m.alert_lessons
           when 'live' then m.alert_live
           else true
         end
     and (not coalesce(p_vip_only, true) or m.role in ('mentor', 'admin') or m.vip_until > now())
   order by t.token;
$$;

-- The messages members have reported and staff have not dealt with yet, with how many
-- members reported each. Most reported first.
create function public.reported_messages(p_space uuid)
returns table (
  message_id uuid, group_id uuid, group_name text, user_id uuid, name text, role text,
  body text, has_image boolean, created_at timestamptz, reports integer, first_reported timestamptz
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
    select m.id, g.id, g.name, m.user_id, coalesce(f.display_name, 'Member'),
           (select ms.role from public.memberships ms where ms.space_id = p_space and ms.user_id = m.user_id and ms.status = 'active'),
           m.body, m.image_path is not null, m.created_at, r.reports, r.first_reported
      from (
        select mr.message_id, count(*)::integer as reports, min(mr.created_at) as first_reported
          from public.message_reports mr
         where mr.space_id = p_space and mr.status = 'open'
         group by mr.message_id
      ) r
      join public.messages m on m.id = r.message_id
      join public.groups g on g.id = m.group_id
      left join public.profiles f on f.id = m.user_id
     order by r.reports desc, r.first_reported
     limit 100;
end;
$$;

-- Staff have looked at a reported message and are leaving it up.
create function public.dismiss_message_reports(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select m.space_id into v_space from public.messages m where m.id = p_message;
  if v_space is null or not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.message_reports r set status = 'closed' where r.message_id = p_message and r.status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------

-- A person stops seeing another member's messages. The mentor and admins of a space the two
-- share cannot be blocked there: a member who wants no more of them reports the space.
create function public.block_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or p_user is null or p_user = v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.shares_space_with(p_user) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships mine
      join public.memberships theirs on theirs.space_id = mine.space_id
     where mine.user_id = v_uid and mine.status = 'active'
       and theirs.user_id = p_user and theirs.status = 'active' and theirs.role in ('mentor', 'admin')
  ) then
    raise exception 'cannot_block_staff';
  end if;
  insert into public.blocks (user_id, blocked_id) values (v_uid, p_user) on conflict do nothing;
end;
$$;

create function public.unblock_member(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks b where b.user_id = (select auth.uid()) and b.blocked_id = p_user;
$$;

-- The people this person has blocked, by the names they go by.
create function public.my_blocks()
returns table (user_id uuid, name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, coalesce(f.display_name, 'Member'), b.created_at
    from public.blocks b
    left join public.profiles f on f.id = b.blocked_id
   where b.user_id = (select auth.uid())
   order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Names
-- ---------------------------------------------------------------------------
-- In a group, a name is how people tell who is speaking. The mentor and admins carry a badge
-- that no name can fake. These rules close what is left: a name that claims to be staff, a
-- name that carries a way to reach someone outside Floor, and a member taking the name of the
-- mentor, an admin or the space itself.

-- Stricter than before: the words count anywhere in a name, not only as the whole name.
create or replace function private.is_reserved_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_name, ''))) = 'floor'
      or lower(coalesce(p_name, '')) ~ '(^|[^a-z])(admin|admins|administrator|moderator|support|official|mentor|mentors|helpdesk|help desk|customer care)([^a-z]|$)';
$$;

-- A name down to its letters and digits, in small letters: "Kd  Trader." and "kd_trader" are
-- the same name to a reader.
create function private.plain_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g');
$$;

-- True when, to a reader, the name is that of the space, its mentor or one of its admins, and
-- the person asking is none of them. "Member", the name every account starts with, is free.
create function private.name_taken_in(p_space uuid, p_user uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.plain_name(p_name) not in ('', 'member')
     and (
       exists (select 1 from public.spaces s where s.id = p_space and private.plain_name(s.name) = private.plain_name(p_name))
       or exists (
         select 1 from public.memberships m
           join public.profiles f on f.id = m.user_id
          where m.space_id = p_space and m.status = 'active' and m.role in ('mentor', 'admin')
            and m.user_id <> p_user
            and private.plain_name(f.display_name) = private.plain_name(p_name)
       )
     );
$$;

create function private.check_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name then
    return new;
  end if;
  if private.has_link(new.display_name) or private.has_phone(new.display_name) then
    -- A new account never fails over its name. It starts as "Member" and is asked for one.
    if tg_op = 'INSERT' then
      new.display_name := 'Member';
      return new;
    end if;
    raise exception 'name_has_contact';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.memberships m
     where m.user_id = new.id and m.status = 'active' and m.role = 'member'
       and private.name_taken_in(m.space_id, new.id, new.display_name)
  ) then
    raise exception 'name_taken';
  end if;
  return new;
end;
$$;

create trigger profiles_check_name
  before insert or update of display_name on public.profiles
  for each row execute function private.check_display_name();

-- Someone who joins a space under the name of its mentor, an admin or the space itself goes
-- back to "Member", and the apps ask them to choose a name.
create function private.clear_taken_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'member' then
    update public.profiles f
       set display_name = 'Member'
     where f.id = new.user_id and f.display_name <> 'Member'
       and private.name_taken_in(new.space_id, new.user_id, f.display_name);
  end if;
  return new;
end;
$$;

create trigger memberships_clear_taken_name
  after insert on public.memberships
  for each row execute function private.clear_taken_name();

-- ---------------------------------------------------------------------------
-- Every space starts with two groups
-- ---------------------------------------------------------------------------

create function private.add_first_groups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.groups (space_id, name, about, audience, posting, position)
  values
    (new.id, 'General', 'Open to everyone in the space.', 'everyone', 'all', 0),
    (new.id, 'VIP room', 'For VIP members.', 'vip', 'all', 1);
  return new;
end;
$$;

create trigger spaces_first_groups
  after insert on public.spaces
  for each row execute function private.add_first_groups();

-- Spaces opened before groups existed get the same two.
insert into public.groups (space_id, name, about, audience, posting, position)
select s.id, v.name, v.about, v.audience, 'all', v.position
  from public.spaces s
  cross join (values
    ('General', 'Open to everyone in the space.', 'everyone', 0),
    ('VIP room', 'For VIP members.', 'vip', 1)
  ) as v (name, about, audience, position)
 where not exists (select 1 from public.groups g where g.space_id = s.id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.group_reads enable row level security;
alter table public.blocks enable row level security;
alter table public.message_reports enable row level security;

-- The apps read all of this through the functions above. The policies are the second lock:
-- what a person could read by asking the tables directly is no more than the functions give.
create policy "groups: read the ones you can open, and VIP ones by name"
  on public.groups for select to authenticated
  using (private.can_read_group(id) or (audience = 'vip' and private.has_access(space_id, false)));

create policy "group_members: staff read, and your own"
  on public.group_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_members.group_id and private.is_staff(g.space_id))
  );

create policy "messages: read in groups you can open"
  on public.messages for select to authenticated
  using (deleted_at is null and private.can_read_group(group_id));

create policy "group_reads: your own"
  on public.group_reads for select to authenticated
  using (user_id = (select auth.uid()));

create policy "blocks: your own"
  on public.blocks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "message_reports: your own, and staff read their space's"
  on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_staff(space_id));

grant select on public.groups, public.group_members, public.messages, public.group_reads, public.blocks, public.message_reports to authenticated;
grant all on public.groups, public.group_members, public.messages, public.group_reads, public.blocks, public.message_reports to service_role;

revoke all on function private.can_read_group(uuid) from public, anon, authenticated;
revoke all on function private.has_link(text) from public, anon, authenticated;
revoke all on function private.has_phone(text) from public, anon, authenticated;
revoke all on function private.message_rows(uuid[]) from public, anon, authenticated;
revoke all on function private.hidden_from_me(uuid, uuid) from public, anon, authenticated;
revoke all on function private.add_first_groups() from public, anon, authenticated;
revoke all on function private.plain_name(text) from public, anon, authenticated;
revoke all on function private.name_taken_in(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.check_display_name() from public, anon, authenticated;
revoke all on function private.clear_taken_name() from public, anon, authenticated;
grant execute on function private.can_read_group(uuid) to authenticated;

revoke all on function public.save_group(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_group(uuid) from public, anon, authenticated;
revoke all on function public.reorder_groups(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.set_group_members(uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.group_member_ids(uuid) from public, anon, authenticated;
revoke all on function public.my_groups(uuid) from public, anon, authenticated;
revoke all on function public.mark_read(uuid) from public, anon, authenticated;
revoke all on function public.chat_page(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.chat_changes(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.delete_message(uuid) from public, anon, authenticated;
revoke all on function public.mute_member(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.report_message(uuid) from public, anon, authenticated;
revoke all on function public.reported_messages(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_message_reports(uuid) from public, anon, authenticated;
revoke all on function public.block_member(uuid) from public, anon, authenticated;
revoke all on function public.unblock_member(uuid) from public, anon, authenticated;
revoke all on function public.my_blocks() from public, anon, authenticated;

grant execute on function public.save_group(uuid, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.delete_group(uuid) to authenticated, service_role;
grant execute on function public.reorder_groups(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.set_group_members(uuid, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.group_member_ids(uuid) to authenticated, service_role;
grant execute on function public.my_groups(uuid) to authenticated, service_role;
grant execute on function public.mark_read(uuid) to authenticated, service_role;
grant execute on function public.chat_page(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.chat_changes(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.send_message(uuid, text, uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.delete_message(uuid) to authenticated, service_role;
grant execute on function public.mute_member(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.report_message(uuid) to authenticated, service_role;
grant execute on function public.reported_messages(uuid) to authenticated, service_role;
grant execute on function public.dismiss_message_reports(uuid) to authenticated, service_role;
grant execute on function public.block_member(uuid) to authenticated, service_role;
grant execute on function public.unblock_member(uuid) to authenticated, service_role;
grant execute on function public.my_blocks() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deleting an account, now that there are groups
-- ---------------------------------------------------------------------------

-- As before, and also: the pictures this person posted in groups, anywhere, and every picture
-- in the groups of a space they own. Their messages go with the account by themselves.
create or replace function public.erase_account(p_user uuid)
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
  -- The pictures they posted in groups, as an admin of someone else's space.
  perform private.enqueue_files('chat', array(
    select m.image_path from public.messages m
     where m.user_id = p_user and m.image_path is not null and m.space_id is distinct from v_space
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
    perform private.enqueue_files('chat', array(
      select o.name from storage.objects o where o.bucket_id = 'chat' and split_part(o.name, '/', 1) = v_space::text
    ));
    for v_video in
      select l.video_provider, l.video_id from public.lessons l where l.space_id = v_space and l.video_id is not null
    loop
      perform private.enqueue('video_delete', null, jsonb_build_object('provider', v_video.video_provider, 'video_id', v_video.video_id));
    end loop;

    -- The space goes, and with it its members' places, posts, lessons, groups, payments and the rest.
    delete from public.spaces s where s.id = v_space;
  end if;
end;
$$;
