import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, newUser, type Db, type TestUser, type Tx } from "./harness";
import { claim, join, openSpace } from "./helpers";

type Row = Record<string, unknown>;

/** Runs as Floor's server, which holds the secret key. */
function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

const saveModule = (db: Db, by: TestUser, space: string, title: string, id: string | null = null) =>
  as(db, by, (tx) => call<string>(tx, "select public.save_module($1, $2, $3)", [space, title, id]));
const saveLesson = (db: Db, by: TestUser, module: string, title: string, words: string | null = null, id: string | null = null) =>
  as(db, by, (tx) => call<string>(tx, "select public.save_lesson($1, $2, $3, $4)", [module, title, words, id]));
const setVideo = (db: Db, lesson: string, status: string, video: string | null = "vid-1", seconds: number | null = null) =>
  asServer(db, (tx) => tx.query("select public.set_lesson_video($1, 'bunny', $2, $3, $4)", [lesson, video, status, seconds]));
const publish = (db: Db, by: TestUser, lesson: string, on = true) =>
  as(db, by, (tx) => tx.query("select public.publish_lesson($1, $2)", [lesson, on]));
const outline = (db: Db, who: TestUser, space: string) =>
  as(db, who, async (tx) => (await tx.query<Row>("select * from public.learn_outline($1)", [space])).rows);

describe("building a course", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let space: string;
  let other: string;
  let basics: string;
  let risk: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    bola = await newUser(db, "bola@example.com", "Bola");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, bola, "pip-room");
    await join(db, tobi, "gold-desk");
    await join(db, ada, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
  });

  it("is for staff of the space", async () => {
    await expect(saveModule(db, ada, space, "Basics")).rejects.toThrow(/not_allowed/);
    await expect(saveModule(db, bola, space, "Basics")).rejects.toThrow(/not_allowed/);
    basics = await saveModule(db, kay, space, " Basics ");
    risk = await saveModule(db, tobi, space, "Risk");
    await expect(saveLesson(db, ada, basics, "Hello")).rejects.toThrow(/not_allowed/);
    await expect(as(db, kay, (tx) => tx.query("insert into public.modules (space_id, title) values ($1, 'x')", [space]))).rejects.toThrow(/permission denied/);
  });

  it("adds modules and lessons at the end, and renames them", async () => {
    const one = await saveLesson(db, kay, basics, "What a pip is", "Read this first.");
    const two = await saveLesson(db, kay, basics, "Lots and leverage");
    await saveLesson(db, kay, risk, "Stops that make sense");
    await saveModule(db, kay, space, "The basics", basics);
    await saveLesson(db, kay, basics, "What a pip really is", "Read this first.", one);

    const rows = await outline(db, kay, space);
    expect(rows.map((row) => [row.module_title, row.lesson_title])).toEqual([
      ["The basics", "What a pip really is"],
      ["The basics", "Lots and leverage"],
      ["Risk", "Stops that make sense"],
    ]);
    expect(rows.every((row) => row.published === false && row.locked === false)).toBe(true);
    expect(two).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("cannot rename a module or lesson of another space by naming its id", async () => {
    const theirs = await saveModule(db, bola, other, "Theirs");
    await expect(saveModule(db, kay, space, "Mine now", theirs)).rejects.toThrow(/module_not_found/);
    const lesson = await saveLesson(db, bola, theirs, "Their lesson");
    await expect(saveLesson(db, kay, basics, "Mine now", null, lesson)).rejects.toThrow(/lesson_not_found/);
  });

  it("reorders modules and lessons, and refuses an order that leaves one out", async () => {
    await as(db, kay, (tx) => tx.query("select public.reorder_modules($1, $2)", [space, [risk, basics]]));
    expect((await outline(db, kay, space)).map((row) => row.module_title)).toEqual(["Risk", "The basics", "The basics"]);
    await expect(as(db, kay, (tx) => tx.query("select public.reorder_modules($1, $2)", [space, [risk]]))).rejects.toThrow(/bad_order/);
    await expect(as(db, kay, (tx) => tx.query("select public.reorder_modules($1, $2)", [space, [risk, risk]]))).rejects.toThrow(/bad_order/);

    const ids = (await outline(db, kay, space)).filter((row) => row.module_id === basics).map((row) => row.lesson_id as string);
    await as(db, kay, (tx) => tx.query("select public.reorder_lessons($1, $2)", [basics, [ids[1], ids[0]]]));
    const after = (await outline(db, kay, space)).filter((row) => row.module_id === basics).map((row) => row.lesson_title);
    expect(after).toEqual(["Lots and leverage", "What a pip really is"]);
    await expect(as(db, ada, (tx) => tx.query("select public.reorder_lessons($1, $2)", [basics, ids]))).rejects.toThrow(/not_allowed/);
  });

  it("moves a lesson to the end of another module", async () => {
    const lesson = (await outline(db, kay, space)).find((row) => row.lesson_title === "Lots and leverage")!.lesson_id as string;
    await saveLesson(db, kay, risk, "Lots and leverage", null, lesson);
    const inRisk = (await outline(db, kay, space)).filter((row) => row.module_id === risk).map((row) => row.lesson_title);
    expect(inRisk).toEqual(["Stops that make sense", "Lots and leverage"]);
  });

  it("deletes a lesson, and a module with its lessons, and queues their videos for removal", async () => {
    const withVideo = await saveLesson(db, kay, risk, "With a video");
    await setVideo(db, withVideo, "ready", "vid-delete-me", 600);
    await expect(as(db, ada, (tx) => tx.query("select public.delete_lesson($1)", [withVideo]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.delete_lesson($1)", [withVideo]));

    const second = await saveLesson(db, kay, risk, "Another video");
    await setVideo(db, second, "ready", "vid-in-module", 300);
    await as(db, kay, (tx) => tx.query("select public.delete_module($1)", [risk]));
    expect((await outline(db, kay, space)).map((row) => row.module_title)).toEqual(["The basics"]);

    const jobs = await db.query<{ payload: Row }>("select payload from private.outbox where kind = 'video_delete' order by id");
    expect(jobs.rows.map((job) => job.payload.video_id)).toEqual(["vid-delete-me", "vid-in-module"]);
  });
});

describe("publishing and reading lessons", () => {
  let db: Db;
  let kay: TestUser;
  let vee: TestUser;
  let free: TestUser;
  let stranger: TestUser;
  let space: string;
  let basics: string;
  let text: string;
  let video: string;
  let draft: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    vee = await newUser(db, "vee@example.com", "Vee");
    free = await newUser(db, "free@example.com", "Free");
    stranger = await newUser(db, "stranger@example.com", "Stranger");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [vee, free]) {
      await join(db, person, "gold-desk");
      await claim(db, person, `${person.id}-phone`);
    }
    await claim(db, stranger, `${stranger.id}-phone`);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
    basics = await saveModule(db, kay, space, "Basics");
    await saveModule(db, kay, space, "Coming soon");
    text = await saveLesson(db, kay, basics, "What a pip is", "A pip is the fourth decimal place.");
    video = await saveLesson(db, kay, basics, "Reading a chart");
    draft = await saveLesson(db, kay, basics, "Not ready yet", "Draft words.");
  });

  it("will not publish a lesson with nothing in it, or with a video that is not ready", async () => {
    await expect(publish(db, kay, video)).rejects.toThrow(/lesson_empty/);
    await setVideo(db, video, "uploading", "vid-chart");
    await expect(publish(db, kay, video)).rejects.toThrow(/video_not_ready/);
    await setVideo(db, video, "processing", "vid-chart");
    await expect(publish(db, kay, video)).rejects.toThrow(/video_not_ready/);
    await expect(publish(db, vee, text)).rejects.toThrow(/not_allowed/);
  });

  it("publishes a ready lesson and queues one alert, the first time only", async () => {
    await setVideo(db, video, "ready", "vid-chart", 754);
    await publish(db, kay, video);
    await publish(db, kay, text);
    await publish(db, kay, text);
    await publish(db, kay, text, false);
    await publish(db, kay, text);
    const jobs = await db.query<{ payload: Row }>("select payload from private.outbox where kind = 'alert' order by id");
    expect(jobs.rows.map((job) => [job.payload.type, job.payload.title])).toEqual([
      ["lesson", "Reading a chart"],
      ["lesson", "What a pip is"],
      ["lesson", "What a pip is"],
    ]);
  });

  it("keeps the video's place to the server alone", async () => {
    await expect(as(db, kay, (tx) => tx.query("select public.set_lesson_video($1, 'bunny', 'x', 'ready', 1)", [video]))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("update public.lessons set video_status = 'ready' where id = $1", [draft]))).rejects.toThrow(/permission denied/);
  });

  it("gives staff the whole outline, drafts and empty modules included", async () => {
    const rows = await outline(db, kay, space);
    expect(rows.map((row) => [row.module_title, row.lesson_title, row.published, row.video_status])).toEqual([
      ["Basics", "What a pip is", true, "none"],
      ["Basics", "Reading a chart", true, "ready"],
      ["Basics", "Not ready yet", false, "none"],
      ["Coming soon", null, false, null],
    ]);
  });

  it("gives a VIP member the published lessons, open", async () => {
    const rows = await outline(db, vee, space);
    expect(rows.map((row) => [row.lesson_title, row.locked, row.duration_seconds, row.has_video])).toEqual([
      ["What a pip is", false, null, false],
      ["Reading a chart", false, 754, true],
    ]);
    expect(rows[0].video_status).toBeNull();
  });

  it("gives a free member the same outline, locked", async () => {
    const rows = await outline(db, free, space);
    expect(rows.map((row) => [row.lesson_title, row.locked])).toEqual([["What a pip is", true], ["Reading a chart", true]]);
  });

  it("guards the lessons table itself: VIP only, and no drafts", async () => {
    const seen = (who: TestUser) => as(db, who, async (tx) => (await tx.query<{ title: string }>("select title from public.lessons order by position")).rows.map((row) => row.title));
    expect(await seen(vee)).toEqual(["What a pip is", "Reading a chart"]);
    expect(await seen(free)).toEqual([]);
    expect(await seen(stranger)).toEqual([]);
    expect(await seen(kay)).toHaveLength(3);
    await expect(outline(db, stranger, space)).rejects.toThrow(/not_allowed/);
  });

  it("lets only someone who may watch ask for playback", async () => {
    const playback = (who: TestUser, lesson: string) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.lesson_playback($1)", [lesson])).rows);
    expect(await playback(vee, video)).toEqual([{ space_id: space, video_provider: "bunny", video_id: "vid-chart", duration_seconds: 754 }]);
    expect(await playback(kay, video)).toHaveLength(1);
    await expect(playback(free, video)).rejects.toThrow(/not_allowed/);
    await expect(playback(stranger, video)).rejects.toThrow(/not_allowed/);
    await expect(playback(vee, text)).rejects.toThrow(/not_allowed/);
  });

  it("stops playback for a login another phone has taken over, and when VIP ends", async () => {
    const playback = (who: TestUser) => as(db, who, (tx) => tx.query("select * from public.lesson_playback($1)", [video]));
    const older = { ...vee };
    vee.session = "22222222-2222-4222-8222-222222222222";
    await claim(db, vee, `${vee.id}-phone`);
    await expect(playback(older)).rejects.toThrow(/not_allowed/);
    await playback(vee);
    await as(db, kay, (tx) => tx.query("select public.end_vip($1, $2)", [space, vee.id]));
    await expect(playback(vee)).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
  });

  it("lets only staff of the space ask to upload a video", async () => {
    const upload = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.lesson_for_upload($1)", [video])).rows);
    expect(await upload(kay)).toEqual([{ space_id: space, title: "Reading a chart", video_provider: "bunny", video_id: "vid-chart" }]);
    await expect(upload(vee)).rejects.toThrow(/not_allowed/);
    await expect(upload(stranger)).rejects.toThrow(/not_allowed/);
  });

  it("keeps each member's own progress, and never un-finishes a lesson", async () => {
    const save = (who: TestUser, seconds: number, done = false) => as(db, who, (tx) => tx.query("select public.save_progress($1, $2, $3)", [video, seconds, done]));
    await save(vee, 120);
    await save(vee, 700, true);
    await save(vee, 30);
    await expect(save(free, 10)).rejects.toThrow(/not_allowed/);
    const mine = (await outline(db, vee, space)).find((row) => row.lesson_id === video)!;
    expect([mine.seconds, mine.completed]).toEqual([30, true]);
    const kays = (await outline(db, kay, space)).find((row) => row.lesson_id === video)!;
    expect([kays.seconds, kays.completed]).toEqual([0, false]);
    const others = await as(db, kay, async (tx) => (await tx.query("select * from public.lesson_progress")).rows);
    expect(others).toEqual([]);
  });

  it("takes a lesson back to a draft when its video is replaced, until the new one is ready", async () => {
    await setVideo(db, video, "uploading", "vid-chart-2");
    expect((await outline(db, vee, space)).map((row) => row.lesson_title)).toEqual(["What a pip is"]);
    await setVideo(db, video, "ready", "vid-chart-2", 800);
    expect((await outline(db, kay, space)).find((row) => row.lesson_id === video)!.published).toBe(false);
    await publish(db, kay, video);
    expect((await outline(db, vee, space)).map((row) => row.lesson_title)).toEqual(["What a pip is", "Reading a chart"]);
  });

  it("shows published lessons in the Feed as notes, locked to free members", async () => {
    const feed = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.feed($1)", [space])).rows);
    await as(db, kay, (tx) => tx.query("select public.create_post(p_space => $1, p_kind => 'post', p_audience => 'everyone', p_title => 'Welcome')", [space]));
    await db.query("update public.posts set created_at = now() - interval '1 day'");
    const vips = await feed(vee);
    expect(vips.map((row) => [row.kind, row.title, row.locked])).toEqual([
      ["lesson", "Reading a chart", false],
      ["lesson", "What a pip is", false],
      ["post", "Welcome", false],
    ]);
    expect(vips[0].id).toBe(video);
    expect((await feed(free)).map((row) => [row.kind, row.locked])).toEqual([["lesson", true], ["lesson", true], ["post", false]]);
    expect((await feed(vee)).some((row) => row.title === "Not ready yet")).toBe(false);
  });
});

describe("the protection switches", () => {
  let db: Db;
  let kay: TestUser;
  let ada: TestUser;
  let space: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    space = await openSpace(db, kay, "gold-desk");
    await join(db, ada, "gold-desk");
  });

  const mine = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select block_capture, watermark from public.my_spaces()")).rows[0]);

  it("are on until the mentor switches them off, and come with the space", async () => {
    expect(await mine(ada)).toEqual({ block_capture: true, watermark: true });
  });

  it("come with the name the person goes by, for the name on paid video", async () => {
    const row = await as(db, ada, async (tx) => (await tx.query<Row>("select display_name from public.my_spaces()")).rows[0]);
    expect(row).toEqual({ display_name: "Ada O." });
  });

  it("are the mentor's to change, and nobody else's", async () => {
    const changed = await as(db, ada, async (tx) => (await tx.query("update public.space_settings set watermark = false where space_id = $1 returning space_id", [space])).rows);
    expect(changed).toEqual([]);
    await as(db, kay, (tx) => tx.query("update public.space_settings set block_capture = false where space_id = $1", [space]));
    expect(await mine(ada)).toEqual({ block_capture: false, watermark: true });
  });
});
