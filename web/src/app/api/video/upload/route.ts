import { createVideo, deleteVideo, uploadTicket } from "@/server/bunny";
import { videoConfigured } from "@/server/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { asPerson, asServer } from "@/server/supabase";

export const OPTIONS = preflight;

/**
 * A mentor or admin is about to upload a lesson's video. Makes a place for it at the video
 * host and answers with what the phone or laptop needs to send the file there directly.
 * The database decides whether this person may: staff of the lesson's space only.
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
  const current = (asked.data as { title: string; video_id: string | null }[])[0];

  let videoId: string;
  try {
    videoId = await createVideo(current.title);
  } catch {
    return refuse(502, "video_host_unavailable");
  }
  const saved = await asServer().rpc("set_lesson_video", {
    p_lesson: lesson,
    p_provider: "bunny",
    p_video_id: videoId,
    p_status: "uploading",
  });
  if (saved.error) {
    await deleteVideo(videoId).catch(() => {});
    return refuse(502, "database_unavailable");
  }
  // The video this one replaces is no longer shown anywhere.
  if (current.video_id) await deleteVideo(current.video_id).catch(() => {});

  return reply({ videoId, ...uploadTicket(videoId) });
}
