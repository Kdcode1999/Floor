import { CRON_SECRET } from "@/server/env";
import { bearer, preflight, refuse, reply } from "@/server/http";
import { runJobs } from "@/server/jobs";
import { asPerson } from "@/server/supabase";

export const OPTIONS = preflight;

/** A run may take a little while: it sends alerts and talks to other services. */
export const maxDuration = 60;

/**
 * Does the jobs waiting in the queue: alerts to send, videos to remove.
 *
 * The apps call this right after an action that queued a job, so the job is done at once. A
 * timer on Vercel calls it too, to pick up anything that was left behind. Anyone signed in may
 * call it: it only ever does jobs the database itself queued.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  const known = await asPerson(token).rpc("session_status");
  if (known.error || known.data === "signed_out") return refuse(401, "signed_out");
  return run();
}

/** The timer's way in. Vercel sends the secret word with every run. */
export async function GET(request: Request) {
  const sent = request.headers.get("authorization") ?? "";
  if (!CRON_SECRET || sent !== `Bearer ${CRON_SECRET}`) return refuse(401, "signed_out");
  return run();
}

async function run(): Promise<Response> {
  try {
    return reply(await runJobs());
  } catch {
    return refuse(502, "database_unavailable");
  }
}
