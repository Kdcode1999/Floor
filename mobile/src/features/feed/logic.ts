// The Feed's plain logic: checking what a mentor typed into the composer, reading links to
// videos and social posts, and wording what a card says. No phone code. Tested in tests/.

import type { FeedPost, Side } from "./types";

/** A price as the database accepts it: digits, and up to eight more after a point. */
const PRICE = /^\d{1,9}(\.\d{1,8})?$/;

/** Tidies a typed price: spaces and thousands commas out. "1,950.50" becomes "1950.50". */
export function cleanPrice(typed: string): string {
  return typed.replace(/[\s,]/g, "");
}

/** Tidies a typed pair: "eur/usd " becomes "EUR/USD", "xau usd" becomes "XAUUSD". */
export function cleanPair(typed: string): string {
  return typed.replace(/\s/g, "").toUpperCase();
}

export interface SetupForm {
  pair: string;
  side: Side | null;
  entry: string;
  stop: string;
  /** Up to three. Empty boxes are left out. */
  targets: string[];
  note: string;
}

export type SetupProblems = Partial<Record<"pair" | "side" | "entry" | "stop" | "targets" | "note", string>>;

/** The targets a mentor filled in, tidied, with the empty boxes dropped. */
export function filledTargets(targets: string[]): string[] {
  return targets.map(cleanPrice).filter((target) => target !== "");
}

/**
 * Everything wrong with a setup, by field. Empty when it can be posted.
 *
 * Besides the shape of each price it checks that the prices make sense together: a Buy has its
 * stop below the entry and its targets above, a Sell the other way round. A setup that fails
 * this is nearly always a typing slip, and members act on these numbers.
 */
export function setupProblems(form: SetupForm): SetupProblems {
  const problems: SetupProblems = {};
  if (!/^[A-Z0-9][A-Z0-9./]{1,14}$/.test(cleanPair(form.pair))) problems.pair = "Type the pair, like EURUSD or XAUUSD.";
  if (!form.side) problems.side = "Choose Buy or Sell.";

  const entry = cleanPrice(form.entry);
  const stop = cleanPrice(form.stop);
  const targets = filledTargets(form.targets);
  if (!PRICE.test(entry)) problems.entry = "Type the entry price, like 1.0850.";
  if (!PRICE.test(stop)) problems.stop = "Type the stop price.";
  if (targets.length === 0) problems.targets = "Give at least one target.";
  else if (targets.some((target) => !PRICE.test(target))) problems.targets = "Type each target as a price.";

  if (form.side && !problems.entry && !problems.stop && !problems.targets) {
    const up = form.side === "buy";
    const e = Number(entry);
    const s = Number(stop);
    if (up ? s >= e : s <= e) {
      problems.stop = up ? "For a Buy, the stop goes below the entry." : "For a Sell, the stop goes above the entry.";
    } else if (targets.some((target) => (up ? Number(target) <= e : Number(target) >= e))) {
      problems.targets = up ? "For a Buy, targets go above the entry." : "For a Sell, targets go below the entry.";
    }
  }
  if (form.note.trim().length > 4000) problems.note = "Keep the note shorter.";
  return problems;
}

export type EmbedSource = "youtube" | "x" | "instagram" | "facebook";

const HOSTS: Record<string, EmbedSource> = {
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "x.com": "x",
  "twitter.com": "x",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.watch": "facebook",
};

/** Where a link comes from, when it is one of the four places a free post may embed. */
export function embedSource(link: string): EmbedSource | null {
  const match = /^https:\/\/(?:www\.|m\.|mobile\.)?([a-z0-9.-]+)\/\S+$/i.exec(link.trim());
  return match ? (HOSTS[match[1].toLowerCase()] ?? null) : null;
}

/** The id of a YouTube video, from any of the shapes its links take. Null when there is none. */
export function youtubeId(link: string): string | null {
  const text = link.trim();
  const found =
    /^https:\/\/youtu\.be\/([\w-]{6,20})/i.exec(text) ??
    /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)([\w-]{6,20})/i.exec(text);
  return found ? found[1] : null;
}

export const SOURCE_NAME: Record<EmbedSource, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** What is wrong with a link a mentor wants to embed, or null when it is fine or empty. */
export function embedProblem(link: string): string | null {
  if (link.trim() === "") return null;
  const source = embedSource(link);
  if (!source) return "Use a link from YouTube, X, Instagram or Facebook, starting with https://";
  if (source === "youtube" && !youtubeId(link)) return "That YouTube link has no video in it. Copy the video's own link.";
  return null;
}

export interface PostForm {
  title: string;
  body: string;
  embed: string;
  hasPicture: boolean;
  forEveryone: boolean;
}

export type PostProblems = Partial<Record<"title" | "body" | "embed", string>>;

export function postProblems(form: PostForm): PostProblems {
  const problems: PostProblems = {};
  const empty = form.title.trim() === "" && form.body.trim() === "" && form.embed.trim() === "" && !form.hasPicture;
  if (empty) problems.body = "Write something, or add a picture.";
  if (form.title.trim().length > 120) problems.title = "Keep the title to 120 letters or fewer.";
  if (form.body.trim().length > 4000) problems.body = "Keep it to 4000 letters or fewer.";
  const embed = embedProblem(form.embed);
  if (embed) problems.embed = embed;
  else if (form.embed.trim() !== "" && !form.forEveryone) {
    problems.embed = "A video or post from another site can only go in a post for everyone.";
  }
  return problems;
}

export interface OfferForm {
  title: string;
  body: string;
  link: string;
  label: string;
}

export type OfferProblems = Partial<Record<keyof OfferForm, string>>;

export function offerProblems(form: OfferForm): OfferProblems {
  const problems: OfferProblems = {};
  if (form.title.trim() === "") problems.title = "Give the offer a title.";
  else if (form.title.trim().length > 120) problems.title = "Keep the title to 120 letters or fewer.";
  if (form.body.trim().length > 4000) problems.body = "Keep it to 4000 letters or fewer.";
  if (!/^https:\/\/[^\s/]+\.\S+$/i.test(form.link.trim())) problems.link = "Type the link, starting with https://";
  if (form.label.trim().length > 30) problems.label = "Keep it to 30 letters or fewer.";
  return problems;
}

/** The few words that name a locked post to someone without VIP. */
export function lockedTitle(post: Pick<FeedPost, "kind" | "title" | "pair">): string {
  if (post.kind === "setup") return post.pair ? `${post.pair} setup` : "Trade setup";
  if (post.kind === "lesson") return post.title ? `New lesson: ${post.title}` : "New lesson";
  return post.title ?? "A post for VIP members";
}

/** "Target" for one, "Target 1", "Target 2" for more. */
export function targetLabel(index: number, count: number): string {
  return count === 1 ? "Target" : `Target ${index + 1}`;
}

/** Cuts a piece of text into plain parts and web addresses, so the addresses can be tapped. */
export function splitLinks(text: string): { text: string; link: boolean }[] {
  const parts: { text: string; link: boolean }[] = [];
  const pattern = /https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), link: false });
    parts.push({ text: match[0], link: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), link: false });
  return parts;
}

export interface Failure {
  message?: string | null;
}

/** What to say when posting, editing or deleting failed. */
export function feedMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "not_allowed") return "Only the mentor and admins can do that.";
  if (message === "too_many_offers") return "A space can pin five offers. Remove one first.";
  if (message === "post_not_found") return "That post is no longer there.";
  if (message === "embed_needs_free_post") return "A video or post from another site can only go in a post for everyone.";
  if (message.includes("posts_embed")) return "Use a link from YouTube, X, Instagram or Facebook.";
  if (message.includes("posts_setup")) return "Check the pair and the prices.";
  if (message.includes("posts_offer")) return "Give the offer a title and a link starting with https://";
  if (message.includes("posts_not_empty")) return "Write something, or add a picture.";
  return "That didn't go through. Check your connection and try again.";
}
