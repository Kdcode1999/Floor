// What Learn asks of the database and of Floor's server. Who may do what is decided there.

import type { SupabaseClient } from "@supabase/supabase-js";

import { callServer, kickJobs, ServerError } from "@/lib/server";

import { groupOutline, learnMessage, type OutlineRow } from "./logic";
import type { Lesson, OutlineModule, VideoStatus } from "./types";

/** Turns the answer to an action into a sentence to show, or null when it worked. */
function done(result: { error: { message: string; code?: string } | null }): string | null {
  return result.error ? learnMessage({ message: result.error.message }) : null;
}

/** The space's course for the person asking, in order. */
export async function loadOutline(client: SupabaseClient, spaceId: string): Promise<OutlineModule[]> {
  const { data, error } = await client.rpc("learn_outline", { p_space: spaceId });
  if (error) throw new Error(error.message);
  return groupOutline((data ?? []) as OutlineRow[]);
}

/** One lesson. Null when it is gone, or not theirs to open. */
export async function loadLesson(client: SupabaseClient, lessonId: string): Promise<Lesson | null> {
  const { data, error } = await client
    .from("lessons")
    .select("id, module_id, title, description, duration_seconds, video_status, published_at")
    .eq("id", lessonId)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as
    | { id: string; module_id: string; title: string; description: string | null; duration_seconds: number | null; video_status: VideoStatus; published_at: string | null }
    | undefined;
  return row
    ? {
        id: row.id,
        moduleId: row.module_id,
        title: row.title,
        description: row.description,
        duration: row.duration_seconds,
        videoStatus: row.video_status,
        published: row.published_at !== null,
      }
    : null;
}

// --- Building the course: staff -----------------------------------------------------------

export const saveModule = async (client: SupabaseClient, spaceId: string, title: string, moduleId: string | null = null) =>
  done(await client.rpc("save_module", { p_space: spaceId, p_title: title, p_module: moduleId }));

export const deleteModule = async (client: SupabaseClient, moduleId: string) => {
  const problem = done(await client.rpc("delete_module", { p_module: moduleId }));
  // Its videos are queued for removal from the video host.
  if (!problem) kickJobs();
  return problem;
};

export const reorderModules = async (client: SupabaseClient, spaceId: string, moduleIds: string[]) =>
  done(await client.rpc("reorder_modules", { p_space: spaceId, p_modules: moduleIds }));

/** Adds a lesson or changes one's words. Resolves with its id, or with a sentence to show. */
export async function saveLesson(
  client: SupabaseClient,
  moduleId: string,
  words: { title: string; description: string },
  lessonId: string | null = null,
): Promise<{ id: string } | { problem: string }> {
  const { data, error } = await client.rpc("save_lesson", {
    p_module: moduleId,
    p_title: words.title,
    p_description: words.description.trim() || null,
    p_lesson: lessonId,
  });
  return error ? { problem: learnMessage({ message: error.message }) } : { id: String(data) };
}

export const reorderLessons = async (client: SupabaseClient, moduleId: string, lessonIds: string[]) =>
  done(await client.rpc("reorder_lessons", { p_module: moduleId, p_lessons: lessonIds }));

export const publishLesson = async (client: SupabaseClient, lessonId: string, published: boolean) => {
  const problem = done(await client.rpc("publish_lesson", { p_lesson: lessonId, p_published: published }));
  // Publishing queues an alert for VIP members.
  if (!problem && published) kickJobs();
  return problem;
};

export const deleteLesson = async (client: SupabaseClient, lessonId: string) => {
  const problem = done(await client.rpc("delete_lesson", { p_lesson: lessonId }));
  if (!problem) kickJobs();
  return problem;
};

// --- Video --------------------------------------------------------------------------------

export interface UploadTicket {
  videoId: string;
  /** Where the file is sent, straight to the video host. */
  endpoint: string;
  headers: Record<string, string>;
}

/** Asks the server for a place to upload a lesson's video. Staff only. */
export const requestUpload = (lessonId: string) => callServer<UploadTicket>("/api/video/upload", { lessonId });

/** Asks the server to find out how a lesson's video is doing, and record it. Staff only. */
export const refreshVideo = (lessonId: string) =>
  callServer<{ status: VideoStatus; seconds: number | null }>("/api/video/status", { lessonId });

export interface Playback {
  url: string;
  poster: string;
  /** When the addresses stop working, in seconds since 1970. */
  expires: number;
}

/** Asks the server for an address to play a lesson's video. Only someone who may watch gets one. */
export const requestPlayback = (lessonId: string) => callServer<Playback>("/api/video/play", { lessonId });

/** Words a failed call to the server. */
export function serverMessage(error: unknown): string {
  return learnMessage({ code: error instanceof ServerError ? error.code : null });
}

// --- Learning -----------------------------------------------------------------------------

/** Remembers where the viewer is in a lesson. Nothing is shown if it fails: the next save will catch up. */
export async function saveProgress(client: SupabaseClient, lessonId: string, seconds: number, completed: boolean): Promise<void> {
  await client.rpc("save_progress", { p_lesson: lessonId, p_seconds: Math.max(0, Math.round(seconds)), p_completed: completed });
}
