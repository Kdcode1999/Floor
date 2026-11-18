import { beforeAll, describe, expect, it } from "vitest";

import { as, createDb, newUser, type Db, type TestUser, type Tx } from "./harness";
import { DAY, expectAbout, join, openSpace, vipUntil } from "./helpers";

type Row = Record<string, unknown>;

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("card payments", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let stranger: TestUser;
  let space: string;
  let other: string;

  const connect = (provider = "paystack", test = false, target = space) =>
    asServer(db, (tx) =>
      tx.query("select public.save_payment_account($1, $2, $3, $4, $5, $6)", [target, provider, `v1.cipher-of-${provider}-key-0001`, null, "0001", test]),
    );
  const start = (who: TestUser, target = space) =>
    as(db, who, async (tx) => (await tx.query<Row>("select * from public.start_payment($1)", [target])).rows[0]);
  const settle = (reference: string, amount: number, currency = "NGN", providerId = "tx_1") =>
    asServer(db, async (tx) => (await tx.query<Row>("select * from public.settle_payment($1, $2, $3, $4)", [reference, providerId, amount, currency])).rows[0]);
  const payment = async (reference: string) => (await db.query<Row>("select * from public.payments where reference = $1", [reference])).rows[0];

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    bola = await newUser(db, "bola@example.com", "Bola");
    stranger = await newUser(db, "stranger@example.com", "Stranger");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, bola, "pip-room");
    await join(db, tobi, "gold-desk");
    await join(db, ada, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
    await as(db, kay, (tx) => tx.query("update public.spaces set vip_price_cents = 2500000, vip_currency = 'NGN', vip_days = 30 where id = $1", [space]));
  });

  it("can only be connected by the mentor", async () => {
    const mine = await as(db, kay, async (tx) => (await tx.query<Row>("select * from public.payments_connect_check($1)", [space])).rows[0]);
    expect(mine).toEqual({ slug: "gold-desk", vip_price_cents: 2500000, vip_currency: "NGN" });
    for (const person of [tobi, ada, bola, stranger]) {
      await expect(as(db, person, (tx) => tx.query("select * from public.payments_connect_check($1)", [space]))).rejects.toThrow(/not_allowed/);
    }
  });

  it("keep the key where no app can reach it", async () => {
    await expect(as(db, kay, (tx) => tx.query("select public.save_payment_account($1, 'paystack', 'v1.aaaaaaaaaaaaaaaaaaaaaaaa', null, '0001', false)", [space]))).rejects.toThrow(/permission denied/);
    await connect();
    expect((await db.query<Row>("select card_provider, card_test from public.spaces where id = $1", [space])).rows[0]).toEqual({ card_provider: "paystack", card_test: false });

    for (const person of [kay, tobi, ada]) {
      await expect(as(db, person, (tx) => tx.query("select * from private.payment_accounts"))).rejects.toThrow(/permission denied/);
      await expect(as(db, person, (tx) => tx.query("select * from public.payment_account_for_server($1)", [space]))).rejects.toThrow(/permission denied/);
    }
    await expect(as(db, null, (tx) => tx.query("select * from private.payment_accounts"))).rejects.toThrow(/permission denied/);
    // Nor can the mentor set the public flag by hand.
    await expect(as(db, kay, (tx) => tx.query("update public.spaces set card_provider = 'flutterwave' where id = $1", [space]))).rejects.toThrow(/permission denied/);
  });

  it("show the mentor which key is connected, and never the key", async () => {
    const seen = await as(db, kay, async (tx) => (await tx.query<Row>("select * from public.payment_account($1)", [space])).rows[0]);
    expect(Object.keys(seen).sort()).toEqual(["connected_at", "has_hook_secret", "key_hint", "last_error", "last_error_at", "provider"]);
    expect(seen).toMatchObject({ provider: "paystack", key_hint: "0001", has_hook_secret: false });
    await expect(as(db, tobi, (tx) => tx.query("select * from public.payment_account($1)", [space]))).rejects.toThrow(/not_allowed/);
  });

  it("start with the price and days of that moment", async () => {
    const started = await start(ada);
    expect(started.reference).toMatch(/^fl-[0-9a-f]{32}$/);
    expect(started).toMatchObject({ provider: "paystack", amount_cents: 2500000, currency: "NGN", days: 30, email: "ada@example.com", slug: "gold-desk", space_name: "Gold Desk" });

    // The mentor raises the price while Ada is on the processor's page.
    await as(db, kay, (tx) => tx.query("update public.spaces set vip_price_cents = 4000000, vip_days = 60 where id = $1", [space]));
    expect(await payment(started.reference as string)).toMatchObject({ status: "started", amount_cents: 2500000, days: 30, paid_at: null });
    await as(db, kay, (tx) => tx.query("update public.spaces set vip_price_cents = 2500000, vip_days = 30 where id = $1", [space]));

    const job = await db.query<Row>("select kind, payload ->> 'reference' as reference, run_after > now() + interval '9 minutes' as later from private.outbox where kind = 'payment_check'");
    expect(job.rows).toEqual([{ kind: "payment_check", reference: started.reference, later: true }]);
  });

  it("are for members of the space: not strangers, staff or the public", async () => {
    await expect(start(stranger)).rejects.toThrow(/not_allowed/);
    await expect(start(kay)).rejects.toThrow(/not_allowed/);
    await expect(start(tobi)).rejects.toThrow(/not_allowed/);
    await expect(as(db, null, (tx) => tx.query("select * from public.start_payment($1)", [space]))).rejects.toThrow(/permission denied/);
    await expect(as(db, ada, (tx) => tx.query("insert into public.payments (space_id, user_id, provider, reference, amount_cents, currency, days) values ($1, $2, 'paystack', 'fl-00000000000000000000000000000000', 1, 'NGN', 3660)", [space, ada.id]))).rejects.toThrow(/permission denied/);
  });

  it("need a processor and a price a card can be charged in", async () => {
    await join(db, ada, "pip-room");
    await expect(start(ada, other)).rejects.toThrow(/cards_not_connected/);

    for (const [price, currency] of [[null, null], [0, "NGN"], [2500, "USDT"]] as const) {
      await db.query("update public.spaces set vip_price_cents = $2, vip_currency = $3 where id = $1", [space, price, currency]);
      await expect(start(ada)).rejects.toThrow(/no_card_price/);
    }
    await db.query("update public.spaces set vip_price_cents = 2500000, vip_currency = 'NGN' where id = $1", [space]);
  });

  it("add the VIP days once the processor confirms, and only once", async () => {
    const started = await start(ada);
    const reference = started.reference as string;
    await expect(as(db, ada, (tx) => tx.query("select * from public.settle_payment($1, 'tx', 2500000, 'NGN')", [reference]))).rejects.toThrow(/permission denied/);

    const first = await settle(reference, 2500000);
    expect(first.already).toBe(false);
    expectAbout(await vipUntil(db, space, ada), Date.now() + 30 * DAY);
    expect(await payment(reference)).toMatchObject({ status: "paid", provider_id: "tx_1" });

    // The member's return and the processor's webhook both arrive.
    const second = await settle(reference, 2500000);
    expect(second.already).toBe(true);
    expect(second.vip_until).toEqual(first.vip_until);
    expectAbout(await vipUntil(db, space, ada), Date.now() + 30 * DAY);

    // Paying again while VIP adds to the end of what is left.
    const again = await start(ada);
    await settle(again.reference as string, 2500000, "NGN", "tx_2");
    expectAbout(await vipUntil(db, space, ada), Date.now() + 60 * DAY);
  });

  it("refuse a payment of less than the price, or in another currency", async () => {
    const before = await vipUntil(db, space, ada);
    const started = await start(ada);
    const reference = started.reference as string;
    await expect(settle(reference, 2499999)).rejects.toThrow(/payment_mismatch/);
    await expect(settle(reference, 2500000, "USD")).rejects.toThrow(/payment_mismatch/);
    await expect(settle("fl-ffffffffffffffffffffffffffffffff", 2500000)).rejects.toThrow(/payment_not_found/);
    expect(await payment(reference)).toMatchObject({ status: "started", paid_at: null });
    expect(await vipUntil(db, space, ada)).toEqual(before);
    // More than the price is the member's to settle with the mentor: the VIP is given.
    expect((await settle(reference, 2600000)).already).toBe(false);
  });

  it("let the page a member returns to ask the processor only so often", async () => {
    const started = await start(ada);
    const mayAsk = () => asServer(db, (tx) => tx.query<{ ok: boolean }>("select public.payment_may_ask($1) as ok", [started.reference]).then((result) => result.rows[0].ok));
    expect(await mayAsk()).toBe(true);
    // A second ask within three seconds is not passed on.
    expect(await mayAsk()).toBe(false);
    await db.query("update public.payments set asked_at = now() - interval '4 seconds' where reference = $1", [started.reference]);
    expect(await mayAsk()).toBe(true);
    // Nor is anything after eighty asks, however slowly they come.
    await db.query("update public.payments set asks = 80, asked_at = null where reference = $1", [started.reference]);
    expect(await mayAsk()).toBe(false);
    // A payment that is settled needs no asking, and one that does not exist gets none.
    await db.query("update public.payments set asks = 0 where reference = $1", [started.reference]);
    await settle(started.reference as string, 2500000, "NGN", "tx_3");
    expect(await mayAsk()).toBe(false);
    expect(await asServer(db, (tx) => tx.query<{ ok: boolean }>("select public.payment_may_ask('fl-ffffffffffffffffffffffffffffffff') as ok").then((result) => result.rows[0].ok))).toBe(false);
    await expect(as(db, ada, (tx) => tx.query("select public.payment_may_ask($1)", [started.reference]))).rejects.toThrow(/permission denied/);
  });

  it("keep for the mentor why a member could not start a payment, and alert them once a day at most", async () => {
    const note = (problem: string) => asServer(db, (tx) => tx.query("select public.note_payment_problem($1, $2)", [space, problem]));
    const alerts = async () => (await db.query<Row>("select count(*)::int as count from private.outbox where kind = 'alert' and payload ->> 'type' = 'payment_problem'")).rows[0].count;
    const seen = () => as(db, kay, async (tx) => (await tx.query<Row>("select last_error, last_error_at from public.payment_account($1)", [space])).rows[0]);

    expect(await seen()).toEqual({ last_error: null, last_error_at: null });
    await note("Currency not supported by merchant");
    expect((await seen()).last_error).toBe("Currency not supported by merchant");
    expect(await alerts()).toBe(1);
    await note("key_refused");
    expect((await seen()).last_error).toBe("key_refused");
    expect(await alerts()).toBe(1);
    await db.query("update private.payment_accounts set last_error_at = now() - interval '25 hours' where space_id = $1", [space]);
    await note("key_refused");
    expect(await alerts()).toBe(2);
    await expect(as(db, kay, (tx) => tx.query("select public.note_payment_problem($1, 'x')", [space]))).rejects.toThrow(/permission denied/);

    // The next payment that goes through shows the trouble is over.
    const started = await start(ada);
    await settle(started.reference as string, 2500000, "NGN", "tx_4");
    expect(await seen()).toEqual({ last_error: null, last_error_at: null });
  });

  it("tell the mentor, and only the mentor, that money came in", async () => {
    for (const [person, token] of [[kay, "kay"], [tobi, "tobi"], [ada, "ada"]] as const) {
      await as(db, person, (tx) => tx.query("select public.save_push_token($1, 'android')", [`ExponentPushToken[${token}]`]));
    }
    const job = await db.query<Row>("select payload from private.outbox where kind = 'alert' order by id desc limit 1");
    expect(job.rows[0].payload).toMatchObject({ type: "payment", name: "Ada O.", days: 30 });
    expect((job.rows[0].payload as Row).actor).toBeUndefined();

    for (const type of ["payment", "payment_problem"]) {
      const told = await asServer(db, async (tx) => (await tx.query<{ token: string }>("select * from public.alert_recipients($1, $2, true, null)", [space, type])).rows.map((row) => row.token));
      expect(told).toEqual(["ExponentPushToken[kay]"]);
    }
    const setup = await asServer(db, async (tx) => (await tx.query<{ token: string }>("select * from public.alert_recipients($1, 'setup', true, null)", [space])).rows.map((row) => row.token));
    expect(setup).toEqual(["ExponentPushToken[ada]", "ExponentPushToken[kay]", "ExponentPushToken[tobi]"]);
  });

  it("show staff who paid, and each member only their own payments", async () => {
    const list = await as(db, tobi, async (tx) => (await tx.query<Row>("select * from public.list_payments($1)", [space])).rows);
    expect(list).toHaveLength(5);
    expect(list[0]).toMatchObject({ name: "Ada O.", amount_cents: 2500000, currency: "NGN", days: 30, user_id: ada.id });
    await expect(as(db, ada, (tx) => tx.query("select * from public.list_payments($1)", [space]))).rejects.toThrow(/not_allowed/);
    await expect(as(db, bola, (tx) => tx.query("select * from public.list_payments($1)", [space]))).rejects.toThrow(/not_allowed/);

    const count = (who: TestUser | null) => as(db, who, async (tx) => (await tx.query<Row>("select reference from public.payments")).rows.length);
    expect(await count(ada)).toBe(6);
    expect(await count(kay)).toBe(6);
    expect(await count(bola)).toBe(0);
    expect(await count(stranger)).toBe(0);
    await expect(count(null)).rejects.toThrow(/permission denied/);
  });

  it("record a payment from someone removed in the meantime, without giving VIP", async () => {
    const cee = await newUser(db, "cee@example.com", "Cee");
    await join(db, cee, "gold-desk");
    const started = await start(cee);
    await as(db, kay, (tx) => tx.query("select public.ban_member($1, $2)", [space, cee.id]));
    const settled = await settle(started.reference as string, 2500000, "NGN", "tx_9");
    expect(settled).toEqual({ vip_until: null, already: false });
    expect(await payment(started.reference as string)).toMatchObject({ status: "paid", vip_until: null });
    expect(await vipUntil(db, space, cee)).toBeNull();
    await expect(start(cee)).rejects.toThrow(/not_allowed/);
  });

  it("stop a person who keeps starting payments", async () => {
    const dan = await newUser(db, "dan@example.com", "Dan");
    await join(db, dan, "gold-desk");
    for (let count = 0; count < 10; count += 1) await start(dan);
    await expect(start(dan)).rejects.toThrow(/too_many_tries/);
  });

  it("say when the key is a test key", async () => {
    await connect("flutterwave", true);
    expect((await db.query<Row>("select card_provider, card_test from public.spaces where id = $1", [space])).rows[0]).toEqual({ card_provider: "flutterwave", card_test: true });
    const seen = await as(db, null, async (tx) => (await tx.query<Row>("select card_provider, card_test from public.spaces where slug = 'gold-desk'")).rows[0]);
    expect(seen).toEqual({ card_provider: "flutterwave", card_test: true });
  });

  it("cannot vouch for an older payment once the processor has changed", async () => {
    // The space now uses Flutterwave. A Paystack payment started before can no longer be checked.
    const old = (await db.query<Row>("select reference from public.payments where provider = 'paystack' and status = 'started' limit 1")).rows[0];
    const found = await asServer(db, async (tx) => (await tx.query<Row>("select * from public.payment_for_server($1)", [old.reference])).rows);
    expect(found).toEqual([]);

    const fresh = await start(ada);
    const mine = await asServer(db, async (tx) => (await tx.query<Row>("select * from public.payment_for_server($1)", [fresh.reference])).rows[0]);
    expect(mine).toMatchObject({ provider: "flutterwave", amount_cents: 2500000, currency: "NGN", status: "started", secret_cipher: "v1.cipher-of-flutterwave-key-0001" });
  });

  it("can be disconnected by the mentor, which deletes the key", async () => {
    await expect(as(db, tobi, (tx) => tx.query("select public.disconnect_payments($1)", [space]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.disconnect_payments($1)", [space]));
    expect((await db.query<Row>("select count(*)::int as count from private.payment_accounts where space_id = $1", [space])).rows[0].count).toBe(0);
    expect((await db.query<Row>("select card_provider, card_test from public.spaces where id = $1", [space])).rows[0]).toEqual({ card_provider: null, card_test: false });
    await expect(start(ada)).rejects.toThrow(/cards_not_connected/);
    expect(await as(db, kay, async (tx) => (await tx.query<Row>("select * from public.payment_account($1)", [space])).rows)).toEqual([]);
  });
});
