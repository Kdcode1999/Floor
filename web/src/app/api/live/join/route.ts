import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { passFor, personIn } from "@/server/live";
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
 * them: VIP or staff, while the session is on. The answer carries the session's chat and a pass
 * into the video room that lets the broadcaster send and everyone else only watch. While live
 * video is not set up there is no pass, and the room opens with its chat alone.
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
  const person = personIn(token);
  if (!person) return refuse(401, "signed_out");
  const pass = await passFor(session, { id: person, name: row.viewer_name, broadcaster: row.is_host });

  return reply({
    title: row.title,
    startedAt: row.started_at,
    groupId: row.group_id,
    isHost: row.is_host,
    isStaff: row.is_staff,
    viewerName: row.viewer_name,
    ...(pass ?? {}),
  });
}
