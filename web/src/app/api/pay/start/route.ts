import { after } from "next/server";

import { SITE_URL } from "@/lib/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { runJobs } from "@/server/jobs";
import { KeyRefused, processorNamed, unseal, vaultReady } from "@/server/pay";
import { asPerson, asServer } from "@/server/supabase";

export const OPTIONS = preflight;

interface Started {
  reference: string;
  provider: string;
  amount_cents: number;
  currency: string;
  email: string;
  slug: string;
  space_name: string;
}

/**
 * A member wants to pay by card. The database decides whether they may, and fixes the price.
 * The server then asks the mentor's processor for a page to pay on, and answers with its
 * address. The money goes from the member to the mentor: Floor only starts the payment.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  if (!vaultReady) return refuse(503, "payments_not_set_up");
  const space = id((await body(request)).space);
  if (!space) return refuse(400, "bad_request");

  const asked = await asPerson(token).rpc("start_payment", { p_space: space });
  const refusal = refusalFor(asked.error);
  if (refusal) return refusal;
  const started = ((asked.data ?? []) as Started[])[0];
  const processor = started ? processorNamed(started.provider) : null;
  if (!started || !processor) return refuse(502, "database_unavailable");
  if (!processor.currencies.includes(started.currency)) return refuse(400, "currency_not_supported");

  const account = await asServer().rpc("payment_account_for_server", { p_space: space });
  const keys = ((account.data ?? []) as { provider: string; secret_cipher: string }[])[0];
  if (account.error || !keys || keys.provider !== processor.name) return refuse(400, "cards_not_connected");

  const page = `${SITE_URL || new URL(request.url).origin}/${started.slug}`;
  try {
    const url = await processor.begin(unseal(keys.secret_cipher, space), {
      reference: started.reference,
      amountCents: started.amount_cents,
      currency: started.currency,
      email: started.email,
      title: started.space_name,
      returnUrl: `${page}?paid=${started.reference}`,
      cancelUrl: page,
    });
    return reply({ url });
  } catch (error) {
    // The mentor's key no longer works, or the processor would not take this payment. The
    // member cannot fix either. The reason is kept for the mentor, who is alerted.
    const refused = error instanceof KeyRefused;
    const problem = refused ? "key_refused" : error instanceof Error ? error.message : "unknown";
    await asServer().rpc("note_payment_problem", { p_space: space, p_problem: problem });
    after(() => runJobs().catch(() => {}));
    return refuse(502, refused ? "cards_not_working" : "processor_unavailable");
  }
}
