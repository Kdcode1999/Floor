import { describe, expect, it } from "vitest";

import { deleteMessage, nameMatches, whatGoes } from "../src/features/account/logic";
import { REPORT_REASONS, reportMessage, reportProblem, suspendedForMember, suspendedForStaff } from "../src/features/safety/logic";
import { canOpen } from "../src/space/access";

describe("reporting a space", () => {
  it("offers the reasons the database knows, each with a line saying what it covers", () => {
    expect(REPORT_REASONS.map((each) => each.value).sort()).toEqual(["abuse", "asks_for_money", "guaranteed_profits", "other", "scam"]);
    for (const each of REPORT_REASONS) expect(each.detail.length).toBeGreaterThan(8);
  });

  it("needs a reason, and a few words when the reason is something else", () => {
    expect(reportProblem(null, "")).toBe("Choose what is wrong.");
    expect(reportProblem("scam", "")).toBeNull();
    expect(reportProblem("other", "bad")).toBe("Tell us what is wrong, in a sentence or two.");
    expect(reportProblem("other", "They keep changing the price.")).toBeNull();
    expect(reportProblem("scam", "x".repeat(1001))).toContain("too long");
  });

  it("says what happened when a report could not be sent", () => {
    expect(reportMessage({ message: "already_reported" })).toBe("You have already reported this space. Floor is looking into it.");
    expect(reportMessage({ message: "not_allowed" })).toBe("Only members of a space can report it.");
    expect(reportMessage({})).toContain("couldn't be sent");
  });
});

describe("a suspended space", () => {
  it("does not open for its members, and does for its staff", () => {
    expect(canOpen({ suspended: false, role: "member" })).toBe(true);
    expect(canOpen({ suspended: true, role: "member" })).toBe(false);
    expect(canOpen({ suspended: true, role: "admin" })).toBe(true);
    expect(canOpen({ suspended: true, role: "mentor" })).toBe(true);
  });

  it("tells a member plainly, and where to ask", () => {
    expect(suspendedForMember("Gold Desk", "help@floor.example")).toEqual({
      title: "Gold Desk is closed for now",
      text: "Floor has suspended this space, so nothing in it can be opened. If it opens again, everything will be where you left it. Questions about it go to help@floor.example.",
    });
    expect(suspendedForMember("Gold Desk", "").text).not.toContain("Questions");
  });

  it("tells the staff why, in Floor's own words, and where to answer", () => {
    expect(suspendedForStaff("Posts promise guaranteed profits.", "help@floor.example").text).toBe(
      "Members cannot open it, and nobody can join or pay. Floor's note: “Posts promise guaranteed profits.” To answer, write to help@floor.example.",
    );
    expect(suspendedForStaff(null, "").text).toBe("Members cannot open it, and nobody can join or pay.");
  });
});

describe("deleting an account, in the app", () => {
  it("uses the same words as the web", () => {
    const mentor = { user_id: "u1", email: "kay@example.com", space_id: "s1", space_name: "Gold Desk", members: 3 };
    expect(whatGoes(mentor)[1]).toContain("Its 3 members lose it.");
    expect(nameMatches("gold desk", "Gold Desk")).toBe(true);
    expect(deleteMessage("name_needed")).toContain("Type your space's name exactly");
  });
});
