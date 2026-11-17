-- The Feed: posts, trade setups and pinned offers. And the queue of jobs for Floor's server.

-- ---------------------------------------------------------------------------
-- Jobs for the server
-- ---------------------------------------------------------------------------
-- Some things cannot happen inside the database: sending an alert to phones, posting to a
-- Telegram channel, telling the video host to delete a file. A function that needs one of them
-- adds a row here in the same transaction as its own change, so the job exists exactly when the
-- change does. Floor's server takes jobs from here with its secret key and does them.
--
-- The table is in the private schema: the API cannot reach it at all.

create table private.outbox (
  id bigint generated always as identity primary key,
  kind text not null,
  space_id uuid references public.spaces (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  claimed_at timestamptz,
  done_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table private.outbox enable row level security;
create index outbox_waiting_idx on private.outbox (run_after) where done_at is null;

create function private.enqueue(
  p_kind text,
  p_space uuid,
  p_payload jsonb default '{}'::jsonb,
  p_run_after timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.outbox (kind, space_id, payload, run_after)
  values (p_kind, p_space, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_after, now()));
$$;

-- The server takes the jobs that are due. A job taken more than five minutes ago and never
-- finished is handed out again: the server that took it has died.
create function public.claim_outbox(p_limit integer default 20)
returns table (id bigint, kind text, space_id uuid, payload jsonb, attempts integer)
language sql
security definer
set search_path = ''
as $$
  update private.outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.id in (
     select w.id
       from private.outbox w
      where w.done_at is null
        and w.run_after <= now()
        and (w.claimed_at is null or w.claimed_at < now() - interval '5 minutes')
      order by w.run_after, w.id
      limit least(greatest(coalesce(p_limit, 20), 1), 100)
      for update skip locked
   )
  returning o.id, o.kind, o.space_id, o.payload, o.attempts;
$$;

-- The server reports how a job went. A job that failed is tried again later, each time after a
-- longer wait, and given up on after five tries.
create function public.finish_outbox(p_id bigint, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.outbox o
     set done_at = case when p_error is null or o.attempts >= 5 then now() end,
         last_error = left(p_error, 500),
         claimed_at = null,
         run_after = case
           when p_error is null then o.run_after
           else now() + make_interval(mins => o.attempts * o.attempts)
         end
   where o.id = p_id;
$$;

revoke all on function private.enqueue(text, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_outbox(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;
grant execute on function public.finish_outbox(bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
-- kind      what it is
-- post      words, with an optional picture. A free post may embed a video or a social post.
-- setup     a trade idea: pair, direction, entry, stop and one to three targets.
-- offer     a deal the mentor pins to the top of the Feed: a title, a few words and a link.
--
-- audience is who may open it: everyone in the space, or VIP only. Free members see that a VIP
-- post exists, and nothing inside it.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  kind text not null
    constraint posts_kind check (kind in ('post', 'setup', 'offer')),
  audience text not null default 'vip'
    constraint posts_audience check (audience in ('everyone', 'vip')),
  title text
    constraint posts_title check (title is null or char_length(btrim(title)) between 1 and 120),
  body text
    constraint posts_body check (body is null or char_length(btrim(body)) between 1 and 4000),

  -- A picture, kept in the "posts" file store under "<space>/<audience>/".
  image_path text,
  image_width integer,
  image_height integer,

  -- A video or post from YouTube, X, Instagram or Facebook, shown inside a free post.
  embed_url text,

  -- A setup. Prices are kept as typed, so 1.0850 stays 1.0850.
  pair text,
  side text,
  entry text,
  stop text,
  targets text[],
  -- The mentor's own word on how it went, and whether it is over.
  update_note text
    constraint posts_update_note check (update_note is null or char_length(btrim(update_note)) between 1 and 200),
  update_at timestamptz,
  closed_at timestamptz,

  -- An offer's link.
  link_url text,
  link_label text
    constraint posts_link_label check (link_label is null or char_length(btrim(link_label)) between 1 and 30),

  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,

  -- A check passes when its answer is unknown, so each of these says plainly that a missing
  -- value is a "no".
  constraint posts_image check (
    (image_path is null and image_width is null and image_height is null)
    or coalesce(
      char_length(image_path) <= 300
      and position(space_id::text || '/' || audience || '/' in image_path) = 1
      and image_width between 1 and 10000
      and image_height between 1 and 10000,
      false
    )
  ),
  -- Embeds are for free posts only. YouTube's rules do not allow charging to watch an embedded
  -- video, so paid video is always uploaded and hosted by Floor instead.
  constraint posts_embed check (
    embed_url is null
    or (
      audience = 'everyone'
      and kind = 'post'
      and char_length(embed_url) <= 500
      and embed_url ~* '^https://(www\.|m\.|mobile\.)?(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com|facebook\.com|fb\.watch)/\S+$'
    )
  ),
  constraint posts_setup check (
    case when kind = 'setup' then
      coalesce(
        pair ~ '^[A-Z0-9][A-Z0-9./]{1,14}$'
        and side in ('buy', 'sell')
        and entry ~ '^\d{1,9}(\.\d{1,8})?$'
        and stop ~ '^\d{1,9}(\.\d{1,8})?$'
        and array_to_string(targets, ',') ~ '^\d{1,9}(\.\d{1,8})?(,\d{1,9}(\.\d{1,8})?){0,2}$',
        false
      )
    else
      pair is null and side is null and entry is null and stop is null and targets is null
      and update_note is null and update_at is null and closed_at is null
    end
  ),
  constraint posts_offer check (
    case when kind = 'offer' then
      coalesce(
        title is not null and audience = 'everyone'
        and char_length(link_url) <= 500 and link_url ~* '^https://\S+$',
        false
      )
    else
      link_url is null and link_label is null
    end
  ),
  constraint posts_not_empty check (
    kind <> 'post' or title is not null or body is not null or image_path is not null or embed_url is not null
  )
);
create index posts_feed_idx on public.posts (space_id, created_at desc) where deleted_at is null;

alter table public.posts enable row level security;

-- The rule that guards the table itself: a VIP post is only ever read by someone with VIP.
-- The locked glimpse free members get comes from the feed function below, and holds nothing
-- from inside the post.
create policy "posts: read what your access allows"
  on public.posts for select to authenticated
  using (deleted_at is null and private.has_access(space_id, audience = 'vip'));

grant select on public.posts to authenticated;
grant all on public.posts to service_role;

-- Pictures in posts. The second folder says who may see the file, and must match the post.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "posts files: staff add"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posts'
    and private.is_staff(private.try_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] in ('everyone', 'vip')
  );

create policy "posts files: read what your access allows"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'posts'
    and private.has_access(
      private.try_uuid((storage.foldername(name))[1]),
      (storage.foldername(name))[2] is distinct from 'everyone'
    )
  );

create policy "posts files: staff remove"
  on storage.objects for delete to authenticated
  using (bucket_id = 'posts' and private.is_staff(private.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------------
-- Posting
-- ---------------------------------------------------------------------------

-- The mentor or an admin posts. Returns the new post's id.
-- A new setup also queues an alert for the members who may open it.
create function public.create_post(
  p_space uuid,
  p_kind text,
  p_audience text default 'vip',
  p_title text default null,
  p_body text default null,
  p_image_path text default null,
  p_image_width integer default null,
  p_image_height integer default null,
  p_embed_url text default null,
  p_pair text default null,
  p_side text default null,
  p_entry text default null,
  p_stop text default null,
  p_targets text[] default null,
  p_link_url text default null,
  p_link_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_audience text := case when p_kind = 'offer' then 'everyone' else coalesce(p_audience, 'vip') end;
  v_pair text := upper(regexp_replace(coalesce(p_pair, ''), '\s', '', 'g'));
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('post', 'setup', 'offer') then
    raise exception 'bad_kind';
  end if;
  if p_embed_url is not null and v_audience <> 'everyone' then
    raise exception 'embed_needs_free_post';
  end if;
  if p_kind = 'offer' and (
    select count(*) from public.posts p
     where p.space_id = p_space and p.kind = 'offer' and p.deleted_at is null
  ) >= 5 then
    raise exception 'too_many_offers';
  end if;

  insert into public.posts (
    space_id, author_id, kind, audience, title, body,
    image_path, image_width, image_height, embed_url,
    pair, side, entry, stop, targets, link_url, link_label
  )
  values (
    p_space, (select auth.uid()), p_kind, v_audience,
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    p_image_path, p_image_width, p_image_height,
    nullif(btrim(coalesce(p_embed_url, '')), ''),
    case when p_kind = 'setup' then v_pair end,
    case when p_kind = 'setup' then p_side end,
    case when p_kind = 'setup' then btrim(p_entry) end,
    case when p_kind = 'setup' then btrim(p_stop) end,
    case when p_kind = 'setup' then p_targets end,
    case when p_kind = 'offer' then btrim(p_link_url) end,
    case when p_kind = 'offer' then nullif(btrim(coalesce(p_link_label, '')), '') end
  )
  returning id into v_id;

  if p_kind = 'setup' then
    perform private.enqueue('alert', p_space, jsonb_build_object(
      'type', 'setup', 'post_id', v_id, 'audience', v_audience, 'pair', v_pair, 'side', p_side
    ));
  end if;
  return v_id;
end;
$$;

-- Changes the words of a post or an offer. A setup cannot be edited: see update_setup.
create function public.edit_post(
  p_post uuid,
  p_title text default null,
  p_body text default null,
  p_link_url text default null,
  p_link_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts p where p.id = p_post and p.deleted_at is null for update;
  if not found then
    raise exception 'post_not_found';
  end if;
  if not private.is_staff(v_post.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_post.kind = 'setup' then
    raise exception 'setups_cannot_be_edited';
  end if;
  update public.posts p
     set title = nullif(btrim(coalesce(p_title, '')), ''),
         body = nullif(btrim(coalesce(p_body, '')), ''),
         link_url = case when v_post.kind = 'offer' then btrim(p_link_url) end,
         link_label = case when v_post.kind = 'offer' then nullif(btrim(coalesce(p_link_label, '')), '') end,
         edited_at = now()
   where p.id = p_post;
end;
$$;

-- A setup's prices are set once. Nobody can rewrite a call after the market has moved.
-- What the mentor can do is add their own word on how it went, and close it. A closed setup
-- stays closed.
create function public.update_setup(p_post uuid, p_note text default null, p_closed boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_post from public.posts p where p.id = p_post and p.deleted_at is null for update;
  if not found then
    raise exception 'post_not_found';
  end if;
  if not private.is_staff(v_post.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_post.kind <> 'setup' then
    raise exception 'not_a_setup';
  end if;
  update public.posts p
     set update_note = v_note,
         update_at = case when v_note is distinct from v_post.update_note then now() else p.update_at end,
         closed_at = case when coalesce(p_closed, false) then coalesce(p.closed_at, now()) else p.closed_at end
   where p.id = p_post;
end;
$$;

-- Takes a post out of the Feed for everyone.
create function public.delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select p.space_id into v_space from public.posts p where p.id = p_post and p.deleted_at is null;
  if not found then
    raise exception 'post_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.posts p set deleted_at = now() where p.id = p_post;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading the Feed
-- ---------------------------------------------------------------------------

-- One page of a space's Feed for the person asking, newest first. The first page starts with
-- the pinned offers. p_before asks for the page of posts older than that moment.
--
-- A VIP post comes back locked for someone without VIP: its kind, when it was posted, a post's
-- title or a setup's pair, and nothing else.
create function public.feed(p_space uuid, p_before timestamptz default null, p_limit integer default 20)
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
begin
  if not private.has_access(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_vip := private.has_access(p_space, true);

  return query
    with page as (
      (
        select p.*, 0 as part
          from public.posts p
         where p.space_id = p_space and p.deleted_at is null and p.kind = 'offer' and p_before is null
         order by p.created_at desc
      )
      union all
      (
        select p.*, 1 as part
          from public.posts p
         where p.space_id = p_space and p.deleted_at is null and p.kind <> 'offer'
           and (p_before is null or p.created_at < p_before)
         order by p.created_at desc
         limit least(greatest(coalesce(p_limit, 20), 1), 50)
      )
    ),
    seen as (
      select page.*, (page.audience = 'vip' and not v_vip) as is_locked from page
    )
    select
      s.id, s.kind, s.audience, s.is_locked,
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
      s.closed_at is not null,
      s.link_url, s.link_label, s.created_at, s.edited_at is not null
    from seen s
    order by s.part, s.created_at desc;
end;
$$;

-- What a visitor sees on a space's join page before signing up: the newest few posts. Free
-- posts show their title and opening words. VIP posts show as locked, as they do to a free
-- member in the app.
create function public.space_preview(p_slug text)
returns table (kind text, locked boolean, title text, pair text, snippet text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.kind,
    p.audience = 'vip',
    case when p.audience = 'vip' and p.kind <> 'post' then null else p.title end,
    p.pair,
    case when p.audience = 'everyone' then left(p.body, 160) end,
    p.created_at
  from public.posts p
  join public.spaces s on s.id = p.space_id
  where s.slug = lower(btrim(coalesce(p_slug, ''))) and s.status = 'active'
    and p.deleted_at is null and p.kind <> 'offer'
  order by p.created_at desc
  limit 4;
$$;

revoke all on function public.create_post(uuid, text, text, text, text, text, integer, integer, text, text, text, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.edit_post(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_setup(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.delete_post(uuid) from public, anon, authenticated;
revoke all on function public.feed(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.space_preview(text) from public, anon, authenticated;
grant execute on function public.create_post(uuid, text, text, text, text, text, integer, integer, text, text, text, text, text, text[], text, text) to authenticated, service_role;
grant execute on function public.edit_post(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.update_setup(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.delete_post(uuid) to authenticated, service_role;
grant execute on function public.feed(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.space_preview(text) to anon, authenticated, service_role;
