import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, newUser, type Db, type TestUser } from "./harness";
import { DAY, expectAbout, join, openSpace, requestAccess, vipUntil } from "./helpers";

describe("the join page", () => {
  let db: Db;
  let kay: TestUser;
  let bola: TestUser;
  let ada: TestUser;
  let goldDesk: string;
  let pipRoom: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    bola = await newUser(db, "bola@example.com", "Bola");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    goldDesk = await openSpace(db, kay, "gold-desk", "Gold Desk");
    pipRoom = await openSpace(db, bola, "pip-room", "Pip Room");
  });

  const createCode = (mentor: TestUser, space: string, days: number) =>
    as(db, mentor, (tx) => call<string>(tx, "select public.create_invite_code($1, $2)", [space, days]));

  const redeem = (user: TestUser, code: string, space: string | null) =>
    as(db, user, (tx) =>
      call<{ space_id: string; vip_until: string }>(tx, "select public.redeem_invite($1, $2)", [code, space]),
    );

  it("shows the public a space's name, look and price, and nothing about how to pay", async () => {
    const seen = await as(db, null, (tx) =>
      tx.query<{ name: string; theme: string }>("select name, theme, vip_price_cents from public.spaces where slug = 'gold-desk'"),
    );
    expect(seen.rows).toEqual([{ name: "Gold Desk", theme: "night", vip_price_cents: null }]);
    await expect(as(db, null, (tx) => tx.query("select * from public.space_settings"))).rejects.toThrow(/permission denied/);
  });

  it("shows how to pay only once someone has joined", async () => {
    await db.query("update public.space_settings set payment_instructions = 'Bank: 0123456789' where space_id = $1", [goldDesk]);
    const read = () =>
      as(db, ada, (tx) => tx.query<{ payment_instructions: string }>("select payment_instructions from public.space_settings"));
    expect((await read()).rows).toHaveLength(0);
    await join(db, ada, "gold-desk");
    expect((await read()).rows).toEqual([{ payment_instructions: "Bank: 0123456789" }]);
  });

  it("accepts a space's own code typed on its join page", async () => {
    const code = await createCode(kay, goldDesk, 7);
    const result = await redeem(ada, code, goldDesk);
    expect(result.space_id).toBe(goldDesk);
    expectAbout(await vipUntil(db, goldDesk, ada), Date.now() + 7 * DAY);
  });

  it("refuses another space's code, joins nobody, and gives nothing away", async () => {
    const code = await createCode(bola, pipRoom, 30);
    await expect(redeem(ada, code, goldDesk)).rejects.toThrow(/invite_invalid/);
    await expect(redeem(ada, "NOSUCHCODE", goldDesk)).rejects.toThrow(/invite_invalid/);
    const joined = await db.query("select 1 from public.memberships where space_id = $1 and user_id = $2", [pipRoom, ada.id]);
    expect(joined.rows).toHaveLength(0);
    const used = await db.query<{ used_count: number }>("select used_count from public.invite_codes where code = $1", [code]);
    expect(used.rows[0].used_count).toBe(0);
  });

  it("still redeems a code with no space given, as the phone app may", async () => {
    const code = await createCode(bola, pipRoom, 30);
    expect((await redeem(ada, code, null)).space_id).toBe(pipRoom);
  });

  it("lets staff read the people in their space by name, and members only themselves", async () => {
    const members = (user: TestUser) =>
      as(db, user, (tx) =>
        tx.query<{ display_name: string }>(
          `select p.display_name from public.memberships m join public.profiles p on p.id = m.user_id
            where m.space_id = $1 order by p.display_name`,
          [goldDesk],
        ),
      );
    expect((await members(kay)).rows.map((row) => row.display_name)).toEqual(["Ada O.", "Kay"]);
    expect((await members(ada)).rows.map((row) => row.display_name)).toEqual(["Ada O."]);
  });

  it("lets staff read who is asking, by name", async () => {
    await requestAccess(db, ada, goldDesk, "payment");
    const queue = await as(db, kay, (tx) =>
      tx.query<{ display_name: string; kind: string }>(
        `select p.display_name, r.kind from public.access_requests r join public.profiles p on p.id = r.user_id
          where r.space_id = $1 and r.status = 'pending'`,
        [goldDesk],
      ),
    );
    expect(queue.rows).toEqual([{ display_name: "Ada O.", kind: "payment" }]);
  });

  it("removes a person's memberships when their account is deleted", async () => {
    const temp = await newUser(db, "temp@example.com", "Temp");
    await join(db, temp, "gold-desk");
    await db.query("delete from auth.users where id = $1", [temp.id]);
    const left = await db.query("select 1 from public.memberships where user_id = $1", [temp.id]);
    expect(left.rows).toHaveLength(0);
  });
});
