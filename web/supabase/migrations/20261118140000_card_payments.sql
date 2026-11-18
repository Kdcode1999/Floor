-- Card payments: a member pays the mentor through the mentor's own card processor, and VIP
-- starts by itself. Floor never touches the money. Its server starts the payment with the
-- mentor's key, asks the processor whether it went through, and only then adds the VIP days.

-- ---------------------------------------------------------------------------
-- The mentor's processor
-- ---------------------------------------------------------------------------

-- Which processor a space takes cards through. Public like the rest of this table: the join
-- page shows it. Only the functions below change it.
alter table public.spaces
  add column card_provider text
    constraint spaces_card_provider check (card_provider is null or card_provider in ('paystack', 'flutterwave')),
  -- True while the mentor's key is a test key, which takes pretend cards. The join page says so.
  add column card_test boolean not null default false;

-- The mentor's key for that processor. Floor's server encrypts it before it gets here, with a
-- key the database never sees, so a copy of the database holds nothing that can move money.
-- The table is in the private schema: no app can reach it at all.
create table private.payment_accounts (
  space_id uuid primary key references public.spaces (id) on delete cascade,
  provider text not null
    constraint payment_accounts_provider check (provider in ('paystack', 'flutterwave')),
  secret_cipher text not null
    constraint payment_accounts_secret check (char_length(secret_cipher) between 20 and 2000),
  -- Flutterwave only: the word the mentor chose for its webhooks, encrypted the same way.
  hook_cipher text
    constraint payment_accounts_hook check (hook_cipher is null or char_length(hook_cipher) between 20 and 2000),
  -- The key's last four characters, so the mentor can tell which key is connected.
  key_hint text not null
    constraint payment_accounts_hint check (char_length(key_hint) between 1 and 8),
  connected_at timestamptz not null default now(),
  -- The last time a member could not start a payment, and why, in the processor's own words.
  -- The mentor sees it: a sale lost without a word is the thing Floor exists to prevent.
  last_error text
    constraint payment_accounts_error check (last_error is null or char_length(last_error) <= 300),
  last_error_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

-- One row per try at paying by card. The price and the VIP days are fixed when the member
-- starts, so a later price change cannot alter a payment that is under way.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    constraint payments_provider check (provider in ('paystack', 'flutterwave')),
  -- Floor's own name for the payment, given to the processor. Unguessable.
  reference text not null unique
    constraint payments_reference check (reference ~ '^fl-[0-9a-f]{32}$'),
  amount_cents integer not null
    constraint payments_amount check (amount_cents > 0),
  currency text not null
    constraint payments_currency check (currency ~ '^[A-Z]{3}$'),
  days integer not null
    constraint payments_days check (days between 1 and 3660),
  status text not null default 'started'
    constraint payments_status check (status in ('started', 'paid')),
  -- The processor's own id for the payment, once it is paid.
  provider_id text
    constraint payments_provider_id check (provider_id is null or char_length(provider_id) <= 100),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  -- Where the member's VIP stood after this payment. Empty if they had been removed from the
  -- space by the time the money arrived: the mentor then owes them a refund.
  vip_until timestamptz,
  -- How often, and when last, the page a member returns to has made the server ask the
  -- processor about this payment. See payment_may_ask.
  asks integer not null default 0,
  asked_at timestamptz,
  constraint payments_paid check ((status = 'paid') = (paid_at is not null))
);
create index payments_space_idx on public.payments (space_id, paid_at desc) where status = 'paid';
create index payments_user_idx on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

create policy "payments: a member reads their own"
  on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

create policy "payments: staff read their space's"
  on public.payments for select to authenticated
  using (private.is_staff(space_id));

grant select on public.payments to authenticated;
grant all on public.payments to service_role;

-- ---------------------------------------------------------------------------
-- Connecting a processor (the mentor)
-- ---------------------------------------------------------------------------

-- Floor's server asks this, as the mentor, before it accepts a key from them. Only the mentor
-- may connect a processor: whoever holds it receives every card payment.
create function public.payments_connect_check(p_space uuid)
returns table (slug text, vip_price_cents integer, vip_currency text)
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
    select s.slug, s.vip_price_cents, s.vip_currency from public.spaces s where s.id = p_space;
end;
$$;

-- The server stores the encrypted key. A test key takes pretend cards, and the server only
-- accepts one where that has been switched on. Secret key only.
create function public.save_payment_account(
  p_space uuid,
  p_provider text,
  p_secret_cipher text,
  p_hook_cipher text,
  p_key_hint text,
  p_test_mode boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.payment_accounts (space_id, provider, secret_cipher, hook_cipher, key_hint)
  values (p_space, p_provider, p_secret_cipher, p_hook_cipher, p_key_hint)
  on conflict (space_id) do update
    set provider = excluded.provider,
        secret_cipher = excluded.secret_cipher,
        hook_cipher = excluded.hook_cipher,
        key_hint = excluded.key_hint,
        connected_at = now(),
        last_error = null,
        last_error_at = null;
  update public.spaces s
     set card_provider = p_provider, card_test = coalesce(p_test_mode, false)
   where s.id = p_space;
end;
$$;

-- What the mentor sees about their connection. Never the key.
create function public.payment_account(p_space uuid)
returns table (provider text, key_hint text, has_hook_secret boolean, connected_at timestamptz, last_error text, last_error_at timestamptz)
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
    select a.provider, a.key_hint, a.hook_cipher is not null, a.connected_at, a.last_error, a.last_error_at
      from private.payment_accounts a
     where a.space_id = p_space;
end;
$$;

-- The mentor disconnects. The encrypted key is deleted, and the join page stops offering cards.
create function public.disconnect_payments(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_mentor(p_space) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from private.payment_accounts a where a.space_id = p_space;
  update public.spaces s set card_provider = null, card_test = false where s.id = p_space;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paying (a member)
-- ---------------------------------------------------------------------------

-- A member starts a payment. Floor's server calls this as the member, then sends them to the
-- processor's page. Answers with what the processor needs to be told.
create function public.start_payment(p_space uuid)
returns table (reference text, provider text, amount_cents integer, currency text, days integer, email text, slug text, space_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_space public.spaces%rowtype;
  v_reference text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_space from public.spaces s where s.id = p_space and s.status = 'active';
  if not found then
    raise exception 'space_not_found';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.space_id = p_space and m.user_id = v_uid and m.status = 'active' and m.role = 'member'
  ) then
    -- Not a member, removed, or staff: staff have no use for VIP.
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_space.card_provider is null
     or not exists (select 1 from private.payment_accounts a where a.space_id = p_space) then
    raise exception 'cards_not_connected';
  end if;
  if coalesce(v_space.vip_price_cents, 0) <= 0 or v_space.vip_currency is null or v_space.vip_currency !~ '^[A-Z]{3}$' then
    raise exception 'no_card_price';
  end if;
  -- Each start asks the processor for a page with the mentor's key. Ten an hour is plenty for
  -- a person and too few to be a nuisance.
  if (select count(*) from public.payments p where p.user_id = v_uid and p.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_tries';
  end if;

  v_reference := 'fl-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payments (space_id, user_id, provider, reference, amount_cents, currency, days)
  values (p_space, v_uid, v_space.card_provider, v_reference, v_space.vip_price_cents, v_space.vip_currency, v_space.vip_days);

  -- If the member pays and never comes back to the page, and the mentor has set up no
  -- webhook, the server still asks the processor a little later.
  perform private.enqueue('payment_check', p_space, jsonb_build_object('reference', v_reference), now() + interval '10 minutes');

  return query
    select v_reference, v_space.card_provider, v_space.vip_price_cents, v_space.vip_currency, v_space.vip_days,
           (select u.email::text from auth.users u where u.id = v_uid), v_space.slug, v_space.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- What Floor's server asks
-- ---------------------------------------------------------------------------

-- A space's processor and its encrypted key. Secret key only.
create function public.payment_account_for_server(p_space uuid)
returns table (provider text, secret_cipher text, hook_cipher text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.provider, a.secret_cipher, a.hook_cipher
    from private.payment_accounts a
    join public.spaces s on s.id = a.space_id
   where a.space_id = p_space and s.status = 'active';
$$;

-- A payment and the key to ask its processor with. Secret key only. Nothing comes back if the
-- space has since changed processor: the key on file could not vouch for this payment.
create function public.payment_for_server(p_reference text)
returns table (
  reference text, space_id uuid, provider text, amount_cents integer, currency text, status text,
  vip_until timestamptz, created_at timestamptz, secret_cipher text, hook_cipher text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.reference, p.space_id, p.provider, p.amount_cents, p.currency, p.status,
         p.vip_until, p.created_at, a.secret_cipher, a.hook_cipher
    from public.payments p
    join private.payment_accounts a on a.space_id = p.space_id and a.provider = p.provider
   where p.reference = p_reference;
$$;

-- The page a member returns to asks the server what became of their payment, and needs no
-- login to do it. Each ask costs the mentor's processor a call, so one payment gets one every
-- three seconds and eighty in all, which is far more than the page itself ever makes. The
-- processor's webhook and the server's own later check are not counted. Secret key only.
create function public.payment_may_ask(p_reference text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments p
     set asks = p.asks + 1, asked_at = now()
   where p.reference = p_reference
     and p.status = 'started'
     and p.asks < 80
     and (p.asked_at is null or p.asked_at < now() - interval '3 seconds');
  return found;
end;
$$;

-- A member could not start a payment: the processor refused the mentor's key, or said why it
-- would not take this one. Kept for the mentor to read, and they are alerted, once a day at
-- most. Secret key only.
create function public.note_payment_problem(p_space uuid, p_problem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before timestamptz;
begin
  select a.last_error_at into v_before from private.payment_accounts a where a.space_id = p_space for update;
  if not found then
    return;
  end if;
  update private.payment_accounts a
     set last_error = left(coalesce(nullif(btrim(p_problem), ''), 'unknown'), 300), last_error_at = now()
   where a.space_id = p_space;
  if v_before is null or v_before < now() - interval '1 day' then
    perform private.enqueue('alert', p_space, jsonb_build_object('type', 'payment_problem'));
  end if;
end;
$$;

-- The processor has confirmed a payment: mark it paid and add the VIP days. Safe to call twice,
-- which happens when the member's return and the processor's webhook arrive together. The
-- server passes what the processor says was paid, and a payment of less than was asked, or in
-- another currency, is refused. Secret key only.
create function public.settle_payment(p_reference text, p_provider_id text, p_amount_cents bigint, p_currency text)
returns table (vip_until timestamptz, already boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_until timestamptz;
  v_name text;
begin
  select * into v_payment from public.payments p where p.reference = p_reference for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if v_payment.status = 'paid' then
    return query select v_payment.vip_until, true;
    return;
  end if;
  if p_amount_cents is null or p_amount_cents < v_payment.amount_cents or p_currency is distinct from v_payment.currency then
    raise exception 'payment_mismatch';
  end if;

  -- Someone removed from the space after they started paying gets no VIP. The payment is
  -- still recorded, so the mentor can see it and refund it.
  if exists (
    select 1 from public.memberships m
     where m.space_id = v_payment.space_id and m.user_id = v_payment.user_id and m.status = 'active'
  ) then
    v_until := private.extend_vip(v_payment.space_id, v_payment.user_id, v_payment.days);
  end if;

  update public.payments p
     set status = 'paid', paid_at = now(), provider_id = left(p_provider_id, 100), vip_until = v_until
   where p.id = v_payment.id;

  -- A payment went through, so whatever stopped the last one is over.
  update private.payment_accounts a
     set last_error = null, last_error_at = null
   where a.space_id = v_payment.space_id and a.last_error is not null;

  -- Tell the mentor that money came in.
  select f.display_name into v_name from public.profiles f where f.id = v_payment.user_id;
  perform private.enqueue(
    'alert',
    v_payment.space_id,
    jsonb_build_object(
      'type', 'payment', 'payment_id', v_payment.id, 'name', coalesce(v_name, 'A member'),
      'days', v_payment.days, 'vip', v_until is not null
    )
  );

  return query select v_until, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- What staff see
-- ---------------------------------------------------------------------------

-- The card payments that went through, newest first, with who paid.
create function public.list_payments(p_space uuid, p_limit integer default 50)
returns table (id uuid, user_id uuid, name text, amount_cents integer, currency text, days integer, paid_at timestamptz, vip_until timestamptz)
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
    select p.id, p.user_id, coalesce(f.display_name, 'Member'), p.amount_cents, p.currency, p.days, p.paid_at, p.vip_until
      from public.payments p
      left join public.profiles f on f.id = p.user_id
     where p.space_id = p_space and p.status = 'paid'
     order by p.paid_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- An alert about a payment, or about payments not working, goes to the mentor alone.
-- Everything else is as before.
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
     and case p_type
           when 'setup' then m.alert_setups
           when 'lesson' then m.alert_lessons
           when 'live' then m.alert_live
           else true
         end
     and (not coalesce(p_vip_only, true) or m.role in ('mentor', 'admin') or m.vip_until > now())
   order by t.token;
$$;

revoke all on function public.payments_connect_check(uuid) from public, anon, authenticated;
revoke all on function public.save_payment_account(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.payment_account(uuid) from public, anon, authenticated;
revoke all on function public.disconnect_payments(uuid) from public, anon, authenticated;
revoke all on function public.start_payment(uuid) from public, anon, authenticated;
revoke all on function public.payment_account_for_server(uuid) from public, anon, authenticated;
revoke all on function public.payment_for_server(text) from public, anon, authenticated;
revoke all on function public.settle_payment(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.payment_may_ask(text) from public, anon, authenticated;
revoke all on function public.note_payment_problem(uuid, text) from public, anon, authenticated;
revoke all on function public.list_payments(uuid, integer) from public, anon, authenticated;

grant execute on function public.payments_connect_check(uuid) to authenticated, service_role;
grant execute on function public.payment_account(uuid) to authenticated, service_role;
grant execute on function public.disconnect_payments(uuid) to authenticated, service_role;
grant execute on function public.start_payment(uuid) to authenticated, service_role;
grant execute on function public.list_payments(uuid, integer) to authenticated, service_role;
grant execute on function public.save_payment_account(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.payment_account_for_server(uuid) to service_role;
grant execute on function public.payment_for_server(text) to service_role;
grant execute on function public.settle_payment(text, text, bigint, text) to service_role;
grant execute on function public.payment_may_ask(text) to service_role;
grant execute on function public.note_payment_problem(uuid, text) to service_role;
