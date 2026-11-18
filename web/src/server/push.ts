import "server-only";

import { alertWords, inPieces } from "./alertWords";
import { PUSH } from "./env";
import type { Job } from "./jobs";
import { asServer } from "./supabase";

// Sending alerts to phones through Expo's notification service, which passes them on to Apple
// and Google. The service answers each message with a ticket. A while later it can say, for
// each ticket, whether the phone took the message: that is how Floor learns that an app was
// removed, and stops sending to it.

interface Ticket {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${PUSH.api}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(PUSH.accessToken ? { Authorization: `Bearer ${PUSH.accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`The notification service answered ${response.status}`);
  return (await response.json()) as T;
}

/** How long to wait before asking whether the phones took the messages. */
const RECEIPTS_AFTER_MS = 30 * 60_000;

/** A job from the queue: tell the members of a space about something new in it. */
export async function sendAlert(job: Job): Promise<void> {
  if (!job.space_id) return;
  const database = asServer();
  const found = await database.from("spaces").select("id, name").eq("id", job.space_id).limit(1);
  if (found.error) throw new Error(found.error.message);
  const space = (found.data ?? [])[0] as { id: string; name: string } | undefined;
  if (!space) return;

  // An alert about a class or a live session is checked when its turn comes: a reminder waits
  // in the queue for days, and the class may have moved or been cancelled since. The title is
  // read now too, so it is the one the class has today.
  let payload = job.payload;
  if (payload.type === "class" || payload.type === "live") {
    const still = await database.rpc("live_for_alert", {
      p_session: payload.session_id,
      p_starts_at: payload.type === "class" ? payload.starts_at : null,
    });
    if (still.error) throw new Error(still.error.message);
    const session = ((still.data ?? []) as { title: string }[])[0];
    if (!session) return;
    payload = { ...payload, title: session.title };
  }

  // The job is of a kind nobody is told about: nothing to send.
  const words = alertWords(payload, space);
  if (!words) return;

  // Whoever posted it is not told: they know.
  const actor = typeof payload.actor === "string" ? payload.actor : null;
  const asked = await database.rpc("alert_recipients", {
    p_space: job.space_id,
    p_type: words.kind,
    p_vip_only: words.vipOnly,
    p_except: actor,
  });
  if (asked.error) throw new Error(asked.error.message);
  const tokens = ((asked.data ?? []) as { token: string }[]).map((row) => row.token);
  if (tokens.length === 0) return;

  const dead: string[] = [];
  const tickets: Record<string, string> = {};
  let sent = 0;
  let lastProblem: unknown = null;
  for (const piece of inPieces(tokens, 100)) {
    const messages = piece.map((to) => ({
      to,
      title: words.title,
      body: words.body,
      data: words.data,
      sound: "default",
      priority: "high",
      channelId: "alerts",
    }));
    try {
      const answer = await call<{ data: Ticket[] }>("/send", messages);
      answer.data.forEach((ticket, index) => {
        if (ticket.status === "ok" && ticket.id) tickets[ticket.id] = piece[index];
        else if (ticket.details?.error === "DeviceNotRegistered") dead.push(piece[index]);
      });
      sent += 1;
    } catch (problem) {
      lastProblem = problem;
    }
  }
  // If nothing went out at all the job is tried again later. If some of it went out it is not:
  // a second try would alert the same people twice.
  if (sent === 0) throw lastProblem instanceof Error ? lastProblem : new Error("No alert could be sent");

  if (dead.length > 0) await database.rpc("forget_push_tokens", { p_tokens: dead });
  if (Object.keys(tickets).length > 0) {
    await database.rpc("queue_job", {
      p_kind: "push_receipts",
      p_space: job.space_id,
      p_payload: { tickets },
      p_run_after: new Date(Date.now() + RECEIPTS_AFTER_MS).toISOString(),
    });
  }
}

/** A job from the queue: ask whether the phones took an alert, and forget the ones that are gone. */
export async function checkReceipts(job: Job): Promise<void> {
  const tickets = (job.payload.tickets ?? {}) as Record<string, string>;
  const ids = Object.keys(tickets);
  const dead: string[] = [];
  for (const piece of inPieces(ids, 300)) {
    const answer = await call<{ data: Record<string, Ticket> }>("/getReceipts", { ids: piece });
    for (const [id, receipt] of Object.entries(answer.data ?? {})) {
      if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") dead.push(tickets[id]);
    }
  }
  if (dead.length > 0) await asServer().rpc("forget_push_tokens", { p_tokens: dead });
}
