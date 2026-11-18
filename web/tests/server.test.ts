import { createHash, createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The server reads its settings when it starts, so they are set before it is loaded.
vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "12345");
vi.stubEnv("BUNNY_STREAM_API_KEY", "library-api-key");
vi.stubEnv("BUNNY_STREAM_CDN_HOST", "vz-test.b-cdn.net");
vi.stubEnv("BUNNY_STREAM_TOKEN_KEY", "token-key");

let bunny: typeof import("@/server/bunny");
let http: typeof import("@/server/http");

beforeAll(async () => {
  bunny = await import("@/server/bunny");
  http = await import("@/server/http");
});

const VIDEO = "657bb740-a71b-4529-a012-528021c31a92";
const NOW = Date.parse("2026-11-18T12:00:00Z");

describe("an upload ticket", () => {
  it("is signed the way the video host checks it, and lasts a day", () => {
    const ticket = bunny.uploadTicket(VIDEO, NOW);
    const expires = NOW / 1000 + 24 * 60 * 60;
    expect(ticket.endpoint).toBe("https://video.bunnycdn.com/tusupload");
    expect(ticket.headers).toEqual({
      AuthorizationSignature: createHash("sha256").update(`12345library-api-key${expires}${VIDEO}`).digest("hex"),
      AuthorizationExpire: String(expires),
      VideoId: VIDEO,
      LibraryId: "12345",
    });
  });

  it("is good for one video only", () => {
    const other = bunny.uploadTicket("00000000-0000-4000-8000-000000000000", NOW);
    expect(other.headers.AuthorizationSignature).not.toBe(bunny.uploadTicket(VIDEO, NOW).headers.AuthorizationSignature);
  });
});

describe("a playback address", () => {
  it("carries a token for the video's own folder, in the path, so a player can follow the video's links", () => {
    const { url, poster, expires } = bunny.playback(VIDEO, NOW);
    expect(expires).toBe(NOW / 1000 + 6 * 60 * 60);

    const folder = `/${VIDEO}/`;
    const token = createHmac("sha256", "token-key").update(`${folder}${expires}token_path=${folder}`).digest("base64url");
    const start = `https://vz-test.b-cdn.net/bcdn_token=HS256-${token}&expires=${expires}&token_path=%2F${VIDEO}%2F/${VIDEO}/`;
    expect(url).toBe(`${start}playlist.m3u8`);
    expect(poster).toBe(`${start}thumbnail.jpg`);
  });

  it("is different for every video and every expiry", () => {
    const one = bunny.signedAddress(VIDEO, "playlist.m3u8", 1000);
    expect(bunny.signedAddress(VIDEO, "playlist.m3u8", 1001)).not.toBe(one);
    expect(bunny.signedAddress("another-video", "playlist.m3u8", 1000)).not.toContain(one.split("&")[0].split("=")[1]);
  });
});

describe("reading a request", () => {
  const request = (headers: Record<string, string>, text = "{}") => new Request("https://floor.example/api/x", { method: "POST", headers, body: text });

  it("takes the login from the header, and only if it has the shape of one", () => {
    expect(http.bearer(request({ authorization: "Bearer aaa.bbb.ccc" }))).toBe("aaa.bbb.ccc");
    expect(http.bearer(request({ authorization: "Bearer not-a-login" }))).toBeNull();
    expect(http.bearer(request({ authorization: "Basic aaa.bbb.ccc" }))).toBeNull();
    expect(http.bearer(request({}))).toBeNull();
  });

  it("reads a body that is an object, and treats anything else as empty", async () => {
    expect(await http.body(request({}, '{"lessonId":"x"}'))).toEqual({ lessonId: "x" });
    expect(await http.body(request({}, "[1,2]"))).toEqual({});
    expect(await http.body(request({}, "not json"))).toEqual({});
  });

  it("accepts an id only when it is one", () => {
    expect(http.id(VIDEO)).toBe(VIDEO);
    expect(http.id("1; drop table lessons")).toBeNull();
    expect(http.id(42)).toBeNull();
  });

  it("passes the database's short codes on, and hides everything else", async () => {
    const code = async (error: { message: string; code?: string } | null) => {
      const refusal = http.refusalFor(error);
      return refusal ? [refusal.status, ((await refusal.json()) as { error: string }).error] : null;
    };
    expect(await code(null)).toBeNull();
    expect(await code({ message: "not_allowed", code: "42501" })).toEqual([403, "not_allowed"]);
    expect(await code({ message: "permission denied for function x", code: "42501" })).toEqual([403, "not_allowed"]);
    expect(await code({ message: "video_not_ready", code: "P0001" })).toEqual([400, "video_not_ready"]);
    expect(await code({ message: "JWT expired", code: "PGRST303" })).toEqual([401, "signed_out"]);
    expect(await code({ message: 'relation "secret_table" does not exist', code: "42P01" })).toEqual([502, "database_unavailable"]);
  });
});
