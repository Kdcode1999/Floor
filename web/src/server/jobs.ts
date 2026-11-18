import "server-only";

import { deleteVideo, fetchVideo } from "./bunny";
import { RECORDINGS, videoConfigured } from "./env";
import { confirmPayment, REFERENCE, vaultReady } from "./pay";
import { checkReceipts, sendAlert } from "./push";
import { asServer } from "./supabase";
import { sendTeaser } from "./teasers";

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
  /** Something new in a space: post a notice in the Telegram channel it is connected to. */
  telegram: sendTeaser,

  /**
   * A member started a card payment a while ago. If they paid and never came back to the
   * page, and no webhook arrived, this is what gives them their VIP.
   */
  payment_check: async (job) => {
    const reference = job.payload.reference;
    if (
      !vaultReady ||
      typeof reference !== "string" ||
      !REFERENCE.test(reference)
    )
      return;
    const confirmed = await confirmPayment(reference);
    if (
      confirmed.state === "paid" ||
      confirmed.state === "unknown" ||
      confirmed.state === "mismatch"
    )
      return;
    // Still open at the processor: the member may yet pay. Look again later, for a while.
    const age = confirmed.createdAt
      ? Date.now() - Date.parse(confirmed.createdAt)
      : Infinity;
    if (age < STILL_OPEN_MS)
      throw new Error("The payment has not gone through yet");
  },

  /**
   * An account or a space was deleted. The rows that pointed at its files went with it. The
   * files themselves are removed here, through the file store's own door.
   */
  files_delete: async (job) => {
    const bucket = job.payload.bucket;
    const paths = Array.isArray(job.payload.paths)
      ? job.payload.paths.filter(
          (path): path is string => typeof path === "string",
        )
      : [];
    if (typeof bucket !== "string" || paths.length === 0) return;
    const { error } = await asServer().storage.from(bucket).remove(paths);
    if (error) throw new Error(error.message);
  },

  /**
   * A live session's recording is finished and in the file store. The video host fetches it
   * from a short-lived address, and the session's draft lesson is made with that video.
   */
  recording: async (job) => {
    try {
      await recordingToLesson(job);
    } catch (error) {
      // The last try: staff are told the recording could not be saved, not left waiting.
      if (job.attempts >= 5 && typeof job.payload.session_id === "string") {
        await asServer().rpc("live_recording", {
          p_session: job.payload.session_id,
          p_status: "failed",
        });
      }
      throw error;
    }
  },

  /** A lesson was deleted, so its video is removed from the video host. */
  video_delete: async (job) => {
    if (!videoConfigured) throw new Error("The video host is not set up");
    const videoId = job.payload.video_id;
    if (typeof videoId === "string" && job.payload.provider === "bunny")
      await deleteVideo(videoId);
  },
};

async function recordingToLesson(job: Job): Promise<void> {
  if (!videoConfigured) throw new Error("The video host is not set up");
  const session = job.payload.session_id;
  if (typeof session !== "string") return;
  const server = asServer();
  const { data, error } = await server
    .from("live_sessions")
    .select("title, recording_status, recording_path")
    .eq("id", session)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.recording_status !== "saving" || !data.recording_path)
    return;
  const signed = await server.storage
    .from(RECORDINGS.bucket)
    .createSignedUrl(data.recording_path, 24 * 60 * 60);
  if (signed.error || !signed.data)
    throw new Error(
      signed.error?.message ?? "The recording could not be reached",
    );
  const videoId = await fetchVideo(signed.data.signedUrl, data.title);
  const handed = await server.rpc("live_recording_handed", {
    p_session: session,
    p_provider: "bunny",
    p_video_id: videoId,
  });
  if (handed.error) {
    await deleteVideo(videoId).catch(() => {});
    throw new Error(handed.error.message);
  }
}

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
