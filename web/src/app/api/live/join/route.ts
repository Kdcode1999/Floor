import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { asPerson } from "@/server/supabase";

export const OPTIONS = preflight;

interface JoinRow {
  title: string;
  started_at: string;
  group_id: string | null;
  is_host: boolean;
  is_staff: boolean;
  viewer_name: string;
}

/**
 * Someone opens the live room. The database, asked as the person, says whether it opens for
 * them: VIP or staff, while the session is on. The answer carries the session's chat.
 *
 * The way into the video itself is added once the video service is connected. Until then the
 * room opens with its chat and says live video is not switched on.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  const session = id((await body(request)).session);
  if (!session) return refuse(400, "bad_request");

  const joined = await asPerson(token).rpc("live_join", { p_session: session });
  const refusal = refusalFor(joined.error);
  if (refusal) return refusal;
  const row = ((joined.data ?? []) as JoinRow[])[0];
  if (!row?.group_id) return refuse(400, "not_live");

  return reply({
    title: row.title,
    startedAt: row.started_at,
    groupId: row.group_id,
    isHost: row.is_host,
    isStaff: row.is_staff,
    viewerName: row.viewer_name,
  });
}
