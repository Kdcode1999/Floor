// Calls to Floor's own server: the few jobs that need a secret key, such as signing a video's
// address. The server lives with the web app. Every call carries the person's login, and the
// database decides what that person may do.

import { sampleServer } from "@/lib/database";
import { SITE_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";

/** A refusal from the server. `code` is a short word the app turns into a sentence. */
export class ServerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** True when the app knows where the server is. It is the web app's address. */
export const serverConfigured = SITE_URL !== "";

export async function callServer<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  // The sample space has its own stand-in for the server, which answers from memory.
  if (sampleServer) {
    const answer = await sampleServer(path, body);
    if (!answer.ok) throw new ServerError(answer.code);
    return answer.data as T;
  }
  if (!supabase || !serverConfigured) throw new ServerError("not_set_up");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ServerError("signed_out");

  let response: Response;
  try {
    response = await fetch(`${SITE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ServerError("offline");
  }
  const answer = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || answer === null) throw new ServerError(answer?.error ?? "server_unavailable");
  return answer;
}

/**
 * Tells the server there may be jobs waiting, such as an alert to send for a new setup. Called
 * after an action that queues one. Nothing depends on it getting through: a timer on the
 * server picks up anything left behind.
 */
export function kickJobs(): void {
  callServer("/api/jobs/run").catch(() => {});
}
