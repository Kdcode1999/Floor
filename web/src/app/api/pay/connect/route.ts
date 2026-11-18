import { SITE_URL } from "@/lib/env";
import { PAYMENTS_ALLOW_TEST_KEYS } from "@/server/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { KeyRefused, processorNamed, seal, vaultReady } from "@/server/pay";
import { asPerson, asServer } from "@/server/supabase";

export const OPTIONS = preflight;

/**
 * A mentor connects their card processor. The database says whether this person is the
 * mentor of the space. The key is tried on the processor, encrypted, and stored where no app
 * can read it. It is never sent back.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  if (!vaultReady) return refuse(503, "payments_not_set_up");

  const sent = await body(request);
  const space = id(sent.space);
  const processor = processorNamed(sent.provider);
  const secret = typeof sent.secret === "string" ? sent.secret.trim() : "";
  const hookSecret = typeof sent.hookSecret === "string" ? sent.hookSecret.trim() : "";
  if (!space || !processor) return refuse(400, "bad_request");
  if (!processor.looksRight(secret)) return refuse(400, "bad_key");
  if (hookSecret.length > 200) return refuse(400, "bad_request");
  const test = processor.isTest(secret);
  if (test && !PAYMENTS_ALLOW_TEST_KEYS) return refuse(400, "test_key");

  const asked = await asPerson(token).rpc("payments_connect_check", { p_space: space });
  const refusal = refusalFor(asked.error);
  if (refusal) return refusal;

  try {
    await processor.probe(secret);
  } catch (error) {
    return error instanceof KeyRefused ? refuse(400, "key_refused") : refuse(502, "processor_unavailable");
  }

  const saved = await asServer().rpc("save_payment_account", {
    p_space: space,
    p_provider: processor.name,
    p_secret_cipher: seal(secret, space),
    p_hook_cipher: hookSecret ? seal(hookSecret, space) : null,
    p_key_hint: secret.slice(-4),
    p_test_mode: test,
  });
  if (saved.error) return refuse(502, "database_unavailable");

  return reply({ provider: processor.name, hint: secret.slice(-4), test, hookUrl: hookAddress(request, processor.name, space) });
}

/** The address the mentor gives their processor for webhooks. */
function hookAddress(request: Request, provider: string, space: string): string {
  return `${SITE_URL || new URL(request.url).origin}/api/pay/hook/${provider}/${space}`;
}
