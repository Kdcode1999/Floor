// Classes and the live room: how the screens word things and read what a mentor types.
// Plain logic, no phone code. Tested in tests/.

import type { LiveClass, RecordingStatus } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// --- Reading the schedule -------------------------------------------------------------------------

/** The session that is on right now, if there is one. */
export function liveNow(classes: LiveClass[]): LiveClass | null {
  return classes.find((each) => each.state === "live") ?? null;
}

/** How late a class can be and still be shown to members as coming. */
const LATE_MS = 30 * MINUTE;

/** The classes still to come, soonest first. One that is half an hour overdue no longer counts. */
export function upcoming(classes: LiveClass[], now: number): LiveClass[] {
  return classes
    .filter((each) => each.state === "scheduled" && Date.parse(each.startsAt) > now - LATE_MS)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The classes whose time passed without the mentor starting them. Only staff are shown these. */
export function missed(classes: LiveClass[], now: number): LiveClass[] {
  return classes.filter((each) => each.state === "scheduled" && Date.parse(each.startsAt) <= now - LATE_MS);
}

/** Sessions that are over, newest first. Only staff are given these. */
export function ended(classes: LiveClass[]): LiveClass[] {
  return classes.filter((each) => each.state === "ended");
}

// --- Days and times -------------------------------------------------------------------------------

/** Midnight at the start of a moment's day, on the phone's own clock. */
function dayStart(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** How many days from today a moment falls on, on the phone's own calendar. */
function daysAhead(time: number, now: number): number {
  return Math.round((dayStart(time) - dayStart(now)) / DAY);
}

/** "7:30 PM" or "19:30", in the phone's own way of writing time. */
export function clockTime(value: string | number, locale?: string): string {
  return new Date(value).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", "Yesterday" or "Thu 19 Nov". */
export function dayName(value: string | number, now: number, locale?: string): string {
  const time = new Date(value).getTime();
  const ahead = daysAhead(time, now);
  if (ahead === 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  if (ahead === -1) return "Yesterday";
  return new Date(time).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

/** When a class is, in the phone's own time: "Today, 7:30 PM", "Thu 19 Nov, 7:30 PM". */
export function classWhen(startsAt: string, now: number, locale?: string): string {
  return `${dayName(startsAt, now, locale)}, ${clockTime(startsAt, locale)}`;
}

function span(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}

/** "Starts in 12 minutes", "Starting now", "Was due 20 minutes ago". */
export function startsIn(startsAt: string, now: number): string {
  const gap = Date.parse(startsAt) - now;
  if (Math.abs(gap) < MINUTE) return "Starting now";
  return gap > 0 ? `Starts in ${span(gap)}` : `Was due ${span(-gap)} ago`;
}

/** "Live for 23 min", "Live for 1 hr 5 min". */
export function liveFor(startedAt: string | null, now: number): string {
  const minutes = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / MINUTE)) : 0;
  if (minutes < 1) return "Just started";
  if (minutes < 60) return `Live for ${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `Live for ${Math.floor(minutes / 60)} hr` : `Live for ${Math.floor(minutes / 60)} hr ${rest} min`;
}

/** "Lasted 45 min", for a session that is over. Null when the times are not known. */
export function lasted(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const minutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / MINUTE));
  if (minutes < 60) return `Lasted ${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `Lasted ${Math.floor(minutes / 60)} hr` : `Lasted ${Math.floor(minutes / 60)} hr ${rest} min`;
}

// --- The form a mentor fills in ------------------------------------------------------------------

/** How many days ahead the form offers. The database takes a class up to a year ahead. */
export const DAYS_OFFERED = 28;

/** A day as the form holds it: "2026-11-19", on the phone's own calendar. */
export function dayKey(time: number): string {
  const date = new Date(time);
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The days a class can be put on, from today, each with its name. */
export function dayChoices(now: number, locale?: string, count = DAYS_OFFERED): { value: string; label: string }[] {
  const start = new Date(now);
  return Array.from({ length: count }, (_, index) => {
    const time = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).getTime();
    return { value: dayKey(time), label: dayName(time, now, locale) };
  });
}

/**
 * Reads a typed time of day into minutes since midnight. Takes "7:30 pm", "7pm", "19:30",
 * "1930", "7.30 PM" and "7". Null when it is not a time.
 */
export function parseTime(typed: string): number | null {
  const found = /^(\d{1,2})(?:[:.\s]?(\d{2}))?\s*([ap])?\.?m?\.?$/i.exec(typed.trim().replace(/\s+/g, " "));
  if (!found) return null;
  let hour = Number(found[1]);
  const minute = found[2] ? Number(found[2]) : 0;
  const half = found[3]?.toLowerCase();
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** Minutes since midnight written the way the form reads them back: "7:30 pm". */
export function timeText(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

/** The moment a day and a time of day make, on the phone's own clock. Null when either is unreadable. */
export function startFor(day: string, typedTime: string): Date | null {
  const minutes = parseTime(typedTime);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (minutes === null || !parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Math.floor(minutes / 60), minutes % 60);
}

export const TITLE_MAX = 120;
export const ABOUT_MAX = 500;

export interface ClassForm {
  title: string;
  about: string;
  day: string;
  time: string;
}

export type ClassProblems = Partial<Record<"title" | "about" | "time", string>>;

/** Everything wrong with the class form, by field. Empty when it can be saved. */
export function classProblems(form: ClassForm, now: number): ClassProblems {
  const problems: ClassProblems = {};
  const title = form.title.trim();
  if (title === "") problems.title = "Give the class a title.";
  else if (title.length > TITLE_MAX) problems.title = `Keep it to ${TITLE_MAX} letters or fewer.`;
  if (form.about.trim().length > ABOUT_MAX) problems.about = `Keep it to ${ABOUT_MAX} letters or fewer.`;
  if (form.time.trim() === "") problems.time = "Type the time it starts, like 7:30 pm.";
  else {
    const start = startFor(form.day, form.time);
    if (!start) problems.time = "Type a time, like 7:30 pm or 19:30.";
    else if (start.getTime() < now) problems.time = "That time has passed. Pick a later one.";
  }
  return problems;
}

/** "Thursday 19 November at 7:30 PM, your time", read back under the form. Null until it is a time. */
export function readBack(form: Pick<ClassForm, "day" | "time">, locale?: string): string | null {
  const start = startFor(form.day, form.time);
  if (!start) return null;
  const day = start.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  return `${day} at ${clockTime(start.getTime(), locale)}, your time`;
}

// --- Wording -------------------------------------------------------------------------------------

/** What staff are told about a finished session's recording. */
export function recordingLine(status: RecordingStatus | null, record: boolean): string {
  switch (status) {
    case "recording":
    case "saving":
      return "Saving the recording. It will show in Learn as a draft lesson.";
    case "saved":
      return "The recording is a draft lesson in Learn.";
    case "failed":
      return "The recording could not be saved.";
    default:
      return record ? "No recording was made." : "Not recorded.";
  }
}

/** "Nobody is watching yet", "1 watching", "12 watching". */
export function watching(count: number): string {
  return count <= 0 ? "Nobody is watching yet" : `${count} watching`;
}

/** What to say when something to do with classes or the live room was refused. */
export function liveMessage(code: string | null | undefined): string {
  switch (code) {
    case "not_allowed":
      return "This is for VIP members.";
    case "not_live":
      return "This session is not live any more.";
    case "already_live":
      return "A session is already live in this space. End it before starting another.";
    case "session_not_found":
      return "That class is no longer on the schedule.";
    case "bad_time":
      return "Pick a time from now up to a year ahead.";
    case "too_many_classes":
      return "The schedule is full. Cancel a class to add another.";
    case "space_unavailable":
      return "This space cannot go live right now.";
    case "live_not_set_up":
    case "not_set_up":
      return "Live video is not switched on in this copy of Floor yet.";
    case "live_unavailable":
      return "The video service could not be reached. Try again in a moment.";
    case "signed_out":
      return "You have been signed out. Sign in again.";
    case "offline":
      return "You seem to be offline. Check your connection and try again.";
    default:
      return "That didn't work. Try again.";
  }
}

/** The same, for the mentor and admins, whose refusals mean something else. */
export function staffLiveMessage(code: string | null | undefined): string {
  return code === "not_allowed" ? "Only the mentor and admins can do that." : liveMessage(code);
}
