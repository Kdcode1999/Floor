import { videoState } from "@/server/bunny";
import { videoConfigured } from "@/server/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { asPerson, asServer } from "@/server/supabase";

export const OPTIONS = preflight;

/**
 * Asks the video host how a lesson's video is doing and records the answer. The app calls
 * this when an upload finishes and while a video is being prepared. Staff only.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  if (!videoConfigured) return refuse(503, "video_not_set_up");
  const lesson = id((await body(request)).lessonId);
  if (!lesson) return refuse(400, "bad_request");

  const asked = await asPerson(token).rpc("lesson_for_upload", { p_lesson: lesson });
  const refusal = refusalFor(asked.error);
  if (refusal) return refusal;
  const videoId = (asked.data as { video_id: string | null }[])[0].video_id;
  if (!videoId) return reply({ status: "none", seconds: null });

  let state: Awaited<ReturnType<typeof videoState>>;
  try {
    state = await videoState(videoId);
  } catch {
    return refuse(502, "video_host_unavailable");
  }
  // A video the host no longer has cannot be played.
  const status = state?.status ?? "failed";
  const saved = await asServer().rpc("set_lesson_video", {
    p_lesson: lesson,
    p_provider: "bunny",
    p_video_id: videoId,
    p_status: status,
    p_duration: state?.seconds ?? null,
  });
  if (saved.error) return refuse(502, "database_unavailable");
  return reply({ status, seconds: state?.seconds ?? null });
}
