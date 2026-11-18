-- Card payments are taken out (see docs/DECISIONS.md, "Plan change, 18 Nov 2026"). Members pay
-- the mentor by bank transfer or USDT and send proof, or use a broker link or an invite code.
--
-- VIP that card payments gave stays: it lives on the membership, not here. What goes is the
-- record of each card payment, the mentors' encrypted processor keys, and the functions that
-- used them. The alerts about card payments are no longer sent by anything.

drop function if exists public.payments_connect_check(uuid);
drop function if exists public.save_payment_account(uuid, text, text, text, text, boolean);
drop function if exists public.payment_account(uuid);
drop function if exists public.disconnect_payments(uuid);
drop function if exists public.start_payment(uuid);
drop function if exists public.payment_account_for_server(uuid);
drop function if exists public.payment_for_server(text);
drop function if exists public.payment_may_ask(text);
drop function if exists public.note_payment_problem(uuid, text);
drop function if exists public.settle_payment(text, text, bigint, text);
drop function if exists public.list_payments(uuid, integer);

drop table if exists public.payments;
drop table if exists private.payment_accounts;

alter table public.spaces
  drop column if exists card_provider,
  drop column if exists card_test;

-- Checks on card payments that were still waiting in the queue have nothing left to check.
delete from private.outbox where kind = 'payment_check' and done_at is null;
