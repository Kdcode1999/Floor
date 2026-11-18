// Learn's plain logic: turning the database's rows into a course, wording lengths and
// progress, and deciding where a video resumes. No phone code. Tested in tests/.

import type { OutlineLesson, OutlineModule, VideoStatus } from "./types";

/** One row of the course as the database sends it: a module, and one of its lessons if it has any. */
export interface OutlineRow {
  module_id: string;
  module_title: string;
  lesson_id: string | null;
  lesson_title: string | null;
  duration_seconds: number | null;
  has_video: boolean | null;
  video_status: VideoStatus | null;
  published: boolean | null;
  locked: boolean | null;
  seconds: number | null;
  completed: boolean | null;
}

/** Gathers the rows into modules, keeping the order the database gave. */
export function groupOutline(rows: OutlineRow[]): OutlineModule[] {
  const modules: OutlineModule[] = [];
  for (const row of rows) {
    let current = modules[modules.length - 1];
    if (!current || current.id !== row.module_id) {
      current = { id: row.module_id, title: row.module_title, lessons: [] };
      modules.push(current);
    }
    if (row.lesson_id) {
      current.lessons.push({
        id: row.lesson_id,
        title: row.lesson_title ?? "",
        duration: row.duration_seconds,
        hasVideo: row.has_video ?? false,
        videoStatus: row.video_status,
        published: row.published ?? false,
        locked: row.locked ?? false,
        watched: row.seconds ?? 0,
        completed: row.completed ?? false,
      });
    }
  }
  return modules;
}

/** "45 sec", "12 min", "1 h 5 min". */
export function lengthText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** How many of a set of lessons are finished: "3 of 8 done". */
export function doneText(lessons: OutlineLesson[]): string {
  const done = lessons.filter((lesson) => lesson.completed).length;
  return `${done} of ${lessons.length} done`;
}

/** The share of a set of lessons that is finished, from 0 to 1. */
export function doneShare(lessons: OutlineLesson[]): number {
  return lessons.length === 0 ? 0 : lessons.filter((lesson) => lesson.completed).length / lessons.length;
}

/** The one line under a lesson's title in the course. */
export function lessonLine(lesson: OutlineLesson, staff: boolean): string {
  const parts: string[] = [];
  if (staff && !lesson.published) parts.push("Draft");
  if (staff && lesson.videoStatus && lesson.videoStatus !== "ready" && lesson.videoStatus !== "none") {
    parts.push(VIDEO_WORDS[lesson.videoStatus]);
  }
  if (lesson.duration) parts.push(lengthText(lesson.duration));
  else if (!lesson.hasVideo) parts.push("To read");
  if (lesson.completed) parts.push("Done");
  else if (lesson.watched > 0 && lesson.duration) {
    parts.push(`${lengthText(Math.max(lesson.duration - lesson.watched, 1))} left`);
  }
  return parts.join(" · ");
}

export const VIDEO_WORDS: Record<VideoStatus, string> = {
  none: "No video",
  uploading: "Video not uploaded yet",
  processing: "Video is being prepared",
  ready: "Video ready",
  failed: "The video could not be used",
};

/** A lesson counts as watched once this share of it has played. Nobody sits through the last seconds. */
export const FINISHED_SHARE = 0.92;

export function isFinished(position: number, duration: number): boolean {
  return duration > 0 && position >= duration * FINISHED_SHARE;
}

/**
 * Where a video should start: where the viewer left off, a few seconds earlier so they catch
 * the thread. From the beginning when they had barely started or had finished.
 */
export function resumeAt(watched: number, duration: number | null, completed: boolean): number {
  if (completed || watched < 15) return 0;
  if (duration && isFinished(watched, duration)) return 0;
  return Math.max(0, watched - 5);
}

/** The lesson after this one that the viewer can open, across modules. Null at the end. */
export function nextLesson(modules: OutlineModule[], lessonId: string): OutlineLesson | null {
  const all = modules.flatMap((module) => module.lessons);
  const at = all.findIndex((lesson) => lesson.id === lessonId);
  if (at === -1) return null;
  return all.slice(at + 1).find((lesson) => !lesson.locked && lesson.published) ?? null;
}

/** A copy of a list with one item moved up (-1) or down (+1). The same list when it cannot move. */
export function moved<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

/** "12%" while a file uploads. Never shows 100 until the upload has really finished. */
export function uploadPercent(sent: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.min(99, Math.floor((sent / total) * 100))}%`;
}

export interface Failure {
  message?: string | null;
  code?: string | null;
}

/** What to say when something in Learn failed. Takes the database's and the server's short codes. */
export function learnMessage(failure: Failure): string {
  const code = failure.code && /^[a-z_]+$/.test(failure.code) ? failure.code : (failure.message ?? "");
  if (code === "not_allowed") return "You're not allowed to do that in this space.";
  if (code === "video_not_ready") return "The video is not ready yet. Publish the lesson once it is.";
  if (code === "lesson_empty") return "Add a video or some words before publishing.";
  if (code === "lesson_not_found" || code === "module_not_found") return "That's no longer there.";
  if (code === "bad_order") return "The course changed while you were sorting it. Go back and try again.";
  if (code === "video_not_set_up" || code === "not_set_up") return "Video is not set up for this copy of Floor yet.";
  if (code === "video_host_unavailable") return "The video service did not answer. Try again in a moment.";
  if (code === "signed_out") return "You've been signed out. Sign in again.";
  if (code === "offline") return "No connection. Check your internet and try again.";
  if ((failure.message ?? "").includes("modules_title") || (failure.message ?? "").includes("lessons_title")) return "Give it a title.";
  return "That didn't go through. Check your connection and try again.";
}
