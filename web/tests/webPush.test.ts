import { createECDH, randomBytes } from "node:crypto";

import webpush from "web-push";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const keys = webpush.generateVAPIDKeys();
vi.mock("@/server/env", () => ({
  WEB_PUSH: { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:alerts@example.com" },
  webPushConfigured: true,
}));

const { isWebAddress, sendWebAlerts } = await import("@/server/webPush");

/** A subscription the way a browser makes one. */
function subscription(name: string): string {
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  return JSON.stringify({
    endpoint: `https://web.push.example.com/push/${name}`,
    keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
  });
}

describe("alerts to the iPhone web app", () => {
  const words = { title: "Gold Desk", body: "New setup: XAUUSD · Buy", data: { type: "setup", space: "s1", id: "p1" } };

  it("tells a web app's address from a phone app's", () => {
    expect(isWebAddress(subscription("a"))).toBe(true);
    expect(isWebAddress("ExponentPushToken[abc]")).toBe(false);
  });

  it("builds each message encrypted for that browser and signed with Floor's key", () => {
    const details = webpush.generateRequestDetails(JSON.parse(subscription("live")) as webpush.PushSubscription, JSON.stringify(words), {
      vapidDetails: { subject: "mailto:alerts@example.com", publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 86400,
    });
    expect(details.endpoint).toBe("https://web.push.example.com/push/live");
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(String(details.headers.Authorization)).toMatch(new RegExp(`^vapid t=.+, k=${keys.publicKey}$`));
    // The words travel encrypted: they are not in the body as written.
    expect(Buffer.from(details.body as Buffer).includes(Buffer.from("XAUUSD"))).toBe(false);
  });

  it("counts what went out, drops addresses that are gone, and counts the rest as failed", async () => {
    const send = vi.spyOn(webpush, "sendNotification").mockImplementation(async (target) => {
      const path = (target as { endpoint: string }).endpoint;
      if (path.endsWith("/gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (path.endsWith("/busy")) throw Object.assign(new Error("Busy"), { statusCode: 503 });
      return { statusCode: 201, body: "", headers: {} };
    });
    const live = subscription("live");
    const gone = subscription("gone");
    const busy = subscription("busy");
    const result = await sendWebAlerts([live, gone, busy, "{not json"], words);
    expect({ ...result, dead: [...result.dead].sort() }).toEqual({ sent: 1, dead: [gone, "{not json"].sort(), failed: 1 });
    const options = send.mock.calls[0][2];
    expect(options).toMatchObject({ TTL: 86400, urgency: "high", vapidDetails: { subject: "mailto:alerts@example.com", publicKey: keys.publicKey } });
    expect(JSON.parse(String(send.mock.calls[0][1]))).toEqual(words);
    send.mockRestore();
  });
});
