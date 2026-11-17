import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { as, call, createDb, deviceId, newUser, type Db, type TestUser } from "./harness";

const DAY = 24 * 60 * 60 * 1000;
const TERMS = "2026-11";

function openSpace(db: Db, mentor: TestUser, slug: string, name = "Gold Desk") {
  return as(db, mentor, (tx) =>
    call<string>(tx, "select public.create_space($1, $2, $3, $4)", [name, slug, "night", TERMS]),
  );
}

function join(db: Db, user: TestUser, slug: string) {
  return as(db, user, (tx) => call<string>(tx, "select public.join_space($1)", [slug]));
}

function claim(db: Db, user: TestUser, device: string) {
  return as(db, user, (tx) => call<string>(tx, "select public.claim_session($1)", [device]));
}

function hasAccess(db: Db, user: TestUser, space: string, vip = false) {
  return as(db, user, (tx) => call<boolean>(tx, "select private.has_access($1, $2)", [space, vip]));
}

function requestAccess(db: Db, user: TestUser, space: string, kind = "payment", file = "receipt.jpg") {
  return as(db, user, (tx) =>
    call<string>(tx, "select public.request_access($1, $2, $3, $4)", [
      space,
      kind,
      `${space}/${user.id}/${file}`,
      "Paid by transfer",
    ]),
  );
}

async function vipUntil(db: Db, space: string, user: TestUser): Promise<Date | null> {
  const result = await db.query<{ vip_until: Date | null }>(
    "select vip_until from public.memberships where space_id = $1 and user_id = $2",
    [space, user.id],
  );
  return result.rows[0]?.vip_until ?? null;
}

function expectAbout(actual: Date | null, expectedMs: number) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as Date).getTime() - expectedMs)).toBeLessThan(60_000);
}

describe("accounts", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createDb();
  });

  it("gives every new account a profile and a security row", async () => {
    const ada = await newUser(db, "ada@example.com", "Ada O.");
    const profile = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [ada.id],
    );
    expect(profile.rows[0].display_name).toBe("Ada O.");
    const security = await db.query("select 1 from public.account_security where user_id = $1", [ada.id]);
    expect(security.rows).toHaveLength(1);
  });

  it("does not let a new account take a staff-sounding name", async () => {
    const fake = await newUser(db, "fake@example.com", "  Admin ");
    const profile = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [fake.id],
    );
    expect(profile.rows[0].display_name).toBe("Member");
  });

  it("lets a member rename themselves, but not to a staff-sounding name", async () => {
    const kofi = await newUser(db, "kofi@example.com", "Kofi");
    await as(db, kofi, (tx) =>
      tx.query("update public.profiles set display_name = 'Kofi A.' where id = $1", [kofi.id]),
    );
    await expect(
      as(db, kofi, (tx) => tx.query("update public.profiles set display_name = 'Mentor' where id = $1", [kofi.id])),
    ).rejects.toThrow(/profiles_display_name_reserved/);
  });

  it("does not let one account edit or see a stranger's profile", async () => {
    const tunde = await newUser(db, "tunde@example.com", "Tunde");
    const stranger = await newUser(db, "stranger@example.com", "Stranger");
    const update = await as(db, stranger, (tx) =>
      tx.query("update public.profiles set display_name = 'Hacked' where id = $1", [tunde.id]),
    );
    expect(update.affectedRows).toBe(0);
    const seen = await as(db, stranger, (tx) => tx.query("select id from public.profiles where id = $1", [tunde.id]));
    expect(seen.rows).toHaveLength(0);
  });
});

describe("spaces", () => {
  let db: Db;
  let mentor: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    space = await openSpace(db, mentor, "gold-desk");
  });

  it("opens a space with its settings and makes the creator the mentor", async () => {
    const rows = await db.query<{ role: string }>(
      "select role from public.memberships where space_id = $1 and user_id = $2",
      [space, mentor.id],
    );
    expect(rows.rows[0].role).toBe("mentor");
    const settings = await db.query("select 1 from public.space_settings where space_id = $1", [space]);
    expect(settings.rows).toHaveLength(1);
  });

  it("allows one space per mentor", async () => {
    await expect(openSpace(db, mentor, "second-desk")).rejects.toThrow(/already_has_space/);
  });

  it("refuses a taken link, a reserved link, a badly formed link and missing Terms", async () => {
    const other = await newUser(db, "other-mentor@example.com", "Bola");
    await expect(openSpace(db, other, "gold-desk")).rejects.toThrow(/slug_taken/);
    await expect(openSpace(db, other, "admin")).rejects.toThrow(/slug_reserved/);
    await expect(openSpace(db, other, "Gold Desk!")).rejects.toThrow(/spaces_slug_format/);
    await expect(
      as(db, other, (tx) => call(tx, "select public.create_space($1, $2, $3, $4)", ["Desk", "bola-desk", "dawn", " "])),
    ).rejects.toThrow(/terms_required/);
  });

  it("shows the public the join page details, and nothing about payment", async () => {
    const seen = await as(db, null, (tx) =>
      tx.query<{ name: string; theme: string }>("select name, theme from public.spaces where slug = 'gold-desk'"),
    );
    expect(seen.rows[0]).toEqual({ name: "Gold Desk", theme: "night" });
    await expect(as(db, null, (tx) => tx.query("select * from public.space_settings"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lets the mentor change the look and price, but not the link, owner or status", async () => {
    const update = await as(db, mentor, (tx) =>
      tx.query(
        "update public.spaces set name = 'Gold Desk Pro', theme = 'smoke', vip_price_cents = 3000, vip_currency = 'USD' where id = $1",
        [space],
      ),
    );
    expect(update.affectedRows).toBe(1);
    for (const column of ["slug = 'stolen'", "status = 'suspended'", `owner_id = '${randomUUID()}'`]) {
      await expect(
        as(db, mentor, (tx) => tx.query(`update public.spaces set ${column} where id = $1`, [space])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("does not let a member edit the space or its payment settings", async () => {
    const member = await newUser(db, "member@example.com", "Ada");
    await join(db, member, "gold-desk");
    const spaceUpdate = await as(db, member, (tx) =>
      tx.query("update public.spaces set name = 'Mine now' where id = $1", [space]),
    );
    expect(spaceUpdate.affectedRows).toBe(0);
    const settingsUpdate = await as(db, member, (tx) =>
      tx.query("update public.space_settings set payment_link = 'https://evil.example' where space_id = $1", [space]),
    );
    expect(settingsUpdate.affectedRows).toBe(0);
  });

  it("lets members read how to pay, and strangers not", async () => {
    await as(db, mentor, (tx) =>
      tx.query("update public.space_settings set payment_instructions = 'USDT TRC20: T...' where space_id = $1", [
        space,
      ]),
    );
    const member = await newUser(db, "payer@example.com", "Payer");
    await join(db, member, "gold-desk");
    const asMember = await as(db, member, (tx) => tx.query("select payment_instructions from public.space_settings"));
    expect(asMember.rows).toHaveLength(1);
    const stranger = await newUser(db, "stranger2@example.com", "Stranger");
    const asStranger = await as(db, stranger, (tx) => tx.query("select * from public.space_settings"));
    expect(asStranger.rows).toHaveLength(0);
  });
});

describe("joining and VIP", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let tunde: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    tunde = await newUser(db, "tunde@example.com", "Tunde");
    space = await openSpace(db, mentor, "gold-desk");
  });

  it("joins as Free, and joining twice changes nothing", async () => {
    expect(await join(db, ada, "gold-desk")).toBe(space);
    expect(await join(db, ada, " Gold-Desk ")).toBe(space);
    const rows = await db.query<{ role: string; vip_until: Date | null }>(
      "select role, vip_until from public.memberships where space_id = $1 and user_id = $2",
      [space, ada.id],
    );
    expect(rows.rows).toEqual([{ role: "member", vip_until: null }]);
  });

  it("lets a member see only their own membership, and staff see everyone", async () => {
    await join(db, tunde, "gold-desk");
    const asAda = await as(db, ada, (tx) => tx.query("select user_id from public.memberships"));
    expect(asAda.rows).toEqual([{ user_id: ada.id }]);
    const asMentor = await as(db, mentor, (tx) => tx.query("select user_id from public.memberships"));
    expect(asMentor.rows).toHaveLength(3);
  });

  it("does not let a member give themselves VIP or a role", async () => {
    await expect(
      as(db, ada, (tx) => tx.query("update public.memberships set vip_until = now() + interval '10 years'")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, ada, (tx) =>
        tx.query("insert into public.memberships (space_id, user_id, role) values ($1, $2, 'admin')", [space, ada.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, ada, (tx) => call(tx, "select public.grant_vip($1, $2, 30)", [space, ada.id]))).rejects.toThrow(
      /not_allowed/,
    );
  });

  it("keeps time left when VIP is extended, and ends VIP by the date alone", async () => {
    const first = await as(db, mentor, (tx) => call<Date>(tx, "select public.grant_vip($1, $2, 30)", [space, ada.id]));
    expectAbout(first, Date.now() + 30 * DAY);
    const second = await as(db, mentor, (tx) => call<Date>(tx, "select public.grant_vip($1, $2, 30)", [space, ada.id]));
    expectAbout(second, Date.now() + 60 * DAY);

    await claim(db, ada, deviceId());
    expect(await hasAccess(db, ada, space, true)).toBe(true);

    // The date passes. Nothing else runs: no job, no update.
    await db.query(
      "update public.memberships set vip_until = now() - interval '1 minute' where space_id = $1 and user_id = $2",
      [space, ada.id],
    );
    expect(await hasAccess(db, ada, space, true)).toBe(false);
    expect(await hasAccess(db, ada, space, false)).toBe(true);

    // Renewing after it ran out starts from today, not from the old date.
    const renewed = await as(db, mentor, (tx) => call<Date>(tx, "select public.grant_vip($1, $2, 30)", [space, ada.id]));
    expectAbout(renewed, Date.now() + 30 * DAY);
  });

  it("lets staff end a member's VIP at once", async () => {
    await as(db, mentor, (tx) => call(tx, "select public.end_vip($1, $2)", [space, ada.id]));
    expect(await hasAccess(db, ada, space, true)).toBe(false);
  });
});

describe("the approval queue", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let tunde: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    tunde = await newUser(db, "tunde@example.com", "Tunde");
    space = await openSpace(db, mentor, "gold-desk");
    await as(db, mentor, (tx) =>
      tx.query("update public.space_settings set broker_vip_days = 90 where space_id = $1", [space]),
    );
  });

  it("takes a payment proof, joining the member if they are new", async () => {
    const id = await requestAccess(db, ada, space);
    const row = await db.query<{ status: string; days: number; kind: string }>(
      "select status, days, kind from public.access_requests where id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({ status: "pending", days: 30, kind: "payment" });
    const member = await db.query("select 1 from public.memberships where space_id = $1 and user_id = $2", [
      space,
      ada.id,
    ]);
    expect(member.rows).toHaveLength(1);
  });

  it("refuses a second pending request of the same kind and a proof from someone else's folder", async () => {
    await expect(requestAccess(db, ada, space)).rejects.toThrow(/already_pending/);
    await expect(
      as(db, tunde, (tx) =>
        call(tx, "select public.request_access($1, $2, $3)", [space, "payment", `${space}/${ada.id}/receipt.jpg`]),
      ),
    ).rejects.toThrow(/bad_proof_path/);
    await expect(
      as(db, tunde, (tx) =>
        call(tx, "select public.request_access($1, $2, $3)", [space, "gift", `${space}/${tunde.id}/x.jpg`]),
      ),
    ).rejects.toThrow(/bad_kind/);
  });

  it("shows a request to its owner and to staff only", async () => {
    await join(db, tunde, "gold-desk");
    const asTunde = await as(db, tunde, (tx) => tx.query("select id from public.access_requests"));
    expect(asTunde.rows).toHaveLength(0);
    const asAda = await as(db, ada, (tx) => tx.query("select id from public.access_requests"));
    expect(asAda.rows).toHaveLength(1);
    const asMentor = await as(db, mentor, (tx) => tx.query("select id from public.access_requests"));
    expect(asMentor.rows).toHaveLength(1);
  });

  it("lets only staff approve, once, and starts VIP for the days on the request", async () => {
    const pending = await db.query<{ id: string }>("select id from public.access_requests where user_id = $1", [ada.id]);
    const id = pending.rows[0].id;
    await expect(as(db, tunde, (tx) => call(tx, "select public.approve_request($1)", [id]))).rejects.toThrow(
      /not_allowed/,
    );
    await expect(as(db, ada, (tx) => call(tx, "select public.approve_request($1)", [id]))).rejects.toThrow(
      /not_allowed/,
    );
    const until = await as(db, mentor, (tx) => call<Date>(tx, "select public.approve_request($1)", [id]));
    expectAbout(until, Date.now() + 30 * DAY);
    expectAbout(await vipUntil(db, space, ada), Date.now() + 30 * DAY);
    await expect(as(db, mentor, (tx) => call(tx, "select public.approve_request($1)", [id]))).rejects.toThrow(
      /already_decided/,
    );
  });

  it("gives a broker proof the broker days, and lets staff set other days when approving", async () => {
    const brokerId = await requestAccess(db, tunde, space, "broker", "account.png");
    const row = await db.query<{ days: number }>("select days from public.access_requests where id = $1", [brokerId]);
    expect(row.rows[0].days).toBe(90);
    const until = await as(db, mentor, (tx) => call<Date>(tx, "select public.approve_request($1, 7)", [brokerId]));
    expectAbout(until, Date.now() + 7 * DAY);
  });

  it("declines with a reason, gives no VIP, and lets the member try again", async () => {
    const bola = await newUser(db, "bola@example.com", "Bola");
    const id = await requestAccess(db, bola, space);
    await as(db, mentor, (tx) => call(tx, "select public.decline_request($1, $2)", [id, "Receipt is unreadable"]));
    const row = await as(db, bola, (tx) =>
      tx.query<{ status: string; decline_reason: string }>(
        "select status, decline_reason from public.access_requests where id = $1",
        [id],
      ),
    );
    expect(row.rows[0]).toEqual({ status: "declined", decline_reason: "Receipt is unreadable" });
    expect(await vipUntil(db, space, bola)).toBeNull();
    await expect(requestAccess(db, bola, space, "payment", "receipt-2.jpg")).resolves.toBeTruthy();
  });
});

describe("invite codes", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    space = await openSpace(db, mentor, "gold-desk");
  });

  function createCode(user: TestUser, days: number, maxUses: number | null = null, expires: string | null = null, code: string | null = null) {
    return as(db, user, (tx) =>
      call<string>(tx, "select public.create_invite_code($1, $2, $3, $4::timestamptz, $5)", [
        space,
        days,
        maxUses,
        expires,
        code,
      ]),
    );
  }

  function redeem(user: TestUser, code: string) {
    return as(db, user, (tx) => call<{ space_id: string; vip_until: string }>(tx, "select public.redeem_invite($1)", [code]));
  }

  it("lets staff create codes that are easy to read, and nobody else", async () => {
    const code = await createCode(mentor, 14);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    await expect(createCode(ada, 14)).rejects.toThrow(/not_allowed/);
    const asAda = await as(db, ada, (tx) => tx.query("select code from public.invite_codes"));
    expect(asAda.rows).toHaveLength(0);
  });

  it("gives VIP at once, joins the member, and works once per member", async () => {
    const code = await createCode(mentor, 14);
    const result = await redeem(ada, code.toLowerCase());
    expect(result.space_id).toBe(space);
    expectAbout(await vipUntil(db, space, ada), Date.now() + 14 * DAY);
    await expect(redeem(ada, code)).rejects.toThrow(/invite_already_used/);
  });

  it("accepts a code the mentor chose, and refuses a duplicate", async () => {
    expect(await createCode(mentor, 7, null, null, "gold2026")).toBe("GOLD2026");
    await expect(createCode(mentor, 7, null, null, "GOLD2026")).rejects.toThrow(/code_taken/);
    await expect(createCode(mentor, 7, null, null, "no spaces")).rejects.toThrow(/bad_code/);
  });

  it("gives the same answer for a used-up, expired, revoked or unknown code", async () => {
    const tunde = await newUser(db, "tunde@example.com", "Tunde");
    const bola = await newUser(db, "bola@example.com", "Bola");

    const single = await createCode(mentor, 7, 1);
    await redeem(tunde, single);
    await expect(redeem(bola, single)).rejects.toThrow(/invite_invalid/);

    const expired = await createCode(mentor, 7, null, new Date(Date.now() - DAY).toISOString());
    await expect(redeem(bola, expired)).rejects.toThrow(/invite_invalid/);

    const revoked = await createCode(mentor, 7);
    const row = await db.query<{ id: string }>("select id from public.invite_codes where code = $1", [revoked]);
    await as(db, mentor, (tx) => call(tx, "select public.revoke_invite_code($1)", [row.rows[0].id]));
    await expect(redeem(bola, revoked)).rejects.toThrow(/invite_invalid/);

    await expect(redeem(bola, "NOSUCHCODE")).rejects.toThrow(/invite_invalid/);
    expect(await vipUntil(db, space, bola)).toBeNull();
  });
});

describe("one login at a time, one phone per account", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let space: string;
  const phoneA = deviceId();
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    space = await openSpace(db, mentor, "gold-desk");
    await join(db, ada, "gold-desk");
  });

  it("opens nothing until the login is claimed from the phone", async () => {
    expect(await hasAccess(db, ada, space)).toBe(false);
    expect(await as(db, ada, (tx) => call(tx, "select public.session_status()"))).toBe("not_current");
    expect(await claim(db, ada, phoneA)).toBe("ok");
    expect(await hasAccess(db, ada, space)).toBe(true);
    expect(await as(db, ada, (tx) => call(tx, "select public.session_status()"))).toBe("ok");
  });

  it("ends the old login when the account signs in again", async () => {
    const oldLogin: TestUser = { ...ada };
    const newLogin: TestUser = { ...ada, session: randomUUID() };
    expect(await claim(db, newLogin, phoneA)).toBe("ok");
    expect(await hasAccess(db, newLogin, space)).toBe(true);
    expect(await hasAccess(db, oldLogin, space)).toBe(false);
    expect(await as(db, oldLogin, (tx) => call(tx, "select public.session_status()"))).toBe("not_current");
    ada.session = newLogin.session;
  });

  it("lets the account move to a new phone twice in 30 days, then stops", async () => {
    const loginB: TestUser = { ...ada, session: randomUUID() };
    expect(await claim(db, loginB, deviceId())).toBe("ok");
    expect(await hasAccess(db, ada, space)).toBe(false);

    const loginC: TestUser = { ...ada, session: randomUUID() };
    expect(await claim(db, loginC, deviceId())).toBe("ok");

    const loginD: TestUser = { ...ada, session: randomUUID() };
    expect(await claim(db, loginD, deviceId())).toBe("device_limit");
    expect(await hasAccess(db, loginD, space)).toBe(false);
    expect(await hasAccess(db, loginC, space)).toBe(true);

    // After 30 days the count is clear again.
    await db.query("update public.device_bindings set bound_at = bound_at - interval '31 days' where user_id = $1", [
      ada.id,
    ]);
    expect(await claim(db, loginD, deviceId())).toBe("ok");
    expect(await hasAccess(db, loginC, space)).toBe(false);
  });

  it("refuses a missing or too-short phone id", async () => {
    await expect(claim(db, ada, "short")).rejects.toThrow(/bad_device/);
  });

  it("lets staff work from the phone and the laptop together", async () => {
    const phone: TestUser = { ...mentor };
    const laptop: TestUser = { ...mentor, session: randomUUID() };
    await claim(db, phone, deviceId());
    expect(await hasAccess(db, phone, space, true)).toBe(true);
    expect(await hasAccess(db, laptop, space, true)).toBe(true);
  });

  it("keeps the phone and login details private to the account", async () => {
    const asMentor = await as(db, mentor, (tx) =>
      tx.query("select user_id from public.account_security where user_id = $1", [ada.id]),
    );
    expect(asMentor.rows).toHaveLength(0);
    await expect(as(db, ada, (tx) => tx.query("select * from public.device_bindings"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("admins", () => {
  let db: Db;
  let mentor: TestUser;
  let admin: TestUser;
  let ada: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    admin = await newUser(db, "admin@example.com", "Sam");
    ada = await newUser(db, "ada@example.com", "Ada");
    space = await openSpace(db, mentor, "gold-desk");
    await join(db, admin, "gold-desk");
    await join(db, ada, "gold-desk");
  });

  it("lets only the mentor make an admin", async () => {
    await expect(
      as(db, ada, (tx) => call(tx, "select public.set_member_role($1, $2, 'admin')", [space, ada.id])),
    ).rejects.toThrow(/not_allowed/);
    await as(db, mentor, (tx) => call(tx, "select public.set_member_role($1, $2, 'admin')", [space, admin.id]));
    await expect(
      as(db, admin, (tx) => call(tx, "select public.set_member_role($1, $2, 'admin')", [space, ada.id])),
    ).rejects.toThrow(/not_allowed/);
  });

  it("lets an admin work the queue and make codes", async () => {
    const id = await requestAccess(db, ada, space);
    const until = await as(db, admin, (tx) => call<Date>(tx, "select public.approve_request($1)", [id]));
    expectAbout(until, Date.now() + 30 * DAY);
    const code = await as(db, admin, (tx) => call<string>(tx, "select public.create_invite_code($1, 7)", [space]));
    expect(code).toHaveLength(8);
  });

  it("never changes the mentor's own role, and refuses unknown roles", async () => {
    await expect(
      as(db, mentor, (tx) => call(tx, "select public.set_member_role($1, $2, 'member')", [space, mentor.id])),
    ).rejects.toThrow(/member_not_found/);
    await expect(
      as(db, mentor, (tx) => call(tx, "select public.set_member_role($1, $2, 'mentor')", [space, admin.id])),
    ).rejects.toThrow(/bad_role/);
  });

  it("takes admin rights away again", async () => {
    await as(db, mentor, (tx) => call(tx, "select public.set_member_role($1, $2, 'member')", [space, admin.id]));
    await expect(
      as(db, admin, (tx) => call(tx, "select public.create_invite_code($1, 7)", [space])),
    ).rejects.toThrow(/not_allowed/);
  });
});

describe("reports and suspension", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let floorAdmin: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    floorAdmin = await newUser(db, "ops@floor.example", "Ops");
    await db.query("insert into public.platform_admins (user_id) values ($1)", [floorAdmin.id]);
    space = await openSpace(db, mentor, "gold-desk");
    await join(db, ada, "gold-desk");
    await claim(db, ada, deviceId());
  });

  it("takes one open report per member, from members only", async () => {
    const outsider = await newUser(db, "outsider@example.com", "Outsider");
    await expect(
      as(db, outsider, (tx) => call(tx, "select public.report_space($1, 'scam')", [space])),
    ).rejects.toThrow(/not_allowed/);
    const id = await as(db, ada, (tx) =>
      call<string>(tx, "select public.report_space($1, 'guaranteed_profits', $2)", [space, "Promised 10% a week"]),
    );
    expect(id).toBeTruthy();
    await expect(as(db, ada, (tx) => call(tx, "select public.report_space($1, 'scam')", [space]))).rejects.toThrow(
      /already_reported/,
    );
  });

  it("shows reports to the reporter and to Floor, never to the mentor", async () => {
    expect((await as(db, ada, (tx) => tx.query("select id from public.reports"))).rows).toHaveLength(1);
    expect((await as(db, mentor, (tx) => tx.query("select id from public.reports"))).rows).toHaveLength(0);
    expect((await as(db, floorAdmin, (tx) => tx.query("select id from public.reports"))).rows).toHaveLength(1);
  });

  it("lets only Floor suspend a space, and shuts members and the public out when it does", async () => {
    await expect(
      as(db, mentor, (tx) => call(tx, "select public.set_space_status($1, 'suspended')", [space])),
    ).rejects.toThrow(/not_allowed/);
    expect(await hasAccess(db, ada, space)).toBe(true);

    await as(db, floorAdmin, (tx) => call(tx, "select public.set_space_status($1, 'suspended')", [space]));

    expect(await hasAccess(db, ada, space)).toBe(false);
    expect(await hasAccess(db, mentor, space)).toBe(true);
    const publicView = await as(db, null, (tx) => tx.query("select id from public.spaces where slug = 'gold-desk'"));
    expect(publicView.rows).toHaveLength(0);
    const newcomer = await newUser(db, "newcomer@example.com", "Newcomer");
    await expect(join(db, newcomer, "gold-desk")).rejects.toThrow(/space_unavailable/);
    await expect(requestAccess(db, ada, space)).rejects.toThrow(/space_unavailable/);

    await as(db, floorAdmin, (tx) => call(tx, "select public.set_space_status($1, 'active')", [space]));
    expect(await hasAccess(db, ada, space)).toBe(true);
  });
});

describe("proof files", () => {
  let db: Db;
  let mentor: TestUser;
  let ada: TestUser;
  let tunde: TestUser;
  let space: string;
  beforeAll(async () => {
    db = await createDb();
    mentor = await newUser(db, "mentor@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada");
    tunde = await newUser(db, "tunde@example.com", "Tunde");
    space = await openSpace(db, mentor, "gold-desk");
    await join(db, ada, "gold-desk");
    await join(db, tunde, "gold-desk");
  });

  function upload(user: TestUser, path: string) {
    return as(db, user, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name, owner) values ('proofs', $1, $2)", [path, user.id]),
    );
  }

  it("lets a member upload only into their own folder of a space they belong to", async () => {
    await expect(upload(ada, `${space}/${ada.id}/receipt.jpg`)).resolves.toBeTruthy();
    await expect(upload(tunde, `${space}/${ada.id}/fake.jpg`)).rejects.toThrow(/row-level security/);
    const outsider = await newUser(db, "outsider@example.com", "Outsider");
    await expect(upload(outsider, `${space}/${outsider.id}/x.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(ada, `not-a-space/${ada.id}/x.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("shows a proof to its owner and the space's staff, and to nobody else", async () => {
    const read = (user: TestUser) => as(db, user, (tx) => tx.query("select name from storage.objects"));
    expect((await read(ada)).rows).toHaveLength(1);
    expect((await read(mentor)).rows).toHaveLength(1);
    expect((await read(tunde)).rows).toHaveLength(0);
  });
});
