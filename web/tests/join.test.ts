import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  formatPrice,
  inviteMessage,
  isVip,
  latestRequests,
  priceLine,
  proofPath,
  proofProblem,
  stepFor,
  type Membership,
} from "@/features/join/logic";

const member: Membership = { role: "member", status: "active", vip_until: null };

describe("stepFor", () => {
  it("waits until it knows who is looking", () => {
    expect(stepFor({ signedIn: undefined, membership: undefined, displayName: undefined, wantsToJoin: false })).toBe("loading");
    expect(stepFor({ signedIn: true, membership: undefined, displayName: undefined, wantsToJoin: false })).toBe("loading");
  });

  it("shows a visitor the space first, and sign-in only once they press Join", () => {
    expect(stepFor({ signedIn: false, membership: undefined, displayName: undefined, wantsToJoin: false })).toBe("intro");
    expect(stepFor({ signedIn: false, membership: undefined, displayName: undefined, wantsToJoin: true })).toBe("sign-in");
  });

  it("does not join someone just because they are signed in", () => {
    expect(stepFor({ signedIn: true, membership: null, displayName: "Ada", wantsToJoin: false })).toBe("intro");
  });

  it("asks a new member what to call them, once", () => {
    expect(stepFor({ signedIn: true, membership: member, displayName: "Member", wantsToJoin: true })).toBe("name");
    expect(stepFor({ signedIn: true, membership: member, displayName: "Ada O.", wantsToJoin: true })).toBe("member");
  });

  it("never asks the mentor, and stops a banned member", () => {
    const mentor: Membership = { role: "mentor", status: "active", vip_until: null };
    expect(stepFor({ signedIn: true, membership: mentor, displayName: "Member", wantsToJoin: false })).toBe("member");
    const banned: Membership = { ...member, status: "banned" };
    expect(stepFor({ signedIn: true, membership: banned, displayName: "Ada", wantsToJoin: true })).toBe("banned");
  });
});

describe("isVip", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  it("goes by the date", () => {
    expect(isVip({ ...member, vip_until: "2026-12-01T00:00:00Z" }, now)).toBe(true);
    expect(isVip({ ...member, vip_until: "2026-11-18T11:59:59Z" }, now)).toBe(false);
    expect(isVip(member, now)).toBe(false);
  });
  it("counts staff as VIP", () => {
    expect(isVip({ role: "admin", status: "active", vip_until: null }, now)).toBe(true);
  });
});

describe("prices", () => {
  it("writes ordinary money with its sign and no needless pennies", () => {
    expect(formatPrice(2_500_000, "NGN", "en-NG")).toBe("₦25,000");
    expect(formatPrice(4000, "USD", "en-US")).toBe("$40");
    expect(formatPrice(4050, "USD", "en-US")).toBe("$40.50");
  });

  it("copes with money the browser does not know", () => {
    expect(formatPrice(2500, "USDT", "en-US")).toBe("25 USDT");
  });

  it("makes the price line, or none when no price is set", () => {
    expect(priceLine({ vip_price_cents: 2_500_000, vip_currency: "NGN", vip_days: 30 }, "en-NG")).toBe("₦25,000 for 30 days");
    expect(priceLine({ vip_price_cents: null, vip_currency: null, vip_days: 30 })).toBeNull();
    expect(priceLine({ vip_price_cents: 0, vip_currency: "USD", vip_days: 1 })).toBe("Free for 1 day");
  });
});

describe("proof files", () => {
  it("accepts photos and PDFs up to 5 MB", () => {
    expect(proofProblem({ size: 300_000, type: "image/jpeg" })).toBeNull();
    expect(proofProblem({ size: 300_000, type: "application/pdf" })).toBeNull();
    expect(proofProblem({ size: 6 * 1024 * 1024, type: "image/png" })).toMatch(/5 MB/);
    expect(proofProblem({ size: 1000, type: "video/mp4" })).toMatch(/photo/);
    expect(proofProblem({ size: 0, type: "image/png" })).toMatch(/empty/);
  });

  it("keeps a file under the member's own folder in the space, with a safe name", () => {
    const path = proofPath("space-1", "user-9", "My Receipt (final).JPG", 1700000000000);
    expect(path).toBe("space-1/user-9/1700000000000-my-receipt-final.jpg");
    expect(proofPath("s", "u", "…", 5)).toBe("s/u/5-proof");
  });
});

describe("requests", () => {
  it("keeps the newest of each kind", () => {
    const latest = latestRequests([
      { kind: "payment", status: "declined", decline_reason: "Blurry", created_at: "2026-11-01T00:00:00Z" },
      { kind: "payment", status: "pending", decline_reason: null, created_at: "2026-11-02T00:00:00Z" },
      { kind: "broker", status: "approved", decline_reason: null, created_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(latest.payment?.status).toBe("pending");
    expect(latest.broker?.status).toBe("approved");
  });
});

describe("messages", () => {
  it("gives the same answer for every bad code", () => {
    expect(inviteMessage({ message: "invite_invalid" })).toMatch(/doesn't work/);
    expect(inviteMessage({ message: "invite_already_used" })).toMatch(/already used/);
  });
});

describe("files shared with the phone app", () => {
  // These files are kept in both apps. If this fails, copy the phone app's file over the web's.
  for (const [web, phone] of [
    ["src/theme/themes.ts", "../mobile/src/theme/themes.ts"],
    ["src/auth/messages.ts", "../mobile/src/auth/messages.ts"],
    ["src/lib/initials.ts", "../mobile/src/lib/initials.ts"],
  ]) {
    it(`${web} matches the phone app's copy`, () => {
      expect(readFileSync(web, "utf8")).toBe(readFileSync(phone, "utf8"));
    });
  }
});
