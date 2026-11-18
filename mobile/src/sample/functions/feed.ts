// The Feed, in the sample space. Each function follows the database's own of the same name:
// see web/supabase/migrations/…_feed.sql and …_learn.sql.

import { failedCheck, hasAccess, isStaff, notAllowed, Refusal, within, words, type Ctx } from "../rules";
import { iso, newId, type LessonRow, type PostRow } from "../world";

import { teased } from "./telegram";

const PRICE = /^\d{1,9}(\.\d{1,8})?$/;
const PAIR = /^[A-Z0-9][A-Z0-9./]{1,14}$/;
const EMBED = /^https:\/\/(www\.|m\.|mobile\.)?(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com|facebook\.com|fb\.watch)\/\S+$/i;

const newest = (a: { created_at: string }, b: { created_at: string }) => Date.parse(b.created_at) - Date.parse(a.created_at);

/** A post as the Feed hands it over. A locked one keeps only what a free member may know. */
function feedRow(post: PostRow, locked: boolean) {
  const open = <T>(value: T): T | null => (locked ? null : value);
  return {
    id: post.id,
    kind: post.kind as string,
    audience: post.audience as string,
    locked,
    title: locked && post.kind !== "post" ? null : post.title,
    body: open(post.body),
    image_path: open(post.image_path),
    image_width: open(post.image_width),
    image_height: open(post.image_height),
    embed_url: open(post.embed_url),
    pair: post.pair,
    side: open(post.side),
    entry: open(post.entry),
    stop: open(post.stop),
    targets: open(post.targets),
    update_note: open(post.update_note),
    update_at: open(post.update_at),
    closed: post.closed_at !== null,
    link_url: post.link_url,
    link_label: post.link_label,
    created_at: post.created_at,
    edited: post.edited_at !== null,
  };
}

/** The note the Feed carries for a lesson: its title and when it was published. Its id is the lesson's. */
function noteRow(lesson: LessonRow, locked: boolean): ReturnType<typeof feedRow> {
  return {
    id: lesson.id,
    kind: "lesson",
    audience: "vip",
    locked,
    title: lesson.title,
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
    closed: false,
    link_url: null,
    link_label: null,
    created_at: lesson.published_at ?? "",
    edited: false,
  };
}

/** The rules the posts table keeps for itself. */
function checkPost(post: PostRow): void {
  const length = (text: string | null, low: number, high: number) => text === null || (text.trim().length >= low && text.trim().length <= high);
  if (!length(post.title, 1, 120)) throw failedCheck("posts", "posts_title");
  if (!length(post.body, 1, 4000)) throw failedCheck("posts", "posts_body");
  if (!length(post.update_note, 1, 200)) throw failedCheck("posts", "posts_update_note");
  if (!length(post.link_label, 1, 30)) throw failedCheck("posts", "posts_link_label");

  const size = (value: number | null) => value !== null && value >= 1 && value <= 10_000;
  const noPicture = post.image_path === null && post.image_width === null && post.image_height === null;
  const goodPicture =
    post.image_path !== null &&
    post.image_path.length <= 300 &&
    post.image_path.startsWith(`${post.space_id}/${post.audience}/`) &&
    size(post.image_width) &&
    size(post.image_height);
  if (!noPicture && !goodPicture) throw failedCheck("posts", "posts_image");

  if (post.embed_url !== null && !(post.audience === "everyone" && post.kind === "post" && post.embed_url.length <= 500 && EMBED.test(post.embed_url))) {
    throw failedCheck("posts", "posts_embed");
  }

  if (post.kind === "setup") {
    const targets = post.targets ?? [];
    const good =
      PAIR.test(post.pair ?? "") &&
      (post.side === "buy" || post.side === "sell") &&
      PRICE.test(post.entry ?? "") &&
      PRICE.test(post.stop ?? "") &&
      targets.length >= 1 &&
      targets.length <= 3 &&
      targets.every((target) => PRICE.test(target));
    if (!good) throw failedCheck("posts", "posts_setup");
  }

  if (post.kind === "offer") {
    const link = post.link_url ?? "";
    if (!(post.title !== null && post.audience === "everyone" && link.length <= 500 && /^https:\/\/\S+$/i.test(link))) {
      throw failedCheck("posts", "posts_offer");
    }
  }

  if (post.kind === "post" && post.title === null && post.body === null && post.image_path === null && post.embed_url === null) {
    throw failedCheck("posts", "posts_not_empty");
  }
}

/** A post that is still there, or a refusal. */
function livePost(ctx: Ctx, id: string): PostRow {
  const post = ctx.world.posts.find((each) => each.id === id && each.deleted_at === null);
  if (!post) throw new Refusal("post_not_found");
  if (!isStaff(ctx, post.space_id)) throw notAllowed();
  return post;
}

export const feedFunctions = {
  /** One page of the Feed: the pinned offers first, then posts and new lessons, newest first. */
  feed(ctx: Ctx, args: { p_space: string; p_before?: string | null; p_limit?: number | null }) {
    if (!hasAccess(ctx, args.p_space)) throw notAllowed();
    const vip = hasAccess(ctx, args.p_space, true);
    const limit = within(args.p_limit, 1, 50, 20);
    const before = args.p_before ? Date.parse(args.p_before) : null;
    const earlier = (time: string) => before === null || Date.parse(time) < before;

    const mine = ctx.world.posts.filter((post) => post.space_id === args.p_space && post.deleted_at === null);
    const offers = before === null ? mine.filter((post) => post.kind === "offer").sort(newest) : [];
    const posts = mine
      .filter((post) => post.kind !== "offer" && earlier(post.created_at))
      .sort(newest)
      .slice(0, limit)
      .map((post) => feedRow(post, post.audience === "vip" && !vip));

    // A lesson that members can open shows in the Feed as a note that it was added.
    const notes = ctx.world.lessons
      .filter((lesson) => lesson.space_id === args.p_space && lesson.published_at !== null && (lesson.video_status === "none" || lesson.video_status === "ready") && earlier(lesson.published_at))
      .map((lesson) => noteRow(lesson, !vip))
      .sort(newest)
      .slice(0, limit);

    return [...offers.map((post) => feedRow(post, false)), ...[...posts, ...notes].sort(newest).slice(0, limit)];
  },

  create_post(
    ctx: Ctx,
    args: {
      p_space: string;
      p_kind: string;
      p_audience?: string | null;
      p_title?: string | null;
      p_body?: string | null;
      p_image_path?: string | null;
      p_image_width?: number | null;
      p_image_height?: number | null;
      p_embed_url?: string | null;
      p_pair?: string | null;
      p_side?: string | null;
      p_entry?: string | null;
      p_stop?: string | null;
      p_targets?: string[] | null;
      p_link_url?: string | null;
      p_link_label?: string | null;
    },
  ) {
    if (!isStaff(ctx, args.p_space)) throw notAllowed();
    if (args.p_kind !== "post" && args.p_kind !== "setup" && args.p_kind !== "offer") throw new Refusal("bad_kind");
    const kind = args.p_kind;
    const audience = kind === "offer" ? "everyone" : (args.p_audience ?? "vip");
    if (audience !== "everyone" && audience !== "vip") throw failedCheck("posts", "posts_audience");
    if (args.p_embed_url != null && audience !== "everyone") throw new Refusal("embed_needs_free_post");
    const offers = ctx.world.posts.filter((post) => post.space_id === args.p_space && post.kind === "offer" && post.deleted_at === null);
    if (kind === "offer" && offers.length >= 5) throw new Refusal("too_many_offers");

    const setup = kind === "setup";
    const offer = kind === "offer";
    const post: PostRow = {
      id: newId(),
      space_id: args.p_space,
      author_id: ctx.uid,
      kind,
      audience,
      title: words(args.p_title),
      body: words(args.p_body),
      image_path: args.p_image_path ?? null,
      image_width: args.p_image_width ?? null,
      image_height: args.p_image_height ?? null,
      embed_url: words(args.p_embed_url),
      pair: setup ? (args.p_pair ?? "").replace(/\s/g, "").toUpperCase() : null,
      side: setup ? (args.p_side ?? null) : null,
      entry: setup ? (args.p_entry ?? "").trim() : null,
      stop: setup ? (args.p_stop ?? "").trim() : null,
      targets: setup ? (args.p_targets ?? null) : null,
      update_note: null,
      update_at: null,
      closed_at: null,
      link_url: offer ? (args.p_link_url ?? "").trim() : null,
      link_label: offer ? words(args.p_link_label) : null,
      created_at: iso(ctx.now),
      edited_at: null,
      deleted_at: null,
    };
    checkPost(post);
    ctx.world.posts.push(post);
    if (!offer) teased(ctx, args.p_space, setup ? "tease_setups" : "tease_posts");
    return post.id;
  },

  /** Changes a post's or an offer's words. A setup's prices are set once. */
  edit_post(ctx: Ctx, args: { p_post: string; p_title?: string | null; p_body?: string | null; p_link_url?: string | null; p_link_label?: string | null }) {
    const post = livePost(ctx, args.p_post);
    if (post.kind === "setup") throw new Refusal("setups_cannot_be_edited");
    const next: PostRow = {
      ...post,
      title: words(args.p_title),
      body: words(args.p_body),
      link_url: post.kind === "offer" ? (args.p_link_url ?? "").trim() : null,
      link_label: post.kind === "offer" ? words(args.p_link_label) : null,
      edited_at: iso(ctx.now),
    };
    checkPost(next);
    Object.assign(post, next);
    return null;
  },

  /** The mentor's word on how a setup went. Once closed, a setup stays closed. */
  update_setup(ctx: Ctx, args: { p_post: string; p_note?: string | null; p_closed?: boolean | null }) {
    const post = livePost(ctx, args.p_post);
    if (post.kind !== "setup") throw new Refusal("not_a_setup");
    const note = words(args.p_note);
    const next: PostRow = {
      ...post,
      update_note: note,
      update_at: note !== post.update_note ? iso(ctx.now) : post.update_at,
      closed_at: args.p_closed ? (post.closed_at ?? iso(ctx.now)) : post.closed_at,
    };
    checkPost(next);
    Object.assign(post, next);
    return null;
  },

  delete_post(ctx: Ctx, args: { p_post: string }) {
    livePost(ctx, args.p_post).deleted_at = iso(ctx.now);
    return null;
  },
};
