import { describe, expect, it } from "vitest";

import { nameMessage, nameProblem } from "../src/features/account/name";
import {
  askSince,
  audienceTag,
  cannotWrite,
  chatMessage,
  chatRows,
  choiceLabel,
  clock,
  dayLabel,
  groupHeaderLine,
  groupLine,
  groupProblems,
  groupSummary,
  hasLink,
  hasPhone,
  lastWhen,
  mergeMessages,
  messageChoices,
  moved,
  muteLine,
  reportedLine,
  reportsLine,
  roleBadge,
  sendProblem,
  totalUnread,
  unreadBadge,
  waitFor,
  withoutWriter,
} from "../src/features/chat/logic";
import type { Group, Message } from "../src/features/chat/types";
import { CONTACT_NAMES, FINE_NAMES, LINKS, NOT_LINKS, NOT_PHONES, PHONES, STAFF_NAMES } from "./filterCases";

describe("the link and number filter, as the app applies it", () => {
  it("agrees with the database on every case", () => {
    for (const text of LINKS) expect([text, hasLink(text)]).toEqual([text, true]);
    for (const text of NOT_LINKS) expect([text, hasLink(text)]).toEqual([text, false]);
    for (const text of PHONES) expect([text, hasPhone(text)]).toEqual([text, true]);
    for (const text of NOT_PHONES) expect([text, hasPhone(text)]).toEqual([text, false]);
  });

  it("stops a member before they send, and lets staff through", () => {
    expect(sendProblem("join t.me/fxsignals", false)).toContain("Only the mentor and admins can post links");
    expect(sendProblem("call 0803 123 4567", false)).toContain("put commas between them");
    expect(sendProblem("join t.me/fxsignals or call 0803 123 4567", true)).toBeNull();
    expect(sendProblem("   ", true)).toBe("Type a message first.");
    expect(sendProblem("x".repeat(2001), true)).toContain("too long");
    expect(sendProblem("tp 1.0850 1.0900", false)).toBeNull();
  });
});

const NOW = new Date(2026, 10, 18, 15, 0, 0).getTime();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function message(id: string, minutesAgo: number, more: Partial<Message> = {}): Message {
  return {
    id,
    userId: "u1",
    name: "Ada O.",
    role: "member",
    body: `message ${id}`,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    replyTo: null,
    replyName: null,
    replyBody: null,
    createdAt: at(minutesAgo),
    changedAt: at(minutesAgo),
    deleted: false,
    mine: false,
    ...more,
  };
}

describe("putting a conversation together", () => {
  it("adds what arrived and keeps everything in the order it was written", () => {
    const held = [message("a", 10), message("c", 4)];
    const merged = mergeMessages(held, [message("d", 1), message("b", 7)]);
    expect(merged.map((each) => each.id)).toEqual(["a", "b", "c", "d"]);
    expect(mergeMessages(held, [])).toBe(held);
  });

  it("replaces a message that changed, so a deleted one empties in place", () => {
    const held = [message("a", 10), message("b", 5)];
    const merged = mergeMessages(held, [message("a", 10, { body: null, deleted: true, changedAt: at(1) })]);
    expect(merged.map((each) => [each.id, each.deleted])).toEqual([["a", true], ["b", false]]);
  });

  it("leaves out a deleted message it never showed, and one person's messages once they are blocked", () => {
    const held = [message("a", 10), message("b", 5, { userId: "u2" })];
    expect(mergeMessages(held, [message("z", 99, { body: null, deleted: true })]).map((each) => each.id)).toEqual(["a", "b"]);
    expect(withoutWriter(held, "u2").map((each) => each.id)).toEqual(["a"]);
  });

  it("asks for changes from a little before the last one it knows", () => {
    const held = [message("a", 10), message("b", 5, { changedAt: at(2) })];
    expect(askSince(held, at(60))).toBe(new Date(Date.parse(at(2)) - 3000).toISOString());
    expect(askSince([], at(60))).toBe(new Date(Date.parse(at(60)) - 3000).toISOString());
  });

  it("asks at once after a nudge, rarely while nudges can arrive, and less and less in a quiet group", () => {
    expect(waitFor(true, true, 0)).toBe(1000);
    expect(waitFor(true, false, 9)).toBe(1000);
    expect(waitFor(false, true, 0)).toBe(20_000);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((rounds) => waitFor(false, false, rounds))).toEqual([3000, 3000, 3000, 5000, 7000, 9000, 11000, 12000, 12000]);
  });

  it("starts each day with a line, and runs one person's quick messages together", () => {
    const rows = chatRows(
      [
        message("a", 60 * 30, { userId: "u2" }),
        message("b", 12),
        message("c", 10),
        message("d", 1),
        message("e", 0.5, { userId: "u2" }),
      ],
      NOW,
      "en-GB",
    );
    expect(rows.map((row) => (row.kind === "day" ? row.label : `${row.message.id}${row.joined ? "+" : ""}`))).toEqual([
      "Yesterday", "a", "Today", "b", "c+", "d", "e",
    ]);
  });

  it("names days the way people do", () => {
    expect(dayLabel(at(5), NOW)).toBe("Today");
    expect(dayLabel(at(60 * 20), NOW)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 2, 9).toISOString(), NOW, "en-GB")).toBe("2 Nov 2026");
  });
});

describe("how chat is worded", () => {
  const group: Group = {
    id: "g1", name: "General", about: "Open to everyone in the space.", audience: "everyone", posting: "all",
    canOpen: true, canPost: true, lastAt: null, lastName: null, lastBody: null, lastHasImage: false, unread: 0,
  };

  it("says what is in each group in the list", () => {
    expect(groupLine(group)).toBe("Open to everyone in the space.");
    expect(groupLine({ ...group, about: null })).toBe("No messages yet");
    expect(groupLine({ ...group, lastAt: at(1), lastName: "Kay", lastBody: "London in ten" })).toBe("Kay: London in ten");
    expect(groupLine({ ...group, lastAt: at(1), lastName: "Kay", lastHasImage: true })).toBe("Kay: Picture");
    expect(groupLine({ ...group, audience: "vip", canOpen: false, canPost: false })).toBe("For VIP members");
  });

  it("adds up what is waiting across the groups a person can open", () => {
    expect(totalUnread([])).toBe(0);
    expect(totalUnread([{ canOpen: true, unread: 3 }, { canOpen: true, unread: 0 }, { canOpen: false, unread: 9 }, { canOpen: true, unread: 100 }])).toBe(103);
  });

  it("counts unread messages, up to a point", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(7)).toBe("7");
    expect(unreadBadge(100)).toBe("99+");
  });

  it("marks who is staff, and nobody else", () => {
    expect(roleBadge("mentor")).toBe("Mentor");
    expect(roleBadge("admin")).toBe("Admin");
    expect(roleBadge("member")).toBeNull();
    expect(roleBadge(null)).toBeNull();
  });

  it("tells someone who may not write why", () => {
    expect(cannotWrite(group, false, null, NOW)).toBeNull();
    expect(cannotWrite({ posting: "staff", canPost: false }, false, null, NOW)).toBe("Only the mentor and admins write here.");
    const until = new Date(2026, 10, 19, 15, 0, 0).toISOString();
    expect(cannotWrite({ posting: "all", canPost: false }, false, until, NOW, "en-GB")).toBe("You are muted until 19 Nov 2026, 15:00. You can still read.");
    expect(cannotWrite({ posting: "all", canPost: false }, false, at(5), NOW)).toBe("You can't write in this group.");
  });

  it("turns the database's short codes into sentences", () => {
    expect(chatMessage({ message: "muted" })).toContain("muted you");
    expect(chatMessage({ message: "slow_down" })).toContain("Wait a minute");
    expect(chatMessage({ message: "cannot_block_staff" })).toContain("can't be blocked");
    expect(chatMessage({ message: 'new row for relation "groups" violates check constraint "groups_name"' })).toBe("Give the group a name of 1 to 40 letters.");
    expect(chatMessage({ code: "42501", message: "permission denied" })).toBe("You can't write in this group.");
    expect(chatMessage({})).toContain("didn't go through");
  });
});

describe("what a person can do with a message", () => {
  const theirs = message("a", 5);
  const mine = message("b", 4, { mine: true });
  const fromMentor = message("c", 3, { role: "mentor", name: "Kay" });
  const fromAdmin = message("d", 2, { role: "admin", name: "Tobi" });
  const picture = message("e", 1, { body: null, imagePath: "s/g/p.jpg", imageWidth: 800, imageHeight: 600 });

  it("lets a member reply, copy, report and block another member", () => {
    expect(messageChoices(theirs, "member", true)).toEqual(["reply", "copy", "report", "block"]);
    // Their own: no reporting or blocking yourself, and they can delete it.
    expect(messageChoices(mine, "member", true)).toEqual(["reply", "copy", "delete"]);
  });

  it("never lets a member block staff, and sends a complaint about staff to Floor", () => {
    expect(messageChoices(fromMentor, "member", true)).toEqual(["reply", "copy", "reportSpace"]);
    expect(messageChoices(fromAdmin, "member", true)).toEqual(["reply", "copy", "reportSpace"]);
  });

  it("lets staff mute a member and delete what they wrote", () => {
    expect(messageChoices(theirs, "admin", true)).toEqual(["reply", "copy", "mute", "delete"]);
    expect(messageChoices(theirs, "mentor", true)).toEqual(["reply", "copy", "mute", "delete"]);
    // Someone who has left the space cannot be muted, but what they wrote can go.
    expect(messageChoices(message("x", 1, { role: null }), "admin", true)).toEqual(["reply", "copy", "delete"]);
  });

  it("keeps the mentor's messages safe from an admin", () => {
    expect(messageChoices(fromMentor, "admin", true)).toEqual(["reply", "copy"]);
    expect(messageChoices(fromAdmin, "mentor", true)).toEqual(["reply", "copy", "delete"]);
    expect(messageChoices(fromAdmin, "admin", true)).toEqual(["reply", "copy", "delete"]);
  });

  it("leaves out what cannot be done: no reply where they may not write, no copy of a picture, nothing for a removed message", () => {
    expect(messageChoices(theirs, "member", false)).toEqual(["copy", "report", "block"]);
    expect(messageChoices(picture, "member", true)).toEqual(["reply", "report", "block"]);
    expect(messageChoices(message("z", 1, { deleted: true, body: null }), "mentor", true)).toEqual([]);
  });

  it("words each choice", () => {
    expect(choiceLabel("block", theirs)).toBe("Block Ada O.");
    expect(choiceLabel("mute", theirs)).toBe("Mute Ada O.");
    expect(choiceLabel("delete", mine)).toBe("Delete");
    expect(choiceLabel("delete", theirs)).toBe("Delete for everyone");
    expect(choiceLabel("reportSpace", fromMentor)).toBe("Report this space to Floor");
  });
});

describe("groups, for the people who run them", () => {
  it("says who a group is for and who writes in it", () => {
    expect(audienceTag("everyone")).toBeNull();
    expect(audienceTag("vip")).toBe("VIP");
    expect(audienceTag("invited")).toBe("Invited");
    expect(groupSummary({ audience: "everyone", posting: "all" })).toBe("Open to everyone · Members can write");
    expect(groupSummary({ audience: "vip", posting: "staff" })).toBe("VIP members · Only staff write");
    expect(groupHeaderLine({ audience: "invited", posting: "all" })).toBe("Invited members");
    expect(groupHeaderLine({ audience: "everyone", posting: "staff" })).toBe("Everyone in the space · Announcements");
  });

  it("checks a group's details before saving", () => {
    expect(groupProblems({ name: "Gold traders", about: "" })).toEqual({});
    expect(groupProblems({ name: "   ", about: "" })).toEqual({ name: "Give the group a name." });
    expect(groupProblems({ name: "x".repeat(41), about: "y".repeat(201) })).toEqual({
      name: "Keep the name to 40 letters.",
      about: "Keep the description under 200 letters.",
    });
    // Runs of spaces count once, as the database stores them.
    expect(groupProblems({ name: `a${" ".repeat(60)}b`, about: "" })).toEqual({});
  });

  it("moves a group one place up or down", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const list = ["a", "b", "c"];
    expect(moved(list, 0, -1)).toBe(list);
    expect(moved(list, 2, 1)).toBe(list);
    expect(moved(list, 7, 1)).toBe(list);
  });

  it("says when a mute ends, and nothing once it has", () => {
    expect(muteLine(null, NOW)).toBeNull();
    expect(muteLine(at(1), NOW)).toBeNull();
    expect(muteLine(at(-60), NOW, "en-GB")).toBe("Muted until 18 Nov 2026, 16:00");
  });

  it("counts reports and what is waiting", () => {
    expect(reportsLine(1)).toBe("Reported by 1 member");
    expect(reportsLine(4)).toBe("Reported by 4 members");
    expect(reportedLine(0)).toBe("Nothing is waiting");
    expect(reportedLine(1)).toBe("1 message is waiting for you");
    expect(reportedLine(3)).toBe("3 messages are waiting for you");
  });

  it("writes the time the way the phone does", () => {
    expect(clock(at(30), "en-GB")).toBe("14:30");
    expect(clock(at(30), "en-US")).toMatch(/^2:30\sPM$/);
  });

  it("says when the newest message was sent, shortly", () => {
    expect(lastWhen(at(30), NOW, "en-GB")).toBe("14:30");
    expect(lastWhen(at(24 * 60), NOW, "en-GB")).toBe("Yesterday");
    expect(lastWhen(at(5 * 24 * 60), NOW, "en-GB")).toBe("13 Nov 2026");
  });
});

describe("names", () => {
  it("lets ordinary names through", () => {
    for (const name of FINE_NAMES) {
      expect([name, nameProblem(name)]).toEqual([name, null]);
    }
  });

  it("stops a name that claims to be staff", () => {
    for (const name of STAFF_NAMES) {
      expect([name, nameProblem(name)]).toEqual([name, expect.stringContaining("get a badge instead")]);
    }
  });

  it("stops a name that carries a way to reach someone", () => {
    for (const name of CONTACT_NAMES) {
      expect([name, nameProblem(name)]).toEqual([name, expect.stringContaining("link, an @name or a phone number")]);
    }
  });

  it("wants 1 to 40 letters", () => {
    expect(nameProblem("   ")).toBe("Use a name of 1 to 40 letters.");
    expect(nameProblem("x".repeat(41))).toBe("Use a name of 1 to 40 letters.");
  });

  it("turns the database's refusals into sentences", () => {
    expect(nameMessage({ message: "name_has_contact" })).toContain("phone number");
    expect(nameMessage({ message: "name_taken" })).toContain("its mentor or an admin");
    expect(nameMessage({ message: 'new row violates check constraint "profiles_display_name_reserved"' })).toContain("badge");
    expect(nameMessage({ message: 'new row violates check constraint "profiles_display_name_length"' })).toBe("Use a name of 1 to 40 letters.");
    expect(nameMessage({ message: "Failed to fetch" })).toContain("Check your connection");
  });
});
