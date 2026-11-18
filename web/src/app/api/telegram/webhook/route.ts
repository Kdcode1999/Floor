import { SITE_URL } from "@/lib/env";
import { body, refuse, reply } from "@/server/http";
import { DatabaseDown, handleUpdate } from "@/server/teasers";
import { hookSecretMatches } from "@/server/telegram";

/**
 * Where Telegram sends what Floor's bot sees. Every call must carry the word Floor gave
 * Telegram when it registered this address: anything else is turned away unread.
 */
export async function POST(request: Request) {
  if (!hookSecretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) return refuse(401, "signed_out");
  try {
    await handleUpdate(await body(request), SITE_URL || new URL(request.url).origin);
  } catch (error) {
    // Telegram sends an update again when it is not taken. That is only wanted when the
    // database could not be asked: anything else would fail the same way next time.
    if (error instanceof DatabaseDown) return refuse(503, "database_unavailable");
  }
  return reply({ ok: true });
}
