// The join page's plain logic: what to show, how to word prices and dates, which files are
// accepted as proof. No browser code in here. Tested in tests/.

import type { ThemeName } from "@/theme/themes";

import type { Failure } from "@/features/vip/logic";

export {
  declinedLine,
  inviteMessage,
  latestRequests,
  PROOF_MAX_BYTES,
  PROOF_TYPES,
  proofMessage,
  proofPath,
  proofProblem,
  type AccessRequest,
  type Failure,
  type RequestKind,
} from "@/features/vip/logic";

/** What anyone may know about a space. Mirrors the public columns of `spaces`. */
export interface PublicSpace {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  theme: ThemeName;
  /** The logo's place in the "logos" file store, or null when the space has none. */
  logo_path: string | null;
  vip_price_cents: number | null;
  vip_currency: string | null;
  vip_days: number;
  broker_name: string | null;
}

/** The visitor's place in the space. Mirrors their row in `memberships`. */
export interface Membership {
  role: "mentor" | "admin" | "member";
  status: "active" | "banned";
  vip_until: string | null;
}

/** How to pay and how to prove a broker account. Only members may read it. */
export interface Settings {
  payment_link: string | null;
  payment_instructions: string | null;
  broker_link: string | null;
  broker_vip_days: number;
}

export type Step =
  /** Working out who is looking. */
  | "loading"
  /** Not a member yet: the space, what they get, and a Join button. */
  | "intro"
  /** Pressed Join while signed out: email, then code. */
  | "sign-in"
  /** A member whose name is still the placeholder: ask what to call them. */
  | "name"
  /** A member: their status and the ways to VIP. */
  | "member"
  /** Banned from this space. */
  | "banned";

export interface Situation {
  /** Undefined while the browser is still finding out whether someone is signed in. */
  signedIn: boolean | undefined;
  /** Undefined while loading. Null when signed in but not a member. */
  membership: Membership | null | undefined;
  /** The name on their profile. "Member" is the placeholder new accounts get. */
  displayName: string | undefined;
  /** True once the visitor pressed Join. */
  wantsToJoin: boolean;
}

export function stepFor({ signedIn, membership, displayName, wantsToJoin }: Situation): Step {
  if (signedIn === undefined) return "loading";
  if (!signedIn) return wantsToJoin ? "sign-in" : "intro";
  if (membership === undefined) return "loading";
  if (membership === null) return "intro";
  if (membership.status === "banned") return "banned";
  if (membership.role === "member" && (displayName === undefined || displayName === "Member")) return "name";
  return "member";
}

/** True while the member's VIP date is still ahead. Staff always count as VIP. */
export function isVip(membership: Membership, now: number): boolean {
  if (membership.role !== "member") return true;
  return membership.vip_until !== null && Date.parse(membership.vip_until) > now;
}

/** "₦25,000", "$40", or "25 USDT" for money that is not an ordinary currency. */
export function formatPrice(cents: number, currency: string, locale?: string): string {
  const amount = cents / 100;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    // Not a currency the browser knows, such as USDT.
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
    return `${number} ${currency}`;
  }
}

/** "30 days", "1 day". */
export function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

/** The price line on the join page, or null when the mentor has not set a price. */
export function priceLine(space: Pick<PublicSpace, "vip_price_cents" | "vip_currency" | "vip_days">, locale?: string): string | null {
  if (space.vip_price_cents === null || !space.vip_currency) return null;
  if (space.vip_price_cents === 0) return `Free for ${days(space.vip_days)}`;
  return `${formatPrice(space.vip_price_cents, space.vip_currency, locale)} for ${days(space.vip_days)}`;
}

/** "12 Dec 2026". */
export function formatDay(value: string, locale?: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** What to say when saving a name failed. */
export function nameMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message.includes("name_has_contact")) return "A name can't carry a link, an @name or a phone number.";
  if (message.includes("name_taken")) return "That is the name of this space, its mentor or an admin. Choose another.";
  if (message.includes("profiles_display_name_reserved")) {
    return "Names can't use words like Admin, Mentor, Support or Official. The mentor and admins get a badge instead.";
  }
  if (message.includes("profiles_display_name")) return "Use a name of 1 to 40 letters.";
  return "Your name couldn't be saved. Try again.";
}

/** One of a space's newest posts, as the database gives it to a visitor. */
export interface PreviewRow {
  kind: "post" | "setup";
  locked: boolean;
  title: string | null;
  pair: string | null;
  /** The opening words of a free post. */
  snippet: string | null;
  created_at: string;
}

/** The same post, worded for the join page. */
export interface PreviewItem {
  locked: boolean;
  title: string;
  /** The opening words of a free post, or null. */
  detail: string | null;
  /** "VIP · 2 hours ago" or "Free · Yesterday". */
  meta: string;
}

/** How long ago something happened, in words: "12 min ago", "3 hours ago", "Yesterday". */
export function timeAgo(value: string, now: number, locale?: string): string {
  const gap = now - new Date(value).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (gap < minute) return "Just now";
  if (gap < hour) return `${Math.floor(gap / minute)} min ago`;
  if (gap < day) return Math.floor(gap / hour) === 1 ? "1 hour ago" : `${Math.floor(gap / hour)} hours ago`;
  if (gap < 2 * day) return "Yesterday";
  if (gap < 14 * day) return `${Math.floor(gap / day)} days ago`;
  return formatDay(value, locale);
}

/** Words one post for the join page. A locked post gives away its kind and nothing more. */
export function previewLine(row: PreviewRow, now: number, locale?: string): PreviewItem {
  const title =
    row.kind === "setup"
      ? row.pair
        ? `${row.pair} setup`
        : "Trade setup"
      : (row.title ?? (row.locked ? "A post for VIP members" : (row.snippet ?? "A new post")));
  const usedSnippet = row.kind === "post" && !row.title && !row.locked;
  return {
    locked: row.locked,
    title,
    detail: row.locked || usedSnippet ? null : row.snippet,
    meta: `${row.locked ? "VIP" : "Free"} · ${timeAgo(row.created_at, now, locale)}`,
  };
}
