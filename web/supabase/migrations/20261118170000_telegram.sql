-- The Telegram teaser bot. Floor has one bot. A mentor adds it to the Telegram channel their
-- audience is already in, and it posts a short notice there when something new is in their
-- space, with the join link. It never posts what is for VIP members, only that it is there.

-- ---------------------------------------------------------------------------
-- The link between a space and a Telegram chat
-- ---------------------------------------------------------------------------

create table public.telegram_links (
  space_id uuid primary key references public.spaces (id) on delete cascade,
  -- The channel or group the bot posts in. Null until the mentor has connected one. A chat
  -- serves one space.
  chat_id bigint unique,
  chat_title text
    constraint telegram_links_title check (chat_title is null or char_length(chat_title) <= 255),
  chat_kind text
    constraint telegram_links_kind check (chat_kind is null or chat_kind in ('channel', 'supergroup', 'group')),
  connected_at timestamptz,
  -- A code the mentor posts in the chat, once, to prove the chat is theirs.
  connect_code text unique,
  code_expires_at timestamptz,
  -- What the bot announces.
  tease_setups boolean not null default true,
  tease_posts boolean not null default true,
  tease_lessons boolean not null default true,
  tease_live boolean not null default true,
  last_sent_at timestamptz,
  -- Why the last notice could not be posted, as a short code. Null while all is well.
  last_error text,
  last_error_at timestamptz
);

-- Nothing reads this table but the functions below.
alter table public.telegram_links enable row level security;
grant all on public.telegram_links to service_role;

-- ---------------------------------------------------------------------------
-- For the mentor
-- ---------------------------------------------------------------------------

-- A code to post in the chat. It works once, for half an hour. Asking again replaces it.
-- A chat that is already connected stays connected until another takes its place.
create function public.telegram_start(p_space uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_until timestamptz := now() + interval '30 minutes';
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  loop
    v_code := private.random_code();
    exit when not exists (select 1 from public.telegram_links t where t.connect_code = v_code);
  end loop;
  insert into public.telegram_links (space_id, connect_code, code_expires_at)
  values (p_space, v_code, v_until)
  on conflict (space_id) do update set connect_code = excluded.connect_code, code_expires_at = excluded.code_expires_at;
  return query select v_code, v_until;
end;
$$;

-- Where the space's teasers stand. Always one row, even before anything was set up.
create function public.telegram_status(p_space uuid)
returns table (
  connected boolean, chat_title text, chat_kind text, connected_at timestamptz,
  code text, code_expires_at timestamptz,
  tease_setups boolean, tease_posts boolean, tease_lessons boolean, tease_live boolean,
  last_sent_at timestamptz, last_error text, last_error_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select t.chat_id is not null, t.chat_title, t.chat_kind, t.connected_at,
           case when t.code_expires_at > now() then t.connect_code end,
           case when t.code_expires_at > now() then t.code_expires_at end,
           coalesce(t.tease_setups, true), coalesce(t.tease_posts, true), coalesce(t.tease_lessons, true), coalesce(t.tease_live, true),
           t.last_sent_at, t.last_error, t.last_error_at
      from (select p_space as id) s
      left join public.telegram_links t on t.space_id = s.id;
end;
$$;

-- Which kinds of thing the bot announces.
create function public.telegram_set(p_space uuid, p_setups boolean, p_posts boolean, p_lessons boolean, p_live boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.telegram_links (space_id, tease_setups, tease_posts, tease_lessons, tease_live)
  values (p_space, coalesce(p_setups, true), coalesce(p_posts, true), coalesce(p_lessons, true), coalesce(p_live, true))
  on conflict (space_id) do update
    set tease_setups = excluded.tease_setups, tease_posts = excluded.tease_posts,
        tease_lessons = excluded.tease_lessons, tease_live = excluded.tease_live;
end;
$$;

-- Stops the bot posting. The chat is forgotten. The switches are kept.
create function public.telegram_disconnect(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.telegram_links t
     set chat_id = null, chat_title = null, chat_kind = null, connected_at = null,
         connect_code = null, code_expires_at = null, last_error = null, last_error_at = null
   where t.space_id = p_space;
end;
$$;

-- Asks the bot to post a line in the chat, so the mentor can see that it works.
create function public.telegram_test(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.telegram_links t where t.space_id = p_space and t.chat_id is not null) then
    raise exception 'not_connected';
  end if;
  -- One test at a time: pressing the button again while one waits adds nothing.
  if not exists (
    select 1 from private.outbox o
     where o.kind = 'telegram' and o.space_id = p_space and o.payload ->> 'type' = 'test' and o.done_at is null
  ) then
    perform private.enqueue('telegram', p_space, jsonb_build_object('type', 'test'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- For Floor's server, with the secret key
-- ---------------------------------------------------------------------------

-- The bot saw a code posted in a chat. If the code is good, that chat is now the space's.
-- Answers with the space, or with nothing when the code is wrong or too old.
create function public.telegram_connect(p_code text, p_chat_id bigint, p_title text, p_kind text)
returns table (space_id uuid, space_name text, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select t.space_id into v_space
    from public.telegram_links t
   where t.connect_code = upper(btrim(coalesce(p_code, ''))) and t.code_expires_at > now()
     for update;
  if v_space is null or p_chat_id is null then
    return;
  end if;
  -- A chat serves one space. If it was another's, it is this one's now.
  update public.telegram_links t
     set chat_id = null, chat_title = null, chat_kind = null, connected_at = null
   where t.chat_id = p_chat_id and t.space_id <> v_space;
  update public.telegram_links t
     set chat_id = p_chat_id,
         chat_title = left(nullif(btrim(coalesce(p_title, '')), ''), 255),
         chat_kind = case when p_kind in ('channel', 'supergroup', 'group') then p_kind end,
         connected_at = now(), connect_code = null, code_expires_at = null,
         last_error = null, last_error_at = null
   where t.space_id = v_space;
  return query select s.id, s.name, s.slug from public.spaces s where s.id = v_space;
end;
$$;

-- What the server needs to post a notice for a space. Nothing when no chat is connected.
create function public.telegram_target(p_space uuid)
returns table (
  chat_id bigint, tease_setups boolean, tease_posts boolean, tease_lessons boolean, tease_live boolean,
  space_name text, slug text, space_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.chat_id, t.tease_setups, t.tease_posts, t.tease_lessons, t.tease_live, s.name, s.slug, s.status
    from public.telegram_links t
    join public.spaces s on s.id = t.space_id
   where t.space_id = p_space and t.chat_id is not null;
$$;

-- How posting a notice went. With no error it went through.
create function public.telegram_result(p_space uuid, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.telegram_links t
     set last_sent_at = case when p_error is null then now() else t.last_sent_at end,
         last_error = left(p_error, 40),
         last_error_at = case when p_error is null then null else now() end
   where t.space_id = p_space;
$$;

-- The bot was taken out of a chat, or lost the right to post there.
create function public.telegram_left(p_chat_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.telegram_links t
     set last_error = 'removed', last_error_at = now()
   where t.chat_id = p_chat_id;
$$;

-- ---------------------------------------------------------------------------
-- What gets announced
-- ---------------------------------------------------------------------------
-- A notice is queued when a post or a setup is written, and when a lesson is published. The
-- server words it from what a free member would see, and posts it.

create function private.tease_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('post', 'setup') and exists (
    select 1 from public.telegram_links t
     where t.space_id = new.space_id and t.chat_id is not null
       and case new.kind when 'setup' then t.tease_setups else t.tease_posts end
  ) then
    perform private.enqueue('telegram', new.space_id, jsonb_build_object('type', new.kind, 'post_id', new.id));
  end if;
  return new;
end;
$$;

create trigger posts_tease
  after insert on public.posts
  for each row execute function private.tease_post();

create function private.tease_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.published_at is null and new.published_at is not null and exists (
    select 1 from public.telegram_links t
     where t.space_id = new.space_id and t.chat_id is not null and t.tease_lessons
  ) then
    perform private.enqueue('telegram', new.space_id, jsonb_build_object('type', 'lesson', 'lesson_id', new.id));
  end if;
  return new;
end;
$$;

create trigger lessons_tease
  after update of published_at on public.lessons
  for each row execute function private.tease_lesson();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on function private.tease_post() from public, anon, authenticated;
revoke all on function private.tease_lesson() from public, anon, authenticated;

revoke all on function public.telegram_start(uuid) from public, anon, authenticated;
revoke all on function public.telegram_status(uuid) from public, anon, authenticated;
revoke all on function public.telegram_set(uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.telegram_disconnect(uuid) from public, anon, authenticated;
revoke all on function public.telegram_test(uuid) from public, anon, authenticated;
revoke all on function public.telegram_connect(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.telegram_target(uuid) from public, anon, authenticated;
revoke all on function public.telegram_result(uuid, text) from public, anon, authenticated;
revoke all on function public.telegram_left(bigint) from public, anon, authenticated;

grant execute on function public.telegram_start(uuid) to authenticated, service_role;
grant execute on function public.telegram_status(uuid) to authenticated, service_role;
grant execute on function public.telegram_set(uuid, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.telegram_disconnect(uuid) to authenticated, service_role;
grant execute on function public.telegram_test(uuid) to authenticated, service_role;
grant execute on function public.telegram_connect(text, bigint, text, text) to service_role;
grant execute on function public.telegram_target(uuid) to service_role;
grant execute on function public.telegram_result(uuid, text) to service_role;
grant execute on function public.telegram_left(bigint) to service_role;
