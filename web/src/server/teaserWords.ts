// What Floor's bot posts in a mentor's Telegram channel. Plain logic, tested in tests/. No
// secrets, nothing to send.
//
// One rule: a notice never says more than a free member would see in the app. A setup for VIP
// is named by its pair and nothing else. A post for VIP gives its title at most.

export interface TeaserSpace {
  name: string;
  /** The word the space's join link ends with. */
  slug: string;
}

export type TeaserSource =
  | { type: "setup"; audience: string; pair: string | null; side: string | null }
  | { type: "post"; audience: string; title: string | null; body: string | null }
  | { type: "lesson"; title: string }
  | { type: "test" };

/** Which of the mentor's switches a notice falls under. A test is always sent. */
export function switchFor(type: string): "tease_setups" | "tease_posts" | "tease_lessons" | null {
  if (type === "setup") return "tease_setups";
  if (type === "post") return "tease_posts";
  if (type === "lesson") return "tease_lessons";
  return null;
}

/** How much of a free post's words a notice carries. The rest is read in the app. */
const EXCERPT_MAX = 280;

/** The start of some words as one paragraph, cut at a word if it runs long. */
export function excerpt(text: string, max = EXCERPT_MAX): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // A word is only cut in two when it is so long that stopping before it would lose half the room.
  return `${(lastSpace >= max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** Where a notice sends people: the space's join page. */
export function joinLink(site: string, slug: string): string {
  return `${site.replace(/\/+$/, "")}/${slug}`;
}

/** The words of a notice. */
export function teaserFor(source: TeaserSource, space: TeaserSpace, site: string): string {
  const where = `${space.name} on Floor: ${joinLink(site, space.slug)}`;
  const lines = (...parts: (string | null)[]) => [...parts.filter((part): part is string => !!part), where].join("\n\n");
  const vip = source.type !== "test" && source.type !== "lesson" && source.audience !== "everyone";

  if (source.type === "setup") {
    const pair = source.pair?.trim() || null;
    if (vip) return lines(pair ? `New VIP setup: ${pair}` : "New VIP setup", "The entry, stop and targets are inside, for VIP members.");
    const side = source.side === "sell" ? "Sell" : source.side === "buy" ? "Buy" : null;
    return lines(pair ? `New setup: ${pair}${side ? ` · ${side}` : ""}` : "New setup", "The entry, stop and targets are inside.");
  }
  if (source.type === "post") {
    const title = source.title?.trim() || null;
    if (vip) return lines(title ? `New for VIP members: ${title}` : "New post for VIP members", "Read it inside.");
    const body = source.body ? excerpt(source.body) : null;
    if (!title && !body) return lines("New post", "See it inside.");
    return lines(title, body);
  }
  if (source.type === "lesson") {
    return lines(`New lesson: ${source.title.trim()}`, "Watch it inside, with VIP.");
  }
  return lines(`This is a test from Floor. Notices for ${space.name} will be posted here.`);
}

// --- What the bot is told, and what it answers ---------------------------------------------------

/** The code in "/connect ABCD2345", or null when the message is anything else. */
export function connectCode(text: string): string | null {
  const found = /^\/connect(?:@\w+)?\s+([A-Za-z0-9]{6,12})\s*$/.exec(text.trim());
  return found ? found[1].toUpperCase() : null;
}

/** True for "/start", which is what Telegram sends when someone opens the bot. */
export function isStart(text: string): boolean {
  return /^\/start(?:@\w+)?(?:\s|$)/.test(text.trim());
}

export const BOT_WORDS = {
  connected: (space: TeaserSpace, site: string) =>
    `Connected. New setups, posts and lessons from ${space.name} will be announced here.\n\n${space.name} on Floor: ${joinLink(site, space.slug)}`,
  badCode: "That code is not valid, or has run out. Get a new one in the Floor app: Manage, then Telegram teasers.",
  notHere: "Post that line in your channel or group, not here. I connect the chat it is posted in.",
  hello:
    "I announce new setups, posts and lessons from a Floor space in its mentor's Telegram channel.\n\nIf you run a space: open the Floor app, go to Manage, then Telegram teasers.",
};

/**
 * Why Telegram refused a notice, as the short code the app turns into a sentence.
 * - removed: the bot is no longer in the chat, or the chat is gone.
 * - no_rights: the bot is there but may not post.
 * - moved: Telegram turned the group into a bigger kind, with a new address.
 * - refused: anything else.
 */
export function failureCode(status: number, description: string): "removed" | "no_rights" | "moved" | "refused" {
  const words = description.toLowerCase();
  if (words.includes("migrated") || words.includes("upgraded to a supergroup")) return "moved";
  if (words.includes("kicked") || words.includes("not a member") || words.includes("chat not found") || words.includes("deactivated")) return "removed";
  if (words.includes("rights") || words.includes("write_forbidden") || words.includes("not enough")) return "no_rights";
  if (status === 403) return "removed";
  return "refused";
}
