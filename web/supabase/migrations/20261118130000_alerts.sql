-- Alerts: a notification on a member's phone for a new setup, a new lesson, and going live.

-- ---------------------------------------------------------------------------
-- Where to send them
-- ---------------------------------------------------------------------------
-- A phone that allows notifications gets an address from the notification service, and the
-- app hands it over here. An account has one phone, so it has one address: saving a new one
-- replaces the old, and a phone that changes hands takes its address to the new account.
-- Nothing reads this table but the functions below.

create table public.push_tokens (
  token text primary key
    constraint push_tokens_token check (char_length(token) between 10 and 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null
    constraint push_tokens_platform check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create unique index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
grant all on public.push_tokens to service_role;

-- Each member chooses which alerts they get from each space. All on to begin with.
alter table public.memberships
  add column alert_setups boolean not null default true,
  add column alert_live boolean not null default true,
  add column alert_lessons boolean not null default true;

-- The app calls this when the person allows notifications, and each time it opens after that.
create function public.save_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.push_tokens t where t.user_id = v_uid or t.token = p_token;
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_uid, p_platform);
end;
$$;

-- The app calls this when the person signs out, so a signed-out phone gets no more alerts.
create function public.remove_push_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens t where t.user_id = (select auth.uid());
$$;

-- A member switches their alerts from one space on or off.
create function public.set_alerts(p_space uuid, p_setups boolean, p_live boolean, p_lessons boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships m
     set alert_setups = coalesce(p_setups, m.alert_setups),
         alert_live = coalesce(p_live, m.alert_live),
         alert_lessons = coalesce(p_lessons, m.alert_lessons)
   where m.space_id = p_space and m.user_id = (select auth.uid());
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- What Floor's server asks when it sends an alert
-- ---------------------------------------------------------------------------

-- Every job now records who caused it, so an alert can leave out the person who posted: they
-- know already. A job the server queues for itself has nobody behind it.
create or replace function private.enqueue(
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
  values (
    p_kind,
    p_space,
    coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('actor', (select auth.uid()))),
    coalesce(p_run_after, now())
  );
$$;

-- The phones to alert: active members of an open space who have this kind of alert switched
-- on. With p_vip_only, only those who could open what the alert is about: VIP that has not
-- run out, and staff. p_except is the person who caused the alert, who is not told.
-- Secret key only.
create function public.alert_recipients(
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
     and case p_type
           when 'setup' then m.alert_setups
           when 'lesson' then m.alert_lessons
           when 'live' then m.alert_live
           else true
         end
     and (not coalesce(p_vip_only, true) or m.role in ('mentor', 'admin') or m.vip_until > now())
   order by t.token;
$$;

-- The notification service says an address no longer works: the app was removed. Secret key only.
create function public.forget_push_tokens(p_tokens text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens t where t.token = any (p_tokens);
$$;

revoke all on function public.save_push_token(text, text) from public, anon, authenticated;
revoke all on function public.remove_push_token() from public, anon, authenticated;
revoke all on function public.set_alerts(uuid, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.alert_recipients(uuid, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.forget_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.save_push_token(text, text) to authenticated, service_role;
grant execute on function public.remove_push_token() to authenticated, service_role;
grant execute on function public.set_alerts(uuid, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.alert_recipients(uuid, text, boolean, uuid) to service_role;
grant execute on function public.forget_push_tokens(text[]) to service_role;

-- The server queues a job of its own: checking, a little later, whether alerts were delivered.
-- Secret key only.
create function public.queue_job(
  p_kind text,
  p_space uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_run_after timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.enqueue(p_kind, p_space, p_payload, p_run_after);
$$;

revoke all on function public.queue_job(text, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.queue_job(text, uuid, jsonb, timestamptz) to service_role;
