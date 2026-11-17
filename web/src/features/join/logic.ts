// The join page's plain logic: what to show, how to word prices and dates, which files are
// accepted as proof. No browser code in here. Tested in tests/.

import type { ThemeName } from "@/theme/themes";

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

export type RequestKind = "payment" | "broker";

/** A request for VIP the visitor has sent. Mirrors `access_requests`. */
export interface AccessRequest {
  kind: RequestKind;
  status: "pending" | "approved" | "declined";
  decline_reason: string | null;
  created_at: string;
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

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** What is wrong with a file offered as proof, or null when it is fine. The storage bucket enforces the same. */
export function proofProblem(file: { size: number; type: string }): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Use a photo (JPG, PNG or WebP) or a PDF.";
  if (file.size > PROOF_MAX_BYTES) return "That file is over 5 MB. Use a smaller one.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * Where a proof file is kept: `<space>/<member>/<time>-<name>`. The database only accepts a
 * request whose file sits under the member's own folder in that space.
 */
export function proofPath(spaceId: string, userId: string, fileName: string, now: number): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const stem = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${spaceId}/${userId}/${now}-${stem || "proof"}${extension ? `.${extension}` : ""}`;
}

/** The newest request of each kind. */
export function latestRequests(requests: AccessRequest[]): Partial<Record<RequestKind, AccessRequest>> {
  const latest: Partial<Record<RequestKind, AccessRequest>> = {};
  for (const request of requests) {
    const current = latest[request.kind];
    if (!current || Date.parse(request.created_at) > Date.parse(current.created_at)) latest[request.kind] = request;
  }
  return latest;
}

export interface Failure {
  message?: string | null;
  code?: string | null;
}

/** What to say when using an invite code failed. */
export function inviteMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "invite_invalid") return "That code doesn't work. Check it with your mentor.";
  if (message === "invite_already_used") return "You've already used that code.";
  if (message === "banned") return "You can't join this space.";
  return "The code couldn't be checked. Try again.";
}

/** What to say when sending a proof failed. */
export function proofMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "already_pending") return "You've already sent one. Wait for your mentor to check it.";
  if (message === "banned") return "You can't join this space.";
  if (message === "space_unavailable") return "This space isn't open right now.";
  return "That couldn't be sent. Check your connection and try again.";
}

/** What to say when saving a name failed. */
export function nameMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message.includes("profiles_display_name_reserved")) return "That name can't be used. Try another.";
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
