import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, newUser, type Db, type TestUser } from "./harness";
import { hasAccess, join, openSpace, requestAccess, vipUntil } from "./helpers";

describe("removing someone from a space", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let sam: TestUser;
  let space: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    sam = await newUser(db, "sam@example.com", "Sam K.");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [tobi, ada, sam]) await join(db, person, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
  });

  const ban = (by: TestUser, who: TestUser) => as(db, by, (tx) => tx.query("select public.ban_member($1, $2)", [space, who.id]));
  const unban = (by: TestUser, who: TestUser) => as(db, by, (tx) => tx.query("select public.unban_member($1, $2)", [space, who.id]));
  const row = async (who: TestUser) =>
    (await db.query<{ status: string; role: string }>("select status, role from public.memberships where space_id = $1 and user_id = $2", [space, who.id])).rows[0];

  it("is for staff only", async () => {
    await expect(ban(ada, sam)).rejects.toThrow(/not_allowed/);
  });

  it("lets an admin ban a member, and the member loses the space, their VIP and their place in the queue", async () => {
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, ada.id]));
    await as(db, ada, (tx) => tx.query("select public.claim_session('ada-phone-0123456789')"));
    await requestAccess(db, ada, space, "broker");
    expect(await hasAccess(db, ada, space, true)).toBe(true);

    await ban(tobi, ada);
    expect(await row(ada)).toEqual({ status: "banned", role: "member" });
    expect(await vipUntil(db, space, ada)).toBeNull();
    expect(await hasAccess(db, ada, space)).toBe(false);
    const waiting = await db.query("select 1 from public.access_requests where user_id = $1 and status = 'pending'", [ada.id]);
    expect(waiting.rows).toHaveLength(0);
  });

  it("keeps a banned person out by every door", async () => {
    await expect(join(db, ada, "gold-desk")).rejects.toThrow(/banned/);
    await expect(requestAccess(db, ada, space, "payment")).rejects.toThrow(/banned/);
    const code = await as(db, kay, (tx) => call<string>(tx, "select public.create_invite_code($1, 7)", [space]));
    await expect(as(db, ada, (tx) => tx.query("select public.redeem_invite($1, $2)", [code, space]))).rejects.toThrow(/banned/);
  });

  it("protects the mentor from everyone and admins from each other", async () => {
    await expect(ban(tobi, kay)).rejects.toThrow(/not_allowed/);
    await expect(ban(kay, kay)).rejects.toThrow(/not_allowed/);
    await expect(ban(tobi, tobi)).rejects.toThrow(/not_allowed/);
  });

  it("lets the mentor ban an admin, who comes back as an ordinary member", async () => {
    await ban(kay, tobi);
    expect(await row(tobi)).toEqual({ status: "banned", role: "member" });
    await unban(kay, tobi);
    expect(await row(tobi)).toEqual({ status: "active", role: "member" });
    await expect(ban(tobi, sam)).rejects.toThrow(/not_allowed/);
  });

  it("lets a banned member back in as a free member, with no VIP handed back", async () => {
    await unban(kay, ada);
    expect(await row(ada)).toEqual({ status: "active", role: "member" });
    expect(await vipUntil(db, space, ada)).toBeNull();
    await expect(unban(kay, ada)).rejects.toThrow(/member_not_found/);
  });
});

describe("a space's logo", () => {
  let db: Db;
  let kay: TestUser;
  let bola: TestUser;
  let ada: TestUser;
  let space: string;
  let other: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    bola = await newUser(db, "bola@example.com", "Bola");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, bola, "pip-room");
    await join(db, ada, "gold-desk");
  });

  const upload = (by: TestUser, name: string) =>
    as(db, by, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('logos', $1)", [name]));
  const setLogo = (by: TestUser, id: string, path: string | null) =>
    as(db, by, (tx) => tx.query("update public.spaces set logo_path = $2 where id = $1 returning id", [id, path]));

  it("is uploaded by the mentor into the space's own folder, and by nobody else", async () => {
    await upload(kay, `${space}/logo.png`);
    await expect(upload(ada, `${space}/logo2.png`)).rejects.toThrow(/row-level security/);
    await expect(upload(kay, `${other}/logo.png`)).rejects.toThrow(/row-level security/);
    await expect(upload(kay, "not-a-space/logo.png")).rejects.toThrow(/row-level security/);
  });

  it("is set by the mentor, and must sit in the space's own folder", async () => {
    expect((await setLogo(kay, space, `${space}/logo.png`)).rows).toHaveLength(1);
    await expect(setLogo(kay, space, `${other}/logo.png`)).rejects.toThrow(/spaces_logo_path/);
    await expect(setLogo(kay, space, "https://example.com/logo.png")).rejects.toThrow(/spaces_logo_path/);
    expect((await setLogo(ada, space, `${space}/logo.png`)).rows).toHaveLength(0);
  });

  it("is public, like the rest of what anyone may know about a space", async () => {
    const seen = await as(db, null, (tx) => tx.query<{ logo_path: string }>("select logo_path from public.spaces where id = $1", [space]));
    expect(seen.rows[0].logo_path).toBe(`${space}/logo.png`);
  });
});

describe("the reads that join tables", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let sam: TestUser;
  let zed: TestUser;
  let bola: TestUser;
  let space: string;
  let other: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    sam = await newUser(db, "sam@example.com", "Sam K.");
    zed = await newUser(db, "zed@example.com", "Zed 100%");
    bola = await newUser(db, "bola@example.com", "Bola");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, bola, "pip-room", "Pip Room");
    for (const person of [tobi, ada, sam, zed]) await join(db, person, "gold-desk");
    await join(db, ada, "pip-room");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 3)", [space, sam.id]));
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 60)", [space, ada.id]));
    await as(db, kay, (tx) => tx.query("select public.ban_member($1, $2)", [space, zed.id]));
  });

  type SpaceRow = { id: string; name: string; role: string; status: string; vip_until: Date | null };
  type MemberRow = { user_id: string; name: string; role: string; status: string };
  const mySpaces = (who: TestUser | null) => as(db, who, async (tx) => (await tx.query<SpaceRow>("select * from public.my_spaces()")).rows);
  const members = (who: TestUser, search: string | null = null, limit = 50, user: string | null = null) =>
    as(db, who, async (tx) => (await tx.query<MemberRow>("select * from public.list_members($1, $2, $3, $4)", [space, search, limit, user])).rows);

  it("gives a person their own spaces and their place in each", async () => {
    const adas = await mySpaces(ada);
    expect(adas.map((row) => [row.name, row.role])).toEqual([["Gold Desk", "member"], ["Pip Room", "member"]]);
    expect(adas[0].vip_until).not.toBeNull();
    expect((await mySpaces(kay)).map((row) => [row.id, row.role])).toEqual([[space, "mentor"]]);
    expect(await mySpaces(zed)).toEqual([]);
  });

  it("is closed to people who are not signed in", async () => {
    await expect(mySpaces(null)).rejects.toThrow(/permission denied/);
  });

  it("still lists a suspended space, with its status, so the app can say why it will not open", async () => {
    await db.query("update public.spaces set status = 'suspended' where id = $1", [other]);
    const adas = await mySpaces(ada);
    expect(adas.find((row) => row.id === other)?.status).toBe("suspended");
    await db.query("update public.spaces set status = 'active' where id = $1", [other]);
  });

  it("lists members for staff: VIP about to end first, removed people last", async () => {
    const rows = await members(tobi);
    expect(rows.map((row) => row.name)).toEqual(["Sam K.", "Ada O.", "Kay", "Tobi", "Zed 100%"]);
    expect(rows[4].status).toBe("banned");
  });

  it("finds members by part of a name, taking the letters as typed", async () => {
    expect((await members(kay, "  sam ")).map((row) => row.name)).toEqual(["Sam K."]);
    expect((await members(kay, "100%")).map((row) => row.name)).toEqual(["Zed 100%"]);
    expect(await members(kay, "%")).toHaveLength(1);
    expect(await members(kay, "_")).toHaveLength(0);
  });

  it("gives one member when asked, and no more than the limit", async () => {
    expect((await members(kay, null, 50, ada.id)).map((row) => row.name)).toEqual(["Ada O."]);
    expect(await members(kay, null, 2)).toHaveLength(2);
    expect(await members(kay, null, 50, bola.id)).toEqual([]);
  });

  it("keeps the member list and the queue from everyone who is not staff", async () => {
    await expect(members(ada)).rejects.toThrow(/not_allowed/);
    await expect(members(bola)).rejects.toThrow(/not_allowed/);
    await expect(as(db, ada, (tx) => tx.query("select * from public.list_requests($1)", [space]))).rejects.toThrow(/not_allowed/);
    await expect(as(db, ada, (tx) => tx.query("select * from public.member_counts($1)", [space]))).rejects.toThrow(/not_allowed/);
  });

  it("lists the queue oldest first, with names", async () => {
    await requestAccess(db, sam, space, "payment");
    await requestAccess(db, ada, space, "broker");
    const rows = await as(db, tobi, async (tx) => (await tx.query<{ name: string; kind: string; days: number; proof_path: string }>("select * from public.list_requests($1)", [space])).rows);
    expect(rows.map((row) => [row.name, row.kind])).toEqual([["Sam K.", "payment"], ["Ada O.", "broker"]]);
    expect(rows[0].proof_path).toBe(`${space}/${sam.id}/receipt.jpg`);
  });

  it("counts the space's people", async () => {
    const counts = await as(db, kay, async (tx) => (await tx.query<Record<string, number>>("select * from public.member_counts($1)", [space])).rows[0]);
    expect({ ...counts }).toEqual({ members: 4, vip: 2, expiring: 1, removed: 1 });
  });
});
