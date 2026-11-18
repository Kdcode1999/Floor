import { SITE_URL } from "@/lib/env";
import { telegramConfigured } from "@/server/env";
import { bearer, body, id, preflight, refusalFor, refuse, reply } from "@/server/http";
import { asPerson } from "@/server/supabase";
import { botName, ensureWebhook } from "@/server/telegram";

export const OPTIONS = preflight;

/**
 * A mentor sets up Telegram teasers: this answers with the bot's name and the code to post in
 * their channel. The database says whether this person is the mentor of the space. The code
 * they already have is given again while it lasts, unless a new one is asked for.
 *
 * The first call also tells Telegram where to send the bot's updates, so nobody has to
 * register that by hand.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  if (!telegramConfigured) return refuse(503, "telegram_not_set_up");

  const sent = await body(request);
  const space = id(sent.space);
  if (!space) return refuse(400, "bad_request");
  const database = asPerson(token);

  let code: { code: string; expires_at: string } | null = null;
  if (sent.renew !== true) {
    const status = await database.rpc("telegram_status", { p_space: space });
    const refusal = refusalFor(status.error);
    if (refusal) return refusal;
    const row = ((status.data ?? []) as { code: string | null; code_expires_at: string | null }[])[0];
    if (row?.code && row.code_expires_at) code = { code: row.code, expires_at: row.code_expires_at };
  }
  if (!code) {
    const started = await database.rpc("telegram_start", { p_space: space });
    const refusal = refusalFor(started.error);
    if (refusal) return refusal;
    code = ((started.data ?? []) as { code: string; expires_at: string }[])[0] ?? null;
    if (!code) return refuse(502, "database_unavailable");
  }

  try {
    await ensureWebhook(SITE_URL || new URL(request.url).origin);
    return reply({ code: code.code, expiresAt: code.expires_at, bot: await botName() });
  } catch {
    return refuse(502, "telegram_unavailable");
  }
}
