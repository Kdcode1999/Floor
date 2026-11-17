// The mentor tools' plain logic: reading what was typed into the setup form, and wording where
// a member, a request or an invite code stands. No phone code in here. Tested in tests/.

import { days, daysUntil, formatDay } from "@/lib/format";

/** The currencies offered as one-tap choices. The database accepts any 3 to 5 capital letters. */
export const CURRENCIES = ["NGN", "USD", "USDT", "GHS", "KES", "ZAR", "GBP", "EUR"];

/** VIP lengths offered as one-tap choices. */
export const DAY_CHOICES = [7, 30, 90, 365];

/** Reads typed money into cents: "25,000" is 2500000. Null when it is not an amount. */
export function parseAmount(typed: string): number | null {
  const clean = typed.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents <= 2_000_000_000 ? cents : null;
}

/** Writes cents back the way a person would type them: 2500000 is "25000", 4050 is "40.50". */
export function amountText(cents: number | null): string {
  if (cents === null) return "";
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Reads typed whole days. Null when it is not between 1 and 3660. */
export function parseDays(typed: string): number | null {
  if (!/^\d{1,4}$/.test(typed.trim())) return null;
  const count = Number(typed.trim());
  return count >= 1 && count <= 3660 ? count : null;
}

/** What is wrong with a web address a mentor typed, or null when it is fine or empty. */
export function linkProblem(typed: string): string | null {
  const link = typed.trim();
  if (link === "") return null;
  if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return "Start the link with https://";
  return null;
}

export interface SetupForm {
  tagline: string;
  price: string;
  currency: string;
  vipDays: string;
  instructions: string;
  paymentLink: string;
  brokerName: string;
  brokerLink: string;
  brokerDays: string;
}

export type SetupProblems = Partial<Record<keyof SetupForm, string>>;

/** Everything wrong with the setup form, by field. Empty when it can be saved. */
export function setupProblems(form: SetupForm): SetupProblems {
  const problems: SetupProblems = {};
  if (form.tagline.trim().length > 80) problems.tagline = "Keep it to 80 letters or fewer.";
  if (form.price.trim() !== "" && parseAmount(form.price) === null) problems.price = "Type an amount, like 25000.";
  if (!/^[A-Z]{3,5}$/.test(form.currency)) problems.currency = "Use 3 to 5 capital letters, like NGN.";
  if (parseDays(form.vipDays) === null) problems.vipDays = "Type a number of days, from 1 to 3660.";
  if (form.instructions.length > 1000) problems.instructions = "Keep it to 1000 letters or fewer.";
  const pay = linkProblem(form.paymentLink);
  if (pay) problems.paymentLink = pay;
  if (form.brokerName.trim().length > 40) problems.brokerName = "Keep it to 40 letters or fewer.";
  const broker = linkProblem(form.brokerLink);
  if (broker) problems.brokerLink = broker;
  if (parseDays(form.brokerDays) === null) problems.brokerDays = "Type a number of days, from 1 to 3660.";
  return problems;
}

/** What the form becomes in the database: the two rows a mentor may change. */
export function setupChanges(form: SetupForm) {
  const price = form.price.trim() === "" ? null : parseAmount(form.price);
  const empty = (text: string) => (text.trim() === "" ? null : text.trim());
  return {
    space: {
      tagline: empty(form.tagline),
      vip_price_cents: price,
      vip_currency: price === null ? null : form.currency,
      vip_days: parseDays(form.vipDays) ?? 30,
      broker_name: empty(form.brokerName),
    },
    settings: {
      payment_instructions: empty(form.instructions),
      payment_link: empty(form.paymentLink),
      broker_link: empty(form.brokerLink),
      broker_vip_days: parseDays(form.brokerDays) ?? 30,
    },
  };
}

export interface MemberRow {
  role: "mentor" | "admin" | "member";
  status: "active" | "banned";
  vip_until: string | null;
  /** Whether their VIP is running, as the database says by its own clock. */
  vip: boolean;
}

export type Standing = "mentor" | "admin" | "banned" | "expiring" | "vip" | "free";

/** A VIP member is "expiring" in their last days, so the mentor can nudge them to renew. */
export const EXPIRING_WITHIN_DAYS = 5;

/** Where a member stands, and the few words that say so. */
export function standing(member: MemberRow, now: number, locale?: string): { kind: Standing; label: string } {
  if (member.status === "banned") return { kind: "banned", label: "Removed" };
  if (member.role === "mentor") return { kind: "mentor", label: "Mentor" };
  if (member.role === "admin") return { kind: "admin", label: "Admin" };
  if (member.vip_until === null) return { kind: "free", label: "Free" };
  // The phone's clock only words how long is left. Whether VIP is running is the database's call.
  if (!member.vip) return { kind: "free", label: `Free · VIP ended ${formatDay(member.vip_until, locale)}` };
  const left = Math.max(1, daysUntil(member.vip_until, now));
  if (left <= EXPIRING_WITHIN_DAYS) {
    return { kind: "expiring", label: left === 1 ? "VIP ends tomorrow" : `VIP ends in ${days(left)}` };
  }
  return { kind: "vip", label: `VIP until ${formatDay(member.vip_until, locale)}` };
}

/** One line that sums a space's people up: "128 members · 40 VIP · 3 ending soon". */
export function countsLine(counts: { members: number; vip: number; expiring: number; removed: number }): string {
  const parts = [`${counts.members} ${counts.members === 1 ? "member" : "members"}`, `${counts.vip} VIP`];
  if (counts.expiring > 0) parts.push(`${counts.expiring} ending soon`);
  if (counts.removed > 0) parts.push(`${counts.removed} removed`);
  return parts.join(" · ");
}

export interface CodeRow {
  days: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  revoked: boolean;
}

/** Where an invite code stands: whether it still works, and how much it has been used. */
export function codeStanding(code: CodeRow, now: number): { live: boolean; label: string } {
  const used = code.max_uses === null ? `Used ${code.used_count} times` : `Used ${code.used_count} of ${code.max_uses}`;
  const gives = `${days(code.days)} of VIP`;
  if (code.revoked) return { live: false, label: `Switched off · ${used}` };
  if (code.expires_at !== null && Date.parse(code.expires_at) <= now) return { live: false, label: `Ran out of time · ${used}` };
  if (code.max_uses !== null && code.used_count >= code.max_uses) return { live: false, label: `All used · ${gives}` };
  return { live: true, label: `${gives} · ${used.replace("Used 0 times", "Not used yet")}` };
}

export interface Failure {
  message?: string | null;
  code?: string | null;
}

/** What to say when a mentor tool's action failed. */
export function actionMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "not_allowed") return "You're not allowed to do that in this space.";
  if (message === "already_decided") return "Someone has already answered this request.";
  if (message === "request_not_found" || message === "member_not_found") return "That's no longer there. Pull down to refresh.";
  if (message === "code_taken") return "That code is already in use. Try another.";
  if (message === "bad_code") return "Use 4 to 20 capital letters and numbers.";
  if (message === "bad_days") return "Type a number of days, from 1 to 3660.";
  if (message.includes("spaces_vip_currency")) return "Use 3 to 5 capital letters for the currency, like NGN.";
  return "That didn't go through. Check your connection and try again.";
}
