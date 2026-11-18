import { describe, expect, it } from "vitest";

import {
  classProblems,
  dayChoices,
  dayKey,
  ended,
  lasted,
  liveFor,
  liveMessage,
  liveNow,
  missed,
  parseTime,
  readBack,
  recordingLine,
  staffLiveMessage,
  startFor,
  startsIn,
  timeText,
  upcoming,
} from "../src/features/live/logic";
import type { LiveClass } from "../src/features/live/types";

const NOW = new Date(2026, 10, 18, 12, 0).getTime();
const MIN = 60_000;

const item = (id: string, state: LiveClass["state"], startsAt: number): LiveClass => ({
  id,
  title: id,
  about: null,
  startsAt: new Date(startsAt).toISOString(),
  state,
  startedAt: null,
  endedAt: null,
  locked: false,
  record: true,
  recordingStatus: null,
  lessonId: null,
});

describe("reading the schedule", () => {
  const list = [
    item("later", "scheduled", NOW + 3 * 60 * MIN),
    item("live", "live", NOW - 10 * MIN),
    item("soon", "scheduled", NOW + 20 * MIN),
    item("late", "scheduled", NOW - 10 * MIN),
    item("gone", "scheduled", NOW - 45 * MIN),
    item("over", "ended", NOW - 2 * 60 * MIN),
  ];
  it("finds what is on", () => expect(liveNow(list)?.id).toBe("live"));
  it("lists what is coming, soonest first, a little late included", () => expect(upcoming(list, NOW).map((x) => x.id)).toEqual(["late", "soon", "later"]));
  it("sets apart classes long overdue", () => expect(missed(list, NOW).map((x) => x.id)).toEqual(["gone"]));
  it("lists what is over", () => expect(ended(list).map((x) => x.id)).toEqual(["over"]));
});

describe("time in words", () => {
  it("counts down", () => {
    expect(startsIn(new Date(NOW + 12 * MIN).toISOString(), NOW)).toBe("Starts in 12 minutes");
    expect(startsIn(new Date(NOW + 2 * 60 * MIN).toISOString(), NOW)).toBe("Starts in 2 hours");
    expect(startsIn(new Date(NOW + 20_000).toISOString(), NOW)).toBe("Starting now");
    expect(startsIn(new Date(NOW - 20 * MIN).toISOString(), NOW)).toBe("Was due 20 minutes ago");
  });
  it("says how long a session has run and lasted", () => {
    expect(liveFor(new Date(NOW - 23 * MIN).toISOString(), NOW)).toBe("Live for 23 min");
    expect(liveFor(new Date(NOW - 65 * MIN).toISOString(), NOW)).toBe("Live for 1 hr 5 min");
    expect(liveFor(new Date(NOW).toISOString(), NOW)).toBe("Just started");
    expect(lasted(new Date(NOW - 45 * MIN).toISOString(), new Date(NOW).toISOString())).toBe("Lasted 45 min");
    expect(lasted(null, null)).toBeNull();
  });
});

describe("the class form", () => {
  it("reads times the way people type them", () => {
    expect(parseTime("7:30 pm")).toBe(19 * 60 + 30);
    expect(parseTime("7pm")).toBe(19 * 60);
    expect(parseTime("19:30")).toBe(19 * 60 + 30);
    expect(parseTime("1930")).toBe(19 * 60 + 30);
    expect(parseTime("12 am")).toBe(0);
    expect(parseTime("12:15 PM")).toBe(12 * 60 + 15);
    expect(parseTime("8")).toBe(8 * 60);
    for (const bad of ["", "25:00", "13pm", "7:75", "noon"]) expect(parseTime(bad), bad).toBeNull();
  });
  it("writes a time back the same way", () => {
    expect(timeText(19 * 60 + 30)).toBe("7:30 pm");
    expect(timeText(0)).toBe("12:00 am");
    expect(parseTime(timeText(8 * 60 + 5))).toBe(8 * 60 + 5);
  });
  it("offers four weeks of days from today", () => {
    const days = dayChoices(NOW);
    expect(days).toHaveLength(28);
    expect(days[0]).toEqual({ value: dayKey(NOW), label: "Today" });
    expect(days[1].label).toBe("Tomorrow");
  });
  it("turns a day and a time into a moment on the phone's clock", () => {
    const start = startFor(dayKey(NOW), "7:30 pm");
    expect(start?.getHours()).toBe(19);
    expect(start?.getMinutes()).toBe(30);
    expect(startFor("someday", "7pm")).toBeNull();
    expect(readBack({ day: dayKey(NOW), time: "7:30 pm" })).toContain("your time");
  });
  it("says what is wrong with the form", () => {
    const day = dayKey(NOW);
    expect(classProblems({ title: "London open", about: "", day, time: "7pm" }, NOW)).toEqual({});
    expect(classProblems({ title: " ", about: "", day, time: "" }, NOW)).toEqual({ title: "Give the class a title.", time: "Type the time it starts, like 7:30 pm." });
    expect(classProblems({ title: "x", about: "", day, time: "9am" }, NOW).time).toBe("That time has passed. Pick a later one.");
    expect(classProblems({ title: "x", about: "a".repeat(501), day, time: "11pm" }, NOW).about).toBeDefined();
  });
});

describe("wording", () => {
  it("tells staff what became of a recording", () => {
    expect(recordingLine("saved", true)).toBe("The recording is a draft lesson in Learn.");
    expect(recordingLine("none", false)).toBe("Not recorded.");
    expect(recordingLine("saving", true)).toContain("Saving");
  });
  it("words refusals for members and for staff", () => {
    expect(liveMessage("not_allowed")).toBe("This is for VIP members.");
    expect(staffLiveMessage("not_allowed")).toBe("Only the mentor and admins can do that.");
    expect(staffLiveMessage("already_live")).toContain("already live");
    expect(liveMessage("whatever")).toBe("That didn't work. Try again.");
  });
});
