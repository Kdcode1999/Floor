import { after } from "next/server";

import { body, preflight, refuse, reply } from "@/server/http";
import { runJobs } from "@/server/jobs";
import { confirmPayment, REFERENCE, vaultReady } from "@/server/pay";

export const OPTIONS = preflight;
export const maxDuration = 60;

/**
 * The member is back from the processor's page. The server asks the processor what became of
 * the payment and, if it went through, adds the VIP days.
 *
 * No login is needed. The payment's name is long, random and known only to the person who
 * started it, and all this can ever do is give that person what they paid for. It also means
 * a member who paid in another browser, where they are not signed in, is not left waiting.
 * The database limits how often one payment can make the server ask the processor.
 */
export async function POST(request: Request) {
  if (!vaultReady) return refuse(503, "payments_not_set_up");
  const sent = await body(request);
  const reference = typeof sent.reference === "string" && REFERENCE.test(sent.reference) ? sent.reference : null;
  const providerId = typeof sent.providerId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sent.providerId) ? sent.providerId : undefined;
  if (!reference) return refuse(400, "bad_request");

  try {
    const confirmed = await confirmPayment(reference, providerId, { limited: true });
    // A payment that has just gone through queued an alert for the mentor. Send it now.
    if (confirmed.fresh) after(() => runJobs().catch(() => {}));
    return reply({ state: confirmed.state, vipUntil: confirmed.vipUntil ?? null });
  } catch {
    return refuse(502, "processor_unavailable");
  }
}
