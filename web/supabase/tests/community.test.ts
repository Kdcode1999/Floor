import { beforeAll, describe, expect, it } from "vitest";

import { CONTACT_NAMES, FINE_NAMES, LINKS, NOT_LINKS, NOT_PHONES, PHONES, STAFF_NAMES } from "../../../mobile/tests/filterCases";
import { as, call, createDb, deviceId, newUser, type Db, type TestUser, type Tx } from "./harness";
import { claim, join, openSpace } from "./helpers";

type Row = Record<string, unknown>;

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("the link and number filter", () => {
  let db: Db;
  const has = async (which: "has_link" | "has_phone", text: string) =>
    (await db.query<{ found: boolean }>(`select private.${which}($1) as found`, [text])).rows[0].found;

  beforeAll(async () => {
    db = await createDb();
  });

  it("catches web addresses, email addresses and @names", async () => {
    for (const text of LINKS) expect([text, await has("has_link", text)]).toEqual([text, true]);
  });

  it("lets ordinary talk through", async () => {
    for (const text of NOT_LINKS) expect([text, await has("has_link", text)]).toEqual([text, false]);
  });

  it("catches phone numbers, however they are spaced", async () => {
    for (const text of PHONES) expect([text, await has("has_phone", text)]).toEqual([text, true]);
  });

  it("lets prices and levels through", async () => {
    for (const text of NOT_PHONES) expect([text, await has("has_phone", text)]).toEqual([text, false]);
    expect(await has("has_phone", "")).toBe(false);
  });
});

describe("names", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let space: string;

  const rename = (who: TestUser, name: string) =>
    as(db, who, (tx) => tx.query("update public.profiles set display_name = $1 where id = $2", [name, who.id]));
  const nameOf = async (who: TestUser) =>
    (await db.query<{ display_name: string }>("select display_name from public.profiles where id = $1", [who.id])).rows[0].display_name;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "KD Trader");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    space = await openSpace(db, kay, "gold-desk", "Gold Desk");
    for (const person of [tobi, ada]) await join(db, person, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
  });

  it("cannot claim to be staff, anywhere in the name", async () => {
    for (const name of STAFF_NAMES) {
      await expect(rename(ada, name), name).rejects.toThrow(/profiles_display_name_reserved/);
    }
    // Ordinary names, some of which only look close.
    for (const name of FINE_NAMES) {
      await rename(ada, name);
      expect(await nameOf(ada)).toBe(name);
    }
  });

  it("cannot carry a link, an @name or a phone number", async () => {
    for (const name of CONTACT_NAMES) {
      await expect(rename(ada, name), name).rejects.toThrow(/name_has_contact/);
    }
    // A new account never fails over its name: it starts as "Member".
    const fresh = await newUser(db, "fresh@example.com", "Call 08012345678");
    expect(await nameOf(fresh)).toBe("Member");
    const loud = await newUser(db, "loud@example.com", "Official Support");
    expect(await nameOf(loud)).toBe("Member");
  });

  it("cannot be the name of the mentor, an admin or the space, however it is spaced", async () => {
    for (const name of ["KD Trader", "kd  trader.", "K.D. TRADER", "tobi", "Gold Desk", "gold_desk"]) {
      await expect(rename(ada, name), name).rejects.toThrow(/name_taken/);
    }
    await rename(ada, "Ada Okafor");
    expect(await nameOf(ada)).toBe("Ada Okafor");
    // Staff keep their own names, and the mentor may go by the space's name.
    await rename(kay, "KD  Trader");
    await rename(kay, "Gold Desk");
    await rename(kay, "KD Trader");
    await rename(tobi, "Tobi A.");
    // "Member" is what every account starts as, and stays free.
    await rename(ada, "Member");
    await rename(ada, "Ada Okafor");
  });

  it("go back to Member when someone joins under a staff name", async () => {
    const copy = await newUser(db, "copy@example.com", "K D Trader");
    expect(await nameOf(copy)).toBe("K D Trader");
    await join(db, copy, "gold-desk");
    expect(await nameOf(copy)).toBe("Member");
    const fine = await newUser(db, "fine@example.com", "Bola");
    await join(db, fine, "gold-desk");
    expect(await nameOf(fine)).toBe("Bola");
    // A mentor who never chose a name does not stop anyone joining as "Member".
    const quiet = await newUser(db, "quiet@example.com");
    await openSpace(db, quiet, "quiet-desk", "Quiet Desk");
    const plain = await newUser(db, "plain@example.com");
    await join(db, plain, "quiet-desk");
    expect(await nameOf(plain)).toBe("Member");
  });
});

describe("groups", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let vee: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let stranger: TestUser;
  let space: string;
  let general: string;
  let vipRoom: string;
  let inner: string;
  let news: string;

  const groups = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.my_groups($1)", [space])).rows);
  const send = (who: TestUser, group: string, body: string | null, reply: string | null = null, image: string | null = null) =>
    as(db, who, (tx) => call<string>(tx, "select public.send_message($1, $2, $3, $4, $5, $6)", [group, body, reply, image, image ? 800 : null, image ? 600 : null]));
  const page = (who: TestUser, group: string) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.chat_page($1)", [group])).rows);
  const bodies = async (who: TestUser, group: string) => (await page(who, group)).map((row) => row.body);

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    vee = await newUser(db, "vee@example.com", "Vee");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    bola = await newUser(db, "bola@example.com", "Bola");
    stranger = await newUser(db, "stranger@example.com", "Stranger");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [tobi, vee, ada, bola]) {
      await join(db, person, "gold-desk");
      await claim(db, person, deviceId());
    }
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
  });

  it("start as two in every space: one for everyone and one for VIP", async () => {
    const list = await groups(kay);
    expect(list.map((row) => [row.name, row.audience, row.posting])).toEqual([
      ["General", "everyone", "all"],
      ["VIP room", "vip", "all"],
    ]);
    [general, vipRoom] = list.map((row) => row.id as string);
  });

  it("are made and changed by the mentor and admins", async () => {
    const save = (who: TestUser, name: string, audience = "everyone", posting = "all", id: string | null = null) =>
      as(db, who, (tx) => call<string>(tx, "select public.save_group($1, $2, null, $3, $4, $5)", [space, name, audience, posting, id]));
    inner = await save(tobi, "  Inner   circle ", "invited");
    news = await save(kay, "News", "everyone", "staff");
    expect((await groups(kay)).map((row) => row.name)).toEqual(["General", "VIP room", "Inner circle", "News"]);
    await save(kay, "Announcements", "everyone", "staff", news);
    expect((await groups(kay))[3]).toMatchObject({ name: "Announcements", posting: "staff" });

    for (const person of [vee, ada, stranger]) await expect(save(person, "Mine")).rejects.toThrow(/not_allowed/);
    await expect(save(kay, "   ")).rejects.toThrow(/groups_name/);
    await expect(save(kay, "Bad", "friends")).rejects.toThrow(/groups_audience/);
    await expect(as(db, kay, (tx) => tx.query("insert into public.groups (space_id, name) values ($1, 'x')", [space]))).rejects.toThrow(/permission denied/);
  });

  it("show each person the groups they can open, VIP ones locked, invited ones hidden", async () => {
    const seen = async (who: TestUser) => (await groups(who)).map((row) => [row.name, row.can_open, row.can_post]);
    expect(await seen(kay)).toEqual([["General", true, true], ["VIP room", true, true], ["Inner circle", true, true], ["Announcements", true, true]]);
    expect(await seen(vee)).toEqual([["General", true, true], ["VIP room", true, true], ["Announcements", true, false]]);
    expect(await seen(ada)).toEqual([["General", true, true], ["VIP room", false, false], ["Announcements", true, false]]);
    await expect(groups(stranger)).rejects.toThrow(/not_allowed/);
    await expect(as(db, null, (tx) => tx.query("select * from public.my_groups($1)", [space]))).rejects.toThrow(/permission denied/);
  });

  it("let staff bring members into a group by invitation, and take them out", async () => {
    const set = (who: TestUser, add: string[], remove: string[] = []) =>
      as(db, who, (tx) => tx.query("select public.set_group_members($1, $2, $3)", [inner, add, remove]));
    await set(tobi, [ada.id, vee.id, stranger.id]);
    // Someone who is not in the space cannot be put in one of its groups.
    const ids = await as(db, kay, async (tx) => (await tx.query<{ user_id: string }>("select * from public.group_member_ids($1)", [inner])).rows.map((row) => row.user_id).sort());
    expect(ids).toEqual([ada.id, vee.id].sort());
    expect((await groups(ada)).map((row) => row.name)).toContain("Inner circle");
    await set(kay, [], [vee.id]);
    expect((await groups(vee)).map((row) => row.name)).not.toContain("Inner circle");
    await expect(set(ada, [bola.id])).rejects.toThrow(/not_allowed/);
    await expect(as(db, ada, (tx) => tx.query("select * from public.group_member_ids($1)", [inner]))).rejects.toThrow(/not_allowed/);
  });

  it("carry messages to everyone who can open the group, with who wrote each", async () => {
    const first = await send(ada, general, "  Morning all  ");
    await send(kay, general, "Morning. London in ten.", first);
    const seen = await page(vee, general);
    expect(seen.map((row) => [row.name, row.role, row.body, row.mine])).toEqual([
      ["Kay", "mentor", "Morning. London in ten.", false],
      ["Ada O.", "member", "Morning all", false],
    ]);
    expect(seen[0]).toMatchObject({ reply_to: first, reply_name: "Ada O.", reply_body: "Morning all" });
    expect((await page(ada, general))[1].mine).toBe(true);
  });

  it("keep each group to the people it is for", async () => {
    await send(vee, vipRoom, "VIP only talk");
    await send(ada, inner, "Inner circle talk");
    await expect(send(ada, vipRoom, "let me in")).rejects.toThrow(/not_allowed/);
    await expect(page(ada, vipRoom)).rejects.toThrow(/not_allowed/);
    await expect(page(bola, inner)).rejects.toThrow(/not_allowed/);
    await expect(send(stranger, general, "hello")).rejects.toThrow(/not_allowed/);
    await expect(page(stranger, general)).rejects.toThrow(/not_allowed/);
    // Asking the tables directly gives no more.
    expect(await as(db, ada, async (tx) => (await tx.query("select body from public.messages where group_id = $1", [vipRoom])).rows)).toEqual([]);
    expect(await as(db, bola, async (tx) => (await tx.query("select id from public.groups where id = $1", [inner])).rows)).toEqual([]);
    await expect(as(db, ada, (tx) => tx.query("insert into public.messages (group_id, space_id, user_id, body) values ($1, $2, $3, 'x')", [general, space, ada.id]))).rejects.toThrow(/permission denied/);
    // When VIP runs out, the VIP room closes by itself.
    await db.query("update public.memberships set vip_until = now() - interval '1 minute' where user_id = $1", [vee.id]);
    await expect(page(vee, vipRoom)).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
  });

  it("let only staff write where only staff may, and only staff post links, numbers and pictures", async () => {
    await expect(send(ada, news, "can I post here?")).rejects.toThrow(/staff_only/);
    await send(tobi, news, "Class moved to 4pm. Details: https://example.com/class");
    await expect(send(ada, general, "join https://t.me/fxsignals")).rejects.toThrow(/no_links/);
    await expect(send(ada, general, "whatsapp me 0803 123 4567")).rejects.toThrow(/no_numbers/);
    await expect(send(ada, general, "chart", null, `${space}/${general}/chart.jpg`)).rejects.toThrow(/pictures_staff_only/);
    await send(ada, general, "tp 1.08500 1.09000 1.09500");

    await send(kay, general, "Call the desk on 0803 123 4567 or see https://example.com");
    await send(kay, general, null, null, `${space}/${general}/chart.jpg`);
    await expect(send(kay, general, null, null, `${space}/${vipRoom}/chart.jpg`)).rejects.toThrow(/bad_picture/);
    await expect(send(kay, general, "   ")).rejects.toThrow(/message_empty/);
    await expect(send(kay, general, "x".repeat(2001))).rejects.toThrow(/message_too_long/);
  });

  it("count what a person has not read, until they open the group", async () => {
    const unread = async (who: TestUser, name: string) => (await groups(who)).find((row) => row.name === name)?.unread;
    expect(await unread(bola, "General")).toBe(5);
    expect((await groups(bola)).find((row) => row.name === "General")).toMatchObject({ last_name: "Kay", last_body: null, last_has_image: true });
    await as(db, bola, (tx) => tx.query("select public.mark_read($1)", [general]));
    expect(await unread(bola, "General")).toBe(0);
    await send(ada, general, "one more");
    expect(await unread(bola, "General")).toBe(1);
    // Your own messages are never unread to you.
    expect(await unread(ada, "General")).toBe(0);
    await expect(as(db, ada, (tx) => tx.query("select public.mark_read($1)", [vipRoom]))).rejects.toThrow(/not_allowed/);
  });

  it("stamp messages one after another, so none is missed or read before it is seen", async () => {
    const sent: string[] = [];
    for (let count = 0; count < 6; count += 1) sent.push(await send(count % 2 ? kay : tobi, news, `quick ${count}`));
    const stamps = (await db.query<{ id: string; created_at: Date }>("select id, created_at from public.messages where id = any($1) order by created_at", [sent])).rows;
    expect(stamps.map((row) => row.id)).toEqual(sent);
    const distinct = (await db.query<{ count: number }>("select count(distinct created_at)::int as count from public.messages where id = any($1)", [sent])).rows[0].count;
    expect(distinct).toBe(6);

    // Reading marks the newest message, not the clock: the very next one is unread.
    const unread = async () => (await groups(bola)).find((row) => row.name === "Announcements")?.unread;
    for (let round = 0; round < 3; round += 1) {
      await as(db, bola, (tx) => tx.query("select public.mark_read($1)", [news]));
      expect(await unread()).toBe(0);
      await send(kay, news, `after ${round}`);
      expect(await unread()).toBe(1);
    }
    await as(db, bola, (tx) => tx.query("select public.mark_read($1)", [news]));
  });

  it("let a person delete their own message, and staff delete any", async () => {
    const mine = await send(ada, general, "oops wrong chat");
    const theirs = await send(vee, general, "buy now or regret it");
    await expect(as(db, ada, (tx) => tx.query("select public.delete_message($1)", [theirs]))).rejects.toThrow(/not_allowed/);
    await as(db, ada, (tx) => tx.query("select public.delete_message($1)", [mine]));
    await as(db, tobi, (tx) => tx.query("select public.delete_message($1)", [theirs]));
    expect(await bodies(bola, general)).not.toContain("oops wrong chat");
    expect(await bodies(bola, general)).not.toContain("buy now or regret it");

    // A phone that already showed them is told they went.
    const changes = await as(db, bola, async (tx) => (await tx.query<Row>("select id, body, deleted from public.chat_changes($1, now() - interval '1 minute')", [general])).rows);
    expect(changes.filter((row) => row.deleted)).toEqual([
      { id: mine, body: null, deleted: true },
      { id: theirs, body: null, deleted: true },
    ]);
    const kept = (await db.query<Row>("select body, deleted_by from public.messages where id = $1", [theirs])).rows[0];
    expect(kept).toEqual({ body: null, deleted_by: tobi.id });

    // An admin cannot delete what the mentor wrote. The mentor can delete an admin's.
    const fromMentor = await send(kay, general, "Rules: no signals from anyone but me");
    const fromAdmin = await send(tobi, general, "Noted");
    await expect(as(db, tobi, (tx) => tx.query("select public.delete_message($1)", [fromMentor]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.delete_message($1)", [fromAdmin]));
    expect(await bodies(bola, general)).toContain("Rules: no signals from anyone but me");
    expect(await bodies(bola, general)).not.toContain("Noted");
  });

  it("remove a deleted picture from the file store", async () => {
    const withPicture = await send(kay, general, "chart", null, `${space}/${general}/weekly.jpg`);
    await db.query("delete from private.outbox");
    await as(db, kay, (tx) => tx.query("select public.delete_message($1)", [withPicture]));
    const jobs = (await db.query<Row>("select payload from private.outbox where kind = 'files_delete'")).rows;
    expect(jobs).toMatchObject([{ payload: { bucket: "chat", paths: [`${space}/${general}/weekly.jpg`] } }]);
    expect(jobs).toHaveLength(1);
  });

  it("let staff mute a member for a while", async () => {
    const mute = (who: TestUser, target: TestUser, hours: number) => as(db, who, (tx) => tx.query("select public.mute_member($1, $2, $3)", [space, target.id, hours]));
    await mute(tobi, ada, 24);
    await expect(send(ada, general, "hello?")).rejects.toThrow(/muted/);
    expect((await groups(ada)).find((row) => row.name === "General")).toMatchObject({ can_open: true, can_post: false });
    expect(await bodies(ada, general)).toContain("one more");
    await mute(kay, ada, 0);
    await send(ada, general, "back again");
    // A mute that has run out no longer holds.
    await mute(tobi, ada, 1);
    await db.query("update public.memberships set muted_until = now() - interval '1 second' where user_id = $1", [ada.id]);
    await send(ada, general, "and again");

    await expect(mute(ada, vee, 1)).rejects.toThrow(/not_allowed/);
    await expect(mute(kay, tobi, 1)).rejects.toThrow(/member_not_found/);
    await expect(mute(kay, ada, -1)).rejects.toThrow(/bad_hours/);
  });

  it("stop a flood", async () => {
    const dan = await newUser(db, "dan@example.com", "Dan");
    await join(db, dan, "gold-desk");
    await claim(db, dan, deviceId());
    for (let count = 0; count < 20; count += 1) await send(dan, general, `spam ${count}`);
    await expect(send(dan, general, "one too many")).rejects.toThrow(/slow_down/);
    await db.query("delete from public.messages where user_id = $1", [dan.id]);
  });

  it("take a removed member out of every group at once", async () => {
    const eve = await newUser(db, "eve@example.com", "Eve");
    await join(db, eve, "gold-desk");
    await claim(db, eve, deviceId());
    await send(eve, general, "hi");
    await as(db, kay, (tx) => tx.query("select public.ban_member($1, $2)", [space, eve.id]));
    await expect(send(eve, general, "still here")).rejects.toThrow(/not_allowed/);
    await expect(page(eve, general)).rejects.toThrow(/not_allowed/);
  });

  it("let a member report a message to the space's staff", async () => {
    const bad = await send(vee, general, "send me your account login and I will trade it for you");
    await db.query("delete from private.outbox");
    await as(db, ada, (tx) => tx.query("select public.report_message($1)", [bad]));
    await as(db, ada, (tx) => tx.query("select public.report_message($1)", [bad]));
    await as(db, bola, (tx) => tx.query("select public.report_message($1)", [bad]));
    // The first report tells the staff. The ones after it do not ring their phones again.
    const alerts = (await db.query<Row>("select space_id, payload from private.outbox where kind = 'alert'")).rows;
    expect(alerts).toMatchObject([{ space_id: space, payload: { type: "report", message_id: bad, group: "General", actor: ada.id } }]);
    expect(alerts).toHaveLength(1);
    await expect(as(db, vee, (tx) => tx.query("select public.report_message($1)", [bad]))).rejects.toThrow(/own_message/);
    await expect(as(db, stranger, (tx) => tx.query("select public.report_message($1)", [bad]))).rejects.toThrow(/not_allowed/);

    const queue = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.reported_messages($1)", [space])).rows);
    expect(await queue(tobi)).toMatchObject([{ message_id: bad, group_name: "General", name: "Vee", role: "member", reports: 2, body: "send me your account login and I will trade it for you" }]);
    await expect(queue(ada)).rejects.toThrow(/not_allowed/);
    // The reported member cannot see who reported them.
    expect(await as(db, vee, async (tx) => (await tx.query("select * from public.message_reports")).rows)).toEqual([]);

    // Staff leave one up, and take another down.
    await expect(as(db, ada, (tx) => tx.query("select public.dismiss_message_reports($1)", [bad]))).rejects.toThrow(/not_allowed/);
    await as(db, tobi, (tx) => tx.query("select public.dismiss_message_reports($1)", [bad]));
    expect(await queue(kay)).toEqual([]);
    const worse = await send(vee, general, "last chance to double your money");
    await as(db, ada, (tx) => tx.query("select public.report_message($1)", [worse]));
    await as(db, kay, (tx) => tx.query("select public.delete_message($1)", [worse]));
    expect(await queue(kay)).toEqual([]);
  });

  it("send an alert about a report to the mentor and admins only", async () => {
    for (const [person, token] of [[kay, "ExponentPushToken[kay]"], [tobi, "ExponentPushToken[tobi]"], [vee, "ExponentPushToken[vee]"], [ada, "ExponentPushToken[ada]"]] as const) {
      await as(db, person, (tx) => tx.query("select public.save_push_token($1, 'android')", [token]));
    }
    const told = (type: string, except: string | null = null) =>
      asServer(db, async (tx) => (await tx.query<{ token: string }>("select token from public.alert_recipients($1, $2, true, $3)", [space, type, except])).rows.map((row) => row.token));
    expect(await told("staff")).toEqual(["ExponentPushToken[kay]", "ExponentPushToken[tobi]"]);
    expect(await told("staff", tobi.id)).toEqual(["ExponentPushToken[kay]"]);
    // The rules that were there before still hold.
    expect(await told("payment")).toEqual(["ExponentPushToken[kay]"]);
    expect(await told("setup")).toEqual(["ExponentPushToken[kay]", "ExponentPushToken[tobi]", "ExponentPushToken[vee]"]);
  });

  it("count as unread only what was written after a person joined", async () => {
    const late = await newUser(db, "late@example.com", "Late");
    await join(db, late, "gold-desk");
    await claim(db, late, deviceId());
    const before = (await groups(late)).find((row) => row.name === "General");
    expect(before).toMatchObject({ unread: 0, can_open: true });
    // They can still read what was said before they came.
    expect((await page(late, general)).length).toBeGreaterThan(3);
    await send(kay, general, "Welcome, Late");
    expect((await groups(late)).find((row) => row.name === "General")?.unread).toBe(1);
  });

  it("let a person block another member, and never the staff", async () => {
    await send(bola, general, "Bola here");
    await as(db, ada, (tx) => tx.query("select public.block_member($1)", [bola.id]));
    expect(await bodies(ada, general)).not.toContain("Bola here");
    expect(await bodies(vee, general)).toContain("Bola here");
    const changes = await as(db, ada, async (tx) => (await tx.query<Row>("select body from public.chat_changes($1, now() - interval '1 minute')", [general])).rows.map((row) => row.body));
    expect(changes).not.toContain("Bola here");
    expect((await groups(ada)).find((row) => row.name === "General")?.last_name).not.toBe("Bola");
    expect(await as(db, ada, async (tx) => (await tx.query<Row>("select user_id, name from public.my_blocks()")).rows)).toEqual([{ user_id: bola.id, name: "Bola" }]);

    await expect(as(db, ada, (tx) => tx.query("select public.block_member($1)", [kay.id]))).rejects.toThrow(/cannot_block_staff/);
    await expect(as(db, ada, (tx) => tx.query("select public.block_member($1)", [tobi.id]))).rejects.toThrow(/cannot_block_staff/);
    await expect(as(db, ada, (tx) => tx.query("select public.block_member($1)", [stranger.id]))).rejects.toThrow(/not_allowed/);
    await expect(as(db, ada, (tx) => tx.query("select public.block_member($1)", [ada.id]))).rejects.toThrow(/not_allowed/);

    await as(db, ada, (tx) => tx.query("select public.unblock_member($1)", [bola.id]));
    expect(await bodies(ada, general)).toContain("Bola here");
  });

  it("let only the mentor delete a group, with everything said in it", async () => {
    await expect(as(db, tobi, (tx) => tx.query("select public.delete_group($1)", [news]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.delete_group($1)", [news]));
    expect((await groups(kay)).map((row) => row.name)).toEqual(["General", "VIP room", "Inner circle"]);
    expect((await db.query("select 1 from public.messages where group_id = $1", [news])).rows).toEqual([]);

    await as(db, tobi, (tx) => tx.query("select public.reorder_groups($1, $2)", [space, [inner, general, vipRoom]]));
    expect((await groups(kay)).map((row) => row.name)).toEqual(["Inner circle", "General", "VIP room"]);
  });

  it("close every group to members when Floor suspends the space", async () => {
    await db.query("update public.spaces set status = 'suspended' where id = $1", [space]);
    await expect(page(ada, general)).rejects.toThrow(/not_allowed/);
    await expect(send(ada, general, "hello")).rejects.toThrow(/not_allowed/);
    expect(await bodies(kay, general)).toContain("Bola here");
    await db.query("update public.spaces set status = 'active' where id = $1", [space]);
  });

  it("take a person's messages and pictures with their account", async () => {
    const other = await openSpace(db, bola, "pip-room", "Pip Room");
    const room = (await as(db, bola, async (tx) => (await tx.query<Row>("select id from public.my_groups($1)", [other])).rows))[0].id as string;
    await join(db, tobi, "pip-room");
    await as(db, bola, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [other, tobi.id]));
    await send(tobi, room, null, null, `${other}/${room}/from-tobi.jpg`);
    await db.query("insert into storage.objects (bucket_id, name) values ('chat', $1)", [`${space}/${general}/chart.jpg`]);
    await db.query("delete from private.outbox");

    // Tobi, an admin in two spaces, deletes his account: his pictures in both are queued.
    await asServer(db, (tx) => tx.query("select public.erase_account($1)", [tobi.id]));
    const tobis = (await db.query<Row>("select payload from private.outbox where kind = 'files_delete'")).rows.map((row) => row.payload);
    expect(tobis).toEqual([{ bucket: "chat", paths: [`${other}/${room}/from-tobi.jpg`] }]);
    await db.query("delete from auth.users where id = $1", [tobi.id]);
    expect((await db.query("select 1 from public.messages where user_id = $1", [tobi.id])).rows).toEqual([]);

    // Kay, the mentor, deletes hers: every picture in her space's groups goes with the space.
    await db.query("delete from private.outbox");
    await asServer(db, (tx) => tx.query("select public.erase_account($1)", [kay.id]));
    const kays = (await db.query<Row>("select payload from private.outbox where kind = 'files_delete'")).rows.map((row) => row.payload);
    expect(kays).toContainEqual({ bucket: "chat", paths: [`${space}/${general}/chart.jpg`] });
    expect((await db.query("select 1 from public.groups where space_id = $1", [space])).rows).toEqual([]);
  });
});
