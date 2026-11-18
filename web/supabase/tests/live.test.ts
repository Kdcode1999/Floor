import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, deviceId, newUser, type Db, type TestUser, type Tx } from "./harness";
import { claim, join, openSpace } from "./helpers";

type Row = Record<string, unknown>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("classes and the live room", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let vee: TestUser;
  let ada: TestUser;
  let zed: TestUser;
  let space: string;

  const at = (fromNow: number) => new Date(Date.now() + fromNow);
  const schedule = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.live_schedule($1)", [space])).rows);
  const saveClass = (who: TestUser, title: string, when: Date, more: { about?: string | null; record?: boolean; session?: string | null } = {}) =>
    as(db, who, (tx) =>
      call<string>(tx, "select public.save_class($1, $2, $3, $4, $5, $6)", [space, title, when, more.about ?? null, more.record ?? true, more.session ?? null]),
    );
  const start = (who: TestUser, more: { title?: string | null; session?: string | null; record?: boolean | null } = {}) =>
    as(db, who, (tx) => call<string>(tx, "select public.live_start($1, $2, $3, $4)", [space, more.title ?? null, more.session ?? null, more.record ?? null]));
  const end = (who: TestUser, session: string) => as(db, who, (tx) => tx.query("select public.live_end($1)", [session]));
  const joinRoom = (who: TestUser, session: string) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.live_join($1)", [session])).rows[0]);
  const beat = (who: TestUser, session: string) => as(db, who, (tx) => call<string>(tx, "select public.live_heartbeat($1)", [session]));
  const waiting = async (kind: string) =>
    (await db.query<{ payload: Row; run_after: Date }>("select payload, run_after from private.outbox where kind = $1 and done_at is null order by id", [kind])).rows;
  const clear = () => db.query("delete from private.outbox");
  const quiet = (session: string, minutes: number) =>
    db.query("update public.live_sessions set host_seen_at = now() - make_interval(mins => $2) where id = $1", [session, minutes]);
  const row = async (session: string) => (await db.query<Row>("select * from public.live_sessions where id = $1", [session])).rows[0];
  const forAlert = (session: string, startsAt: Date | null = null) =>
    asServer(db, async (tx) => (await tx.query<{ title: string }>("select * from public.live_for_alert($1, $2)", [session, startsAt])).rows);

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    vee = await newUser(db, "vee@example.com", "Vee");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    zed = await newUser(db, "zed@example.com", "Zed");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [tobi, vee, ada]) {
      await join(db, person, "gold-desk");
      await claim(db, person, deviceId());
    }
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
  });

  // --- The schedule ------------------------------------------------------------------------------

  it("lets staff put a class on the schedule, and nobody else", async () => {
    await expect(saveClass(vee, "London session", at(DAY))).rejects.toThrow(/not_allowed/);
    await expect(saveClass(zed, "London session", at(DAY))).rejects.toThrow(/not_allowed/);
    await expect(saveClass(kay, "London session", at(-HOUR))).rejects.toThrow(/bad_time/);
    await expect(saveClass(kay, "London session", at(400 * DAY))).rejects.toThrow(/bad_time/);
    await expect(saveClass(kay, "  ", at(DAY))).rejects.toThrow(/live_sessions_title/);

    const id = await saveClass(tobi, "  London session ", at(DAY), { about: " What I am watching this week. " });
    expect(await row(id)).toMatchObject({ title: "London session", about: "What I am watching this week.", status: "scheduled", record: true, started_at: null });
  });

  it("queues one reminder for a quarter of an hour before, and a new one when the time moves", async () => {
    await clear();
    const when = at(3 * HOUR);
    const id = await saveClass(kay, "New York open", when);
    let queued = await waiting("alert");
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ type: "class", session_id: id, audience: "vip", actor: kay.id });
    expect(Math.abs(queued[0].run_after.getTime() - (when.getTime() - 15 * MINUTE))).toBeLessThan(1000);

    // Changing the words does not remind anyone twice.
    await saveClass(kay, "New York open, live", when, { session: id });
    expect(await waiting("alert")).toHaveLength(1);
    // Moving it queues a reminder for the new time. The old one is dropped when its turn comes.
    const later = at(5 * HOUR);
    await saveClass(kay, "New York open, live", later, { session: id });
    queued = await waiting("alert");
    expect(queued).toHaveLength(2);
    expect(await forAlert(id, when)).toEqual([]);
    expect(await forAlert(id, later)).toEqual([{ title: "New York open, live" }]);

    // A class that is almost due gets no reminder: going live is the alert.
    await clear();
    await saveClass(kay, "In ten minutes", at(10 * MINUTE));
    expect(await waiting("alert")).toEqual([]);
  });

  it("shows the schedule to each person as they may see it", async () => {
    const staff = await schedule(kay);
    expect(staff.map((each) => each.title)).toEqual(["In ten minutes", "New York open, live", "London session"]);
    expect(staff.every((each) => each.state === "scheduled" && each.locked === false)).toBe(true);
    expect(staff[2]).toMatchObject({ about: "What I am watching this week.", recording_status: "none" });

    const vip = await schedule(vee);
    expect(vip.map((each) => each.title)).toEqual(staff.map((each) => each.title));
    expect(vip[2]).toMatchObject({ about: "What I am watching this week.", locked: false, recording_status: null });

    // Someone who has not paid sees that it is on the schedule, and no more.
    const free = await schedule(ada);
    expect(free.map((each) => [each.title, each.locked, each.about])).toEqual([
      ["In ten minutes", true, null],
      ["New York open, live", true, null],
      ["London session", true, null],
    ]);
    await expect(schedule(zed)).rejects.toThrow(/not_allowed/);
    // The table itself is closed to them.
    expect(await as(db, ada, async (tx) => (await tx.query("select id from public.live_sessions")).rows)).toEqual([]);
    expect((await as(db, vee, async (tx) => (await tx.query("select id from public.live_sessions")).rows)).length).toBe(3);
  });

  it("drops a class from members' view an hour after it was due, and keeps it for staff", async () => {
    const id = await saveClass(kay, "Missed", at(HOUR));
    await db.query("update public.live_sessions set starts_at = now() - interval '2 hours' where id = $1", [id]);
    expect((await schedule(vee)).some((each) => each.id === id)).toBe(false);
    expect((await schedule(kay)).some((each) => each.id === id)).toBe(true);

    await expect(as(db, vee, (tx) => tx.query("select public.cancel_class($1)", [id]))).rejects.toThrow(/not_allowed/);
    await as(db, tobi, (tx) => tx.query("select public.cancel_class($1)", [id]));
    expect((await schedule(kay)).some((each) => each.id === id)).toBe(false);
    await expect(as(db, tobi, (tx) => tx.query("select public.cancel_class($1)", [id]))).rejects.toThrow(/session_not_found/);
    await expect(saveClass(kay, "Back again", at(DAY), { session: id })).rejects.toThrow(/session_not_found/);
    expect(await forAlert(id, at(HOUR))).toEqual([]);
  });

  // --- Going live --------------------------------------------------------------------------------

  let session: string;

  it("lets staff go live with nothing scheduled, alerting VIP members", async () => {
    await clear();
    await expect(start(vee, { title: "Let me" })).rejects.toThrow(/not_allowed/);
    await expect(start(kay, { title: " " })).rejects.toThrow(/live_sessions_title/);
    session = await start(kay, { title: "Gold, live" });
    expect(await row(session)).toMatchObject({ status: "live", title: "Gold, live", host_id: kay.id, record: true, recording_status: "none" });

    expect((await waiting("alert")).map((job) => job.payload)).toEqual([{ type: "live", session_id: session, audience: "vip", actor: kay.id }]);
    // No Telegram channel is connected, so there is nothing to tell it.
    expect(await waiting("telegram")).toEqual([]);
    expect(await forAlert(session)).toEqual([{ title: "Gold, live" }]);

    const now = await schedule(vee);
    expect(now[0]).toMatchObject({ id: session, state: "live", locked: false });
    expect((await schedule(ada))[0]).toMatchObject({ id: session, state: "live", locked: true });
  });

  it("allows one live session at a time", async () => {
    await expect(start(tobi, { title: "Another" })).rejects.toThrow(/already_live/);
    const next = (await schedule(kay)).find((each) => each.title === "In ten minutes");
    await expect(start(tobi, { session: next?.id as string })).rejects.toThrow(/already_live/);
  });

  it("opens the room to VIP members and staff, and to nobody else", async () => {
    const mentor = await joinRoom(kay, session);
    expect(mentor).toMatchObject({ space_id: space, title: "Gold, live", is_host: true, is_staff: true, viewer_name: "Kay" });
    expect(mentor.group_id).toBeTruthy();
    expect(await joinRoom(tobi, session)).toMatchObject({ is_host: false, is_staff: true, viewer_name: "Tobi" });
    expect(await joinRoom(vee, session)).toMatchObject({ is_host: false, is_staff: false, viewer_name: "Vee", group_id: mentor.group_id });
    await expect(joinRoom(ada, session)).rejects.toThrow(/not_allowed/);
    await expect(joinRoom(zed, session)).rejects.toThrow(/not_allowed/);

    // A member whose VIP has run out is shut out, and so is one whose login moved to another phone.
    await db.query("update public.memberships set vip_until = now() - interval '1 minute' where user_id = $1", [vee.id]);
    await expect(joinRoom(vee, session)).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
    const elsewhere = { ...vee, session: "11111111-1111-4111-8111-111111111111" };
    await expect(joinRoom(elsewhere, session)).rejects.toThrow(/not_allowed/);
  });

  it("gives the session a chat of its own, with every rule chat has, and out of the list of groups", async () => {
    const group = (await joinRoom(vee, session)).group_id as string;
    const send = (who: TestUser, body: string) => as(db, who, (tx) => call<string>(tx, "select public.send_message($1, $2)", [group, body]));
    await send(kay, "Welcome in. Charts are up.");
    await send(vee, "Sound is good.");
    await expect(send(vee, "join t.me/fastpips")).rejects.toThrow(/no_links/);
    await expect(send(ada, "let me in")).rejects.toThrow(/not_allowed/);
    const page = await as(db, vee, async (tx) => (await tx.query<Row>("select name, body from public.chat_page($1)", [group])).rows);
    expect(page).toEqual([{ name: "Vee", body: "Sound is good." }, { name: "Kay", body: "Welcome in. Charts are up." }]);

    for (const person of [kay, vee]) {
      const list = await as(db, person, async (tx) => (await tx.query<Row>("select name from public.my_groups($1)", [space])).rows);
      expect(list.map((each) => each.name)).toEqual(["General", "VIP room"]);
    }
    // It cannot be renamed or deleted by hand, and it does not count towards the thirty.
    await expect(as(db, kay, (tx) => tx.query("select public.save_group($1, 'Mine now', null, 'everyone', 'all', $2)", [space, group]))).rejects.toThrow(/group_not_found/);
    await expect(as(db, kay, (tx) => tx.query("select public.delete_group($1)", [group]))).rejects.toThrow(/not_allowed/);
  });

  it("keeps a session on only while its broadcaster is heard from", async () => {
    expect(await beat(kay, session)).toBe("live");
    await expect(beat(vee, session)).rejects.toThrow(/not_allowed/);

    await quiet(session, 4);
    await expect(joinRoom(vee, session)).rejects.toThrow(/not_live/);
    expect((await schedule(vee)).some((each) => each.state === "live")).toBe(false);
    expect((await schedule(kay)).find((each) => each.id === session)).toMatchObject({ state: "ended" });
    expect(await forAlert(session)).toEqual([]);

    // The broadcaster comes back before anything else is started: the session carries on.
    expect(await beat(kay, session)).toBe("live");
    expect(await joinRoom(vee, session)).toMatchObject({ title: "Gold, live" });
  });

  it("lets an admin take over, and tells the first broadcaster", async () => {
    expect(await start(tobi, { session })).toBe(session);
    expect(await row(session)).toMatchObject({ host_id: tobi.id, status: "live" });
    expect(await beat(kay, session)).toBe("taken_over");
    expect(await beat(tobi, session)).toBe("live");
    expect(await joinRoom(tobi, session)).toMatchObject({ is_host: true });
    expect(await start(kay, { session })).toBe(session);
  });

  it("ends when staff say so, and closes its chat to members", async () => {
    await expect(end(vee, session)).rejects.toThrow(/not_allowed/);
    await end(tobi, session);
    expect(await row(session)).toMatchObject({ status: "ended", recording_status: "none" });
    expect((await row(session)).ended_at).not.toBeNull();
    await expect(joinRoom(vee, session)).rejects.toThrow(/not_live/);
    expect(await beat(kay, session)).toBe("ended");
    // Ending twice is nothing.
    await end(kay, session);

    const group = (await db.query<{ id: string }>("select id from public.groups where session_id = $1", [session])).rows[0].id;
    await expect(as(db, vee, (tx) => tx.query("select public.send_message($1, 'Still here?')", [group]))).rejects.toThrow(/staff_only/);
    // What was said can still be read, so a report made during the session can be looked at.
    expect((await as(db, vee, async (tx) => (await tx.query("select id from public.chat_page($1)", [group])).rows)).length).toBe(2);
    // Staff see the ended session for a while. Members do not.
    expect((await schedule(kay)).find((each) => each.id === session)).toMatchObject({ state: "ended" });
    expect((await schedule(vee)).some((each) => each.id === session)).toBe(false);
  });

  it("starts a class from the schedule, and closes a session nobody ended when the next one starts", async () => {
    await clear();
    const next = (await schedule(kay)).find((each) => each.title === "In ten minutes")?.id as string;
    expect(await start(kay, { session: next, record: false })).toBe(next);
    expect(await row(next)).toMatchObject({ status: "live", record: false, host_id: kay.id });
    expect((await waiting("alert")).map((job) => job.payload.type)).toEqual(["live"]);
    await expect(saveClass(kay, "Too late to change", at(DAY), { session: next })).rejects.toThrow(/session_not_found/);

    // The laptop was closed without ending it. Hours later the mentor goes live again.
    await quiet(next, 240);
    const again = await start(kay, { title: "Evening session" });
    expect(await row(next)).toMatchObject({ status: "ended" });
    expect(await row(again)).toMatchObject({ status: "live" });
    await end(kay, again);
  });

  it("tells the space's Telegram channel when the mentor has that switched on", async () => {
    await db.query("insert into public.telegram_links (space_id, chat_id, chat_title, chat_kind, connected_at) values ($1, -100123, 'Signals', 'channel', now())", [space]);
    await clear();
    const live = await start(kay, { title: "With Telegram" });
    expect((await waiting("telegram")).map((job) => job.payload)).toEqual([{ type: "live", session_id: live, actor: kay.id }]);
    await end(kay, live);

    await as(db, kay, (tx) => tx.query("select public.telegram_set($1, true, true, true, false)", [space]));
    await clear();
    const silent = await start(kay, { title: "Without" });
    expect(await waiting("telegram")).toEqual([]);
    await end(kay, silent);
  });

  // --- Recordings --------------------------------------------------------------------------------

  it("keeps what the server learns about a recording, and turns it into a draft lesson", async () => {
    const live = await start(kay, { title: "Recorded session" });
    await db.query("update public.live_sessions set about = 'Notes for the lesson.' where id = $1", [live]);
    await asServer(db, (tx) => tx.query("select public.live_recording($1, 'recording', 'EG_abc', $2)", [live, `${space}/${live}.mp4`]));
    expect(await row(live)).toMatchObject({ recording_status: "recording", egress_id: "EG_abc", recording_path: `${space}/${live}.mp4` });
    expect(await joinRoom(vee, live)).toMatchObject({ record: true, recording_status: "recording" });

    // The room empties: the video service says so, and the recording is finished off.
    await asServer(db, (tx) => tx.query("select public.live_finish($1)", [live]));
    expect(await row(live)).toMatchObject({ status: "ended", recording_status: "saving" });

    const lesson = await asServer(db, (tx) => call<string>(tx, "select public.live_recording_lesson($1)", [live]));
    expect(await asServer(db, (tx) => call<string>(tx, "select public.live_recording_lesson($1)", [live]))).toBe(lesson);
    const made = (await db.query<Row>("select l.title, l.description, l.source, l.published_at, l.video_status, m.title as module from public.lessons l join public.modules m on m.id = l.module_id where l.id = $1", [lesson])).rows[0];
    expect(made).toEqual({ title: "Recorded session", description: "Notes for the lesson.", source: "recording", published_at: null, video_status: "none", module: "Live recordings" });

    await asServer(db, (tx) => tx.query("select public.live_recording($1, 'saved')", [live]));
    expect(await row(live)).toMatchObject({ recording_status: "saved", recording_path: null, lesson_id: lesson });
    // Staff see what became of it. Members are not told.
    expect((await schedule(tobi)).find((each) => each.id === live)).toMatchObject({ state: "ended", recording_status: "saved", lesson_id: lesson });

    // A second recording lands in the same module.
    const second = await start(kay, { title: "Another recorded session" });
    await end(kay, second);
    await asServer(db, (tx) => call<string>(tx, "select public.live_recording_lesson($1)", [second]));
    expect((await db.query("select id from public.modules where space_id = $1 and title = 'Live recordings'", [space])).rows).toHaveLength(1);
  });

  it("keeps the server's own functions to the server", async () => {
    const any = (await schedule(kay))[0].id;
    for (const sql of [
      "select public.live_finish($1)",
      "select public.live_recording($1, 'saved')",
      "select public.live_recording_lesson($1)",
      "select * from public.live_for_alert($1)",
    ]) {
      await expect(as(db, kay, (tx) => tx.query(sql, [any]))).rejects.toThrow(/permission denied/);
    }
  });

  it("throws old sessions' chats away, and keeps recent ones", async () => {
    const old = await start(kay, { title: "Old one" });
    await end(kay, old);
    await db.query("update public.live_sessions set ended_at = now() - interval '8 days' where id = $1", [old]);
    const fresh = await start(kay, { title: "Fresh one" });
    await end(kay, fresh);
    const groups = (await db.query<{ session_id: string }>("select session_id from public.groups where session_id in ($1, $2)", [old, fresh])).rows;
    expect(groups.map((each) => each.session_id)).toEqual([fresh]);
  });

  it("refuses to go live in a space Floor has suspended", async () => {
    await db.query("update public.spaces set status = 'suspended' where id = $1", [space]);
    await expect(start(kay, { title: "While suspended" })).rejects.toThrow(/space_unavailable/);
    await db.query("update public.spaces set status = 'active' where id = $1", [space]);
  });
});
