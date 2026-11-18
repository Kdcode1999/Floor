import "server-only";

import { deleteVideo } from "./bunny";
import { videoConfigured } from "./env";
import { asServer } from "./supabase";

// The jobs the database queues for this server (see private.outbox in the migrations), and
// what each kind means. A job that throws is tried again later, up to five times.

export interface Job {
  id: number;
  kind: string;
  space_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

type Handler = (job: Job) => Promise<void>;

const handlers: Record<string, Handler> = {
  /** A lesson was deleted, so its video is removed from the video host. */
  video_delete: async (job) => {
    if (!videoConfigured) throw new Error("The video host is not set up");
    const videoId = job.payload.video_id;
    if (typeof videoId === "string" && job.payload.provider === "bunny") await deleteVideo(videoId);
  },
};

/** Adds the handler for one kind of job. Each feature registers its own. */
export function handle(kind: string, handler: Handler): void {
  handlers[kind] = handler;
}

/** How long one run may keep taking jobs before it hands over to the next run. */
const BUDGET_MS = 8000;

/** Takes waiting jobs from the queue and does them. Resolves with how many were done and failed. */
export async function runJobs(): Promise<{ done: number; failed: number }> {
  const database = asServer();
  const started = Date.now();
  let done = 0;
  let failed = 0;

  while (Date.now() - started < BUDGET_MS) {
    const taken = await database.rpc("claim_outbox", { p_limit: 20 });
    if (taken.error) throw new Error(taken.error.message);
    const jobs = (taken.data ?? []) as Job[];
    if (jobs.length === 0) break;

    for (const job of jobs) {
      let problem: string | null = null;
      try {
        const handler = handlers[job.kind];
        if (!handler) throw new Error(`No handler for "${job.kind}"`);
        await handler(job);
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
      }
      await database.rpc("finish_outbox", { p_id: job.id, p_error: problem });
      if (problem) failed += 1;
      else done += 1;
    }
  }
  return { done, failed };
}
