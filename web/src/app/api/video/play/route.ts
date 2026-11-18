import { playback } from "@/server/bunny";
import { videoConfigured } from "@/server/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { asPerson } from "@/server/supabase";

export const OPTIONS = preflight;

/**
 * Someone wants to watch a lesson. The database decides whether they may: VIP that has not
 * run out and the account's one login, or staff. If so, answers with an address for the video
 * that works for a few hours and for nothing but this video.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  if (!videoConfigured) return refuse(503, "video_not_set_up");
  const lesson = id((await body(request)).lessonId);
  if (!lesson) return refuse(400, "bad_request");

  const asked = await asPerson(token).rpc("lesson_playback", { p_lesson: lesson });
  const refusal = refusalFor(asked.error);
  if (refusal) return refusal;
  const video = (asked.data as { video_provider: string; video_id: string }[])[0];
  if (video.video_provider !== "bunny") return refuse(502, "video_host_unavailable");

  return reply(playback(video.video_id));
}
