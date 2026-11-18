// Calls from a page to Floor's own server routes, which do the few jobs that need a secret key.
// Every call carries the person's login, and the database decides what that person may do.

import { supabase } from "@/lib/supabase";

/** A refusal from the server. `code` is a short word the page turns into a sentence. */
export class ServerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function callServer<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new ServerError("not_set_up");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ServerError("signed_out");

  let response: Response;
  try {
    response = await fetch(path, {
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

/** Tells the server there may be jobs waiting. Nothing depends on it getting through. */
export function kickJobs(): void {
  callServer("/api/jobs/run").catch(() => {});
}
