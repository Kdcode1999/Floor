// What the class and live screens ask of the database and of Floor's server. The database
// decides who may do what: only the mentor and admins schedule and go live, and the live room
// opens for VIP members.

import type { SupabaseClient } from "@supabase/supabase-js";

import { callServer, kickJobs, ServerError } from "@/lib/server";

import { liveMessage, staffLiveMessage } from "./logic";
import type { ClassState, LiveClass, RecordingStatus, RoomPass } from "./types";

interface ScheduleRow {
  id: string;
  title: string;
  about: string | null;
  starts_at: string;
  state: ClassState;
  started_at: string | null;
  ended_at: string | null;
  locked: boolean;
  record: boolean;
  recording_status: RecordingStatus | null;
  lesson_id: string | null;
}

/** The live session if there is one, then the classes to come. Staff also get recent sessions. */
export async function loadSchedule(client: SupabaseClient, spaceId: string): Promise<LiveClass[]> {
  const { data, error } = await client.rpc("live_schedule", { p_space: spaceId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ScheduleRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    about: row.about,
    startsAt: row.starts_at,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    locked: row.locked,
    record: row.record,
    recordingStatus: row.recording_status,
    lessonId: row.lesson_id,
  }));
}

type Failure = { message: string; code?: string } | null;

const refusal = (error: Failure): string | null =>
  error ? staffLiveMessage(error.code === "42501" ? "not_allowed" : error.message) : null;

export interface ClassDetails {
  title: string;
  about: string;
  startsAt: Date;
  record: boolean;
}

/** Puts a class on the schedule, or changes one that has not started. */
export async function saveClass(client: SupabaseClient, spaceId: string, details: ClassDetails, sessionId: string | null): Promise<{ id: string } | { problem: string }> {
  const { data, error } = await client.rpc("save_class", {
    p_space: spaceId,
    p_title: details.title.trim(),
    p_starts_at: details.startsAt.toISOString(),
    p_about: details.about.trim() || null,
    p_record: details.record,
    p_session: sessionId,
  });
  if (error || typeof data !== "string") return { problem: refusal(error) ?? staffLiveMessage(null) };
  return { id: data };
}

/** Takes a class off the schedule. Resolves with a sentence to show if it failed, or null. */
export async function cancelClass(client: SupabaseClient, sessionId: string): Promise<string | null> {
  const { error } = await client.rpc("cancel_class", { p_session: sessionId });
  return refusal(error);
}

/**
 * Goes live: with a class from the schedule, or with a title and nothing scheduled. Asked again
 * for the session that is already on, it hands the broadcast to this person.
 */
export async function goLive(
  client: SupabaseClient,
  spaceId: string,
  start: { title?: string; sessionId?: string; record?: boolean },
): Promise<{ id: string } | { problem: string }> {
  const { data, error } = await client.rpc("live_start", {
    p_space: spaceId,
    p_title: start.title?.trim() ?? null,
    p_session: start.sessionId ?? null,
    p_record: start.record ?? null,
  });
  if (error || typeof data !== "string") return { problem: refusal(error) ?? staffLiveMessage(null) };
  // VIP members are alerted and the Telegram channel is told. Both wait in the queue.
  kickJobs();
  return { id: data };
}

/** Where a session stands, as the broadcaster's app is told every half minute. */
export type Standing = "live" | "taken_over" | "ended" | "unknown";

/** Says the broadcaster is still there. Resolves with where the session stands. */
export async function heartbeat(client: SupabaseClient, sessionId: string): Promise<Standing> {
  const { data, error } = await client.rpc("live_heartbeat", { p_session: sessionId });
  if (error) return "unknown";
  return data === "live" || data === "taken_over" ? data : data === "ended" || data === "cancelled" ? "ended" : "unknown";
}

interface JoinAnswer {
  title: string;
  startedAt: string;
  groupId: string;
  isHost: boolean;
  isStaff: boolean;
  viewerName: string;
  url?: string;
  token?: string;
  sampleFilm?: string;
}

/**
 * Asks the server to open the live room for this person. Throws a sentence to show when it
 * does not open: the session is over, or the person has no VIP.
 */
export async function openRoom(sessionId: string): Promise<RoomPass> {
  try {
    const answer = await callServer<JoinAnswer>("/api/live/join", { session: sessionId });
    return {
      title: answer.title,
      startedAt: answer.startedAt,
      groupId: answer.groupId,
      isHost: answer.isHost,
      isStaff: answer.isStaff,
      viewerName: answer.viewerName,
      video: answer.url && answer.token ? { url: answer.url, token: answer.token } : null,
      sampleFilm: answer.sampleFilm ?? null,
    };
  } catch (error) {
    throw new Error(liveMessage(error instanceof ServerError ? error.code : null));
  }
}

/** Ends the session for everyone. Resolves with a sentence to show if it failed, or null. */
export async function endSession(sessionId: string): Promise<string | null> {
  try {
    await callServer("/api/live/end", { session: sessionId });
    return null;
  } catch (error) {
    return staffLiveMessage(error instanceof ServerError ? error.code : null);
  }
}
