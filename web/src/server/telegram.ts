import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { TELEGRAM } from "./env";

// Talking to Telegram as Floor's bot. The bot's token is part of every address called, so no
// address is ever put in an error or a log.

/** Telegram understood the request and said no. `description` is its own reason. */
export class TelegramRefused extends Error {
  constructor(
    public readonly status: number,
    public readonly description: string,
    /** Seconds to wait before trying again, when Telegram asks for that. */
    public readonly retryAfter: number | null,
  ) {
    super(`Telegram refused (${status}): ${description}`);
  }
}

/** Telegram could not be reached, or answered with something that was not an answer. */
export class TelegramDown extends Error {
  constructor() {
    super("Telegram could not be reached");
  }
}

interface Answer<T> {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM.api}/bot${TELEGRAM.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramDown();
  }
  const answer = (await response.json().catch(() => null)) as Answer<T> | null;
  if (answer?.ok) return answer.result as T;
  if (!answer || response.status >= 500) throw new TelegramDown();
  throw new TelegramRefused(answer.error_code ?? response.status, answer.description ?? "", answer.parameters?.retry_after ?? null);
}

/**
 * The word Telegram sends with every update, so the webhook knows the call is Telegram's. It
 * is worked out from the bot's token, which only Floor's server and Telegram hold, so there is
 * no second secret to set up or to lose.
 */
export function hookSecret(): string {
  return createHash("sha256").update(`floor/telegram-webhook/v1:${TELEGRAM.token}`).digest("hex");
}

export function hookSecretMatches(sent: string | null): boolean {
  if (!TELEGRAM.token || !sent) return false;
  const want = Buffer.from(hookSecret());
  const got = Buffer.from(sent);
  return want.length === got.length && timingSafeEqual(want, got);
}

let name: Promise<string> | null = null;

/** The bot's @name, without the @. Asked once and remembered. */
export function botName(): Promise<string> {
  name ??= call<{ username?: string }>("getMe").then(
    (me) => me.username ?? "",
    (error) => {
      name = null;
      throw error;
    },
  );
  return name;
}

/** The address this server has told Telegram to send updates to, since it started. */
let registered: string | null = null;

/** The kinds of update the bot needs: posts in channels and groups, and being added or removed. */
const UPDATES = ["message", "channel_post", "my_chat_member"];

/**
 * Makes sure Telegram sends the bot's updates to this server. Done by the server itself, the
 * first time a mentor sets up teasers, so nobody has to register anything by hand.
 */
export async function ensureWebhook(site: string): Promise<void> {
  const want = `${site.replace(/\/+$/, "")}/api/telegram/webhook`;
  if (registered === want) return;
  try {
    await call("setWebhook", { url: want, secret_token: hookSecret(), allowed_updates: UPDATES });
  } catch (error) {
    // Telegram allows this about once a second. If another copy of the server has just done
    // it, the address is already right.
    if (!(error instanceof TelegramRefused) || error.status !== 429) throw error;
    const info = await call<{ url?: string }>("getWebhookInfo");
    if (info.url !== want) throw error;
  }
  registered = want;
}

/** Posts words in a chat. A link in them gets Telegram's own preview of the page. */
export async function sendText(chatId: number, text: string): Promise<void> {
  await call("sendMessage", { chat_id: chatId, text });
}

/** Removes a message from a chat. The bot needs the right to delete there. */
export async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  await call("deleteMessage", { chat_id: chatId, message_id: messageId });
}
