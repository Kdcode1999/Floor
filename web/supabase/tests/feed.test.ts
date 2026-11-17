import { beforeAll, describe, expect, it } from "vitest";

import { as, call, createDb, newUser, type Db, type TestUser } from "./harness";
import { claim, join, openSpace } from "./helpers";

type Row = Record<string, unknown>;

const SETUP = { pair: "eurusd", side: "buy", entry: "1.0850", stop: "1.0810", targets: ["1.0930", "1.1000"] };

/** Posts as the app does, with named arguments, so only what matters is spelled out. */
function post(db: Db, by: TestUser, space: string, fields: Row) {
  const args = { p_space: space, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`p_${key}`, value])) };
  const names = Object.keys(args);
  const sql = `select public.create_post(${names.map((name, index) => `${name} => $${index + 1}`).join(", ")})`;
  return as(db, by, (tx) => call<string>(tx, sql, Object.values(args)));
}

function feed(db: Db, who: TestUser, space: string, before: string | null = null, limit = 20) {
  return as(db, who, async (tx) => (await tx.query<Row>("select * from public.feed($1, $2, $3)", [space, before, limit])).rows);
}

describe("posting to the Feed", () => {
  let db: Db;
  let kay: TestUser;
  let tobi: TestUser;
  let ada: TestUser;
  let bola: TestUser;
  let space: string;
  let other: string;

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

  it("is for the mentor and admins, in their own space", async () => {
    await expect(post(db, ada, space, { kind: "post", title: "Hello" })).rejects.toThrow(/not_allowed/);
    await expect(post(db, bola, space, { kind: "post", title: "Hello" })).rejects.toThrow(/not_allowed/);
    await expect(post(db, kay, other, { kind: "post", title: "Hello" })).rejects.toThrow(/not_allowed/);
    expect(await post(db, tobi, space, { kind: "post", title: "From an admin" })).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("cannot be done by writing to the table directly", async () => {
    await expect(
      as(db, kay, (tx) => tx.query("insert into public.posts (space_id, kind, title) values ($1, 'post', 'Hi')", [space])),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps a setup as typed, and tidies the pair", async () => {
    const id = await post(db, kay, space, { kind: "setup", ...SETUP, pair: " eur usd " });
    const row = (await db.query<Row>("select kind, audience, pair, side, entry, stop, targets, author_id from public.posts where id = $1", [id])).rows[0];
    expect(row).toEqual({ kind: "setup", audience: "vip", pair: "EURUSD", side: "buy", entry: "1.0850", stop: "1.0810", targets: ["1.0930", "1.1000"], author_id: kay.id });
  });

  it("refuses a setup with a missing or malformed part", async () => {
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, pair: null })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, side: "long" })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, entry: "about 1.08" })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, stop: null })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, targets: [] })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, targets: ["1", "2", "3", "4"] })).rejects.toThrow(/posts_setup/);
    await expect(post(db, kay, space, { kind: "setup", ...SETUP, targets: ["1.09", "soon"] })).rejects.toThrow(/posts_setup/);
  });

  it("refuses an empty post", async () => {
    await expect(post(db, kay, space, { kind: "post", title: "  ", body: "" })).rejects.toThrow(/posts_not_empty/);
    await expect(post(db, kay, space, { kind: "note", title: "Hi" })).rejects.toThrow(/bad_kind/);
  });

  it("allows an embed in a free post only, and only from the four places", async () => {
    const video = "https://www.youtube.com/watch?v=abc123";
    await expect(post(db, kay, space, { kind: "post", audience: "vip", embed_url: video })).rejects.toThrow(/embed_needs_free_post/);
    await expect(post(db, kay, space, { kind: "post", embed_url: video })).rejects.toThrow(/embed_needs_free_post/);
    await expect(post(db, kay, space, { kind: "post", audience: "everyone", embed_url: "https://evil.example/watch" })).rejects.toThrow(/posts_embed/);
    await expect(post(db, kay, space, { kind: "post", audience: "everyone", embed_url: "http://youtube.com/watch?v=1" })).rejects.toThrow(/posts_embed/);
    await expect(post(db, kay, space, { kind: "post", audience: "everyone", embed_url: "https://youtube.com.evil.example/x" })).rejects.toThrow(/posts_embed/);
    for (const url of [video, "https://youtu.be/abc123", "https://x.com/kay/status/1", "https://www.instagram.com/p/abc/", "https://m.facebook.com/kay/posts/1", "https://fb.watch/abc/"]) {
      expect(await post(db, kay, space, { kind: "post", audience: "everyone", embed_url: url })).toBeTruthy();
    }
  });

  it("keeps a picture in the folder that matches who may see it", async () => {
    const good = { image_path: `${space}/vip/chart.jpg`, image_width: 1200, image_height: 800 };
    expect(await post(db, kay, space, { kind: "post", ...good })).toBeTruthy();
    await expect(post(db, kay, space, { kind: "post", ...good, image_path: `${space}/everyone/chart.jpg` })).rejects.toThrow(/posts_image/);
    await expect(post(db, kay, space, { kind: "post", ...good, image_path: `${other}/vip/chart.jpg` })).rejects.toThrow(/posts_image/);
    await expect(post(db, kay, space, { kind: "post", ...good, image_width: null })).rejects.toThrow(/posts_image/);
  });

  it("makes an offer a pinned, free post with a link, five at most", async () => {
    await expect(post(db, kay, space, { kind: "offer", title: "No link" })).rejects.toThrow(/posts_offer/);
    await expect(post(db, kay, space, { kind: "offer", title: "Bad link", link_url: "ftp://x" })).rejects.toThrow(/posts_offer/);
    for (let count = 1; count <= 5; count += 1) {
      await post(db, kay, space, { kind: "offer", audience: "vip", title: `Offer ${count}`, link_url: "https://example.com/deal" });
    }
    const audiences = await db.query<{ audience: string }>("select distinct audience from public.posts where kind = 'offer'");
    expect(audiences.rows).toEqual([{ audience: "everyone" }]);
    await expect(post(db, kay, space, { kind: "offer", title: "Offer 6", link_url: "https://example.com/deal" })).rejects.toThrow(/too_many_offers/);
  });

  it("queues an alert for a new setup, and for nothing else", async () => {
    const jobs = await db.query<{ kind: string; payload: Row }>("select kind, payload from private.outbox order by id");
    expect(jobs.rows.length).toBe(1);
    expect(jobs.rows[0].kind).toBe("alert");
    expect(jobs.rows[0].payload).toMatchObject({ type: "setup", audience: "vip", pair: "EURUSD", side: "buy" });
  });
});

describe("reading the Feed", () => {
  let db: Db;
  let kay: TestUser;
  let vip: TestUser;
  let free: TestUser;
  let stranger: TestUser;
  let space: string;
  let setup: string;
  let freePost: string;
  let vipPost: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    vip = await newUser(db, "vip@example.com", "Vee");
    free = await newUser(db, "free@example.com", "Free");
    stranger = await newUser(db, "stranger@example.com", "Stranger");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [vip, free]) {
      await join(db, person, "gold-desk");
      await claim(db, person, `${person.id}-phone`);
    }
    await claim(db, stranger, `${stranger.id}-phone`);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vip.id]));

    freePost = await post(db, kay, space, { kind: "post", audience: "everyone", title: "Welcome", body: "Read this first." });
    await db.query("update public.posts set created_at = now() - interval '3 hours' where id = $1", [freePost]);
    vipPost = await post(db, kay, space, { kind: "post", title: "Why I skipped gold", body: "The spread was too wide.", image_path: `${space}/vip/a.jpg`, image_width: 800, image_height: 600 });
    await db.query("update public.posts set created_at = now() - interval '2 hours' where id = $1", [vipPost]);
    setup = await post(db, kay, space, { kind: "setup", ...SETUP });
    await db.query("update public.posts set created_at = now() - interval '1 hour' where id = $1", [setup]);
    await post(db, kay, space, { kind: "offer", title: "Free VIP with my broker", body: "Open an account under my link.", link_url: "https://broker.example/kay", link_label: "Open account" });
  });

  it("gives a VIP member everything, pinned offers first, then newest first", async () => {
    const rows = await feed(db, vip, space);
    expect(rows.map((row) => [row.kind, row.locked])).toEqual([["offer", false], ["setup", false], ["post", false], ["post", false]]);
    expect(rows[1]).toMatchObject({ pair: "EURUSD", side: "buy", entry: "1.0850", stop: "1.0810", targets: ["1.0930", "1.1000"], closed: false });
    expect(rows[2]).toMatchObject({ title: "Why I skipped gold", body: "The spread was too wide.", image_path: `${space}/vip/a.jpg` });
    expect(rows[0]).toMatchObject({ title: "Free VIP with my broker", link_url: "https://broker.example/kay", link_label: "Open account" });
  });

  it("shows a free member that VIP posts exist, and nothing inside them", async () => {
    const rows = await feed(db, free, space);
    expect(rows.map((row) => [row.kind, row.locked])).toEqual([["offer", false], ["setup", true], ["post", true], ["post", false]]);
    expect(rows[1]).toMatchObject({ pair: "EURUSD", side: null, entry: null, stop: null, targets: null, body: null, update_note: null });
    expect(rows[2]).toMatchObject({ title: "Why I skipped gold", body: null, image_path: null, image_width: null });
    expect(rows[3]).toMatchObject({ title: "Welcome", body: "Read this first." });
  });

  it("guards the table itself the same way", async () => {
    const seen = await as(db, free, async (tx) => (await tx.query<{ id: string }>("select id from public.posts where space_id = $1 and kind <> 'offer'", [space])).rows);
    expect(seen.map((row) => row.id)).toEqual([freePost]);
    const all = await as(db, vip, async (tx) => (await tx.query("select id from public.posts where space_id = $1", [space])).rows);
    expect(all).toHaveLength(4);
  });

  it("is closed to people outside the space, and to the public", async () => {
    await expect(feed(db, stranger, space)).rejects.toThrow(/not_allowed/);
    await expect(as(db, null, (tx) => tx.query("select * from public.feed($1)", [space]))).rejects.toThrow(/permission denied/);
    const seen = await as(db, stranger, async (tx) => (await tx.query("select id from public.posts")).rows);
    expect(seen).toEqual([]);
  });

  it("is closed to a member whose login was taken over by another phone", async () => {
    const older = { ...free, session: free.session };
    free.session = "11111111-1111-4111-8111-111111111111";
    await claim(db, free, `${free.id}-phone`);
    await expect(feed(db, older, space)).rejects.toThrow(/not_allowed/);
    expect(await feed(db, free, space)).toHaveLength(4);
  });

  it("drops a member's VIP posts back to locked the moment VIP ends", async () => {
    await as(db, kay, (tx) => tx.query("select public.end_vip($1, $2)", [space, vip.id]));
    const rows = await feed(db, vip, space);
    expect(rows.filter((row) => row.locked)).toHaveLength(2);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vip.id]));
  });

  it("pages backwards through older posts, without the offers again", async () => {
    const first = await feed(db, vip, space, null, 2);
    expect(first.map((row) => row.kind)).toEqual(["offer", "setup", "post"]);
    const next = await feed(db, vip, space, (first[2].created_at as Date).toISOString(), 2);
    expect(next.map((row) => row.title)).toEqual(["Welcome"]);
  });

  it("lets staff add their word to a setup and close it, but never change its prices", async () => {
    await expect(as(db, vip, (tx) => tx.query("select public.update_setup($1, 'Target 1 hit')", [setup]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.update_setup($1, 'Target 1 hit, stop moved to entry')", [setup]));
    let row = (await feed(db, vip, space)).find((each) => each.id === setup)!;
    expect(row).toMatchObject({ update_note: "Target 1 hit, stop moved to entry", closed: false });
    expect(row.update_at).not.toBeNull();

    await as(db, kay, (tx) => tx.query("select public.update_setup($1, 'Closed at target 2', true)", [setup]));
    await as(db, kay, (tx) => tx.query("select public.update_setup($1, 'Closed at target 2', false)", [setup]));
    row = (await feed(db, vip, space)).find((each) => each.id === setup)!;
    expect(row).toMatchObject({ update_note: "Closed at target 2", closed: true });

    await expect(as(db, kay, (tx) => tx.query("select public.edit_post($1, 'New title', 'New words')", [setup]))).rejects.toThrow(/setups_cannot_be_edited/);
    await expect(as(db, kay, (tx) => tx.query("update public.posts set entry = '1.0700' where id = $1", [setup]))).rejects.toThrow(/permission denied/);
  });

  it("lets staff edit the words of a post, and marks it edited", async () => {
    await expect(as(db, vip, (tx) => tx.query("select public.edit_post($1, 'Hacked', null)", [freePost]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.edit_post($1, 'Welcome to Gold Desk', 'Start here.')", [freePost]));
    const row = (await feed(db, free, space)).find((each) => each.id === freePost)!;
    expect(row).toMatchObject({ title: "Welcome to Gold Desk", body: "Start here.", edited: true });
    await expect(as(db, kay, (tx) => tx.query("select public.update_setup($1, 'x')", [freePost]))).rejects.toThrow(/not_a_setup/);
  });

  it("takes a deleted post out of the Feed for everyone", async () => {
    await expect(as(db, free, (tx) => tx.query("select public.delete_post($1)", [vipPost]))).rejects.toThrow(/not_allowed/);
    await as(db, kay, (tx) => tx.query("select public.delete_post($1)", [vipPost]));
    expect((await feed(db, vip, space)).some((row) => row.id === vipPost)).toBe(false);
    const direct = await as(db, kay, async (tx) => (await tx.query("select id from public.posts where id = $1", [vipPost])).rows);
    expect(direct).toEqual([]);
    await expect(as(db, kay, (tx) => tx.query("select public.delete_post($1)", [vipPost]))).rejects.toThrow(/post_not_found/);
  });

  it("shows visitors a preview: free posts with their opening words, VIP posts locked", async () => {
    const rows = await as(db, null, async (tx) => (await tx.query<Row>("select * from public.space_preview($1)", ["Gold-Desk "])).rows);
    expect(rows.map((row) => [row.kind, row.locked, row.title, row.pair, row.snippet])).toEqual([
      ["setup", true, null, "EURUSD", null],
      ["post", false, "Welcome to Gold Desk", null, "Start here."],
    ]);
    await db.query("update public.spaces set status = 'suspended' where id = $1", [space]);
    expect(await as(db, null, async (tx) => (await tx.query("select * from public.space_preview($1)", ["gold-desk"])).rows)).toEqual([]);
    await db.query("update public.spaces set status = 'active' where id = $1", [space]);
  });
});

describe("pictures in posts", () => {
  let db: Db;
  let kay: TestUser;
  let vip: TestUser;
  let free: TestUser;
  let space: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    vip = await newUser(db, "vip@example.com", "Vee");
    free = await newUser(db, "free@example.com", "Free");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [vip, free]) {
      await join(db, person, "gold-desk");
      await claim(db, person, `${person.id}-phone`);
    }
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vip.id]));
  });

  const upload = (by: TestUser, name: string) =>
    as(db, by, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('posts', $1)", [name]));
  const sees = (who: TestUser) =>
    as(db, who, async (tx) => (await tx.query<{ name: string }>("select name from storage.objects where bucket_id = 'posts' order by name")).rows.map((row) => row.name));

  it("are uploaded by staff only, into one of the two folders", async () => {
    await upload(kay, `${space}/vip/chart.jpg`);
    await upload(kay, `${space}/everyone/welcome.jpg`);
    await expect(upload(free, `${space}/everyone/mine.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(kay, `${space}/secret/x.jpg`)).rejects.toThrow(/row-level security/);
    await expect(upload(kay, `${space}/x.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("can be opened only by those who may open the post", async () => {
    expect(await sees(vip)).toEqual([`${space}/everyone/welcome.jpg`, `${space}/vip/chart.jpg`]);
    expect(await sees(free)).toEqual([`${space}/everyone/welcome.jpg`]);
  });
});

describe("the server's job queue", () => {
  let db: Db;
  let kay: TestUser;
  let space: string;

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    space = await openSpace(db, kay, "gold-desk");
    await post(db, kay, space, { kind: "setup", ...SETUP });
    await post(db, kay, space, { kind: "setup", ...SETUP, pair: "XAUUSD" });
  });

  const asServer = <T>(run: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return run(tx);
    }) as Promise<T>;
  const claimJobs = (limit = 20) => asServer(async (tx) => (await tx.query<{ id: number; attempts: number; payload: Row }>("select * from public.claim_outbox($1)", [limit])).rows);

  it("cannot be touched by anyone signed in", async () => {
    await expect(as(db, kay, (tx) => tx.query("select * from public.claim_outbox(5)"))).rejects.toThrow(/permission denied/);
    await expect(as(db, kay, (tx) => tx.query("select * from private.outbox"))).rejects.toThrow(/permission denied/);
  });

  it("hands each job to one taker", async () => {
    const first = await claimJobs(1);
    const second = await claimJobs(5);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].id).not.toBe(second[0].id);
    expect(await claimJobs()).toHaveLength(0);
  });

  it("finishes a job that worked, and tries a failed one again later", async () => {
    const ids = (await db.query<{ id: number }>("select id from private.outbox order by id")).rows.map((row) => row.id);
    await asServer((tx) => tx.query("select public.finish_outbox($1)", [ids[0]]));
    await asServer((tx) => tx.query("select public.finish_outbox($1, 'The push service is down')", [ids[1]]));
    const rows = (await db.query<{ done: boolean; last_error: string | null; later: boolean }>("select done_at is not null as done, last_error, run_after > now() as later from private.outbox order by id")).rows;
    expect(rows).toEqual([
      { done: true, last_error: null, later: false },
      { done: false, last_error: "The push service is down", later: true },
    ]);
    expect(await claimJobs()).toHaveLength(0);

    await db.query("update private.outbox set run_after = now() where id = $1", [ids[1]]);
    const again = await claimJobs();
    expect(again.map((job) => [job.id, job.attempts])).toEqual([[ids[1], 2]]);
  });

  it("hands out a job again when its taker never reported back", async () => {
    await db.query("update private.outbox set claimed_at = now() - interval '6 minutes' where done_at is null");
    expect(await claimJobs()).toHaveLength(1);
  });

  it("gives up on a job after five tries", async () => {
    const id = (await db.query<{ id: number }>("select id from private.outbox where done_at is null")).rows[0].id;
    await db.query("update private.outbox set attempts = 5 where id = $1", [id]);
    await asServer((tx) => tx.query("select public.finish_outbox($1, 'Still down')", [id]));
    const row = (await db.query<{ done: boolean; last_error: string }>("select done_at is not null as done, last_error from private.outbox where id = $1", [id])).rows[0];
    expect(row).toEqual({ done: true, last_error: "Still down" });
  });
});
