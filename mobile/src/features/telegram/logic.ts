// Telegram teasers: how the screen words things. Plain logic, tested in tests/.

/** Where a space's teasers stand, as the database gives it to the mentor. */
export interface TeaserStatus {
  connected: boolean;
  /** The channel or group the bot posts in. */
  chatTitle: string | null;
  chatKind: "channel" | "supergroup" | "group" | null;
  /** The code waiting to be posted in the chat, while it lasts. */
  code: string | null;
  codeExpiresAt: string | null;
  setups: boolean;
  posts: boolean;
  lessons: boolean;
  live: boolean;
  lastSentAt: string | null;
  /** Why the last notice could not be posted, as a short code. */
  lastError: string | null;
}

export type TeaserSwitch = "setups" | "posts" | "lessons";

/** The kinds of notice a mentor can switch on and off, with what each one gives away. */
export const TEASER_SWITCHES: { key: TeaserSwitch; label: string; detail: string }[] = [
  { key: "setups", label: "New setups", detail: "Says a setup was posted and names the pair. The entry, stop and targets stay in the app." },
  { key: "posts", label: "New posts", detail: "The first lines of a post for everyone. For a VIP post, its title and nothing more." },
  { key: "lessons", label: "New lessons", detail: "The lesson's title." },
];

/** The line the mentor posts in their channel. */
export function connectLine(code: string): string {
  return `/connect ${code}`;
}

/** "@FloorTeaserBot", however the name arrived. */
export function botHandle(name: string): string {
  const clean = name.trim().replace(/^@+/, "");
  return clean ? `@${clean}` : "Floor's bot";
}

/** "The code works for 28 more minutes.", or null once it has run out. */
export function codeLasts(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const left = Math.ceil((Date.parse(expiresAt) - now) / 60_000);
  if (!(left > 0)) return null;
  return left === 1 ? "The code works for 1 more minute." : `The code works for ${left} more minutes.`;
}

/** "your channel Kay FX Signals", "your group Gold talk". */
export function chatName(status: Pick<TeaserStatus, "chatTitle" | "chatKind">): string {
  const kind = status.chatKind === "channel" ? "channel" : "group";
  return status.chatTitle ? `${kind} ${status.chatTitle}` : kind;
}

/** What to tell the mentor when the last notice could not be posted. Null when all is well. */
export function teaserProblem(status: Pick<TeaserStatus, "lastError" | "chatTitle" | "chatKind">): string | null {
  const where = status.chatTitle ?? "the chat";
  switch (status.lastError) {
    case null:
      return null;
    case "removed":
      return `Floor's bot is no longer in ${where}. Add it back as an admin, then send a test.`;
    case "no_rights":
      return `Floor's bot is in ${where} but is not allowed to post. Make it an admin that can post messages, then send a test.`;
    case "moved":
      return "Telegram gave this group a new address. Disconnect, then connect it again.";
    default:
      return "Telegram would not take the last notice. Send a test to try again.";
  }
}

/** What to say when setting teasers up failed. */
export function teaserMessage(code: string | null | undefined): string {
  switch (code) {
    case "telegram_not_set_up":
    case "not_set_up":
      return "Telegram teasers are not switched on in this copy of Floor yet.";
    case "telegram_unavailable":
      return "Telegram could not be reached. Try again in a moment.";
    case "not_connected":
      return "No channel is connected yet.";
    case "not_allowed":
      return "Only the mentor can set up Telegram teasers.";
    case "signed_out":
      return "Sign in again, then come back here.";
    case "offline":
      return "Check your connection and try again.";
    default:
      return "That didn't go through. Try again.";
  }
}
