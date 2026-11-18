// Chat's plain logic: the link and number filter, how a conversation is put together from what
// the server sends, and how things are worded. No phone code. Tested in tests/.

import { formatDay } from "@/lib/format";

import type { Audience, ChatRole, Group, GroupForm, Message, Posting } from "./types";

// --- The link and number filter ----------------------------------------------------------------
// Only the mentor and admins may post links or phone numbers. The database decides: see
// private.has_link and private.has_phone in the migrations. These are the same rules, so the
// app can say so the moment a member presses Send. Both are tested against one list of cases.

const LINK_RULES = [
  /(https?:\/\/|www\.)/i,
  /(^|[^a-z0-9])(t\.me|wa\.me|bit\.ly|discord\.gg|chat\.whatsapp\.com|tinyurl\.com)([^a-z0-9]|$)/i,
  /(^|[^a-z0-9@.])[a-z0-9-]{2,}\.(com|net|org|io|ng|app|xyz|info|biz|ly|gg|ai|uk|za|ke|gh|dev|page)(\/|[^a-z0-9]|$)/i,
  /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i,
  /(^|[^A-Za-z0-9_@])@[A-Za-z0-9_]{4,}/,
];

const PHONE_RULES = [/\+([ ()-]{0,2}[0-9]){9,}/, /(^|[^0-9.,])0([ ()-]{0,2}[0-9]){9,}/, /(^|[^0-9.,])[0-9]{10,}/];

/** True when the text carries a web address, an email address or an @name on another app. */
export const hasLink = (text: string) => LINK_RULES.some((rule) => rule.test(text));

/** True when the text carries a phone number. Prices and levels are not phone numbers. */
export const hasPhone = (text: string) => PHONE_RULES.some((rule) => rule.test(text));

export const MESSAGE_MAX = 2000;

/** What is wrong with a message before it is sent, or null. Staff may post links and numbers. */
export function sendProblem(body: string, staff: boolean): string | null {
  const text = body.trim();
  if (text === "") return "Type a message first.";
  if (text.length > MESSAGE_MAX) return "That is too long for one message. Split it in two.";
  if (!staff && hasLink(text)) return WORDS.no_links;
  if (!staff && hasPhone(text)) return WORDS.no_numbers;
  return null;
}

const WORDS: Record<string, string> = {
  no_links: "Only the mentor and admins can post links, email addresses or @names here.",
  no_numbers: "Only the mentor and admins can post phone numbers here. If these are prices, put commas between them.",
  staff_only: "Only the mentor and admins can write in this group.",
  muted: "You can't write here for now. The mentor or an admin has muted you.",
  pictures_staff_only: "Only the mentor and admins can post pictures here.",
  slow_down: "That is a lot of messages. Wait a minute, then carry on.",
  message_empty: "Type a message first.",
  message_too_long: "That is too long for one message. Split it in two.",
  not_allowed: "You can't write in this group.",
  own_message: "That is your own message. You can delete it instead.",
  cannot_block_staff: "The mentor and admins can't be blocked. If something is wrong, report the space from your Account.",
  too_many_groups: "A space can have 30 groups. Delete one first.",
  group_not_found: "That group no longer exists.",
  member_not_found: "That person is no longer a member, or is staff.",
};

/** What to say when something in chat failed. */
export function chatMessage(failure: { message?: string | null; code?: string | null }): string {
  const message = failure.message ?? "";
  if (WORDS[message]) return WORDS[message];
  if (failure.code === "42501") return WORDS.not_allowed;
  if (message.includes("groups_name")) return "Give the group a name of 1 to 40 letters.";
  if (message.includes("groups_about")) return "Keep the description under 200 letters.";
  return "That didn't go through. Check your connection and try again.";
}

// --- Putting a conversation together -----------------------------------------------------------

/**
 * Brings what the server sent into what the phone already holds: new messages are added,
 * changed ones replace their old selves, and the result is in the order they were written,
 * oldest first. A message that was deleted stays in the list, empty, so the screen can show
 * that something was removed there. A deleted message the phone never held is left out: there
 * is nothing on screen for it to be removed from.
 */
export function mergeMessages(held: Message[], arrived: Message[]): Message[] {
  if (arrived.length === 0) return held;
  const byId = new Map(held.map((message) => [message.id, message]));
  for (const message of arrived) {
    if (message.deleted && !byId.has(message.id)) continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The conversation without one person's messages, for the moment after they are blocked. */
export function withoutWriter(held: Message[], userId: string): Message[] {
  return held.filter((message) => message.userId !== userId);
}

/** The latest moment anything in the list changed: what to ask the server "since". */
export function lastChange(messages: Message[]): string | null {
  let latest: string | null = null;
  for (const message of messages) if (latest === null || message.changedAt > latest) latest = message.changedAt;
  return latest;
}

/**
 * The moment to ask for changes since. A little before the last change the phone knows of: two
 * messages written in the same instant can reach the database's books in either order.
 */
export function askSince(messages: Message[], openedAt: string): string {
  const latest = lastChange(messages) ?? openedAt;
  return new Date(Date.parse(latest) - 3000).toISOString();
}

/**
 * How long an open group waits before asking the database what is new, in milliseconds.
 *
 * - Another phone said something changed: ask, but not more than once a second, so a flood of
 *   such nudges cannot make a phone flood the database.
 * - Nudges can arrive (the live connection is up): ask only now and then, as a safety net.
 * - Nudges cannot arrive: ask every few seconds while the group is busy, and less and less
 *   often while nothing is being said.
 */
export function waitFor(nudged: boolean, live: boolean, quietRounds: number): number {
  if (nudged) return 1000;
  if (live) return 20_000;
  return Math.min(3000 + Math.max(quietRounds - 2, 0) * 2000, 12_000);
}

/** A row of the conversation as drawn: a message, or the line that starts a new day. */
export type ChatRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; /** True when the same person wrote the message just before. */ joined: boolean };

/** "Today", "Yesterday", or the date. */
export function dayLabel(value: string, now: number, locale?: string): string {
  const day = (time: number) => {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const gap = Math.round((day(now) - day(Date.parse(value))) / 86_400_000);
  if (gap <= 0) return "Today";
  if (gap === 1) return "Yesterday";
  return formatDay(value, locale);
}

/** How close together two messages from one person must be to be drawn as one run. */
const RUN_MS = 5 * 60_000;

/** The conversation as rows, oldest first, with a line where each day starts. */
export function chatRows(messages: Message[], now: number, locale?: string): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = "";
  let before: Message | null = null;
  for (const message of messages) {
    const label = dayLabel(message.createdAt, now, locale);
    const newDay = label !== lastDay;
    if (newDay) {
      rows.push({ kind: "day", key: `day-${message.id}`, label });
      lastDay = label;
    }
    const joined =
      !newDay &&
      before !== null &&
      before.userId === message.userId &&
      !before.deleted &&
      Date.parse(message.createdAt) - Date.parse(before.createdAt) < RUN_MS;
    rows.push({ kind: "message", key: message.id, message, joined });
    before = message;
  }
  return rows;
}

/** "14:05" or "2:05 PM", in the phone's own way of writing time. */
export function clock(value: string, locale?: string): string {
  return new Date(value).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

// --- Wording -------------------------------------------------------------------------------------

/** The badge beside a writer's name. Members get none. */
export function roleBadge(role: Message["role"]): string | null {
  if (role === "mentor") return "Mentor";
  if (role === "admin") return "Admin";
  return null;
}

export const AUDIENCE_WORDS: Record<Audience, { label: string; detail: string }> = {
  everyone: { label: "Everyone", detail: "Every member of the space, free or VIP." },
  vip: { label: "VIP", detail: "VIP members only. Free members see that it exists, locked." },
  invited: { label: "Invited", detail: "Only the members you add. Nobody else knows it is there." },
};

export const POSTING_WORDS: Record<Posting, { label: string; detail: string }> = {
  all: { label: "Everyone in the group", detail: "Members talk. Links and phone numbers are still for staff only." },
  staff: { label: "Mentor and admins only", detail: "Members read. Good for announcements." },
};

/** The line under a group's name in the list. */
export function groupLine(group: Group): string {
  if (!group.canOpen) return "For VIP members";
  if (!group.lastAt) return group.about ?? "No messages yet";
  const what = group.lastBody ?? (group.lastHasImage ? "Picture" : "");
  return group.lastName ? `${group.lastName}: ${what}` : what;
}

/** How many messages are waiting across the groups a person can open. */
export function totalUnread(groups: Pick<Group, "canOpen" | "unread">[]): number {
  return groups.reduce((sum, group) => sum + (group.canOpen ? Math.max(group.unread, 0) : 0), 0);
}

/** "3", "99+", or null when there is nothing unread. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/** What stands where the box to type in would be, for someone who may not write. Null when they may. */
export function cannotWrite(group: Pick<Group, "posting" | "canPost">, staff: boolean, mutedUntil: string | null, now: number, locale?: string): string | null {
  if (group.canPost) return null;
  if (!staff && mutedUntil && Date.parse(mutedUntil) > now) {
    return `You are muted until ${formatDay(mutedUntil, locale)}, ${clock(mutedUntil, locale)}. You can still read.`;
  }
  if (group.posting === "staff") return "Only the mentor and admins write here.";
  return "You can't write in this group.";
}

/** Something a person can do with a message. */
export type MessageChoice = "reply" | "copy" | "report" | "reportSpace" | "block" | "mute" | "delete";

/**
 * What a person can do with a message, in the order the choices are shown. The database holds
 * the same rules. This only keeps choices that would be refused off the screen.
 * - Everyone can report what someone else wrote: a member's message to the space's staff, and
 *   a message from the mentor or an admin to Floor, by reporting the space.
 * - A member can block another member, never the mentor or an admin.
 * - Staff can mute a member, and delete any message except that an admin cannot delete the mentor's.
 */
export function messageChoices(message: Pick<Message, "mine" | "role" | "body" | "deleted">, viewer: ChatRole, canReply: boolean): MessageChoice[] {
  if (message.deleted) return [];
  const viewerIsStaff = viewer !== "member";
  const writerIsStaff = message.role === "mentor" || message.role === "admin";
  const choices: MessageChoice[] = [];
  if (canReply) choices.push("reply");
  if (message.body) choices.push("copy");
  if (!message.mine && !viewerIsStaff) choices.push(writerIsStaff ? "reportSpace" : "report");
  if (!message.mine && !viewerIsStaff && !writerIsStaff) choices.push("block");
  if (!message.mine && viewerIsStaff && message.role === "member") choices.push("mute");
  if (message.mine || viewer === "mentor" || (viewer === "admin" && message.role !== "mentor")) choices.push("delete");
  return choices;
}

/** The words on each choice. */
export function choiceLabel(choice: MessageChoice, message: Pick<Message, "mine" | "name">): string {
  switch (choice) {
    case "reply":
      return "Reply";
    case "copy":
      return "Copy text";
    case "report":
      return "Report to the mentor and admins";
    case "reportSpace":
      return "Report this space to Floor";
    case "block":
      return `Block ${message.name}`;
    case "mute":
      return `Mute ${message.name}`;
    case "delete":
      return message.mine ? "Delete" : "Delete for everyone";
  }
}

/** The small tag beside a group's name. A group open to everyone gets none. */
export function audienceTag(audience: Audience): string | null {
  if (audience === "vip") return "VIP";
  if (audience === "invited") return "Invited";
  return null;
}

/** One line for staff: who a group is for, and who writes in it. */
export function groupSummary(group: Pick<Group, "audience" | "posting">): string {
  const who = { everyone: "Open to everyone", vip: "VIP members", invited: "Invited members" }[group.audience];
  return `${who} · ${group.posting === "staff" ? "Only staff write" : "Members can write"}`;
}

/** The line under a group's name at the top of the conversation. */
export function groupHeaderLine(group: Pick<Group, "audience" | "posting">): string {
  const who = { everyone: "Everyone in the space", vip: "VIP members", invited: "Invited members" }[group.audience];
  return group.posting === "staff" ? `${who} · Announcements` : who;
}

export interface GroupProblems {
  name?: string;
  about?: string;
}

/** What is wrong with a group's details before they are saved. Empty when nothing is. */
export function groupProblems(form: Pick<GroupForm, "name" | "about">): GroupProblems {
  const problems: GroupProblems = {};
  const name = form.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) problems.name = "Give the group a name.";
  else if (name.length > 40) problems.name = "Keep the name to 40 letters.";
  if (form.about.trim().length > 200) problems.about = "Keep the description under 200 letters.";
  return problems;
}

/** A list with one item moved a place up or down. The same list back when it cannot move. */
export function moved<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** "Muted until 12 Dec 2026, 14:05", or null when the person is not muted now. */
export function muteLine(mutedUntil: string | null, now: number, locale?: string): string | null {
  if (!mutedUntil || Date.parse(mutedUntil) <= now) return null;
  return `Muted until ${formatDay(mutedUntil, locale)}, ${clock(mutedUntil, locale)}`;
}

/** "Reported by 1 member", "Reported by 3 members". */
export function reportsLine(count: number): string {
  return count === 1 ? "Reported by 1 member" : `Reported by ${count} members`;
}

/** "2 messages waiting", for the row on Mentor home. */
export function reportedLine(count: number): string {
  if (count <= 0) return "Nothing is waiting";
  return count === 1 ? "1 message is waiting for you" : `${count} messages are waiting for you`;
}

/** When the newest message in a group was sent, short: "14:05" today, "Yesterday", or the date. */
export function lastWhen(value: string, now: number, locale?: string): string {
  const label = dayLabel(value, now, locale);
  return label === "Today" ? clock(value, locale) : label;
}

/** The name every account starts with. Someone still called this is asked to choose a name before they write. */
export const UNNAMED = "Member";

/** The lengths of mute staff can pick. */
export const MUTE_CHOICES: { hours: number; label: string }[] = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 168, label: "1 week" },
];
