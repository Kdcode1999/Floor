import { describe, expect, it } from "vitest";

import {
  amountText,
  codeStanding,
  countsLine,
  linkProblem,
  parseAmount,
  parseDays,
  setupChanges,
  setupProblems,
  standing,
  type SetupForm,
} from "../src/features/manage/logic";
import { daysUntil, formatPrice, timeAgo } from "../src/lib/format";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe("money and days", () => {
  it("reads typed amounts into cents", () => {
    expect(parseAmount("25,000")).toBe(2_500_000);
    expect(parseAmount("40")).toBe(4000);
    expect(parseAmount("40.5")).toBe(4050);
    expect(parseAmount(" 1 000 ")).toBe(100_000);
    for (const bad of ["", "abc", "40.555", "-5", "1e3"]) expect(parseAmount(bad)).toBeNull();
  });

  it("writes cents back the way they were typed", () => {
    expect(amountText(2_500_000)).toBe("25000");
    expect(amountText(4050)).toBe("40.50");
    expect(amountText(null)).toBe("");
  });

  it("reads days from 1 to 3660", () => {
    expect(parseDays("30")).toBe(30);
    for (const bad of ["0", "3661", "1.5", "", "ten"]) expect(parseDays(bad)).toBeNull();
  });

  it("formats prices", () => {
    expect(formatPrice(2_500_000, "NGN", "en-NG")).toBe("₦25,000");
    expect(formatPrice(2500, "USDT", "en-US")).toBe("25 USDT");
  });
});

describe("links", () => {
  it("accepts https links and an empty box, and nothing else", () => {
    expect(linkProblem("")).toBeNull();
    expect(linkProblem("https://pay.example/kings")).toBeNull();
    expect(linkProblem("http://pay.example")).not.toBeNull();
    expect(linkProblem("pay.example")).not.toBeNull();
    expect(linkProblem("https://nodot")).not.toBeNull();
  });
});

describe("the setup form", () => {
  const form: SetupForm = {
    tagline: " London session ",
    price: "25,000",
    currency: "NGN",
    vipDays: "30",
    instructions: "Bank: 0123456789",
    paymentLink: "",
    brokerName: "",
    brokerLink: "https://broker.example/ref",
    brokerDays: "60",
  };

  it("passes a good form and turns it into the two rows", () => {
    expect(setupProblems(form)).toEqual({});
    expect(setupChanges(form)).toEqual({
      space: { tagline: "London session", vip_price_cents: 2_500_000, vip_currency: "NGN", vip_days: 30, broker_name: null },
      settings: { payment_instructions: "Bank: 0123456789", payment_link: null, broker_link: "https://broker.example/ref", broker_vip_days: 60 },
    });
  });

  it("clears the money along with the price", () => {
    expect(setupChanges({ ...form, price: "" }).space).toMatchObject({ vip_price_cents: null, vip_currency: null });
  });

  it("names each thing that is wrong", () => {
    const problems = setupProblems({ ...form, price: "lots", currency: "naira", vipDays: "0", paymentLink: "pay.example" });
    expect(Object.keys(problems).sort()).toEqual(["currency", "paymentLink", "price", "vipDays"]);
  });
});

describe("where a member stands", () => {
  const member = { role: "member" as const, status: "active" as const, vip_until: null as string | null, vip: false };
  const vip = (daysLeft: number) => ({ ...member, vip_until: at(daysLeft), vip: true });

  it("goes by role first, then by VIP", () => {
    expect(standing({ ...member, role: "mentor" }, NOW).kind).toBe("mentor");
    expect(standing({ ...member, role: "admin" }, NOW).kind).toBe("admin");
    expect(standing(member, NOW)).toEqual({ kind: "free", label: "Free" });
    expect(standing(vip(40), NOW, "en-GB")).toEqual({ kind: "vip", label: "VIP until 28 Dec 2026" });
  });

  it("flags VIP that is about to end", () => {
    expect(standing(vip(3), NOW)).toEqual({ kind: "expiring", label: "VIP ends in 3 days" });
    expect(standing(vip(0.5), NOW)).toEqual({ kind: "expiring", label: "VIP ends tomorrow" });
  });

  it("drops a member back to free once their VIP has ended", () => {
    expect(standing({ ...member, vip_until: at(-2) }, NOW, "en-GB")).toEqual({ kind: "free", label: "Free · VIP ended 16 Nov 2026" });
  });

  it("takes the database's word on whether VIP is running, not the phone's clock", () => {
    // The phone's clock is a little behind: VIP that just ended still looks a moment ahead.
    expect(standing({ ...member, vip_until: at(0.0001), vip: false }, NOW).kind).toBe("free");
    // Or a little ahead: VIP that is still running looks as if it has passed.
    expect(standing({ ...member, vip_until: at(-0.0001), vip: true }, NOW)).toEqual({ kind: "expiring", label: "VIP ends tomorrow" });
  });

  it("shows a removed member as removed, whatever else they were", () => {
    expect(standing({ ...member, status: "banned", vip_until: at(40), vip: false }, NOW).kind).toBe("banned");
  });
});

describe("the line that counts a space's people", () => {
  it("leaves out what there is none of", () => {
    expect(countsLine({ members: 1, vip: 0, expiring: 0, removed: 0 })).toBe("1 member · 0 VIP");
    expect(countsLine({ members: 128, vip: 40, expiring: 3, removed: 2 })).toBe("128 members · 40 VIP · 3 ending soon · 2 removed");
  });
});

describe("where an invite code stands", () => {
  const code = { days: 7, max_uses: null as number | null, used_count: 0, expires_at: null as string | null, revoked: false };

  it("says what a live code gives and how much it has been used", () => {
    expect(codeStanding(code, NOW)).toEqual({ live: true, label: "7 days of VIP · Not used yet" });
    expect(codeStanding({ ...code, max_uses: 10, used_count: 2 }, NOW)).toEqual({ live: true, label: "7 days of VIP · Used 2 of 10" });
  });

  it("knows when a code no longer works", () => {
    expect(codeStanding({ ...code, revoked: true }, NOW).live).toBe(false);
    expect(codeStanding({ ...code, expires_at: at(-1) }, NOW).live).toBe(false);
    expect(codeStanding({ ...code, max_uses: 1, used_count: 1 }, NOW).live).toBe(false);
  });
});

describe("time in words", () => {
  it("says how long ago", () => {
    expect(timeAgo(NOW - 20_000, NOW)).toBe("Just now");
    expect(timeAgo(NOW - 12 * 60_000, NOW)).toBe("12 min ago");
    expect(timeAgo(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
    expect(timeAgo(NOW - 1.2 * DAY, NOW)).toBe("Yesterday");
    expect(timeAgo(NOW - 5 * DAY, NOW)).toBe("5 days ago");
  });

  it("counts days until a date, rounding up", () => {
    expect(daysUntil(at(0.2), NOW)).toBe(1);
    expect(daysUntil(at(-1), NOW)).toBe(-1);
  });
});
