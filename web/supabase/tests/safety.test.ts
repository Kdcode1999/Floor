import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, deviceId, newUser, type Db, type TestUser, type Tx } from "./harness";
import { claim, hasAccess, join, openSpace, TERMS } from "./helpers";

type Row = Record<string, unknown>;

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("Floor's own tools", () => {
  let db: Db;
  let floor: TestUser;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let space: string;

  const suspend = (who: TestUser, note = "Posts promise guaranteed profits.") =>
    as(db, who, (tx) => tx.query("select public.suspend_space($1, $2)", [space, note]));
  const restore = (who: TestUser) => as(db, who, (tx) => tx.query("select public.restore_space($1)", [space]));
  const report = (who: TestUser, target = space, reason = "guaranteed_profits", details: string | null = "Says 20% a week, every week.") =>
    as(db, who, (tx) => call<string>(tx, "select public.report_space($1, $2, $3)", [target, reason, details]));

  beforeAll(async () => {
    db = await createDb();
    floor = await newUser(db, "team@floor.example", "Floor Team One");
    kay = await newUser(db, "kay@example.com", "Kay");
    tobi = await newUser(db, "tobi@example.com", "Tobi");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    bola = await newUser(db, "bola@example.com", "Bola");
    await db.query("insert into public.platform_admins (user_id) values ($1)", [floor.id]);
    space = await openSpace(db, kay, "gold-desk");
    await openSpace(db, bola, "pip-room", "Pip Room");
    await join(db, tobi, "gold-desk");
    await join(db, ada, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.set_member_role($1, $2, 'admin')", [space, tobi.id]));
    await claim(db, ada, deviceId());
  });

  it("keep the web app's own pages from being claimed as a link word", async () => {
    const cee = await newUser(db, "cee@example.com", "Cee");
    for (const word of ["account", "admin", "live", "delete", "mentor"]) {
      await expect(as(db, cee, (tx) => tx.query("select public.create_space('Mine', $1, 'night', $2)", [word, TERMS]))).rejects.toThrow(/slug_reserved/);
    }
  });

  it("say who is one of Floor's own people", async () => {
    expect(await as(db, floor, (tx) => call<boolean>(tx, "select public.floor_admin()"))).toBe(true);
    for (const person of [kay, tobi, ada]) {
      expect(await as(db, person, (tx) => call<boolean>(tx, "select public.floor_admin()"))).toBe(false);
    }
    await expect(as(db, kay, (tx) => tx.query("insert into public.platform_admins (user_id) values ($1)", [kay.id]))).rejects.toThrow(/permission denied/);
  });

  it("show Floor the open reports, with the reporter's name and never their email", async () => {
    await report(ada);
    await report(tobi, space, "scam", null);
    const seen = await as(db, floor, async (tx) => (await tx.query<Row>("select * from public.admin_reports()")).rows);
    expect(seen).toHaveLength(2);
    expect(seen.map((row) => row.reporter).sort()).toEqual(["Ada O.", "Tobi"]);
    expect(seen.find((row) => row.reporter === "Ada O.")).toMatchObject({
      space_id: space, space_name: "Gold Desk", slug: "gold-desk", space_status: "active",
      reason: "guaranteed_profits", details: "Says 20% a week, every week.",
    });
    expect(JSON.stringify(seen)).not.toContain("@example.com");
    for (const person of [kay, tobi, ada]) {
      await expect(as(db, person, (tx) => tx.query("select * from public.admin_reports()"))).rejects.toThrow(/not_allowed/);
    }
    // The mentor cannot see who reported them.
    expect(await as(db, kay, async (tx) => (await tx.query("select * from public.reports")).rows)).toEqual([]);
  });

  it("let Floor find a space and see its size", async () => {
    const find = (text: string | null) => as(db, floor, async (tx) => (await tx.query<Row>("select * from public.admin_spaces($1)", [text])).rows);
    expect((await find(null)).map((row) => row.slug).sort()).toEqual(["gold-desk", "pip-room"]);
    expect(await find("GOLD")).toMatchObject([{ slug: "gold-desk", name: "Gold Desk", status: "active", members: 3, vip: 0, open_reports: 2, note: null }]);
    expect((await find("pip")).map((row) => row.slug)).toEqual(["pip-room"]);
    // What is typed is searched for as typed: a percent sign is not "anything".
    expect(await find("%")).toEqual([]);
    expect(await find("_")).toEqual([]);
    await expect(as(db, kay, (tx) => tx.query("select * from public.admin_spaces(null)"))).rejects.toThrow(/not_allowed/);
  });

  it("only let Floor suspend a space, and only with a note for the mentor", async () => {
    for (const person of [kay, tobi, ada, bola]) {
      await expect(suspend(person)).rejects.toThrow(/not_allowed/);
    }
    await expect(suspend(floor, "   ")).rejects.toThrow(/note_needed/);
    await expect(as(db, floor, (tx) => tx.query("select public.suspend_space($1, 'x')", ["00000000-0000-4000-8000-000000000000"]))).rejects.toThrow(/space_not_found/);
    expect(await hasAccess(db, ada, space)).toBe(true);
  });

  it("close a suspended space to its members and the public, and tell its staff why", async () => {
    await suspend(floor);
    expect(await hasAccess(db, ada, space)).toBe(false);
    // Staff can still get in, to see what happened and to answer for it.
    expect(await hasAccess(db, kay, space)).toBe(true);

    const cee = await newUser(db, "cee2@example.com", "Cee");
    await expect(join(db, cee, "gold-desk")).rejects.toThrow(/space_unavailable/);
    expect(await as(db, null, async (tx) => (await tx.query("select id from public.spaces where slug = 'gold-desk'")).rows)).toEqual([]);

    const note = (who: TestUser | null) => as(db, who, async (tx) => (await tx.query<Row>("select note from public.suspensions where space_id = $1", [space])).rows);
    expect(await note(kay)).toEqual([{ note: "Posts promise guaranteed profits." }]);
    expect(await note(tobi)).toEqual([{ note: "Posts promise guaranteed profits." }]);
    expect(await note(floor)).toHaveLength(1);
    expect(await note(ada)).toEqual([]);
    expect(await note(bola)).toEqual([]);
    await expect(note(null)).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("delete from public.suspensions where space_id = $1", [space]))).rejects.toThrow(/permission denied/);

    // The member still sees the space in their list, marked, so the app can say why it will not open.
    const mine = await as(db, ada, async (tx) => (await tx.query<Row>("select id, status from public.my_spaces()")).rows);
    expect(mine).toEqual([{ id: space, status: "suspended" }]);
    expect((await as(db, floor, async (tx) => (await tx.query<Row>("select status, note from public.admin_spaces('gold')")).rows))[0]).toEqual({
      status: "suspended", note: "Posts promise guaranteed profits.",
    });
  });

  it("open it again when Floor restores it", async () => {
    await expect(restore(kay)).rejects.toThrow(/not_allowed/);
    await suspend(floor, "A second look: still under review.");
    expect((await db.query<Row>("select note from public.suspensions where space_id = $1", [space])).rows).toEqual([{ note: "A second look: still under review." }]);
    await restore(floor);
    expect(await hasAccess(db, ada, space)).toBe(true);
    expect((await db.query("select 1 from public.suspensions where space_id = $1", [space])).rows).toEqual([]);
    expect(await as(db, null, async (tx) => (await tx.query("select id from public.spaces where slug = 'gold-desk'")).rows)).toHaveLength(1);
  });

  it("take dealt-with reports off the list, and let the same member report again later", async () => {
    await expect(report(ada)).rejects.toThrow(/already_reported/);
    await expect(as(db, kay, (tx) => tx.query("select public.close_reports($1)", [space]))).rejects.toThrow(/not_allowed/);
    expect(await as(db, floor, (tx) => call<number>(tx, "select public.close_reports($1)", [space]))).toBe(2);
    expect(await as(db, floor, async (tx) => (await tx.query("select * from public.admin_reports()")).rows)).toEqual([]);
    await report(ada, space, "other", "Something new.");
    expect(await as(db, floor, async (tx) => (await tx.query("select * from public.admin_reports()")).rows)).toHaveLength(1);
  });
});

describe("deleting an account", () => {
  let db: Db;
  let kay: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let space: string;
  let other: string;

  const file = (bucket: string, name: string) => db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
  const jobs = async (kind: string) =>
    (await db.query<{ space_id: string | null; payload: Row }>("select space_id, payload from private.outbox where kind = $1 and done_at is null order by id", [kind])).rows;
  const erase = (user: TestUser) => asServer(db, (tx) => tx.query("select public.erase_account($1)", [user.id]));

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    ada = await newUser(db, "ada@example.com", "Ada O.");
    bola = await newUser(db, "bola@example.com", "Bola");
    space = await openSpace(db, kay, "gold-desk");
    other = await openSpace(db, bola, "pip-room", "Pip Room");
    await join(db, ada, "gold-desk");
    await join(db, ada, "pip-room");
    await join(db, kay, "pip-room");

    await file("proofs", `${space}/${ada.id}/receipt.png`);
    await file("proofs", `${other}/${ada.id}/receipt.png`);
    await file("proofs", `${other}/${kay.id}/transfer.jpg`);
    await file("proofs", `${space}/${bola.id}/pay.png`);
    await file("posts", `${space}/vip/chart.jpg`);
    await file("posts", `${other}/everyone/hello.jpg`);
    await file("logos", `${space}/logo.jpg`);

    const basics = await as(db, kay, (tx) => call<string>(tx, "select public.save_module($1, 'Basics', null)", [space]));
    const lesson = await as(db, kay, (tx) => call<string>(tx, "select public.save_lesson($1, 'Lesson one', null, null)", [basics]));
    await asServer(db, (tx) => tx.query("select public.set_lesson_video($1, 'bunny', 'video-1', 'ready', 60)", [lesson]));
    await db.query("delete from private.outbox");
  });

  it("tells a person what goes with their account before they decide", async () => {
    const summary = (who: TestUser) => as(db, who, async (tx) => (await tx.query<Row>("select * from public.account_summary()")).rows[0]);
    expect(await summary(ada)).toEqual({ user_id: ada.id, email: "ada@example.com", space_id: null, space_name: null, members: null });
    expect(await summary(kay)).toEqual({ user_id: kay.id, email: "kay@example.com", space_id: space, space_name: "Gold Desk", members: 1 });
    await expect(as(db, null, (tx) => tx.query("select * from public.account_summary()"))).rejects.toThrow(/permission denied/);
  });

  it("can only be done by Floor's server", async () => {
    for (const person of [ada, kay]) {
      await expect(as(db, person, (tx) => tx.query("select public.erase_account($1)", [person.id]))).rejects.toThrow(/permission denied/);
    }
  });

  it("removes a member's files and their places, and leaves the spaces as they were", async () => {
    await erase(ada);
    const files = await jobs("files_delete");
    expect(files).toHaveLength(1);
    expect(files[0].space_id).toBeNull();
    expect(files[0].payload.bucket).toBe("proofs");
    expect((files[0].payload.paths as string[]).sort()).toEqual([`${space}/${ada.id}/receipt.png`, `${other}/${ada.id}/receipt.png`].sort());

    // The server then deletes the account itself, and everything that points at it goes too.
    await db.query("delete from auth.users where id = $1", [ada.id]);
    expect((await db.query("select 1 from public.memberships where user_id = $1", [ada.id])).rows).toEqual([]);
    expect((await db.query("select 1 from public.profiles where id = $1", [ada.id])).rows).toEqual([]);
    expect((await db.query<Row>("select count(*)::int as count from public.spaces")).rows[0].count).toBe(2);
    // The server does the queued job: the files leave the store.
    await db.query("delete from storage.objects where split_part(name, '/', 2) = $1", [ada.id]);
    await db.query("delete from private.outbox");
  });

  it("takes a mentor's space with it: its posts, lessons, files and video", async () => {
    // Until the space is gone the account cannot be deleted at all.
    await expect(db.query("delete from auth.users where id = $1", [kay.id])).rejects.toThrow(/violates foreign key|restrict/i);

    await erase(kay);
    const files = (await jobs("files_delete")).map((job) => [job.payload.bucket, job.payload.paths]);
    // Kay's own proof in Bola's space, then everything under Kay's space: the proofs its
    // members sent, its post pictures and its logo. Nothing from Bola's space.
    expect(files).toEqual([
      ["proofs", [`${other}/${kay.id}/transfer.jpg`]],
      ["proofs", [`${space}/${bola.id}/pay.png`]],
      ["posts", [`${space}/vip/chart.jpg`]],
      ["logos", [`${space}/logo.jpg`]],
    ]);
    expect(await jobs("video_delete")).toEqual([{ space_id: null, payload: { provider: "bunny", video_id: "video-1" } }]);

    expect((await db.query("select 1 from public.spaces where id = $1", [space])).rows).toEqual([]);
    expect((await db.query("select 1 from public.lessons where space_id = $1", [space])).rows).toEqual([]);
    expect((await db.query("select 1 from public.memberships where space_id = $1", [space])).rows).toEqual([]);
    // The jobs outlive the space, because they were never tied to it.
    expect(await jobs("files_delete")).toHaveLength(4);

    await db.query("delete from auth.users where id = $1", [kay.id]);
    expect((await db.query<Row>("select slug from public.spaces")).rows).toEqual([{ slug: "pip-room" }]);
    // Doing it twice is harmless.
    await erase(kay);
  });

  it("queues many files a few hundred at a time", async () => {
    await db.query("delete from private.outbox");
    const cee = await newUser(db, "cee@example.com", "Cee");
    await join(db, cee, "pip-room");
    for (let count = 0; count < 450; count += 1) await file("proofs", `${other}/${cee.id}/file-${count}.png`);
    await erase(cee);
    const files = await jobs("files_delete");
    expect(files.map((job) => (job.payload.paths as string[]).length)).toEqual([200, 200, 50]);
  });
});
