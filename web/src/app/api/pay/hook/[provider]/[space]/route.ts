import { after } from "next/server";

import { id, refuse, reply } from "@/server/http";
import { runJobs } from "@/server/jobs";
import { confirmPayment, processorNamed, REFERENCE, unseal, vaultReady } from "@/server/pay";
import { asServer } from "@/server/supabase";

export const maxDuration = 60;

/**
 * A mentor's processor says something happened on their account. Each space has its own
 * address, so the server knows whose key to check the signature with.
 *
 * A webhook is never believed on its own. If the signature is right and it is about one of
 * Floor's payments, the server asks the processor itself what became of that payment.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string; space: string }> }) {
  const params = await context.params;
  const processor = processorNamed(params.provider);
  const space = id(params.space);
  if (!processor || !space || !vaultReady) return refuse(404, "not_found");
  const raw = await request.text();
  if (raw.length > 200_000) return refuse(413, "too_large");

  const account = await asServer().rpc("payment_account_for_server", { p_space: space });
  if (account.error) return refuse(502, "database_unavailable");
  const keys = ((account.data ?? []) as { provider: string; secret_cipher: string; hook_cipher: string | null }[])[0];
  // The same answer whether the space is unknown or the signature is wrong.
  if (!keys || keys.provider !== processor.name) return refuse(401, "not_genuine");

  const hook = processor.hook(raw, request.headers, {
    secret: unseal(keys.secret_cipher, space),
    hookSecret: keys.hook_cipher ? unseal(keys.hook_cipher, space) : null,
  });
  if (!hook.genuine) return refuse(401, "not_genuine");
  // The mentor's account has other business too. Anything that is not Floor's is ignored.
  if (!hook.payment || !REFERENCE.test(hook.payment.reference)) return reply({ ok: true });

  try {
    const confirmed = await confirmPayment(hook.payment.reference, hook.payment.providerId);
    if (confirmed.fresh) after(() => runJobs().catch(() => {}));
    return reply({ ok: true });
  } catch {
    // Answering with an error makes the processor send it again later.
    return refuse(502, "try_again");
  }
}
