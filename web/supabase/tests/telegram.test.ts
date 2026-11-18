import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, newUser, type Db, type TestUser, type Tx } from "./harness";
import { join, openSpace } from "./helpers";

type Row = Record<string, unknown>;

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("the Telegram teaser bot", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let zed: TestUser;
  let space: string;
  let other: string;

  const CHANNEL = -1001234567890;

  const status = (who: TestUser, of = space) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.telegram_status($1)", [of])).rows[0]);
  const start = (who: TestUser, of = space) => as(db, who, async (tx) => (await tx.query<{ code: string; expires_at: Date }>("select * from public.telegram_start($1)", [of])).rows[0]);
  const connect = (code: string, chat = CHANNEL, title = "Kay FX Signals", kind = "channel") =>
    asServer(db, async (tx) => (await tx.query<Row>("select * from public.telegram_connect($1, $2, $3, $4)", [code, chat, title, kind])).rows);
  const waiting = async () => (await db.query<{ payload: Row }>("select payload from private.outbox where kind = 'telegram' and done_at is null order by id")).rows.map((row) => row.payload);
  const clear = () => db.query("delete from private.outbox");
  const post = (kind: string, more: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = { p_space: space, p_kind: kind, p_audience: "everyone", p_title: "A title", ...more };
    const names = Object.keys(values);
    return as(db, kay, (tx) => call<string>(tx, `select public.create_post(${names.map((name, index) => `${name} => $${index + 1}`).join(", ")})`, Object.values(values)));
  };

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    zed = await newUser(db, "zed@example.com", "Zed");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, zed, "zed-fx", "Zed FX");
    for (const person of [tobi, ada]) await join(db, person, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
  });

  it("starts with nothing connected and every kind of notice switched on", async () => {
    expect(await status(kay)).toEqual({
      connected: false, chat_title: null, chat_kind: null, connected_at: null, code: null, code_expires_at: null,
      tease_setups: true, tease_posts: true, tease_lessons: true, tease_live: true,
      last_sent_at: null, last_error: null, last_error_at: null,
    });
  });

  it("is the mentor's alone to set up", async () => {
    for (const person of [tobi, ada, zed]) {
      await expect(status(person)).rejects.toThrow(/not_allowed/);
      await expect(start(person)).rejects.toThrow(/not_allowed/);
      await expect(as(db, person, (tx) => tx.query("select public.telegram_set($1, false, false, false, false)", [space]))).rejects.toThrow(/not_allowed/);
      await expect(as(db, person, (tx) => tx.query("select public.telegram_disconnect($1)", [space]))).rejects.toThrow(/not_allowed/);
      await expect(as(db, person, (tx) => tx.query("select public.telegram_test($1)", [space]))).rejects.toThrow(/not_allowed/);
    }
    // Nobody reads the table itself, and only the server may say a chat was connected.
    await expect(as(db, kay, (tx) => tx.query("select * from public.telegram_links"))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("select * from public.telegram_connect('ABCDEFGH', 1, 'x', 'channel')"))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("select * from public.telegram_target($1)", [space]))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("select public.telegram_result($1, null)", [space]))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("select public.telegram_left(1)"))).rejects.toThrow(/permission denied/);
  });

  it("gives the mentor a code that lasts half an hour, and a new one each time they ask", async () => {
    const first = await start(kay);
    expect(first.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(first.expires_at.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(first.expires_at.getTime() - Date.now()).toBeLessThan(31 * 60_000);
    expect(await status(kay)).toMatchObject({ connected: false, code: first.code });
    const second = await start(kay);
    expect(second.code).not.toBe(first.code);
    expect(await connect(first.code)).toEqual([]);
    expect(await status(kay)).toMatchObject({ connected: false, code: second.code });
  });

  it("connects the chat where the code was posted, once", async () => {
    const { code } = await start(kay);
    expect(await connect("WRONGCOD")).toEqual([]);
    expect(await connect("")).toEqual([]);
    expect(await connect(` ${code.toLowerCase()} `)).toEqual([{ space_id: space, space_name: "Gold Desk", slug: "gold-desk" }]);
    expect(await status(kay)).toMatchObject({ connected: true, chat_title: "Kay FX Signals", chat_kind: "channel", code: null, code_expires_at: null });
    // The code is used up.
    expect(await connect(code, -100999, "Someone else's channel")).toEqual([]);
    expect(await status(kay)).toMatchObject({ chat_title: "Kay FX Signals" });
  });

  it("refuses a code that has run out", async () => {
    const { code } = await start(zed, other);
    await db.query("update public.telegram_links set code_expires_at = now() - interval '1 second' where space_id = $1", [other]);
    expect(await connect(code, -100555, "Zed's channel")).toEqual([]);
    expect(await status(zed, other)).toMatchObject({ connected: false, code: null });
  });

  it("queues a notice for a post and a setup, and never for an offer", async () => {
    await clear();
    const free = await post("post", { p_body: "Start here" });
    const setup = await post("setup", { p_audience: "vip", p_title: null, p_pair: "EURUSD", p_side: "buy", p_entry: "1.0850", p_stop: "1.0810", p_targets: ["1.0930"] });
    await post("offer", { p_link_url: "https://broker.example/kay" });
    expect(await waiting()).toEqual([
      { type: "post", post_id: free, actor: kay.id },
      { type: "setup", post_id: setup, actor: kay.id },
    ]);
  });

  it("follows the mentor's switches", async () => {
    await clear();
    await as(db, kay, (tx) => tx.query("select public.telegram_set($1, true, false, true, true)", [space]));
    await post("post", { p_body: "Not announced" });
    const setup = await post("setup", { p_title: null, p_pair: "XAUUSD", p_side: "sell", p_entry: "2650", p_stop: "2660", p_targets: ["2630"] });
    expect(await waiting()).toEqual([{ type: "setup", post_id: setup, actor: kay.id }]);
    expect(await status(kay)).toMatchObject({ connected: true, tease_setups: true, tease_posts: false });
    await as(db, kay, (tx) => tx.query("select public.telegram_set($1, true, true, true, true)", [space]));
  });

  it("queues a notice when a lesson is published, not while it is a draft", async () => {
    await clear();
    const moduleId = await as(db, kay, (tx) => call<string>(tx, "select public.save_module($1, $2, null)", [space, "Basics"]));
    const lesson = await as(db, kay, (tx) => call<string>(tx, "select public.save_lesson($1, $2, $3, null)", [moduleId, "Reading a chart", "Start with the daily."]));
    expect(await waiting()).toEqual([]);
    await as(db, kay, (tx) => tx.query("select public.publish_lesson($1, true)", [lesson]));
    expect(await waiting()).toEqual([{ type: "lesson", lesson_id: lesson, actor: kay.id }]);
    // Changing a published lesson's words is not news.
    await as(db, kay, (tx) => tx.query("select public.save_lesson($1, $2, $3, $4)", [moduleId, "Reading a chart", "Start with the weekly.", lesson]));
    expect(await waiting()).toHaveLength(1);
  });

  it("tells the server where to post, and takes back how it went", async () => {
    const target = await asServer(db, async (tx) => (await tx.query<Row>("select * from public.telegram_target($1)", [space])).rows);
    expect(target).toEqual([{
      chat_id: CHANNEL, tease_setups: true, tease_posts: true, tease_lessons: true, tease_live: true,
      space_name: "Gold Desk", slug: "gold-desk", space_status: "active",
    }]);
    expect(await asServer(db, async (tx) => (await tx.query("select * from public.telegram_target($1)", [other])).rows)).toEqual([]);

    await asServer(db, (tx) => tx.query("select public.telegram_result($1, null)", [space]));
    expect(await status(kay)).toMatchObject({ last_error: null });
    expect((await status(kay)).last_sent_at).not.toBeNull();
    await asServer(db, (tx) => tx.query("select public.telegram_result($1, 'no_rights')", [space]));
    const broken = await status(kay);
    expect(broken).toMatchObject({ connected: true, last_error: "no_rights" });
    expect(broken.last_error_at).not.toBeNull();
    expect(broken.last_sent_at).not.toBeNull();
    await asServer(db, (tx) => tx.query("select public.telegram_result($1, null)", [space]));
    expect(await status(kay)).toMatchObject({ last_error: null, last_error_at: null });
    await asServer(db, (tx) => tx.query("select public.telegram_left($1)", [CHANNEL]));
    expect(await status(kay)).toMatchObject({ connected: true, last_error: "removed" });
  });

  it("posts a test line when the mentor asks, one at a time", async () => {
    await clear();
    await expect(as(db, zed, (tx) => tx.query("select public.telegram_test($1)", [other]))).rejects.toThrow(/not_connected/);
    await as(db, kay, (tx) => tx.query("select public.telegram_test($1)", [space]));
    await as(db, kay, (tx) => tx.query("select public.telegram_test($1)", [space]));
    expect(await waiting()).toEqual([{ type: "test", actor: kay.id }]);
  });

  it("lets a chat serve one space: the newest to connect it", async () => {
    const { code } = await start(zed, other);
    expect(await connect(code, CHANNEL, "Kay FX Signals")).toMatchObject([{ space_id: other, slug: "zed-fx" }]);
    expect(await status(zed, other)).toMatchObject({ connected: true, chat_title: "Kay FX Signals" });
    expect(await status(kay)).toMatchObject({ connected: false, chat_title: null });
    // And back again, for the rest of the tests.
    const again = await start(kay);
    expect(await connect(again.code)).toMatchObject([{ space_id: space }]);
    expect(await status(zed, other)).toMatchObject({ connected: false });
  });

  it("stops when the mentor disconnects, and keeps their switches", async () => {
    await as(db, kay, (tx) => tx.query("select public.telegram_set($1, true, false, true, false)", [space]));
    await as(db, kay, (tx) => tx.query("select public.telegram_disconnect($1)", [space]));
    expect(await status(kay)).toMatchObject({ connected: false, chat_title: null, code: null, last_error: null, tease_posts: false, tease_live: false, tease_setups: true });
    await clear();
    await post("setup", { p_title: null, p_pair: "GBPUSD", p_side: "buy", p_entry: "1.2700", p_stop: "1.2650", p_targets: ["1.2800"] });
    expect(await waiting()).toEqual([]);
    await expect(as(db, kay, (tx) => tx.query("select public.telegram_test($1)", [space]))).rejects.toThrow(/not_connected/);
  });

  it("goes with the space", async () => {
    await start(kay);
    expect((await db.query("select 1 from public.telegram_links where space_id = $1", [space])).rows).toHaveLength(1);
    await db.query("delete from public.spaces where id = $1", [space]);
    expect((await db.query("select 1 from public.telegram_links where space_id = $1", [space])).rows).toHaveLength(0);
  });
});
