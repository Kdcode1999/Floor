import { describe, expect, it } from "vitest";

import { botHandle, chatName, codeLasts, connectLine, TEASER_SWITCHES, teaserMessage, teaserProblem } from "../src/features/telegram/logic";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("connecting a Telegram channel", () => {
  it("gives the mentor the exact line to post", () => {
    expect(connectLine("ABCD2345")).toBe("/connect ABCD2345");
  });

  it("writes the bot's name the way Telegram shows it", () => {
    expect(botHandle("FloorTeaserBot")).toBe("@FloorTeaserBot");
    expect(botHandle("@FloorTeaserBot ")).toBe("@FloorTeaserBot");
    expect(botHandle("")).toBe("Floor's bot");
  });

  it("says how long the code still works, and nothing once it has run out", () => {
    expect(codeLasts(inMinutes(30), NOW)).toBe("The code works for 30 more minutes.");
    expect(codeLasts(inMinutes(27.2), NOW)).toBe("The code works for 28 more minutes.");
    expect(codeLasts(inMinutes(0.5), NOW)).toBe("The code works for 1 more minute.");
    expect(codeLasts(inMinutes(0), NOW)).toBeNull();
    expect(codeLasts(inMinutes(-3), NOW)).toBeNull();
    expect(codeLasts(null, NOW)).toBeNull();
    expect(codeLasts("not a date", NOW)).toBeNull();
  });

  it("names the chat by what it is", () => {
    expect(chatName({ chatTitle: "Kay FX Signals", chatKind: "channel" })).toBe("channel Kay FX Signals");
    expect(chatName({ chatTitle: "Gold talk", chatKind: "supergroup" })).toBe("group Gold talk");
    expect(chatName({ chatTitle: null, chatKind: null })).toBe("group");
  });
});

describe("what a mentor is told about their teasers", () => {
  it("offers a switch for each kind of notice, saying what it gives away", () => {
    expect(TEASER_SWITCHES.map((each) => each.key)).toEqual(["setups", "posts", "lessons"]);
    expect(TEASER_SWITCHES[0].detail).toContain("stay in the app");
    expect(TEASER_SWITCHES[1].detail).toContain("its title and nothing more");
  });

  it("says what to do when the bot could not post", () => {
    const chat = { chatTitle: "Kay FX Signals", chatKind: "channel" as const };
    expect(teaserProblem({ ...chat, lastError: null })).toBeNull();
    expect(teaserProblem({ ...chat, lastError: "removed" })).toBe("Floor's bot is no longer in Kay FX Signals. Add it back as an admin, then send a test.");
    expect(teaserProblem({ ...chat, lastError: "no_rights" })).toContain("Make it an admin that can post messages");
    expect(teaserProblem({ ...chat, lastError: "moved" })).toContain("Disconnect, then connect it again");
    expect(teaserProblem({ ...chat, lastError: "refused" })).toContain("Send a test");
    expect(teaserProblem({ chatTitle: null, chatKind: null, lastError: "removed" })).toContain("no longer in the chat");
  });

  it("turns refusals into sentences", () => {
    expect(teaserMessage("telegram_not_set_up")).toBe("Telegram teasers are not switched on in this copy of Floor yet.");
    expect(teaserMessage("not_set_up")).toBe("Telegram teasers are not switched on in this copy of Floor yet.");
    expect(teaserMessage("telegram_unavailable")).toContain("could not be reached");
    expect(teaserMessage("not_connected")).toBe("No channel is connected yet.");
    expect(teaserMessage("not_allowed")).toBe("Only the mentor can set up Telegram teasers.");
    expect(teaserMessage("offline")).toContain("connection");
    expect(teaserMessage(null)).toBe("That didn't go through. Try again.");
  });
});
