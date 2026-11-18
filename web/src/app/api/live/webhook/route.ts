import { readWebhook } from "@/server/live";

/**
 * The live video server tells Floor what happened in its rooms. Each message is signed with
 * Floor's own secret, and anything unsigned is turned away.
 *
 * A room closing does not end its session: a broadcaster alone in the room who loses signal for
 * a moment would lose the session with it. The broadcaster's app saying it is still there is
 * what keeps a session on (see live_heartbeat). Recordings are reported here (Live, part three).
 */
export async function POST(request: Request) {
  const event = await readWebhook(await request.text(), request.headers.get("authorization"));
  if (!event) return new Response("not signed", { status: 401 });
  return new Response("ok");
}
