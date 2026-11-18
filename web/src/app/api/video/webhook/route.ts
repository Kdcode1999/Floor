import { timingSafeEqual } from "node:crypto";

import { videoState } from "@/server/bunny";
import { BUNNY, videoConfigured } from "@/server/env";
import { body, refuse, reply } from "@/server/http";
import { asServer } from "@/server/supabase";

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The video host calls this when a video changes: it finished preparing, or failed.
 *
 * The address ends with a secret word only the host was given. Even so, nothing in the message
 * is believed except which video it is about: the server then asks the host itself how that
 * video is doing, and records that.
 */
export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!videoConfigured || !BUNNY.webhookKey || !same(key, BUNNY.webhookKey)) return refuse(404, "not_found");

  const videoId = (await body(request)).VideoGuid;
  if (typeof videoId !== "string" || videoId.length > 100) return reply({ ok: true });

  const database = asServer();
  const found = await database.from("lessons").select("id").eq("video_provider", "bunny").eq("video_id", videoId).limit(1);
  const lesson = (found.data ?? [])[0] as { id: string } | undefined;
  // A video that is not a lesson's is none of Floor's business. The host still gets a yes.
  if (!lesson) return reply({ ok: true });

  const state = await videoState(videoId);
  await database.rpc("set_lesson_video", {
    p_lesson: lesson.id,
    p_provider: "bunny",
    p_video_id: videoId,
    p_status: state?.status ?? "failed",
    p_duration: state?.seconds ?? null,
  });
  return reply({ ok: true });
}
