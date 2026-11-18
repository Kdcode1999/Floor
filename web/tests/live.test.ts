import { TokenVerifier } from "livekit-server-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  LIVEKIT: { url: "wss://live.example.com", apiKey: "floor-key", apiSecret: ["a", "long", "made", "up", "secret", "for", "tests"].join("-") },
  liveConfigured: true,
  livekitApi: () => "https://live.example.com",
}));

const { passFor, personIn } = await import("@/server/live");
const secret = ["a", "long", "made", "up", "secret", "for", "tests"].join("-");

describe("a pass into a live room", () => {
  it("lets the broadcaster send, and nobody else", async () => {
    const host = await passFor("session-1", { id: "u1", name: "Kay", broadcaster: true });
    const viewer = await passFor("session-1", { id: "u2", name: "Vee", broadcaster: false });
    const verify = new TokenVerifier("floor-key", secret);
    const forHost = await verify.verify(host!.token);
    const forViewer = await verify.verify(viewer!.token);
    expect(host!.url).toBe("wss://live.example.com");
    expect(forHost.video).toMatchObject({ room: "session-1", roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
    expect(forViewer.video).toMatchObject({ room: "session-1", roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false });
    expect(forViewer.sub).toBe("u2");
    expect(forViewer.name).toBe("Vee");
  });

  it("reads who sent a sign-in token", () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(personIn(`${part({ alg: "HS256" })}.${part({ sub: "u9" })}.sig`)).toBe("u9");
    expect(personIn("not a token")).toBeNull();
  });
});
