import { describe, expect, it } from "vitest";

import {
  doneShare,
  doneText,
  groupOutline,
  isFinished,
  learnMessage,
  lengthText,
  lessonLine,
  moved,
  nextLesson,
  resumeAt,
  uploadPercent,
  type OutlineRow,
} from "../src/features/learn/logic";
import type { OutlineLesson } from "../src/features/learn/types";

const row = (module: string, lesson: string | null, more: Partial<OutlineRow> = {}): OutlineRow => ({
  module_id: module,
  module_title: `Module ${module}`,
  lesson_id: lesson,
  lesson_title: lesson ? `Lesson ${lesson}` : null,
  duration_seconds: lesson ? 600 : null,
  has_video: lesson ? true : null,
  video_status: null,
  published: lesson ? true : null,
  locked: lesson ? false : null,
  seconds: lesson ? 0 : null,
  completed: lesson ? false : null,
  ...more,
});

const lesson = (more: Partial<OutlineLesson> = {}): OutlineLesson => ({
  id: "l",
  title: "Lesson",
  duration: 600,
  hasVideo: true,
  videoStatus: null,
  published: true,
  locked: false,
  watched: 0,
  completed: false,
  ...more,
});

describe("the course outline", () => {
  it("gathers the database's rows into modules, in the order given", () => {
    const modules = groupOutline([row("a", "1"), row("a", "2"), row("b", null), row("c", "3", { completed: true, seconds: 590 })]);
    expect(modules.map((module) => [module.title, module.lessons.map((each) => each.id)])).toEqual([
      ["Module a", ["1", "2"]],
      ["Module b", []],
      ["Module c", ["3"]],
    ]);
    expect(modules[2].lessons[0]).toMatchObject({ completed: true, watched: 590, duration: 600 });
  });

  it("words lengths the way people say them", () => {
    expect(lengthText(45)).toBe("45 sec");
    expect(lengthText(754)).toBe("13 min");
    expect(lengthText(3600)).toBe("1 h");
    expect(lengthText(3900)).toBe("1 h 5 min");
  });

  it("counts what is done", () => {
    const lessons = [lesson({ completed: true }), lesson(), lesson({ completed: true }), lesson()];
    expect(doneText(lessons)).toBe("2 of 4 done");
    expect(doneShare(lessons)).toBe(0.5);
    expect(doneShare([])).toBe(0);
  });

  it("says in one line where a lesson stands", () => {
    expect(lessonLine(lesson(), false)).toBe("10 min");
    expect(lessonLine(lesson({ watched: 300 }), false)).toBe("10 min · 5 min left");
    expect(lessonLine(lesson({ completed: true, watched: 600 }), false)).toBe("10 min · Done");
    expect(lessonLine(lesson({ hasVideo: false, duration: null }), false)).toBe("To read");
  });

  it("tells staff, and only staff, about drafts and videos that are not ready", () => {
    const draft = lesson({ published: false, videoStatus: "processing", duration: null });
    expect(lessonLine(draft, true)).toBe("Draft · Video is being prepared");
    expect(lessonLine(draft, false)).toBe("");
  });

  it("finds the next lesson the viewer can open, across modules", () => {
    const modules = groupOutline([row("a", "1"), row("a", "2", { published: false }), row("b", "3", { locked: true }), row("b", "4")]);
    expect(nextLesson(modules, "1")?.id).toBe("4");
    expect(nextLesson(modules, "4")).toBeNull();
    expect(nextLesson(modules, "nope")).toBeNull();
  });
});

describe("watching a lesson", () => {
  it("counts a lesson as watched near the end, not only at the very end", () => {
    expect(isFinished(551, 600)).toBe(false);
    expect(isFinished(553, 600)).toBe(true);
    expect(isFinished(10, 0)).toBe(false);
  });

  it("resumes a little before where the viewer left off", () => {
    expect(resumeAt(300, 600, false)).toBe(295);
  });

  it("starts again from the beginning when they had barely begun or had finished", () => {
    expect(resumeAt(10, 600, false)).toBe(0);
    expect(resumeAt(590, 600, false)).toBe(0);
    expect(resumeAt(300, 600, true)).toBe(0);
  });
});

describe("building the course", () => {
  it("moves an item up or down, and leaves the list alone when it cannot move", () => {
    const list = ["a", "b", "c"];
    expect(moved(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moved(list, 0, -1)).toBe(list);
    expect(moved(list, 2, 1)).toBe(list);
  });

  it("never shows an upload as complete before it is", () => {
    expect(uploadPercent(0, 1000)).toBe("0%");
    expect(uploadPercent(500, 1000)).toBe("50%");
    expect(uploadPercent(1000, 1000)).toBe("99%");
    expect(uploadPercent(5, 0)).toBe("0%");
  });

  it("turns refusals into sentences, from the database and from the server", () => {
    expect(learnMessage({ message: "video_not_ready" })).toContain("not ready yet");
    expect(learnMessage({ message: "lesson_empty" })).toContain("Add a video or some words");
    expect(learnMessage({ code: "video_not_set_up" })).toContain("not set up");
    expect(learnMessage({ code: "offline" })).toContain("No connection");
    expect(learnMessage({ message: 'violates check constraint "lessons_title"' })).toBe("Give it a title.");
    expect(learnMessage({ message: "TypeError: Network request failed" })).toContain("Check your connection");
  });
});
