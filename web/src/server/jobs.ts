import "server-only";

import { deleteVideo } from "./bunny";
import { videoConfigured } from "./env";
import { confirmPayment, REFERENCE, vaultReady } from "./pay";
import { checkReceipts, sendAlert } from "./push";
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
  /** Something new in a space: tell the members who could open it. */
  alert: sendAlert,
  /** Half an hour after an alert: learn which phones no longer have the app. */
  push_receipts: checkReceipts,

  /**
   * A member started a card payment a while ago. If they paid and never came back to the
   * page, and no webhook arrived, this is what gives them their VIP.
   */
  payment_check: async (job) => {
    const reference = job.payload.reference;
    if (!vaultReady || typeof reference !== "string" || !REFERENCE.test(reference)) return;
    const confirmed = await confirmPayment(reference);
    if (confirmed.state === "paid" || confirmed.state === "unknown" || confirmed.state === "mismatch") return;
    // Still open at the processor: the member may yet pay. Look again later, for a while.
    const age = confirmed.createdAt ? Date.now() - Date.parse(confirmed.createdAt) : Infinity;
    if (age < STILL_OPEN_MS) throw new Error("The payment has not gone through yet");
  },

  /** A lesson was deleted, so its video is removed from the video host. */
  video_delete: async (job) => {
    if (!videoConfigured) throw new Error("The video host is not set up");
    const videoId = job.payload.video_id;
    if (typeof videoId === "string" && job.payload.provider === "bunny") await deleteVideo(videoId);
  },
};

/** How long after it was started a card payment is still worth asking about. */
const STILL_OPEN_MS = 2 * 60 * 60_000;

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
