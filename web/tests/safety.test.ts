import { describe, expect, it } from "vitest";

import { deleteMessage, nameMatches, whatGoes } from "@/features/account/logic";
import { adminMessage, groupReports, reasonWords, sizeLine, type ReportRow } from "@/features/admin/logic";

describe("what a person is told before deleting their account", () => {
  const member = { user_id: "u1", email: "ada@example.com", space_id: null, space_name: null, members: null };

  it("lists what goes for a member", () => {
    expect(whatGoes(member)).toEqual([
      "Your name, your email address and your sign-in.",
      "Your place in every space you joined, with any VIP time you have left.",
      "Everything you wrote in groups.",
      "Anything you uploaded, such as payment proofs.",
    ]);
  });

  it("tells a mentor their space goes too, and how many people lose it", () => {
    const mentor = { ...member, space_id: "s1", space_name: "Gold Desk", members: 240 };
    expect(whatGoes(mentor)[1]).toBe("Gold Desk, the space you run, with every post, lesson, video and chat in it. Its 240 members lose it.");
    expect(whatGoes({ ...mentor, members: 1 })[1]).toContain("Its 1 member loses it.");
    expect(whatGoes(mentor)[2]).toBe("Your place in any other space, with everything you wrote in its groups and anything you uploaded there.");
    expect(whatGoes({ ...mentor, members: 0 })[1]).toBe("Gold Desk, the space you run, with every post, lesson, video and chat in it.");
  });

  it("takes the space's name as typed by a person, not a machine", () => {
    expect(nameMatches("Gold Desk", "Gold Desk")).toBe(true);
    expect(nameMatches("  gold   desk ", "Gold Desk")).toBe(true);
    expect(nameMatches("Gold", "Gold Desk")).toBe(false);
    expect(nameMatches("", "Gold Desk")).toBe(false);
    expect(nameMatches("anything", null)).toBe(false);
  });

  it("says what to do when it fails", () => {
    expect(deleteMessage("name_needed")).toContain("Type your space's name exactly");
    expect(deleteMessage("offline")).toBe("Check your connection and try again.");
    expect(deleteMessage(undefined)).toContain("Nothing is half done");
  });
});

describe("Floor's own page", () => {
  const report = (id: string, space: string, at: string): ReportRow => ({
    id,
    space_id: space,
    space_name: space === "s1" ? "Gold Desk" : "Pip Room",
    slug: space === "s1" ? "gold-desk" : "pip-room",
    space_status: "active",
    reason: "scam",
    details: null,
    reporter: "Ada O.",
    created_at: at,
  });

  it("gathers reports by space, the space with the newest report first", () => {
    const groups = groupReports([
      report("r1", "s1", "2026-11-10T10:00:00Z"),
      report("r2", "s2", "2026-11-12T10:00:00Z"),
      report("r3", "s1", "2026-11-11T10:00:00Z"),
    ]);
    expect(groups.map((group) => [group.name, group.reports.map((each) => each.id)])).toEqual([
      ["Pip Room", ["r2"]],
      ["Gold Desk", ["r1", "r3"]],
    ]);
    expect(groupReports([])).toEqual([]);
  });

  it("words reasons, sizes and refusals", () => {
    expect(reasonWords("guaranteed_profits")).toBe("Promises guaranteed profits");
    expect(reasonWords("a_new_reason")).toBe("Something else");
    expect(sizeLine({ members: 1, vip: 0 })).toBe("1 member, 0 VIP");
    expect(sizeLine({ members: 240, vip: 31 })).toBe("240 members, 31 VIP");
    expect(adminMessage("note_needed")).toContain("Write a note for the mentor first");
    expect(adminMessage("not_allowed")).toBe("Only Floor's own team can do that.");
  });
});
