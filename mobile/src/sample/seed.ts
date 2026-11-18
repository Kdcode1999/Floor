// What the sample space holds when the app starts: one mentor's space with people, posts, a
// course, groups and everything a mentor manages. Every time is counted back from "now", so
// the space always looks lived in.
//
// All of it is made up. The people do not exist, the prices are not market prices, and the
// addresses end in example.com, a name kept for examples that nobody can own.

import { PEOPLE, SPACE } from "./people";
import {
  emptyWorld,
  fixedId,
  iso,
  membership,
  settings,
  type GroupRow,
  type LessonRow,
  type MessageRow,
  type PostRow,
  type SampleAsset,
  type World,
} from "./world";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const GROUPS = {
  general: fixedId(0x201),
  vip: fixedId(0x202),
  announcements: fixedId(0x203),
  meetup: fixedId(0x204),
} as const;

export const MODULES = { foundations: fixedId(0x301), london: fixedId(0x302) } as const;

export const LESSONS = {
  chart: fixedId(0x311),
  stops: fixedId(0x312),
  size: fixedId(0x313),
  firstHour: fixedId(0x314),
  sitOut: fixedId(0x315),
} as const;

export const POSTS = {
  offer: fixedId(0x401),
  eurusd: fixedId(0x402),
  gold: fixedId(0x403),
  gbpjpy: fixedId(0x404),
  plan: fixedId(0x405),
  xauusd: fixedId(0x406),
  welcome: fixedId(0x407),
} as const;

/** The message two members have reported. */
export const REPORTED_MESSAGE = fixedId(0x505);

/** How long the film that stands in for every lesson's video runs, in seconds. */
export const FILM_SECONDS = 16;

const NAMES: [keyof typeof PEOPLE, string][] = [
  ["kay", "Kay"],
  ["tobi", "Tobi"],
  ["vee", "Vee"],
  ["newcomer", "Member"],
  ["chidi", "Chidi"],
  ["ada", "Ada O."],
  ["sam", "Sam K."],
  ["ngozi", "Ngozi A."],
  ["femi", "Femi"],
  ["zainab", "Zainab"],
  ["emeka", "Emeka"],
  ["dayo", "Dayo"],
  ["bola", "Bola"],
];

/** The sample space as it stands at `now`. */
export function createWorld(now: number): World {
  const world = emptyWorld();
  const ago = (time: number) => iso(now - time);
  const ahead = (time: number) => iso(now + time);

  // --- People ---------------------------------------------------------------------------------
  for (const [key, name] of NAMES) {
    world.users.push({ id: PEOPLE[key], email: `${key}@example.com` });
    world.profiles.push({ id: PEOPLE[key], display_name: name });
  }

  // --- The space ------------------------------------------------------------------------------
  world.spaces.push({
    id: SPACE,
    slug: "your-academy",
    name: "Your Academy",
    tagline: "London session, every weekday",
    logo_path: null,
    theme: "night",
    owner_id: PEOPLE.kay,
    status: "active",
    vip_price_cents: 2_500_000,
    vip_currency: "NGN",
    vip_days: 30,
    broker_name: "Example Broker",
    card_provider: "paystack",
    created_at: ago(40 * DAY),
  });
  world.space_settings.push({
    ...settings(SPACE),
    payment_instructions: "Bank: Example Bank\nAccount: 0000000000\nName: Your Academy",
    broker_link: "https://example.com/broker",
    // Off to begin with, so the sample can be captured while it is looked at as a member.
    block_capture: false,
  });
  world.payment_accounts.push({ space_id: SPACE, provider: "paystack", last_error: null });

  const joined = (key: keyof typeof PEOPLE, time: number, more: Parameters<typeof membership>[3] = {}) =>
    world.memberships.push(membership(SPACE, PEOPLE[key], now - time, more));
  joined("kay", 40 * DAY, { role: "mentor" });
  joined("tobi", 38 * DAY, { role: "admin" });
  joined("vee", 30 * DAY, { vip_until: ahead(24 * DAY) });
  joined("chidi", 33 * DAY, { vip_until: ahead(18 * DAY) });
  joined("ada", 29 * DAY, { vip_until: ahead(3 * DAY) });
  joined("bola", 12 * DAY);
  joined("sam", 6 * DAY);
  joined("ngozi", 5 * DAY);
  joined("femi", 4 * DAY);
  joined("zainab", 3 * DAY);
  joined("emeka", 2 * DAY);
  joined("dayo", 20 * DAY, { status: "banned" });
  joined("newcomer", HOUR);

  // --- Waiting for VIP ------------------------------------------------------------------------
  const request = (id: number, key: keyof typeof PEOPLE, kind: "payment" | "broker", note: string | null, time: number) => {
    const path = `${SPACE}/${PEOPLE[key]}/sample-proof.jpg`;
    world.access_requests.push({
      id: fixedId(id),
      space_id: SPACE,
      user_id: PEOPLE[key],
      kind,
      proof_path: path,
      note,
      days: 30,
      status: "pending",
      decline_reason: null,
      created_at: ago(time),
    });
    file(world, "proofs", path, "proof");
  };
  request(0x601, "zainab", "broker", "Opened my account through your link", 2 * DAY);
  request(0x602, "femi", "payment", null, 26 * HOUR);
  request(0x603, "ngozi", "broker", "Account ID 4830 2291", 3 * HOUR);
  request(0x604, "sam", "payment", "Paid by bank transfer this morning", 40 * MINUTE);

  // --- Invite codes and card payments ---------------------------------------------------------
  const code = (id: number, text: string, days: number, max: number | null, used: number, time: number, revoked = false) =>
    world.invite_codes.push({ id: fixedId(id), space_id: SPACE, code: text, days, max_uses: max, used_count: used, expires_at: null, revoked, created_at: ago(time) });
  code(0x701, "WELCOME7", 7, 50, 12, 9 * DAY);
  code(0x702, "FRIENDS30", 30, null, 3, 21 * DAY);
  code(0x703, "LAUNCH24", 30, 10, 10, 36 * DAY);
  code(0x704, "TRYVIP22", 7, null, 1, 30 * DAY, true);

  const paid = (id: number, key: keyof typeof PEOPLE, time: number) =>
    world.payments.push({
      id: fixedId(id),
      space_id: SPACE,
      user_id: PEOPLE[key],
      amount_cents: 2_500_000,
      currency: "NGN",
      days: 30,
      paid_at: ago(time),
      vip_until: iso(now - time + 30 * DAY),
    });
  paid(0x801, "vee", 6 * DAY);
  paid(0x802, "chidi", 12 * DAY);
  paid(0x803, "ada", 27 * DAY);

  // --- The Feed -------------------------------------------------------------------------------
  const blank: Omit<PostRow, "id" | "kind" | "created_at"> = {
    space_id: SPACE,
    author_id: PEOPLE.kay,
    audience: "vip",
    title: null,
    body: null,
    image_path: null,
    image_width: null,
    image_height: null,
    embed_url: null,
    pair: null,
    side: null,
    entry: null,
    stop: null,
    targets: null,
    update_note: null,
    update_at: null,
    closed_at: null,
    link_url: null,
    link_label: null,
    edited_at: null,
    deleted_at: null,
  };
  const chart = `${SPACE}/everyone/sample-chart.jpg`;
  file(world, "posts", chart, "chart");
  world.posts.push(
    {
      ...blank,
      id: POSTS.offer,
      kind: "offer",
      audience: "everyone",
      title: "Free VIP with my broker",
      body: "Open an account through my link and send proof of it. You get 30 days of VIP free.",
      link_url: "https://example.com/broker",
      link_label: "Open an account",
      created_at: ago(6 * DAY),
    },
    {
      ...blank,
      id: POSTS.eurusd,
      kind: "setup",
      pair: "EURUSD",
      side: "buy",
      body: "Waiting for the retest of the breakout level. Do not chase it.",
      entry: "1.0850",
      stop: "1.0810",
      targets: ["1.0930", "1.0990"],
      created_at: ago(62 * MINUTE),
    },
    {
      ...blank,
      id: POSTS.gold,
      kind: "post",
      audience: "everyone",
      title: "Why I skipped gold today",
      body: "Two news releases inside the session and no clean level on either side. A day with no trade is still a day of trading well.\n\nThe chart shows what I was waiting for.",
      image_path: chart,
      image_width: 1280,
      image_height: 800,
      created_at: ago(5 * HOUR),
    },
    {
      ...blank,
      id: POSTS.gbpjpy,
      kind: "setup",
      audience: "everyone",
      pair: "GBPJPY",
      side: "sell",
      body: "Sold the rejection at the session high.",
      entry: "191.40",
      stop: "192.10",
      targets: ["189.90"],
      update_note: "Target reached. Closed.",
      update_at: ago(28 * HOUR),
      closed_at: ago(28 * HOUR),
      created_at: ago(2 * DAY),
    },
    {
      ...blank,
      id: POSTS.plan,
      kind: "post",
      title: "Weekly plan: what I am watching",
      body: "EURUSD above the breakout level, gold only after Wednesday's news, and nothing on the yen pairs until the range breaks.\n\nSetups go out here before each session.",
      created_at: ago(3 * DAY),
    },
    {
      ...blank,
      id: POSTS.xauusd,
      kind: "setup",
      pair: "XAUUSD",
      side: "buy",
      body: "Buying the pullback into the weekly level.",
      entry: "2655.0",
      stop: "2641.0",
      targets: ["2680.0", "2700.0"],
      update_note: "Stop moved to entry.",
      update_at: ago(3 * DAY),
      created_at: ago(4 * DAY),
    },
    {
      ...blank,
      id: POSTS.welcome,
      kind: "post",
      audience: "everyone",
      title: "Welcome to Your Academy",
      body: "This is where everything happens: setups and notes in the Feed, the course in Learn, and the groups in Chat.\n\nSome posts are for VIP members. You will see that they are there, and they open once you are VIP.",
      created_at: ago(10 * DAY),
    },
  );

  // --- The course -----------------------------------------------------------------------------
  world.modules.push(
    { id: MODULES.foundations, space_id: SPACE, title: "Foundations", position: 1, created_at: ago(30 * DAY) },
    { id: MODULES.london, space_id: SPACE, title: "The London session", position: 2, created_at: ago(20 * DAY) },
  );
  const lesson = (id: string, module: string, position: number, title: string, description: string | null, video: boolean, published: number | null): LessonRow => ({
    id,
    space_id: SPACE,
    module_id: module,
    title,
    description,
    position,
    published_at: published === null ? null : ago(published),
    video_id: video ? `sample-${id}` : null,
    video_status: video ? "ready" : "none",
    duration_seconds: video ? FILM_SECONDS : null,
    created_at: ago((published ?? 0) + DAY),
  });
  world.lessons.push(
    lesson(LESSONS.chart, MODULES.foundations, 1, "How I read a chart", "The three things I look at before anything else: where price has turned before, which way the larger move is going, and what time of day it is.", true, 9 * DAY),
    lesson(LESSONS.stops, MODULES.foundations, 2, "Stops that make sense", "A stop belongs where the idea is wrong, not where the loss feels comfortable.\n\nHomework: mark the stop on your last five trades and write down why it was there.", true, 26 * HOUR),
    lesson(LESSONS.size, MODULES.foundations, 3, "Position size in two minutes", "Decide what you can lose on the trade first. Divide it by the distance to your stop. That is your size.\n\nNothing else goes into it.", false, 6 * DAY),
    lesson(LESSONS.firstHour, MODULES.london, 1, "The first hour", "What usually happens in the first hour of London, and why I wait for it to finish before I look for an entry.", true, 4 * DAY),
    lesson(LESSONS.sitOut, MODULES.london, 2, "When to sit out", "A draft. Notes on the days I do not trade at all.", false, null),
  );
  world.lesson_progress.push(
    { user_id: PEOPLE.vee, lesson_id: LESSONS.chart, seconds: FILM_SECONDS, completed_at: ago(8 * DAY) },
    { user_id: PEOPLE.vee, lesson_id: LESSONS.size, seconds: 0, completed_at: ago(5 * DAY) },
    { user_id: PEOPLE.vee, lesson_id: LESSONS.stops, seconds: 6, completed_at: null },
  );

  // --- Groups ---------------------------------------------------------------------------------
  const group = (id: string, position: number, name: string, about: string, audience: GroupRow["audience"], posting: GroupRow["posting"]): GroupRow => ({
    id,
    space_id: SPACE,
    name,
    about,
    audience,
    posting,
    position,
    created_at: ago(40 * DAY),
    last_message_at: null,
  });
  world.groups.push(
    group(GROUPS.general, 0, "General", "Open to everyone in the space.", "everyone", "all"),
    group(GROUPS.vip, 1, "VIP room", "For VIP members.", "vip", "all"),
    group(GROUPS.announcements, 2, "Announcements", "Session times and news. Only the mentor and admins write here.", "everyone", "staff"),
    group(GROUPS.meetup, 3, "Lagos meetup", "For the people coming to the meetup.", "invited", "all"),
  );
  for (const key of ["vee", "chidi", "ada"] as const) world.group_members.push({ group_id: GROUPS.meetup, user_id: PEOPLE[key] });

  let count = 0x500;
  const say = (groupId: string, key: keyof typeof PEOPLE, time: number, body: string | null, more: Partial<MessageRow> = {}): string => {
    count += 1;
    const id = fixedId(count);
    const at = ago(time);
    world.messages.push({
      id,
      group_id: groupId,
      space_id: SPACE,
      user_id: PEOPLE[key],
      body,
      image_path: null,
      image_width: null,
      image_height: null,
      reply_to: null,
      created_at: at,
      changed_at: at,
      deleted_at: null,
      ...more,
    });
    const held = world.groups.find((each) => each.id === groupId);
    if (held && (held.last_message_at === null || held.last_message_at < at)) held.last_message_at = at;
    return id;
  };

  const picture = `${SPACE}/${GROUPS.general}/sample-chart.jpg`;
  file(world, "chat", picture, "chart2");
  say(GROUPS.general, "kay", 2 * DAY + 5 * HOUR, "Welcome, everyone. This group is open to all members. Ask anything about the sessions here.");
  say(GROUPS.general, "bola", 2 * DAY + 4 * HOUR, "Thanks Kay. Just joined, reading through the list of lessons now.");
  say(GROUPS.general, "chidi", 2 * DAY + 3 * HOUR, "The lesson on stops changed how I size my trades.");
  say(GROUPS.general, "tobi", 2 * DAY + 2 * HOUR, "A reminder: no signals from members in here. Kay posts setups in the Feed.");
  // 0x505: the one two members reported. See REPORTED_MESSAGE.
  say(GROUPS.general, "emeka", 30 * HOUR, "I can double your account in a week. Ask me how.");
  const recap = say(GROUPS.general, "ada", 29 * HOUR, "Is the recap of the London session going up today?");
  say(GROUPS.general, "kay", 28 * HOUR, "Yes, tonight. It will be in Learn.", { reply_to: recap });
  const proof = say(GROUPS.general, "sam", 27 * HOUR, "I sent my payment proof this morning.");
  say(GROUPS.general, "tobi", 26 * HOUR, "Got it. We will look at it shortly.", { reply_to: proof });
  say(GROUPS.general, "kay", 2 * HOUR, "This is the level I am watching on EURUSD.", { image_path: picture, image_width: 1280, image_height: 800 });
  say(GROUPS.general, "vee", 100 * MINUTE, "That retest looks clean.");
  const when = say(GROUPS.general, "bola", 50 * MINUTE, "What time is the session tomorrow?");
  say(GROUPS.general, "kay", 20 * MINUTE, "8 in the morning, London time. The setup will be in the Feed before then.", { reply_to: when });
  say(GROUPS.general, "chidi", 8 * MINUTE, "See you all there.");

  say(GROUPS.vip, "kay", 3 * DAY + 6 * HOUR, "The VIP room is open. This is where we talk through setups after I post them.");
  say(GROUPS.vip, "vee", 3 * DAY + 2 * HOUR, "Took the gold buy. Stop is at entry now.");
  say(GROUPS.vip, "chidi", 3 * DAY + HOUR, "Same here. Thanks for the update on it.");
  const renew = say(GROUPS.vip, "ada", 26 * HOUR, "My VIP ends this week. I can renew by card from the join page, right?");
  say(GROUPS.vip, "tobi", 25 * HOUR, "Yes. Or send proof of a transfer and we approve it.", { reply_to: renew });
  say(GROUPS.vip, "kay", 60 * MINUTE, "The EURUSD setup is in the Feed. Wait for the retest.");
  say(GROUPS.vip, "vee", 55 * MINUTE, "Got the alert. Watching it.");
  say(GROUPS.vip, "chidi", 15 * MINUTE, "Entry filled on my side.");

  say(GROUPS.announcements, "kay", 4 * DAY, "Sessions run Monday to Friday, in the London morning. A lesson goes up in Learn after each one.");
  say(GROUPS.announcements, "tobi", 26 * HOUR, "A new lesson is up: Stops that make sense.");
  say(GROUPS.announcements, "kay", 30 * MINUTE, "No session this Friday. Back on Monday.");

  say(GROUPS.meetup, "kay", 5 * DAY, "For everyone coming to the Lagos meetup. The date and the place will be posted here.");
  say(GROUPS.meetup, "vee", 5 * DAY - HOUR, "Count me in.");
  say(GROUPS.meetup, "chidi", 5 * DAY - 2 * HOUR, "I will be there.");

  // What each of the three has read, so each finds something new waiting.
  const read = (key: keyof typeof PEOPLE, groupId: string, time: number) =>
    world.group_reads.push({ group_id: groupId, user_id: PEOPLE[key], read_at: ago(time) });
  read("kay", GROUPS.general, 19 * MINUTE);
  read("kay", GROUPS.vip, 30 * MINUTE);
  read("kay", GROUPS.announcements, 0);
  read("kay", GROUPS.meetup, 0);
  read("vee", GROUPS.general, 0);
  read("vee", GROUPS.vip, 55 * MINUTE);
  read("vee", GROUPS.announcements, 2 * HOUR);
  read("vee", GROUPS.meetup, 0);

  // Vee has blocked Emeka, and two members have reported what he wrote.
  world.blocks.push({ user_id: PEOPLE.vee, blocked_id: PEOPLE.emeka, created_at: ago(29 * HOUR) });
  for (const [key, time] of [["chidi", 29 * HOUR], ["ada", 27 * HOUR]] as const) {
    world.message_reports.push({ message_id: REPORTED_MESSAGE, space_id: SPACE, reporter_id: PEOPLE[key], status: "open", created_at: ago(time) });
  }

  // --- Telegram -------------------------------------------------------------------------------
  world.telegram_links.push({
    space_id: SPACE,
    chat_id: -1000000000001,
    chat_title: "Your Academy Signals",
    chat_kind: "channel",
    connected_at: ago(15 * DAY),
    connect_code: null,
    code_expires_at: null,
    tease_setups: true,
    tease_posts: true,
    tease_lessons: true,
    tease_live: true,
    last_sent_at: ago(62 * MINUTE),
    last_error: null,
    last_error_at: null,
  });

  return world;
}

function file(world: World, bucket: string, path: string, asset: SampleAsset): void {
  if (!world.files.some((each) => each.bucket === bucket && each.path === path)) world.files.push({ bucket, path, asset, data: null });
}
