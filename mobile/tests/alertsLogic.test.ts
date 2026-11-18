import { describe, expect, it } from "vitest";

import { routeFor, spaceOf, stateLine } from "../src/features/alerts/logic";

describe("a tapped alert", () => {
  it("opens the lesson it is about", () => {
    expect(routeFor({ type: "lesson", space: "s1", id: "l1" })).toEqual({ pathname: "/lesson", params: { id: "l1" } });
  });

  it("opens the live room for a session that is on, or a class that was scheduled", () => {
    expect(routeFor({ type: "live", id: "x1" })).toEqual({ pathname: "/live", params: { id: "x1" } });
    expect(routeFor({ type: "class", id: "x1" })).toEqual({ pathname: "/live", params: { id: "x1" } });
  });

  it("opens the Feed for a setup, and for anything it does not recognise", () => {
    expect(routeFor({ type: "setup", id: "p1" })).toEqual({ pathname: "/" });
    expect(routeFor({ type: "lesson" })).toEqual({ pathname: "/" });
    expect(routeFor({ type: 42, id: { nested: true } })).toEqual({ pathname: "/" });
    expect(routeFor(null)).toEqual({ pathname: "/" });
  });

  it("opens the list of card payments for the mentor's own alert that someone paid", () => {
    expect(routeFor({ type: "payment", space: "s1", id: "pay-1" })).toEqual({ pathname: "/manage/payments" });
    expect(routeFor({ type: "payment" })).toEqual({ pathname: "/manage/payments" });
    expect(routeFor({ type: "payment_problem", space: "s1" })).toEqual({ pathname: "/manage/payments" });
  });

  it("opens the queue of reported messages for the staff's alert that one was reported", () => {
    expect(routeFor({ type: "report", space: "s1", id: "m1" })).toEqual({ pathname: "/manage/reported" });
  });

  it("says which space it came from", () => {
    expect(spaceOf({ space: "s1" })).toBe("s1");
    expect(spaceOf({ space: "" })).toBeNull();
    expect(spaceOf(undefined)).toBeNull();
  });
});

describe("where alerts stand on a phone", () => {
  it("is said in one plain line", () => {
    expect(stateLine("on")).toContain("on for this phone");
    expect(stateLine("refused")).toContain("phone's settings");
    expect(stateLine("not_asked")).toContain("Turn them on");
    expect(stateLine("unsupported")).toContain("not available");
  });
});
