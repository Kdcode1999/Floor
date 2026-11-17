-- Floor: foundation
--
-- Accounts, spaces, membership, VIP that ends by itself, the approval queue,
-- invite codes, one login at a time, one phone per account, and reports.
--
-- Conventions used in every Floor migration
-- * Row level security is on for every table.
-- * Clients never write privileged columns (role, vip_until, status) directly.
--   Those changes go through the functions in this file.
-- * Helper functions used by policies live in the "private" schema, which the
--   API does not expose. Functions the apps call live in "public".
-- * Functions are "security definer" with an empty search_path, so every name
--   inside them is schema-qualified.
-- * Grants are explicit, so nothing here depends on a project's defaults.
-- * Errors raised for the apps are short codes (for example 'banned'). The
--   apps turn the code into a sentence.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Small pure helpers
-- ---------------------------------------------------------------------------

-- Names a member may not use, so nobody can pose as staff in a chat.
create function private.is_reserved_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_name, ''))) in (
    'admin', 'administrator', 'mentor', 'moderator', 'support', 'floor', 'floor support'
  );
$$;

-- Link words that are routes of the web app, so no space may claim them.
create function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_slug, ''))) in (
    'admin', 'api', 'app', 'auth', 'floor', 'help', 'join', 'login', 'logout', 'mentor',
    'new', 'pay', 'privacy', 'settings', 'signup', 'support', 'terms', 'www'
  );
$$;

-- Text to uuid without raising, for storage paths.
create function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- An 8 character code from letters and digits that are hard to misread.
-- Uses the random bytes of a v4 uuid (bytes 6 and 8 carry fixed bits, so they are skipped).
create function private.random_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_positions constant integer[] := array[0, 1, 2, 3, 4, 5, 9, 10];
  v_code text := '';
  v_pos integer;
begin
  foreach v_pos in array v_positions loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_pos) % 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- What other people may see about an account.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Member'
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 40)
    constraint profiles_display_name_reserved check (not private.is_reserved_name(display_name)),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- One login at a time and one phone per account. Only the owner can read it.
create table public.account_security (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_session_id uuid,
  device_id text,
  device_bound_at timestamptz
);

-- Every phone an account was tied to. Used to limit phone changes.
create table public.device_bindings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  is_change boolean not null default false,
  bound_at timestamptz not null default now()
);
create index device_bindings_user_idx on public.device_bindings (user_id, bound_at desc);

-- One space per mentor. Everything in this table is safe to show on the public join page.
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint spaces_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  name text not null
    constraint spaces_name_length check (char_length(btrim(name)) between 1 and 40),
  tagline text
    constraint spaces_tagline_length check (tagline is null or char_length(tagline) <= 80),
  logo_url text,
  theme text not null default 'night'
    constraint spaces_theme check (theme in ('night', 'dawn', 'smoke')),
  owner_id uuid not null unique references auth.users (id) on delete restrict,
  status text not null default 'active'
    constraint spaces_status check (status in ('active', 'suspended')),
  vip_price_cents integer
    constraint spaces_vip_price check (vip_price_cents is null or vip_price_cents >= 0),
  vip_currency text
    constraint spaces_vip_currency check (vip_currency is null or vip_currency ~ '^[A-Z]{3,5}$'),
  vip_days integer not null default 30
    constraint spaces_vip_days check (vip_days between 1 and 3660),
  broker_name text
    constraint spaces_broker_name check (broker_name is null or char_length(broker_name) <= 40),
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- How members pay and prove a broker account. Members of the space only.
create table public.space_settings (
  space_id uuid primary key references public.spaces (id) on delete cascade,
  payment_link text
    constraint space_settings_payment_link check (payment_link is null or payment_link ~* '^https://'),
  payment_instructions text
    constraint space_settings_instructions check (payment_instructions is null or char_length(payment_instructions) <= 1000),
  broker_link text
    constraint space_settings_broker_link check (broker_link is null or broker_link ~* '^https://'),
  broker_vip_days integer not null default 30
    constraint space_settings_broker_days check (broker_vip_days between 1 and 3660),
  updated_at timestamptz not null default now()
);

-- Who is in a space. VIP is a date: a member is VIP while vip_until is in the future.
create table public.memberships (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    constraint memberships_role check (role in ('mentor', 'admin', 'member')),
  status text not null default 'active'
    constraint memberships_status check (status in ('active', 'banned')),
  vip_until timestamptz,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- The approval queue: proof of a payment (card receipt, transfer, USDT) or of a broker account.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    constraint access_requests_kind check (kind in ('payment', 'broker')),
  proof_path text not null
    constraint access_requests_proof_path check (char_length(proof_path) <= 300),
  note text
    constraint access_requests_note check (note is null or char_length(note) <= 200),
  days integer not null
    constraint access_requests_days check (days between 1 and 3660),
  status text not null default 'pending'
    constraint access_requests_status check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decline_reason text
    constraint access_requests_decline_reason check (decline_reason is null or char_length(decline_reason) <= 200),
  created_at timestamptz not null default now()
);
create unique index access_requests_one_pending
  on public.access_requests (space_id, user_id, kind) where status = 'pending';
create index access_requests_queue_idx
  on public.access_requests (space_id, status, created_at);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  code text not null unique
    constraint invite_codes_format check (code ~ '^[A-Z0-9]{4,20}$'),
  days integer not null
    constraint invite_codes_days check (days between 1 and 3660),
  max_uses integer
    constraint invite_codes_max_uses check (max_uses is null or max_uses >= 1),
  used_count integer not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invite_codes_space_idx on public.invite_codes (space_id);

create table public.invite_redemptions (
  code_id uuid not null references public.invite_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);

-- A member telling Floor that a space breaks the rules.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null
    constraint reports_reason check (reason in ('scam', 'guaranteed_profits', 'asks_for_money', 'abuse', 'other')),
  details text
    constraint reports_details check (details is null or char_length(details) <= 1000),
  status text not null default 'open'
    constraint reports_status check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create unique index reports_one_open on public.reports (space_id, reporter_id) where status = 'open';
create index reports_space_idx on public.reports (space_id, created_at desc);

-- People at Floor who may read reports and suspend a space. Edited by hand in SQL.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Helpers used by policies
-- ---------------------------------------------------------------------------

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  );
$$;

create function private.is_member(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.space_id = p_space and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create function private.is_staff(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.space_id = p_space and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role in ('mentor', 'admin')
  );
$$;

create function private.is_mentor(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.space_id = p_space and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role = 'mentor'
  );
$$;

-- VIP right now. Staff always count as VIP in their own space.
create function private.is_vip(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.space_id = p_space and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role in ('mentor', 'admin') or m.vip_until > now())
  );
$$;

create function private.space_is_active(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.spaces s where s.id = p_space and s.status = 'active');
$$;

-- True when this request comes from the one login the account has claimed.
create function private.session_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_security s
    where s.user_id = (select auth.uid())
      and s.active_session_id is not null
      and s.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  );
$$;

-- The one question every content policy asks.
-- Staff always pass in their own space, on any login, so a mentor can use the phone and the
-- laptop page together. Everyone else needs the claimed login, an active space, an active
-- membership and, for VIP content, VIP that has not run out.
create function private.has_access(p_space uuid, p_vip boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff(p_space)
      or (
        private.session_ok()
        and private.space_is_active(p_space)
        and case when p_vip then private.is_vip(p_space) else private.is_member(p_space) end
      );
$$;

create function private.shares_space_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.space_id = mine.space_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = p_user
  );
$$;

-- Adds days to a member's VIP. Time left is kept: new days start when the current VIP ends.
create function private.extend_vip(p_space uuid, p_user uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if p_days is null or p_days not between 1 and 3660 then
    raise exception 'bad_days';
  end if;
  update public.memberships m
     set vip_until = greatest(coalesce(m.vip_until, now()), now()) + make_interval(days => p_days)
   where m.space_id = p_space and m.user_id = p_user and m.status = 'active'
   returning m.vip_until into v_until;
  if not found then
    raise exception 'member_not_found';
  end if;
  return v_until;
end;
$$;

-- Makes sure the caller is an active member of an active space. Joins them as Free if new.
create function private.ensure_membership(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not private.space_is_active(p_space) then
    raise exception 'space_unavailable';
  end if;
  select m.status into v_status
    from public.memberships m where m.space_id = p_space and m.user_id = v_uid;
  if not found then
    insert into public.memberships (space_id, user_id) values (p_space, v_uid);
  elsif v_status = 'banned' then
    raise exception 'banned';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- New account: profile and security row
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(v_name) not between 1 and 40 or private.is_reserved_name(v_name) then
    v_name := 'Member';
  end if;
  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.account_security (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger space_settings_touch
  before update on public.space_settings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Functions the apps call
-- ---------------------------------------------------------------------------

-- A mentor opens their space. One space per mentor, and the mentor Terms must be accepted.
create function public.create_space(p_name text, p_slug text, p_theme text, p_terms_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_space uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if btrim(coalesce(p_terms_version, '')) = '' then
    raise exception 'terms_required';
  end if;
  if private.is_reserved_slug(v_slug) then
    raise exception 'slug_reserved';
  end if;
  if exists (select 1 from public.spaces s where s.owner_id = v_uid) then
    raise exception 'already_has_space';
  end if;
  if exists (select 1 from public.spaces s where s.slug = v_slug) then
    raise exception 'slug_taken';
  end if;

  insert into public.spaces (slug, name, theme, owner_id, terms_version)
  values (v_slug, btrim(p_name), coalesce(p_theme, 'night'), v_uid, btrim(p_terms_version))
  returning id into v_space;

  insert into public.space_settings (space_id) values (v_space);
  insert into public.memberships (space_id, user_id, role) values (v_space, v_uid, 'mentor');
  return v_space;
end;
$$;

-- Join a space as a Free member. Safe to call again.
create function public.join_space(p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select s.id into v_space from public.spaces s where s.slug = lower(btrim(coalesce(p_slug, '')));
  if not found then
    raise exception 'space_unavailable';
  end if;
  perform private.ensure_membership(v_space);
  return v_space;
end;
$$;

-- Ask for VIP with proof of a payment or of a broker account. Lands in the approval queue.
-- The proof file must already be uploaded under "<space id>/<user id>/".
create function public.request_access(p_space uuid, p_kind text, p_proof_path text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_days integer;
  v_id uuid;
begin
  perform private.ensure_membership(p_space);

  if p_kind = 'payment' then
    select s.vip_days into v_days from public.spaces s where s.id = p_space;
  elsif p_kind = 'broker' then
    select t.broker_vip_days into v_days from public.space_settings t where t.space_id = p_space;
  else
    raise exception 'bad_kind';
  end if;

  if p_proof_path is null
     or position(p_space::text || '/' || v_uid::text || '/' in p_proof_path) <> 1 then
    raise exception 'bad_proof_path';
  end if;

  if exists (
    select 1 from public.access_requests r
    where r.space_id = p_space and r.user_id = v_uid and r.kind = p_kind and r.status = 'pending'
  ) then
    raise exception 'already_pending';
  end if;

  insert into public.access_requests (space_id, user_id, kind, proof_path, note, days)
  values (p_space, v_uid, p_kind, p_proof_path, nullif(btrim(coalesce(p_note, '')), ''), v_days)
  returning id into v_id;
  return v_id;
end;
$$;

-- Staff approve a request. VIP starts or is extended. Returns the new end date.
create function public.approve_request(p_request uuid, p_days integer default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.access_requests;
  v_days integer;
begin
  select * into v_req from public.access_requests r where r.id = p_request for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if not private.is_staff(v_req.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_decided';
  end if;
  v_days := coalesce(p_days, v_req.days);
  if v_days not between 1 and 3660 then
    raise exception 'bad_days';
  end if;

  update public.access_requests r
     set status = 'approved', days = v_days, decided_by = (select auth.uid()), decided_at = now()
   where r.id = p_request;

  return private.extend_vip(v_req.space_id, v_req.user_id, v_days);
end;
$$;

create function public.decline_request(p_request uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.access_requests;
begin
  select * into v_req from public.access_requests r where r.id = p_request for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if not private.is_staff(v_req.space_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_decided';
  end if;
  update public.access_requests r
     set status = 'declined', decided_by = (select auth.uid()), decided_at = now(),
         decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), '')
   where r.id = p_request;
end;
$$;

-- Staff give VIP by hand, for example after a cash payment.
create function public.grant_vip(p_space uuid, p_user uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return private.extend_vip(p_space, p_user, p_days);
end;
$$;

-- Staff end a member's VIP now.
create function public.end_vip(p_space uuid, p_user uuid)
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
     set vip_until = now()
   where m.space_id = p_space and m.user_id = p_user and m.role = 'member';
  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

-- The mentor makes a member an admin, or an admin a member again.
create function public.set_member_role(p_space uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'bad_role';
  end if;
  update public.memberships m
     set role = p_role
   where m.space_id = p_space and m.user_id = p_user and m.role <> 'mentor' and m.status = 'active';
  if not found then
    raise exception 'member_not_found';
  end if;
end;
$$;

-- Staff create an invite code. Leave p_code empty for a random one.
create function public.create_invite_code(
  p_space uuid,
  p_days integer,
  p_max_uses integer default null,
  p_expires_at timestamptz default null,
  p_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_tries integer := 0;
begin
  if not private.is_staff(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 3660 then
    raise exception 'bad_days';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'bad_max_uses';
  end if;

  if nullif(btrim(coalesce(p_code, '')), '') is not null then
    v_code := upper(btrim(p_code));
    if v_code !~ '^[A-Z0-9]{4,20}$' then
      raise exception 'bad_code';
    end if;
    if exists (select 1 from public.invite_codes c where c.code = v_code) then
      raise exception 'code_taken';
    end if;
    insert into public.invite_codes (space_id, code, days, max_uses, expires_at, created_by)
    values (p_space, v_code, p_days, p_max_uses, p_expires_at, (select auth.uid()));
    return v_code;
  end if;

  loop
    v_code := private.random_code();
    v_tries := v_tries + 1;
    if not exists (select 1 from public.invite_codes c where c.code = v_code) then
      insert into public.invite_codes (space_id, code, days, max_uses, expires_at, created_by)
      values (p_space, v_code, p_days, p_max_uses, p_expires_at, (select auth.uid()));
      return v_code;
    end if;
    if v_tries >= 10 then
      raise exception 'code_generation_failed';
    end if;
  end loop;
end;
$$;

create function public.revoke_invite_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select c.space_id into v_space from public.invite_codes c where c.id = p_code_id;
  if not found then
    raise exception 'code_not_found';
  end if;
  if not private.is_staff(v_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.invite_codes c set revoked = true where c.id = p_code_id;
end;
$$;

-- A member enters an invite code. VIP starts at once: the code is the approval.
-- Every failure gives the same answer, so codes cannot be probed.
create function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code public.invite_codes;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_code
    from public.invite_codes c
   where c.code = upper(btrim(coalesce(p_code, '')))
     for update;
  if not found
     or v_code.revoked
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses is not null and v_code.used_count >= v_code.max_uses) then
    raise exception 'invite_invalid';
  end if;

  perform private.ensure_membership(v_code.space_id);

  if exists (
    select 1 from public.invite_redemptions d where d.code_id = v_code.id and d.user_id = v_uid
  ) then
    raise exception 'invite_already_used';
  end if;

  insert into public.invite_redemptions (code_id, user_id) values (v_code.id, v_uid);
  update public.invite_codes c set used_count = c.used_count + 1 where c.id = v_code.id;
  v_until := private.extend_vip(v_code.space_id, v_uid, v_code.days);

  return jsonb_build_object('space_id', v_code.space_id, 'vip_until', v_until);
end;
$$;

-- The phone app calls this right after sign-in.
-- * The login that calls it becomes the only login that can open content. Any older login stops working.
-- * The first phone to call it is tied to the account.
-- * A different phone may take over, at most twice in 30 days. Signing in already needs the emailed
--   code, so that code is what approves the change.
-- Returns 'ok' or 'device_limit'.
create function public.claim_session(p_device_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session uuid := private.try_uuid((select auth.jwt()) ->> 'session_id');
  v_bound text;
  v_changes integer;
begin
  if v_uid is null or v_session is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_device_id is null or char_length(p_device_id) not between 16 and 128 then
    raise exception 'bad_device';
  end if;

  insert into public.account_security (user_id) values (v_uid) on conflict (user_id) do nothing;
  select s.device_id into v_bound
    from public.account_security s where s.user_id = v_uid for update;

  if v_bound is null then
    update public.account_security s
       set device_id = p_device_id, device_bound_at = now(), active_session_id = v_session
     where s.user_id = v_uid;
    insert into public.device_bindings (user_id, device_id, is_change) values (v_uid, p_device_id, false);
    return 'ok';
  end if;

  if v_bound = p_device_id then
    update public.account_security s set active_session_id = v_session where s.user_id = v_uid;
    return 'ok';
  end if;

  select count(*) into v_changes
    from public.device_bindings b
   where b.user_id = v_uid and b.is_change and b.bound_at > now() - interval '30 days';
  if v_changes >= 2 then
    return 'device_limit';
  end if;

  update public.account_security s
     set device_id = p_device_id, device_bound_at = now(), active_session_id = v_session
   where s.user_id = v_uid;
  insert into public.device_bindings (user_id, device_id, is_change) values (v_uid, p_device_id, true);
  return 'ok';
end;
$$;

-- What the phone app asks before showing content: is this the claimed login?
-- 'not_current' means another login has taken over, or this one never called claim_session.
create function public.session_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 'signed_out'
    when private.session_ok() then 'ok'
    else 'not_current'
  end;
$$;

-- A member reports a space to Floor. One open report per member per space.
create function public.report_space(p_space uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m where m.space_id = p_space and m.user_id = v_uid
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.reports r
    where r.space_id = p_space and r.reporter_id = v_uid and r.status = 'open'
  ) then
    raise exception 'already_reported';
  end if;
  insert into public.reports (space_id, reporter_id, reason, details)
  values (p_space, v_uid, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Floor suspends or restores a space.
create function public.set_space_status(p_space uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'bad_status';
  end if;
  update public.spaces s set status = p_status where s.id = p_space;
  if not found then
    raise exception 'space_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.account_security enable row level security;
alter table public.device_bindings enable row level security;
alter table public.spaces enable row level security;
alter table public.space_settings enable row level security;
alter table public.memberships enable row level security;
alter table public.access_requests enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.reports enable row level security;
alter table public.platform_admins enable row level security;

create policy "profiles: read own and people in my spaces"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_space_with(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "account_security: read own"
  on public.account_security for select to authenticated
  using (user_id = (select auth.uid()));

create policy "spaces: the public reads active spaces"
  on public.spaces for select to anon
  using (status = 'active');

create policy "spaces: signed-in people read active spaces and their own"
  on public.spaces for select to authenticated
  using (
    status = 'active'
    or owner_id = (select auth.uid())
    or private.is_staff(id)
    or private.is_platform_admin()
  );

create policy "spaces: the mentor edits their space"
  on public.spaces for update to authenticated
  using (private.is_mentor(id))
  with check (private.is_mentor(id));

create policy "space_settings: members read"
  on public.space_settings for select to authenticated
  using (private.is_member(space_id));

create policy "space_settings: the mentor edits"
  on public.space_settings for update to authenticated
  using (private.is_mentor(space_id))
  with check (private.is_mentor(space_id));

create policy "memberships: read own, staff read all in their space"
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff(space_id));

create policy "access_requests: read own, staff read their queue"
  on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff(space_id));

create policy "invite_codes: staff read"
  on public.invite_codes for select to authenticated
  using (private.is_staff(space_id));

create policy "invite_redemptions: read own, staff read their codes"
  on public.invite_redemptions for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.invite_codes c
      where c.id = invite_redemptions.code_id and private.is_staff(c.space_id)
    )
  );

create policy "reports: read own, Floor reads all"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_platform_admin());

-- device_bindings and platform_admins have no policies: only the functions above touch them.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Written for a project created with "Automatically expose new tables" switched off, and safe with it
-- on: access is taken away first, then granted table by table.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to anon, authenticated, service_role;

-- Policy helpers must be runnable by whoever the policy applies to.
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_staff(uuid) to authenticated;
grant execute on function private.is_mentor(uuid) to authenticated;
grant execute on function private.is_vip(uuid) to authenticated;
grant execute on function private.space_is_active(uuid) to authenticated;
grant execute on function private.session_ok() to authenticated;
grant execute on function private.has_access(uuid, boolean) to authenticated;
grant execute on function private.shares_space_with(uuid) to authenticated;
grant execute on function private.is_reserved_name(text) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;

grant select on public.spaces to anon;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.account_security to authenticated;
grant select on public.spaces to authenticated;
grant update (name, tagline, logo_url, theme, vip_price_cents, vip_currency, vip_days, broker_name)
  on public.spaces to authenticated;
grant select on public.space_settings to authenticated;
grant update (payment_link, payment_instructions, broker_link, broker_vip_days)
  on public.space_settings to authenticated;
grant select on public.memberships to authenticated;
grant select on public.access_requests to authenticated;
grant select on public.invite_codes to authenticated;
grant select on public.invite_redemptions to authenticated;
grant select on public.reports to authenticated;

grant execute on function public.create_space(text, text, text, text) to authenticated;
grant execute on function public.join_space(text) to authenticated;
grant execute on function public.request_access(uuid, text, text, text) to authenticated;
grant execute on function public.approve_request(uuid, integer) to authenticated;
grant execute on function public.decline_request(uuid, text) to authenticated;
grant execute on function public.grant_vip(uuid, uuid, integer) to authenticated;
grant execute on function public.end_vip(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.create_invite_code(uuid, integer, integer, timestamptz, text) to authenticated;
grant execute on function public.revoke_invite_code(uuid) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.claim_session(text) to authenticated;
grant execute on function public.session_status() to authenticated;
grant execute on function public.report_space(uuid, text, text) to authenticated;
grant execute on function public.set_space_status(uuid, text) to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;
