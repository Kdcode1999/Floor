import { EgressStatus } from "livekit-server-sdk";

import { readWebhook, recordingPath } from "@/server/live";
import { asServer } from "@/server/supabase";

/**
 * The live video server tells Floor what happened in its rooms. Each message is signed with
 * Floor's own secret, and anything unsigned is turned away.
 *
 * What matters here is a recording that has finished: it is queued to become a lesson (see
 * live_recording_saved). A recording that failed is noted, so staff are told.
 *
 * A room closing does not end its session: a broadcaster alone in the room who loses signal for
 * a moment would lose the session with it. The broadcaster's app saying it is still there is what
 * keeps a session on (see live_heartbeat).
 */
export async function POST(request: Request) {
  const event = await readWebhook(
    await request.text(),
    request.headers.get("authorization"),
  );
  if (!event) return new Response("not signed", { status: 401 });

  const egress = event.event === "egress_ended" ? event.egressInfo : undefined;
  if (egress?.roomName && egress.egressId) {
    const session = egress.roomName;
    const file = egress.fileResults[0];
    const saved =
      egress.status === EgressStatus.EGRESS_COMPLETE &&
      file !== undefined &&
      file.size > BigInt(0);
    const space = file?.filename?.split("/")[0] ?? "";
    const { error } = saved
      ? await asServer().rpc("live_recording_saved", {
          p_session: session,
          p_egress: egress.egressId,
          p_path: recordingPath(space, session),
        })
      : await asServer().rpc("live_recording", {
          p_session: session,
          p_status: "failed",
        });
    // A room's name is always a session's id. Any other name is not Floor's and is ignored.
    if (
      error &&
      error.code !== "22P02" &&
      error.message !== "session_not_found"
    )
      return new Response("try again", { status: 500 });
  }
  return new Response("ok");
}
