import { describe, expect, it } from "vitest";

import { nameProblem } from "../src/features/account/name";
import { hasLink, hasPhone } from "../src/features/chat/logic";
import { createBackend, SAMPLE_ANSWERS } from "../src/sample/backend";
import { CONNECTS_AFTER_MS } from "../src/sample/functions/telegram";
import { PEOPLE, SPACE } from "../src/sample/people";
import { createWorld, GROUPS, LESSONS, POSTS, REPORTED_MESSAGE, SESSIONS } from "../src/sample/seed";
import { SAMPLE_PEOPLE } from "../src/sample/session";
import { toBase64 } from "../src/sample/storage";

const START = Date.parse("2026-11-18T09:00:00Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A fresh sample space, a clock that can be moved, and a way to ask as any of its people. */
function sample() {
  const clock = { now: START };
  let who: string = PEOPLE.kay;
  const world = createWorld(START);
  const backend = createBackend({ world, who: () => who, assetUri: (asset) => `asset://${asset}`, now: () => clock.now });
  const as = (person: keyof typeof PEOPLE) => {
    who = PEOPLE[person];
    return backend;
  };
  return { world, backend, clock, as };
}

type Rows = Record<string, unknown>[];
const rows = async (asked: PromiseLike<{ data: unknown; error: unknown }>): Promise<Rows> => {
  const { data, error } = await asked;
  expect(error).toBeNull();
  return data as Rows;
};
const refusal = async (asked: PromiseLike<{ data: unknown; error: { message: string; code: string } | null }>) => (await asked).error;

// --- The sample must be able to answer everything the app asks -----------------------------------

describe("what the app asks for", () => {
  // Every source file of the app but the sample's own, read as text.
  const files = import.meta.glob<string>("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
  const source = Object.entries(files)
    .filter(([path]) => !path.includes("/src/sample/"))
    .map(([, text]) => text)
    .join("\n");
  const named = (pattern: RegExp) => [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();

  it("every database function the app calls is one the sample answers", () => {
    // The two the sign-in store calls are named in variables. The sample has no sign-in.
    const called = named(/\.rpc\(\s*"([a-z_]+)"/g);
    expect(called.length).toBeGreaterThan(40);
    expect(called.filter((name) => !SAMPLE_ANSWERS.functions.includes(name))).toEqual([]);
  });

  it("every table and file store the app reaches for is one the sample has", () => {
    const tables: string[] = [];
    const stores: string[] = [];
    for (const match of source.matchAll(/\.from\(\s*"([a-z_]+)"/g)) {
      const before = source.slice(Math.max(0, match.index - 40), match.index).trimEnd();
      (before.endsWith("storage") ? stores : tables).push(match[1]);
    }
    expect(new Set(tables).size).toBeGreaterThan(5);
    expect([...new Set(tables)].filter((name) => !SAMPLE_ANSWERS.tables.includes(name))).toEqual([]);
    expect([...new Set(stores)].sort()).toEqual([...SAMPLE_ANSWERS.stores].sort());
  });

  it("every call to Floor's server is one the sample answers", () => {
    expect(named(/"(\/api\/[a-z/]+)"/g)).toEqual([...SAMPLE_ANSWERS.routes].sort());
  });
});

// --- What the sample holds -----------------------------------------------------------------------

describe("the sample space as it starts", () => {
  it("has members doing only what members may", () => {
    const { world } = sample();
    const staff = [PEOPLE.kay, PEOPLE.tobi] as string[];
    for (const message of world.messages) {
      if (staff.includes(message.user_id)) continue;
      expect(message.image_path, message.body ?? "").toBeNull();
      expect(hasLink(message.body ?? ""), message.body ?? "").toBe(false);
      expect(hasPhone(message.body ?? ""), message.body ?? "").toBe(false);
    }
    for (const profile of world.profiles) {
      if (profile.display_name !== "Member") expect(nameProblem(profile.display_name), profile.display_name).toBeNull();
    }
  });

  it("has every picture it points to", () => {
    const { world } = sample();
    const has = (bucket: string, path: string | null) => path === null || world.files.some((file) => file.bucket === bucket && file.path === path);
    expect(world.posts.every((post) => has("posts", post.image_path))).toBe(true);
    expect(world.messages.every((message) => has("chat", message.image_path))).toBe(true);
    expect(world.access_requests.every((request) => has("proofs", request.proof_path))).toBe(true);
  });

  it("can be looked at as three of its people", () => {
    const { world } = sample();
    expect(SAMPLE_PEOPLE.map((person) => person.persona)).toEqual(["mentor", "vip", "free"]);
    for (const person of SAMPLE_PEOPLE) {
      expect(world.users.find((user) => user.id === person.id)?.email).toBe(person.email);
    }
  });
});

// --- The Feed ------------------------------------------------------------------------------------

describe("the Feed", () => {
  it("shows the mentor everything, the pinned offer first", async () => {
    const { as } = sample();
    const feed = await rows(as("kay").rpc("feed", { p_space: SPACE, p_before: null, p_limit: 20 }));
    expect(feed[0]).toMatchObject({ id: POSTS.offer, kind: "offer", locked: false });
    expect(feed.some((post) => post.locked)).toBe(false);
    const times = feed.slice(1).map((post) => Date.parse(String(post.created_at)));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(feed.filter((post) => post.kind === "lesson").map((post) => post.id)).toContain(LESSONS.stops);
    // A draft is not announced.
    expect(feed.map((post) => post.id)).not.toContain(LESSONS.sitOut);
  });

  it("gives a free member only a glimpse of what is for VIP", async () => {
    const { as } = sample();
    const feed = await rows(as("newcomer").rpc("feed", { p_space: SPACE }));
    const setup = feed.find((post) => post.id === POSTS.eurusd);
    expect(setup).toMatchObject({ locked: true, pair: "EURUSD", entry: null, stop: null, targets: null, body: null, side: null });
    expect(feed.find((post) => post.id === POSTS.plan)).toMatchObject({ locked: true, title: "Weekly plan: what I am watching", body: null });
    expect(feed.find((post) => post.id === POSTS.gbpjpy)).toMatchObject({ locked: false, entry: "191.40", closed: true });
    expect(feed.find((post) => post.id === POSTS.gold)).toMatchObject({ locked: false, image_width: 1280 });
    expect(feed.filter((post) => post.kind === "lesson").every((post) => post.locked)).toBe(true);
    // And the table itself keeps a VIP post from them.
    expect(await rows(as("newcomer").from("posts").select("id, title").eq("id", POSTS.plan).limit(1))).toEqual([]);
    expect(await rows(as("vee").from("posts").select("id, title").eq("id", POSTS.plan).limit(1))).toHaveLength(1);
  });

  it("pages back through older posts", async () => {
    const { as } = sample();
    const first = await rows(as("vee").rpc("feed", { p_space: SPACE, p_limit: 3 }));
    expect(first.map((post) => post.kind)).toEqual(["offer", "setup", "post", "lesson"]);
    const older = await rows(as("vee").rpc("feed", { p_space: SPACE, p_before: first[3].created_at, p_limit: 3 }));
    expect(older.some((post) => post.kind === "offer")).toBe(false);
    expect(older.every((post) => Date.parse(String(post.created_at)) < Date.parse(String(first[3].created_at)))).toBe(true);
  });

  it("lets staff post, and holds a post to the table's rules", async () => {
    const { as, world } = sample();
    expect(await refusal(as("vee").rpc("create_post", { p_space: SPACE, p_kind: "post", p_body: "Hello" }))).toMatchObject({ message: "not_allowed", code: "42501" });
    const setup = { p_space: SPACE, p_kind: "setup", p_audience: "vip", p_pair: " gbp usd ", p_side: "buy", p_entry: "1.2700", p_stop: "1.2650", p_targets: ["1.2800"] };
    const made = await as("tobi").rpc("create_post", setup);
    expect(made.error).toBeNull();
    expect(world.posts.find((post) => post.id === made.data)).toMatchObject({ pair: "GBPUSD", audience: "vip", author_id: PEOPLE.tobi });
    expect((await refusal(as("kay").rpc("create_post", { ...setup, p_entry: "about 1.27" })))?.message).toContain("posts_setup");
    expect((await refusal(as("kay").rpc("create_post", { p_space: SPACE, p_kind: "post" })))?.message).toContain("posts_not_empty");
    expect((await refusal(as("kay").rpc("create_post", { p_space: SPACE, p_kind: "offer", p_title: "Deal", p_link_url: "example.com" })))?.message).toContain("posts_offer");
    expect((await refusal(as("kay").rpc("create_post", { p_space: SPACE, p_kind: "post", p_audience: "vip", p_embed_url: "https://youtu.be/abc" })))?.message).toBe("embed_needs_free_post");
    // The channel was told about the new setup.
    const telegram = await rows(as("kay").rpc("telegram_status", { p_space: SPACE }));
    expect(telegram[0].last_sent_at).toBe(new Date(START).toISOString());
  });

  it("lets a setup be updated and closed, but never reworded", async () => {
    const { as, clock } = sample();
    expect((await refusal(as("kay").rpc("edit_post", { p_post: POSTS.eurusd, p_title: "New" })))?.message).toBe("setups_cannot_be_edited");
    clock.now += MINUTE;
    expect((await as("kay").rpc("update_setup", { p_post: POSTS.eurusd, p_note: "Target 1 hit", p_closed: true })).error).toBeNull();
    const [post] = await rows(as("kay").from("posts").select("update_note, update_at, closed_at").eq("id", POSTS.eurusd).limit(1));
    expect(post).toEqual({ update_note: "Target 1 hit", update_at: new Date(clock.now).toISOString(), closed_at: new Date(clock.now).toISOString() });
    // Closed stays closed.
    await as("kay").rpc("update_setup", { p_post: POSTS.eurusd, p_note: "Target 1 hit", p_closed: false });
    expect((await rows(as("kay").from("posts").select("closed_at").eq("id", POSTS.eurusd).limit(1)))[0].closed_at).not.toBeNull();
    expect((await as("kay").rpc("delete_post", { p_post: POSTS.eurusd })).error).toBeNull();
    expect((await refusal(as("kay").rpc("delete_post", { p_post: POSTS.eurusd })))?.message).toBe("post_not_found");
  });
});

// --- Learn ---------------------------------------------------------------------------------------

describe("Learn", () => {
  it("shows staff the whole course, drafts and all", async () => {
    const { as } = sample();
    const outline = await rows(as("kay").rpc("learn_outline", { p_space: SPACE }));
    expect(outline.map((row) => row.lesson_id)).toEqual([LESSONS.chart, LESSONS.stops, LESSONS.size, LESSONS.firstHour, LESSONS.sitOut]);
    expect(outline[4]).toMatchObject({ published: false, video_status: "none", locked: false });
    expect(outline[0]).toMatchObject({ has_video: true, video_status: "ready", duration_seconds: 16 });
  });

  it("shows a VIP member the published lessons and how far they have got", async () => {
    const { as } = sample();
    const outline = await rows(as("vee").rpc("learn_outline", { p_space: SPACE }));
    expect(outline).toHaveLength(4);
    expect(outline.map((row) => [row.completed, row.seconds, row.locked, row.video_status])).toEqual([
      [true, 16, false, null],
      [false, 6, false, null],
      [true, 0, false, null],
      [false, 0, false, null],
    ]);
  });

  it("shows a free member what the course holds, locked", async () => {
    const { as } = sample();
    const outline = await rows(as("newcomer").rpc("learn_outline", { p_space: SPACE }));
    expect(outline).toHaveLength(4);
    expect(outline.every((row) => row.locked === true && row.seconds === 0 && row.completed === false)).toBe(true);
    expect(await rows(as("newcomer").from("lessons").select("id").eq("id", LESSONS.chart).limit(1))).toEqual([]);
    expect((await as("newcomer").server("/api/video/play", { lessonId: LESSONS.chart }))).toEqual({ ok: false, code: "not_allowed" });
    expect((await refusal(as("newcomer").rpc("save_progress", { p_lesson: LESSONS.chart, p_seconds: 5 })))?.code).toBe("42501");
  });

  it("plays a lesson for someone who may watch, and remembers where they stopped", async () => {
    const { as } = sample();
    const played = await as("vee").server("/api/video/play", { lessonId: LESSONS.firstHour });
    expect(played).toEqual({ ok: true, data: { url: "asset://lesson", poster: "asset://poster", expires: START / 1000 + 6 * 3600 } });
    await as("vee").rpc("save_progress", { p_lesson: LESSONS.firstHour, p_seconds: 9.4, p_completed: false });
    await as("vee").rpc("save_progress", { p_lesson: LESSONS.chart, p_seconds: 2, p_completed: false });
    const outline = await rows(as("vee").rpc("learn_outline", { p_space: SPACE }));
    expect(outline.find((row) => row.lesson_id === LESSONS.firstHour)).toMatchObject({ seconds: 9.4, completed: false });
    // Done stays done.
    expect(outline.find((row) => row.lesson_id === LESSONS.chart)).toMatchObject({ seconds: 2, completed: true });
    // A text lesson has nothing to play.
    expect(await as("vee").server("/api/video/play", { lessonId: LESSONS.size })).toEqual({ ok: false, code: "not_allowed" });
  });

  it("lets staff build the course", async () => {
    const { as } = sample();
    const module = await as("tobi").rpc("save_module", { p_space: SPACE, p_title: "  Risk  " });
    expect(module.error).toBeNull();
    expect((await refusal(as("tobi").rpc("save_module", { p_space: SPACE, p_title: " " })))?.message).toContain("modules_title");
    const lesson = await as("tobi").rpc("save_lesson", { p_module: module.data, p_title: "One trade at a time", p_description: null });
    expect((await refusal(as("tobi").rpc("publish_lesson", { p_lesson: lesson.data, p_published: true })))?.message).toBe("lesson_empty");
    await as("tobi").rpc("save_lesson", { p_module: module.data, p_title: "One trade at a time", p_description: "Notes.", p_lesson: lesson.data });
    expect((await as("tobi").rpc("publish_lesson", { p_lesson: lesson.data, p_published: true })).error).toBeNull();
    const outline = await rows(as("vee").rpc("learn_outline", { p_space: SPACE }));
    expect(outline[outline.length - 1]).toMatchObject({ module_title: "Risk", lesson_title: "One trade at a time" });

    const modules = [...new Set(outline.map((row) => String(row.module_id)))];
    expect((await refusal(as("tobi").rpc("reorder_modules", { p_space: SPACE, p_modules: modules.slice(1) })))?.message).toBe("bad_order");
    expect((await as("tobi").rpc("reorder_modules", { p_space: SPACE, p_modules: [...modules].reverse() })).error).toBeNull();
    expect((await rows(as("vee").rpc("learn_outline", { p_space: SPACE })))[0].module_title).toBe("Risk");

    expect((await as("tobi").rpc("delete_module", { p_module: module.data })).error).toBeNull();
    expect((await refusal(as("tobi").rpc("delete_lesson", { p_lesson: lesson.data })))?.message).toBe("lesson_not_found");
    // A module with nothing in it is there for staff and not for members.
    await as("tobi").rpc("save_module", { p_space: SPACE, p_title: "Empty" });
    expect((await rows(as("tobi").rpc("learn_outline", { p_space: SPACE }))).some((row) => row.module_title === "Empty" && row.lesson_id === null)).toBe(true);
    expect((await rows(as("vee").rpc("learn_outline", { p_space: SPACE }))).some((row) => row.module_title === "Empty")).toBe(false);
  });

  it("cannot take a video, and says it is the sample", async () => {
    const { as } = sample();
    expect(await as("kay").server("/api/video/upload", { lessonId: LESSONS.sitOut })).toEqual({ ok: false, code: "sample" });
    expect(await as("vee").server("/api/video/upload", { lessonId: LESSONS.sitOut })).toEqual({ ok: false, code: "not_allowed" });
    expect(await as("kay").server("/api/video/status", { lessonId: LESSONS.chart })).toEqual({ ok: true, data: { status: "ready", seconds: 16 } });
  });
});

// --- The mentor's tools ----------------------------------------------------------------------------

describe("the mentor's tools", () => {
  it("counts the members and lists them with VIP about to end first", async () => {
    const { as } = sample();
    expect(await rows(as("kay").rpc("member_counts", { p_space: SPACE }))).toEqual([{ members: 12, vip: 3, expiring: 1, removed: 1 }]);
    const members = await rows(as("kay").rpc("list_members", { p_space: SPACE, p_search: null, p_limit: 50 }));
    expect(members.slice(0, 5).map((member) => member.name)).toEqual(["Ada O.", "Chidi", "Vee", "Kay", "Tobi"]);
    expect(members[members.length - 1]).toMatchObject({ name: "Dayo", status: "banned", vip: false });
    expect((await rows(as("kay").rpc("list_members", { p_space: SPACE, p_search: " ADA ", p_limit: 50 }))).map((member) => member.name)).toEqual(["Ada O."]);
    expect(await rows(as("kay").rpc("list_members", { p_space: SPACE, p_user: PEOPLE.vee, p_limit: 1 }))).toHaveLength(1);
    expect((await refusal(as("vee").rpc("list_members", { p_space: SPACE })))?.message).toBe("not_allowed");
  });

  it("answers requests for VIP", async () => {
    const { as, clock } = sample();
    const waiting = await rows(as("tobi").rpc("list_requests", { p_space: SPACE }));
    expect(waiting.map((request) => request.name)).toEqual(["Zainab", "Femi", "Ngozi A.", "Sam K."]);
    const sam = waiting[3];
    expect(sam).toMatchObject({ kind: "payment", days: 30, note: "Paid by bank transfer this morning" });
    expect(await rows(as("tobi").storage.from("proofs").createSignedUrl(String(sam.proof_path), 300) as never)).toEqual({ signedUrl: "asset://proof" });
    expect((await as("vee").storage.from("proofs").createSignedUrl(String(sam.proof_path), 300)).error?.message).toBe("Object not found");

    const approved = await as("tobi").rpc("approve_request", { p_request: sam.id });
    expect(approved.data).toBe(new Date(clock.now + 30 * DAY).toISOString());
    expect((await refusal(as("kay").rpc("approve_request", { p_request: sam.id })))?.message).toBe("already_decided");
    expect((await as("kay").rpc("decline_request", { p_request: waiting[0].id, p_reason: " Wrong broker " })).error).toBeNull();
    expect(await rows(as("kay").rpc("list_requests", { p_space: SPACE }))).toHaveLength(2);
    // Sam now sees what is for VIP.
    expect((await rows(as("sam").rpc("feed", { p_space: SPACE }))).some((post) => post.locked)).toBe(false);
  });

  it("gives VIP, ends it, makes admins and removes people, each by who may", async () => {
    const { as, clock, world } = sample();
    const member = (key: keyof typeof PEOPLE) => world.memberships.find((row) => row.user_id === PEOPLE[key] && row.space_id === SPACE);
    // More time goes on top of what is left.
    const until = Date.parse(member("vee")?.vip_until ?? "");
    await as("tobi").rpc("grant_vip", { p_space: SPACE, p_user: PEOPLE.vee, p_days: 7 });
    expect(Date.parse(member("vee")?.vip_until ?? "")).toBe(until + 7 * DAY);
    expect((await refusal(as("tobi").rpc("grant_vip", { p_space: SPACE, p_user: PEOPLE.vee, p_days: 0 })))?.message).toBe("bad_days");
    await as("tobi").rpc("end_vip", { p_space: SPACE, p_user: PEOPLE.vee });
    expect(member("vee")?.vip_until).toBe(new Date(clock.now).toISOString());

    expect((await refusal(as("tobi").rpc("set_member_role", { p_space: SPACE, p_user: PEOPLE.chidi, p_role: "admin" })))?.message).toBe("not_allowed");
    expect((await as("kay").rpc("set_member_role", { p_space: SPACE, p_user: PEOPLE.chidi, p_role: "admin" })).error).toBeNull();
    // An admin cannot remove another admin, or the mentor.
    expect((await refusal(as("tobi").rpc("ban_member", { p_space: SPACE, p_user: PEOPLE.chidi })))?.message).toBe("not_allowed");
    expect((await refusal(as("kay").rpc("ban_member", { p_space: SPACE, p_user: PEOPLE.kay })))?.message).toBe("not_allowed");
    expect((await as("tobi").rpc("ban_member", { p_space: SPACE, p_user: PEOPLE.sam })).error).toBeNull();
    expect(member("sam")).toMatchObject({ status: "banned", vip_until: null });
    expect((await rows(as("kay").rpc("list_requests", { p_space: SPACE }))).some((request) => request.name === "Sam K.")).toBe(false);
    expect((await refusal(as("sam").rpc("feed", { p_space: SPACE })))?.message).toBe("not_allowed");
    expect((await as("kay").rpc("unban_member", { p_space: SPACE, p_user: PEOPLE.sam })).error).toBeNull();
    expect((await refusal(as("kay").rpc("unban_member", { p_space: SPACE, p_user: PEOPLE.sam })))?.message).toBe("member_not_found");
  });

  it("makes and revokes invite codes", async () => {
    const { as } = sample();
    const before = await rows(as("kay").from("invite_codes").select("id, code, days, max_uses, used_count, expires_at, revoked").eq("space_id", SPACE).order("created_at", { ascending: false }).limit(100));
    expect(before.map((code) => code.code)).toEqual(["WELCOME7", "FRIENDS30", "TRYVIP22", "LAUNCH24"]);
    const made = await as("tobi").rpc("create_invite_code", { p_space: SPACE, p_days: 7, p_max_uses: 5 });
    expect(String(made.data)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await refusal(as("tobi").rpc("create_invite_code", { p_space: SPACE, p_days: 7, p_code: "welcome7" })))?.message).toBe("code_taken");
    const after = await rows(as("kay").from("invite_codes").select("id, code, revoked").eq("space_id", SPACE).order("created_at", { ascending: false }).limit(100));
    expect(after[0]).toMatchObject({ code: made.data, revoked: false });
    expect((await as("kay").rpc("revoke_invite_code", { p_code_id: after[0].id })).error).toBeNull();
    expect(await rows(as("vee").from("invite_codes").select("id").eq("space_id", SPACE))).toEqual([]);
  });

  it("lets only the mentor change the price, the payment details and the look", async () => {
    const { as } = sample();
    const change = { tagline: "New line", vip_price_cents: 3_000_000, vip_currency: "NGN", vip_days: 30, broker_name: null };
    expect(await rows(as("tobi").from("spaces").update(change).eq("id", SPACE).select("id"))).toEqual([]);
    expect(await rows(as("kay").from("spaces").update(change).eq("id", SPACE).select("id"))).toEqual([{ id: SPACE }]);
    expect((await as("kay").from("spaces").update({ ...change, vip_currency: "naira" }).eq("id", SPACE).select("id")).error).toMatchObject({ code: "23514" });
    expect((await as("kay").from("spaces").update({ owner_id: PEOPLE.tobi }).eq("id", SPACE).select("id")).error).toMatchObject({ code: "42501" });
    const [space] = await rows(as("vee").from("spaces").select("slug, tagline, vip_price_cents, vip_currency, vip_days, broker_name").eq("id", SPACE).limit(1));
    expect(space).toEqual({ slug: "your-academy", tagline: "New line", vip_price_cents: 3_000_000, vip_currency: "NGN", vip_days: 30, broker_name: null });

    expect(await rows(as("kay").from("space_settings").update({ block_capture: true }).eq("space_id", SPACE).select("space_id"))).toHaveLength(1);
    expect((await rows(as("vee").rpc("my_spaces")))[0]).toMatchObject({ block_capture: true, watermark: true, role: "member" });
    expect((await as("kay").from("space_settings").update({ payment_link: "http://pay.example" }).eq("space_id", SPACE).select("space_id")).error?.message).toContain("space_settings_payment_link");
    // Someone removed from the space no longer reads how to pay.
    expect(await rows(as("dayo").from("space_settings").select("payment_instructions").eq("space_id", SPACE).limit(1))).toEqual([]);
    expect((await as("kay").from("spaces").select("nothing").eq("id", SPACE)).error?.code).toBe("42703");
  });
});

// --- Groups and chat -------------------------------------------------------------------------------

describe("groups and chat", () => {
  it("lists the groups each person may see, with what is waiting", async () => {
    const { as } = sample();
    const mentor = await rows(as("kay").rpc("my_groups", { p_space: SPACE }));
    expect(mentor.map((group) => [group.name, group.unread])).toEqual([["General", 1], ["VIP room", 1], ["Announcements", 0], ["Lagos meetup", 0]]);
    expect(mentor[0]).toMatchObject({ last_name: "Chidi", last_body: "See you all there.", last_has_image: false, can_post: true });

    const vip = await rows(as("vee").rpc("my_groups", { p_space: SPACE }));
    expect(vip.map((group) => [group.name, group.unread, group.can_post])).toEqual([["General", 0, true], ["VIP room", 1, true], ["Announcements", 1, false], ["Lagos meetup", 0, true]]);

    // A free member sees the VIP room listed and locked, never the invited group, and counts from the hour they joined.
    const free = await rows(as("newcomer").rpc("my_groups", { p_space: SPACE }));
    expect(free.map((group) => [group.name, group.can_open, group.unread])).toEqual([["General", true, 3], ["VIP room", false, 0], ["Announcements", true, 1]]);
    expect(free[1]).toMatchObject({ last_at: null, last_name: null, last_body: null, can_post: false });
    expect((await refusal(as("newcomer").rpc("chat_page", { p_group: GROUPS.vip })))?.message).toBe("not_allowed");
    expect((await refusal(as("bola").rpc("chat_page", { p_group: GROUPS.meetup })))?.message).toBe("not_allowed");
  });

  it("opens a conversation newest first and marks it read", async () => {
    const { as } = sample();
    const page = await rows(as("kay").rpc("chat_page", { p_group: GROUPS.general, p_before: null, p_limit: 40 }));
    expect(page).toHaveLength(14);
    expect(page[0]).toMatchObject({ name: "Chidi", role: "member", mine: false, deleted: false });
    expect(page[1]).toMatchObject({ name: "Kay", role: "mentor", mine: true, reply_name: "Bola", reply_body: "What time is the session tomorrow?" });
    expect(page.find((message) => message.image_path)).toMatchObject({ image_width: 1280, image_height: 800 });
    expect(await rows(as("kay").storage.from("chat").createSignedUrl(String(page.find((message) => message.image_path)?.image_path), 3600) as never)).toEqual({ signedUrl: "asset://chart2" });
    const older = await rows(as("kay").rpc("chat_page", { p_group: GROUPS.general, p_before: page[11].created_at, p_limit: 40 }));
    expect(older.map((message) => message.name)).toEqual(["Bola", "Kay"]);

    await as("kay").rpc("mark_read", { p_group: GROUPS.general });
    expect((await rows(as("kay").rpc("my_groups", { p_space: SPACE })))[0].unread).toBe(0);
  });

  it("holds members to the rules about what they may write", async () => {
    const { as } = sample();
    const send = (person: keyof typeof PEOPLE, group: string, more: Record<string, unknown>) =>
      refusal(as(person).rpc("send_message", { p_group: group, p_body: null, p_reply_to: null, p_image_path: null, p_image_width: null, p_image_height: null, ...more }));
    expect((await send("bola", GROUPS.general, { p_body: "join my channel t.me/fastpips" }))?.message).toBe("no_links");
    expect((await send("bola", GROUPS.general, { p_body: "call 0803 123 4567" }))?.message).toBe("no_numbers");
    expect((await send("bola", GROUPS.general, { p_body: "  " }))?.message).toBe("message_empty");
    expect((await send("bola", GROUPS.announcements, { p_body: "Hello" }))?.message).toBe("staff_only");
    expect((await send("bola", GROUPS.general, { p_image_path: `${SPACE}/${GROUPS.general}/x.jpg`, p_image_width: 10, p_image_height: 10 }))?.message).toBe("pictures_staff_only");
    expect((await send("bola", GROUPS.vip, { p_body: "Hello" }))?.message).toBe("not_allowed");
    expect(await send("bola", GROUPS.general, { p_body: "Entry was 1.0850, stop 1.0810" })).toBeNull();
    // Staff may post links, numbers and pictures.
    expect(await send("tobi", GROUPS.general, { p_body: "The form is at https://example.com/form, or call +234 803 123 4567" })).toBeNull();
    expect((await send("tobi", GROUPS.general, { p_image_path: `${SPACE}/${GROUPS.vip}/x.jpg`, p_image_width: 10, p_image_height: 10 }))?.message).toBe("bad_picture");
  });

  it("stamps each message later than the one before, and reports what changed", async () => {
    const { as, clock } = sample();
    const since = new Date(clock.now - 1).toISOString();
    for (const body of ["One", "Two", "Three"]) await as("vee").rpc("send_message", { p_group: GROUPS.general, p_body: body });
    const changes = await rows(as("kay").rpc("chat_changes", { p_group: GROUPS.general, p_since: since }));
    expect(changes.map((message) => message.body)).toEqual(["One", "Two", "Three"]);
    const stamps = changes.map((message) => Date.parse(String(message.created_at)));
    expect(stamps[1]).toBeGreaterThan(stamps[0]);
    expect(stamps[2]).toBeGreaterThan(stamps[1]);
    expect((await rows(as("kay").rpc("my_groups", { p_space: SPACE })))[0]).toMatchObject({ unread: 4, last_body: "Three", last_name: "Vee" });
    // The writer has read what they wrote.
    expect((await rows(as("vee").rpc("my_groups", { p_space: SPACE })))[0].unread).toBe(0);

    // A reply carries a line of what it answers, and a deleted message keeps its place, empty.
    const reply = await as("kay").rpc("send_message", { p_group: GROUPS.general, p_body: "Noted", p_reply_to: changes[2].id });
    clock.now += MINUTE;
    expect((await as("vee").rpc("delete_message", { p_message: changes[2].id })).error).toBeNull();
    const after = await rows(as("kay").rpc("chat_changes", { p_group: GROUPS.general, p_since: new Date(clock.now - 1).toISOString() }));
    expect(after).toMatchObject([{ id: changes[2].id, deleted: true, body: null }]);
    const page = await rows(as("kay").rpc("chat_page", { p_group: GROUPS.general, p_limit: 2 }));
    expect(page[0]).toMatchObject({ id: reply.data, reply_name: "Vee", reply_body: null });
  });

  it("keeps deleting to who may", async () => {
    const { as, world } = sample();
    const by = (key: keyof typeof PEOPLE) => world.messages.find((message) => message.group_id === GROUPS.general && message.user_id === PEOPLE[key])?.id;
    expect((await refusal(as("vee").rpc("delete_message", { p_message: by("bola") })))?.message).toBe("not_allowed");
    // An admin deletes a member's message, not the mentor's. The mentor deletes any.
    expect((await as("tobi").rpc("delete_message", { p_message: by("bola") })).error).toBeNull();
    expect((await refusal(as("tobi").rpc("delete_message", { p_message: by("kay") })))?.message).toBe("not_allowed");
    expect((await as("kay").rpc("delete_message", { p_message: by("tobi") })).error).toBeNull();
  });

  it("lets a member report and block, and staff deal with it", async () => {
    const { as, clock } = sample();
    // Vee has blocked Emeka, so does not see what he wrote.
    expect((await rows(as("vee").rpc("chat_page", { p_group: GROUPS.general }))).some((message) => message.id === REPORTED_MESSAGE)).toBe(false);
    expect(await rows(as("vee").rpc("my_blocks"))).toMatchObject([{ user_id: PEOPLE.emeka, name: "Emeka" }]);
    expect((await as("vee").rpc("unblock_member", { p_user: PEOPLE.emeka })).error).toBeNull();
    expect((await rows(as("vee").rpc("chat_page", { p_group: GROUPS.general }))).some((message) => message.id === REPORTED_MESSAGE)).toBe(true);
    expect((await refusal(as("vee").rpc("block_member", { p_user: PEOPLE.kay })))?.message).toBe("cannot_block_staff");
    expect((await refusal(as("vee").rpc("block_member", { p_user: PEOPLE.vee })))?.message).toBe("not_allowed");
    expect((await refusal(as("emeka").rpc("report_message", { p_message: REPORTED_MESSAGE })))?.message).toBe("own_message");

    expect((await as("bola").rpc("report_message", { p_message: REPORTED_MESSAGE })).error).toBeNull();
    expect((await as("bola").rpc("report_message", { p_message: REPORTED_MESSAGE })).error).toBeNull();
    const reported = await rows(as("tobi").rpc("reported_messages", { p_space: SPACE }));
    expect(reported).toMatchObject([{ message_id: REPORTED_MESSAGE, group_name: "General", name: "Emeka", role: "member", reports: 3, has_image: false }]);
    expect((await refusal(as("vee").rpc("reported_messages", { p_space: SPACE })))?.message).toBe("not_allowed");

    // Staff mute him: he reads, and cannot write, until it ends.
    const muted = await as("tobi").rpc("mute_member", { p_space: SPACE, p_user: PEOPLE.emeka, p_hours: 24 });
    expect(muted.data).toBe(new Date(clock.now + DAY).toISOString());
    expect((await rows(as("emeka").from("memberships").select("muted_until").eq("space_id", SPACE).eq("user_id", PEOPLE.emeka).limit(1)))[0].muted_until).toBe(muted.data);
    expect((await rows(as("emeka").rpc("my_groups", { p_space: SPACE })))[0]).toMatchObject({ can_open: true, can_post: false });
    expect((await refusal(as("emeka").rpc("send_message", { p_group: GROUPS.general, p_body: "Hello" })))?.message).toBe("muted");
    expect((await refusal(as("tobi").rpc("mute_member", { p_space: SPACE, p_user: PEOPLE.kay, p_hours: 1 })))?.message).toBe("member_not_found");
    clock.now += DAY + MINUTE;
    expect((await as("emeka").rpc("send_message", { p_group: GROUPS.general, p_body: "Hello" })).error).toBeNull();

    // Deleting the message settles the reports.
    expect((await as("tobi").rpc("delete_message", { p_message: REPORTED_MESSAGE })).error).toBeNull();
    expect(await rows(as("tobi").rpc("reported_messages", { p_space: SPACE }))).toEqual([]);
  });

  it("lets staff run the groups", async () => {
    const { as } = sample();
    const form = { p_space: SPACE, p_name: "  Gold   desk ", p_about: " ", p_audience: "invited", p_posting: "all", p_group: null };
    expect((await refusal(as("vee").rpc("save_group", form)))?.code).toBe("42501");
    const made = await as("tobi").rpc("save_group", form);
    expect(typeof made.data).toBe("string");
    expect((await refusal(as("tobi").rpc("save_group", { ...form, p_name: "" })))?.message).toContain("groups_name");
    expect((await rows(as("tobi").rpc("my_groups", { p_space: SPACE }))).map((group) => group.name)).toEqual(["General", "VIP room", "Announcements", "Lagos meetup", "Gold desk"]);

    // Only people in the space can be invited, and only the invited see the group.
    await as("tobi").rpc("set_group_members", { p_group: made.data, p_add: [PEOPLE.bola, PEOPLE.dayo, "nobody"], p_remove: [] });
    expect(await rows(as("tobi").rpc("group_member_ids", { p_group: made.data }))).toEqual([{ user_id: PEOPLE.bola }]);
    expect((await rows(as("bola").rpc("my_groups", { p_space: SPACE }))).some((group) => group.id === made.data)).toBe(true);
    expect((await rows(as("vee").rpc("my_groups", { p_space: SPACE }))).some((group) => group.id === made.data)).toBe(false);
    await as("tobi").rpc("set_group_members", { p_group: made.data, p_add: [], p_remove: [PEOPLE.bola] });
    expect((await rows(as("bola").rpc("my_groups", { p_space: SPACE }))).some((group) => group.id === made.data)).toBe(false);

    await as("tobi").rpc("reorder_groups", { p_space: SPACE, p_groups: [made.data, GROUPS.general, GROUPS.vip, GROUPS.announcements, GROUPS.meetup] });
    expect((await rows(as("tobi").rpc("my_groups", { p_space: SPACE })))[0].name).toBe("Gold desk");
    // An admin cannot delete a group. The mentor can, and what was said in it goes too.
    expect((await refusal(as("tobi").rpc("delete_group", { p_group: GROUPS.general })))?.message).toBe("not_allowed");
    expect((await as("kay").rpc("delete_group", { p_group: GROUPS.general })).error).toBeNull();
    expect(await rows(as("kay").rpc("reported_messages", { p_space: SPACE }))).toEqual([]);
  });
});

// --- Names, alerts, reports and the account --------------------------------------------------------

describe("a person's own account", () => {
  it("holds a name to the rules", async () => {
    const { as } = sample();
    const rename = (person: keyof typeof PEOPLE, name: string) => as(person).from("profiles").update({ display_name: name }).eq("id", PEOPLE[person]);
    expect((await rows(as("newcomer").rpc("my_spaces")))[0]).toMatchObject({ display_name: "Member", role: "member", vip_until: null });
    expect((await rename("newcomer", "Floor Support")).error?.message).toContain("profiles_display_name_reserved");
    expect((await rename("newcomer", "K a y")).error?.message).toBe("name_taken");
    expect((await rename("newcomer", "your academy")).error?.message).toBe("name_taken");
    expect((await rename("newcomer", "t.me/pips")).error?.message).toBe("name_has_contact");
    expect((await rename("newcomer", "")).error?.message).toContain("profiles_display_name");
    expect((await rename("newcomer", "Ife")).error).toBeNull();
    expect((await rows(as("newcomer").rpc("my_spaces")))[0].display_name).toBe("Ife");
    // A person changes their own name and nobody else's.
    await as("newcomer").from("profiles").update({ display_name: "Changed" }).eq("id", PEOPLE.vee);
    expect((await rows(as("vee").rpc("my_spaces")))[0].display_name).toBe("Vee");
    // The mentor may keep the space's own name.
    expect((await rename("kay", "Your Academy")).error).toBeNull();
  });

  it("keeps each person's choice of alerts", async () => {
    const { as } = sample();
    await as("vee").rpc("set_alerts", { p_space: SPACE, p_setups: null, p_live: false, p_lessons: null });
    const [mine] = await rows(as("vee").from("memberships").select("alert_setups, alert_live, alert_lessons").eq("space_id", SPACE).eq("user_id", PEOPLE.vee).limit(1));
    expect(mine).toEqual({ alert_setups: true, alert_live: false, alert_lessons: true });
    // Nobody but staff reads another person's row.
    expect(await rows(as("bola").from("memberships").select("alert_live").eq("space_id", SPACE).eq("user_id", PEOPLE.vee).limit(1))).toEqual([]);
    expect((await as("vee").rpc("save_push_token", { p_token: "ExponentPushToken[sample]", p_platform: "ios" })).error).toBeNull();
    expect((await as("vee").rpc("remove_push_token")).error).toBeNull();
  });

  it("takes one report of the space from a member", async () => {
    const { as } = sample();
    expect((await as("bola").rpc("report_space", { p_space: SPACE, p_reason: "guaranteed_profits", p_details: " " })).error).toBeNull();
    expect((await refusal(as("bola").rpc("report_space", { p_space: SPACE, p_reason: "scam", p_details: null })))?.message).toBe("already_reported");
    expect((await refusal(as("vee").rpc("report_space", { p_space: "elsewhere", p_reason: "scam" })))?.message).toBe("not_allowed");
  });

  it("says what deleting an account would take, and deletes nothing", async () => {
    const { as } = sample();
    expect(await rows(as("kay").rpc("account_summary"))).toEqual([{ user_id: PEOPLE.kay, email: "kay@example.com", space_id: SPACE, space_name: "Your Academy", members: 11 }]);
    expect(await rows(as("vee").rpc("account_summary"))).toEqual([{ user_id: PEOPLE.vee, email: "vee@example.com", space_id: null, space_name: null, members: null }]);
    expect(await as("kay").server("/api/account/delete", { spaceName: "Your Academy" })).toEqual({ ok: false, code: "sample" });
    expect(await as("kay").server("/api/jobs/run")).toEqual({ ok: true, data: {} });
    expect(await as("kay").server("/api/nothing")).toEqual({ ok: false, code: "server_unavailable" });
  });

  it("lets a member start a space of their own", async () => {
    const { as } = sample();
    const terms = { p_theme: "dawn", p_terms_version: "2026-11-17" };
    expect((await refusal(as("vee").rpc("create_space", { ...terms, p_name: "Vee FX", p_slug: "your-academy" })))?.message).toBe("slug_taken");
    expect((await refusal(as("vee").rpc("create_space", { ...terms, p_name: "Vee FX", p_slug: "admin" })))?.message).toBe("slug_reserved");
    expect((await refusal(as("vee").rpc("create_space", { ...terms, p_name: "Vee FX", p_slug: "Vee FX" })))?.message).toContain("spaces_slug_format");
    expect((await refusal(as("kay").rpc("create_space", { ...terms, p_name: "Second", p_slug: "second" })))?.message).toBe("already_has_space");
    const made = await as("vee").rpc("create_space", { ...terms, p_name: " Vee FX ", p_slug: " Vee-FX " });
    expect(made.error).toBeNull();

    const mine = await rows(as("vee").rpc("my_spaces"));
    expect(mine.map((space) => [space.name, space.role, space.theme])).toEqual([["Your Academy", "member", "night"], ["Vee FX", "mentor", "dawn"]]);
    // A new space starts with its two groups, protection on, and nothing else.
    expect(mine[1]).toMatchObject({ block_capture: true, watermark: true, slug: "vee-fx" });
    expect((await rows(as("vee").rpc("my_groups", { p_space: made.data }))).map((group) => [group.name, group.audience])).toEqual([["General", "everyone"], ["VIP room", "vip"]]);
    expect(await rows(as("vee").rpc("feed", { p_space: made.data }))).toEqual([]);
    expect(await rows(as("vee").rpc("learn_outline", { p_space: made.data }))).toEqual([]);
    expect(await rows(as("vee").rpc("telegram_status", { p_space: made.data }))).toMatchObject([{ connected: false, tease_setups: true, code: null }]);
    // Nobody else is in it.
    expect((await refusal(as("kay").rpc("feed", { p_space: made.data })))?.message).toBe("not_allowed");
  });
});

// --- Telegram and files ----------------------------------------------------------------------------

describe("Telegram teasers", () => {
  it("is the mentor's alone, and starts connected", async () => {
    const { as } = sample();
    expect(await rows(as("kay").rpc("telegram_status", { p_space: SPACE }))).toMatchObject([{ connected: true, chat_title: "Your Academy Signals", chat_kind: "channel", tease_posts: true, last_error: null }]);
    expect((await refusal(as("tobi").rpc("telegram_status", { p_space: SPACE })))?.message).toBe("not_allowed");
    expect(await as("tobi").server("/api/telegram/start", { space: SPACE, renew: false })).toEqual({ ok: false, code: "not_allowed" });
    await as("kay").rpc("telegram_set", { p_space: SPACE, p_setups: true, p_posts: false, p_lessons: true, p_live: true });
    expect((await rows(as("kay").rpc("telegram_status", { p_space: SPACE })))[0]).toMatchObject({ tease_posts: false, tease_setups: true });
  });

  it("connects again by itself a few seconds after the code is shown", async () => {
    const { as, clock } = sample();
    expect((await as("kay").rpc("telegram_disconnect", { p_space: SPACE })).error).toBeNull();
    expect((await refusal(as("kay").rpc("telegram_test", { p_space: SPACE })))?.message).toBe("not_connected");
    const first = await as("kay").server("/api/telegram/start", { space: SPACE, renew: false });
    expect(first).toMatchObject({ ok: true, data: { bot: "FloorTeaserBot", expiresAt: new Date(clock.now + 30 * MINUTE).toISOString() } });
    const code = (first as { data: { code: string } }).data.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // The code already waiting is given again. A new one is made only when asked for.
    clock.now += 2000;
    expect((await as("kay").server("/api/telegram/start", { space: SPACE, renew: false }) as { data: { code: string } }).data.code).toBe(code);
    expect((await rows(as("kay").rpc("telegram_status", { p_space: SPACE })))[0]).toMatchObject({ connected: false, code });
    const renewed = (await as("kay").server("/api/telegram/start", { space: SPACE, renew: true }) as { data: { code: string } }).data.code;
    expect(renewed).not.toBe(code);

    clock.now += CONNECTS_AFTER_MS;
    expect((await rows(as("kay").rpc("telegram_status", { p_space: SPACE })))[0]).toMatchObject({ connected: true, code: null, chat_title: "Your Academy Signals" });
    clock.now += MINUTE;
    expect((await as("kay").rpc("telegram_test", { p_space: SPACE })).error).toBeNull();
    expect((await rows(as("kay").rpc("telegram_status", { p_space: SPACE })))[0].last_sent_at).toBe(new Date(clock.now).toISOString());
  });
});

describe("files", () => {
  it("writes bytes out as base64", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256, 1000]) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
      expect(toBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)));
    }
  });

  it("keeps a picture staff upload and shows it to those who may see it", async () => {
    const { as } = sample();
    const bytes = Uint8Array.from([255, 216, 255, 224, 1, 2, 3]).buffer;
    const path = `${SPACE}/vip/new.jpg`;
    expect((await as("vee").storage.from("posts").upload(path, bytes, { contentType: "image/jpeg" })).error?.code).toBe("42501");
    expect((await as("kay").storage.from("posts").upload(path, bytes, { contentType: "image/jpeg" })).error).toBeNull();
    const made = await as("kay").rpc("create_post", { p_space: SPACE, p_kind: "post", p_audience: "vip", p_image_path: path, p_image_width: 800, p_image_height: 600 });
    expect(made.error).toBeNull();
    expect((await as("kay").rpc("create_post", { p_space: SPACE, p_kind: "post", p_audience: "everyone", p_image_path: path, p_image_width: 800, p_image_height: 600 })).error?.message).toContain("posts_image");

    const address = "data:image/jpeg;base64," + btoa(String.fromCharCode(...new Uint8Array(bytes)));
    expect((await as("vee").storage.from("posts").createSignedUrl(path, 3600)).data).toEqual({ signedUrl: address });
    expect((await as("newcomer").storage.from("posts").createSignedUrl(path, 3600)).error?.message).toBe("Object not found");
    // A member cannot throw a picture away. Staff can.
    await as("vee").storage.from("posts").remove([path]);
    expect((await as("vee").storage.from("posts").createSignedUrl(path, 3600)).error).toBeNull();
    await as("tobi").storage.from("posts").remove([path]);
    expect((await as("vee").storage.from("posts").createSignedUrl(path, 3600)).error?.message).toBe("Object not found");
  });

  it("keeps the space's logo, which the mentor alone may set", async () => {
    const { as, backend } = sample();
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    const path = `${SPACE}/logo.jpg`;
    expect((await as("tobi").storage.from("logos").upload(path, bytes, { contentType: "image/jpeg" })).error).not.toBeNull();
    expect((await as("kay").storage.from("logos").upload(path, bytes, { contentType: "image/jpeg" })).error).toBeNull();
    expect(await rows(as("kay").from("spaces").update({ logo_path: path }).eq("id", SPACE).select("id"))).toHaveLength(1);
    expect((await as("kay").from("spaces").update({ logo_path: "elsewhere/logo.jpg" }).eq("id", SPACE).select("id")).error?.message).toContain("spaces_logo_path");
    expect(backend.logoAddress(path)).toBe("data:image/jpeg;base64,AQID");
    expect(backend.logoAddress("nowhere.jpg")).toBeNull();
  });

  it("answers a function it does not know the way Supabase would", async () => {
    const { as } = sample();
    expect((await refusal(as("kay").rpc("no_such_function")))?.code).toBe("PGRST202");
    expect((await as("kay").from("no_such_table").select("id")).error?.code).toBe("42P01");
  });
});

// --- Live --------------------------------------------------------------------------------------

describe("live", () => {
  it("shows the live session and the classes to every member, locked for a free one", async () => {
    const { as } = sample();
    const forVee = await rows(as("vee").rpc("live_schedule", { p_space: SPACE }));
    expect(forVee.map((each) => each.id)).toEqual([SESSIONS.live, SESSIONS.tomorrow, SESSIONS.later]);
    expect(forVee[0].state).toBe("live");
    expect(forVee.every((each) => each.locked === false && each.recording_status === null)).toBe(true);
    const forNew = await rows(as("newcomer").rpc("live_schedule", { p_space: SPACE }));
    expect(forNew.every((each) => each.locked === true && each.about === null)).toBe(true);
    const forKay = await rows(as("kay").rpc("live_schedule", { p_space: SPACE }));
    expect(forKay.map((each) => each.id)).toContain(SESSIONS.past);
  });

  it("opens the room for VIP and staff only, with its own chat", async () => {
    const { as } = sample();
    const pass = (await as("vee").server("/api/live/join", { session: SESSIONS.live })) as { ok: boolean; data: Record<string, unknown> };
    expect(pass.ok).toBe(true);
    expect(pass.data.groupId).toBe(GROUPS.live);
    expect(pass.data.sampleFilm).toBe("asset://lesson");
    expect(await as("newcomer").server("/api/live/join", { session: SESSIONS.live })).toEqual({ ok: false, code: "not_allowed" });
    const said = await rows(as("vee").rpc("chat_page", { p_group: GROUPS.live }));
    expect(said.length).toBeGreaterThan(3);
  });

  it("keeps the session's chat out of the list of groups", async () => {
    const { as } = sample();
    const groups = await rows(as("kay").rpc("my_groups", { p_space: SPACE }));
    expect(groups.map((each) => each.id)).not.toContain(GROUPS.live);
    expect((await refusal(as("kay").rpc("delete_group", { p_group: GROUPS.live })))?.code).toBe("42501");
  });

  it("lets staff schedule, change and cancel, and nobody else", async () => {
    const { as, clock } = sample();
    const at = new Date(clock.now + 2 * DAY).toISOString();
    expect((await refusal(as("vee").rpc("save_class", { p_space: SPACE, p_title: "Mine", p_starts_at: at })))?.code).toBe("42501");
    const { data: id } = await as("kay").rpc("save_class", { p_space: SPACE, p_title: "Q&A", p_starts_at: at });
    expect(typeof id).toBe("string");
    expect((await refusal(as("kay").rpc("save_class", { p_space: SPACE, p_title: "Past", p_starts_at: new Date(clock.now - DAY).toISOString() })))?.message).toBe("bad_time");
    await as("kay").rpc("save_class", { p_space: SPACE, p_title: "Q&A, moved", p_starts_at: at, p_session: id });
    expect((await rows(as("vee").rpc("live_schedule", { p_space: SPACE }))).find((each) => each.id === id)?.title).toBe("Q&A, moved");
    await as("kay").rpc("cancel_class", { p_session: id });
    expect((await rows(as("vee").rpc("live_schedule", { p_space: SPACE }))).some((each) => each.id === id)).toBe(false);
  });

  it("allows one session at a time, and ending it closes the chat and makes a draft lesson", async () => {
    const { as, world } = sample();
    expect((await refusal(as("kay").rpc("live_start", { p_space: SPACE, p_title: "Another" })))?.message).toBe("already_live");
    expect(await as("vee").server("/api/live/end", { session: SESSIONS.live })).toEqual({ ok: false, code: "not_allowed" });
    expect((await as("kay").server("/api/live/end", { session: SESSIONS.live })).ok).toBe(true);
    const row = world.live_sessions.find((each) => each.id === SESSIONS.live);
    expect(row?.status).toBe("ended");
    expect(row?.recording_status).toBe("saved");
    const lesson = world.lessons.find((each) => each.id === row?.lesson_id);
    expect(lesson?.published_at).toBeNull();
    expect(world.modules.find((each) => each.id === lesson?.module_id)?.title).toBe("Live recordings");
    expect(world.groups.find((each) => each.id === GROUPS.live)?.posting).toBe("staff");
    expect(await as("vee").server("/api/live/join", { session: SESSIONS.live })).toEqual({ ok: false, code: "not_live" });
  });

  it("starts a scheduled class with a chat of its own, and hands the broadcast over", async () => {
    const { as, world } = sample();
    await as("kay").server("/api/live/end", { session: SESSIONS.live });
    const { data: id } = await as("kay").rpc("live_start", { p_space: SPACE, p_session: SESSIONS.tomorrow });
    expect(id).toBe(SESSIONS.tomorrow);
    expect(world.groups.some((each) => each.session_id === id)).toBe(true);
    expect((await as("kay").rpc("live_heartbeat", { p_session: id })).data).toBe("live");
    await as("tobi").rpc("live_start", { p_space: SPACE, p_session: id });
    expect((await as("kay").rpc("live_heartbeat", { p_session: id })).data).toBe("taken_over");
  });
});
