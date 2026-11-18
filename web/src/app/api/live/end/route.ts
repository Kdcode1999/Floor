import {
  bearer,
  body,
  id,
  preflight,
  refusalFor,
  refuse,
  reply,
} from "@/server/http";
import { closeRoom } from "@/server/live";
import { asPerson } from "@/server/supabase";

export const OPTIONS = preflight;

/**
 * The mentor or an admin ends the session for everyone. The database, asked as the person,
 * says whether they may. Then the video room is closed, which sends everyone in it out.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  const session = id((await body(request)).session);
  if (!session) return refuse(400, "bad_request");

  const ended = await asPerson(token).rpc("live_end", { p_session: session });
  const refusal = refusalFor(ended.error);
  if (refusal) return refusal;
  await closeRoom(session);
  return reply({ ok: true });
}
