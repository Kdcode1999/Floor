import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// A made-up bot token with the right shape. It is put together from parts so that no line of
// this file reads as a real token to a tool that scans the repo for leaked secrets.
const TOKEN = ["1234567890", `AA${"x".repeat(33)}`].join(":");

// The server reads its settings when it starts, so they are set before it is loaded.
vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
vi.stubEnv("TELEGRAM_API_URL", "https://telegram.test");

let words: typeof import("@/server/teaserWords");
let telegram: typeof import("@/server/telegram");

beforeAll(async () => {
  words = await import("@/server/teaserWords");
  telegram = await import("@/server/telegram");
});

afterEach(() => vi.unstubAllGlobals());

const space = { name: "Gold Desk", slug: "gold-desk" };
const SITE = "https://floor.example";
const WHERE = "Gold Desk on Floor: https://floor.example/gold-desk";

describe("a notice in the mentor's Telegram channel", () => {
  it("names a VIP setup by its pair and gives nothing else away", () => {
    const text = words.teaserFor({ type: "setup", audience: "vip", pair: "EURUSD", side: "buy" }, space, SITE);
    expect(text).toBe(`New VIP setup: EURUSD\n\nThe entry, stop and targets are inside, for VIP members.\n\n${WHERE}`);
    expect(text).not.toMatch(/buy|sell/i);
  });

  it("says which way a setup for everyone goes, and still keeps the prices for the app", () => {
    expect(words.teaserFor({ type: "setup", audience: "everyone", pair: "XAUUSD", side: "sell" }, space, SITE)).toBe(
      `New setup: XAUUSD · Sell\n\nThe entry, stop and targets are inside.\n\n${WHERE}`,
    );
    expect(words.teaserFor({ type: "setup", audience: "everyone", pair: null, side: null }, space, SITE)).toContain("New setup\n\n");
  });

  it("gives a VIP post's title at most, never its words", () => {
    const withTitle = words.teaserFor({ type: "post", audience: "vip", title: "Why I closed gold early", body: "Because the daily candle closed below 2650." }, space, SITE);
    expect(withTitle).toBe(`New for VIP members: Why I closed gold early\n\nRead it inside.\n\n${WHERE}`);
    const without = words.teaserFor({ type: "post", audience: "vip", title: null, body: "Secret words" }, space, SITE);
    expect(without).toBe(`New post for VIP members\n\nRead it inside.\n\n${WHERE}`);
    expect(without).not.toContain("Secret");
  });

  it("carries the start of a post that is for everyone", () => {
    expect(words.teaserFor({ type: "post", audience: "everyone", title: "Welcome", body: "Start here.\n\nRules below." }, space, SITE)).toBe(
      `Welcome\n\nStart here. Rules below.\n\n${WHERE}`,
    );
    const long = words.teaserFor({ type: "post", audience: "everyone", title: null, body: "word ".repeat(200) }, space, SITE);
    expect(long.split("\n\n")[0].length).toBeLessThanOrEqual(281);
    expect(long.split("\n\n")[0].endsWith("…")).toBe(true);
    expect(words.teaserFor({ type: "post", audience: "everyone", title: null, body: null }, space, SITE)).toBe(`New post\n\nSee it inside.\n\n${WHERE}`);
  });

  it("announces a lesson by its title", () => {
    expect(words.teaserFor({ type: "lesson", title: " Reading a chart " }, space, SITE)).toBe(`New lesson: Reading a chart\n\nWatch it inside, with VIP.\n\n${WHERE}`);
  });

  it("says the mentor is live, by the session's title", () => {
    expect(words.teaserFor({ type: "live", title: " London session " }, space, SITE)).toBe(`Live now: London session\n\nWatch it inside, with VIP.\n\n${WHERE}`);
  });

  it("has a test line the mentor can ask for", () => {
    expect(words.teaserFor({ type: "test" }, space, `${SITE}/`)).toBe(`This is a test from Floor. Notices for Gold Desk will be posted here.\n\n${WHERE}`);
  });

  it("cuts long words at a word", () => {
    expect(words.excerpt("short")).toBe("short");
    expect(words.excerpt("one two three four five", 12)).toBe("one two…");
    expect(words.excerpt("a".repeat(50), 10)).toBe(`${"a".repeat(10)}…`);
    expect(words.excerpt("  spread \n over\tlines  ")).toBe("spread over lines");
  });

  it("knows which switch each kind of notice falls under", () => {
    expect(words.switchFor("setup")).toBe("tease_setups");
    expect(words.switchFor("post")).toBe("tease_posts");
    expect(words.switchFor("lesson")).toBe("tease_lessons");
    expect(words.switchFor("live")).toBe("tease_live");
    expect(words.switchFor("test")).toBeNull();
  });
});

describe("what the bot is told", () => {
  it("reads the code a mentor posts in their channel", () => {
    expect(words.connectCode("/connect ABCD2345")).toBe("ABCD2345");
    expect(words.connectCode("  /connect@FloorTeaserBot abcd2345  ")).toBe("ABCD2345");
    for (const other of ["/connect", "/connect ABC", "connect ABCD2345", "/connect ABCD2345 please", "/connect ABCD-2345", "hello /connect ABCD2345", ""]) {
      expect([other, words.connectCode(other)]).toEqual([other, null]);
    }
  });

  it("knows when someone has just opened it", () => {
    expect(words.isStart("/start")).toBe(true);
    expect(words.isStart("/start@FloorTeaserBot now")).toBe(true);
    expect(words.isStart("/started")).toBe(false);
    expect(words.isStart("please /start")).toBe(false);
  });

  it("answers with the space's name and link once connected", () => {
    expect(words.BOT_WORDS.connected(space, SITE)).toBe(
      `Connected. New setups, posts and lessons from Gold Desk will be announced here.\n\n${WHERE}`,
    );
  });

  it("turns Telegram's refusals into a reason the mentor can act on", () => {
    expect(words.failureCode(403, "Forbidden: bot was kicked from the channel chat")).toBe("removed");
    expect(words.failureCode(403, "Forbidden: bot is not a member of the channel chat")).toBe("removed");
    expect(words.failureCode(400, "Bad Request: chat not found")).toBe("removed");
    expect(words.failureCode(400, "Bad Request: need administrator rights in the channel chat")).toBe("no_rights");
    expect(words.failureCode(400, "Bad Request: not enough rights to send text messages to the chat")).toBe("no_rights");
    expect(words.failureCode(400, "Bad Request: group chat was upgraded to a supergroup chat")).toBe("moved");
    expect(words.failureCode(403, "Forbidden")).toBe("removed");
    expect(words.failureCode(400, "Bad Request: message text is empty")).toBe("refused");
  });
});

/** Answers the next calls to Telegram, and remembers what was asked. */
function answer(...answers: ({ status?: number; json: unknown } | "down")[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown> });
    const next = answers.shift() ?? { json: { ok: true, result: true } };
    if (next === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200 });
  });
  return calls;
}

describe("talking to Telegram", () => {
  it("posts as the bot", async () => {
    const calls = answer({ json: { ok: true, result: { message_id: 7 } } });
    await telegram.sendText(-1001234567890, "New VIP setup: EURUSD");
    expect(calls).toEqual([{ url: `https://telegram.test/bot${TOKEN}/sendMessage`, body: { chat_id: -1001234567890, text: "New VIP setup: EURUSD" } }]);
  });

  it("passes on Telegram's own reason when it says no, without the bot's token", async () => {
    answer({ status: 403, json: { ok: false, error_code: 403, description: "Forbidden: bot was kicked from the channel chat" } });
    const refused = await telegram.sendText(1, "x").catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(telegram.TelegramRefused);
    expect(refused).toMatchObject({ status: 403, description: "Forbidden: bot was kicked from the channel chat", retryAfter: null });
    expect(String((refused as Error).message)).not.toContain(TOKEN);

    answer({ status: 429, json: { ok: false, error_code: 429, description: "Too Many Requests: retry after 14", parameters: { retry_after: 14 } } });
    expect(await telegram.sendText(1, "x").catch((error: unknown) => error)).toMatchObject({ status: 429, retryAfter: 14 });
  });

  it("says so when Telegram cannot be reached, again without the token", async () => {
    answer("down");
    const down = await telegram.sendText(1, "x").catch((error: unknown) => error);
    expect(down).toBeInstanceOf(telegram.TelegramDown);
    expect(String((down as Error).message)).not.toContain(TOKEN);
    answer({ status: 502, json: "Bad Gateway" });
    expect(await telegram.sendText(1, "x").catch((error: unknown) => error)).toBeInstanceOf(telegram.TelegramDown);
  });

  it("knows Telegram's calls by a word worked out from the token", () => {
    const secret = telegram.hookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret).not.toContain(TOKEN.slice(-10));
    expect(telegram.hookSecretMatches(secret)).toBe(true);
    expect(telegram.hookSecretMatches(secret.slice(0, -1) + (secret.endsWith("0") ? "1" : "0"))).toBe(false);
    expect(telegram.hookSecretMatches("short")).toBe(false);
    expect(telegram.hookSecretMatches("")).toBe(false);
    expect(telegram.hookSecretMatches(null)).toBe(false);
  });

  it("tells Telegram where to send updates, once", async () => {
    const calls = answer({ json: { ok: true, result: true } });
    await telegram.ensureWebhook("https://floor.example/");
    await telegram.ensureWebhook("https://floor.example");
    expect(calls).toEqual([
      {
        url: `https://telegram.test/bot${TOKEN}/setWebhook`,
        body: { url: "https://floor.example/api/telegram/webhook", secret_token: telegram.hookSecret(), allowed_updates: ["message", "channel_post", "my_chat_member"] },
      },
    ]);
  });

  it("takes it as done when another copy of the server has just registered the same address", async () => {
    const calls = answer(
      { status: 429, json: { ok: false, error_code: 429, description: "Too Many Requests: retry after 1", parameters: { retry_after: 1 } } },
      { json: { ok: true, result: { url: "https://other.example/api/telegram/webhook" } } },
    );
    await telegram.ensureWebhook("https://other.example");
    expect(calls.map((call) => call.url.split("/").pop())).toEqual(["setWebhook", "getWebhookInfo"]);
  });

  it("asks for the bot's name once and remembers it", async () => {
    const calls = answer({ json: { ok: true, result: { username: "FloorTeaserBot" } } });
    expect(await telegram.botName()).toBe("FloorTeaserBot");
    expect(await telegram.botName()).toBe("FloorTeaserBot");
    expect(calls).toHaveLength(1);
  });
});
