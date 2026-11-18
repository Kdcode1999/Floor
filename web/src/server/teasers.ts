import "server-only";

import { SITE_URL } from "@/lib/env";

import { telegramConfigured } from "./env";
import type { Job } from "./jobs";
import { asServer } from "./supabase";
import { BOT_WORDS, connectCode, failureCode, isStart, switchFor, teaserFor, type TeaserSource } from "./teaserWords";
import { deleteMessage, sendText, TelegramRefused } from "./telegram";

// Floor's bot in a mentor's Telegram channel: posting a notice when something new is in the
// space, and connecting a channel when the mentor posts their code in it.

interface Target {
  chat_id: number;
  tease_setups: boolean;
  tease_posts: boolean;
  tease_lessons: boolean;
  tease_live: boolean;
  space_name: string;
  slug: string;
  space_status: string;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** What a notice is about, read with the secret key. Null when it is gone, or not to be announced. */
async function sourceFor(payload: Record<string, unknown>): Promise<TeaserSource | null> {
  const database = asServer();
  const type = payload.type;
  if (type === "test") return { type: "test" };

  if ((type === "post" || type === "setup") && typeof payload.post_id === "string") {
    const found = await database.from("posts").select("kind, audience, title, body, pair, side, deleted_at").eq("id", payload.post_id).limit(1);
    if (found.error) throw new Error(found.error.message);
    const post = (found.data ?? [])[0] as
      | { kind: string; audience: string; title: string | null; body: string | null; pair: string | null; side: string | null; deleted_at: string | null }
      | undefined;
    if (!post || post.deleted_at) return null;
    if (post.kind === "setup") return { type: "setup", audience: post.audience, pair: post.pair, side: post.side };
    if (post.kind === "post") return { type: "post", audience: post.audience, title: post.title, body: post.body };
    return null;
  }

  if (type === "lesson" && typeof payload.lesson_id === "string") {
    const found = await database.from("lessons").select("title, published_at").eq("id", payload.lesson_id).limit(1);
    if (found.error) throw new Error(found.error.message);
    const lesson = (found.data ?? [])[0] as { title: string; published_at: string | null } | undefined;
    return lesson?.published_at ? { type: "lesson", title: lesson.title } : null;
  }

  if (type === "live" && typeof payload.session_id === "string") {
    // Only while it is still on: a notice that arrives after the session is over helps nobody.
    const found = await database.rpc("live_for_alert", { p_session: payload.session_id, p_starts_at: null });
    if (found.error) throw new Error(found.error.message);
    const session = ((found.data ?? []) as { title: string }[])[0];
    return session ? { type: "live", title: session.title } : null;
  }
  return null;
}

/** A job from the queue: post a notice in the Telegram chat a space is connected to. */
export async function sendTeaser(job: Job): Promise<void> {
  if (!job.space_id) return;
  if (!telegramConfigured) throw new Error("The Telegram bot is not set up");
  const database = asServer();

  const asked = await database.rpc("telegram_target", { p_space: job.space_id });
  if (asked.error) throw new Error(asked.error.message);
  const target = ((asked.data ?? []) as Target[])[0];
  // No chat is connected any more, or Floor has suspended the space: nothing to post.
  if (!target || target.space_status !== "active") return;

  // The mentor may have switched this kind off after it was queued.
  const kind = switchFor(text(job.payload.type) ?? "");
  if (kind && !target[kind]) return;

  const source = await sourceFor(job.payload);
  if (!source) return;
  const words = teaserFor(source, { name: target.space_name, slug: target.slug }, SITE_URL);

  let problem: string | null = null;
  try {
    await sendText(Number(target.chat_id), words);
  } catch (error) {
    // Telegram asked for a pause, or could not be reached: the queue tries again later.
    if (!(error instanceof TelegramRefused) || error.status === 429) throw error;
    // Telegram said no for good. The mentor is told why, and has to put it right.
    problem = failureCode(error.status, error.description);
  }
  const noted = await database.rpc("telegram_result", { p_space: job.space_id, p_error: problem });
  if (noted.error) throw new Error(noted.error.message);
}

/** The database could not be asked. Telegram should send the update again. */
export class DatabaseDown extends Error {}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** The bot's answers are a courtesy. If one cannot be posted, the update was still dealt with. */
const quietly = (action: Promise<void>): Promise<void> => action.catch(() => {});

/**
 * One update from Telegram: something the bot saw. The only ones acted on are a mentor's code
 * posted in a chat, someone opening the bot, and the bot being taken out of a chat.
 */
export async function handleUpdate(update: Record<string, unknown>, site: string): Promise<void> {
  const message = record(update.channel_post) ?? record(update.message);
  if (message) {
    const chat = record(message.chat);
    const chatId = typeof chat?.id === "number" ? chat.id : null;
    const words = typeof message.text === "string" ? message.text : "";
    if (chatId === null) return;
    const inPrivate = chat?.type === "private";

    const code = connectCode(words);
    if (code && inPrivate) return quietly(sendText(chatId, BOT_WORDS.notHere));
    if (code) {
      const found = await asServer().rpc("telegram_connect", {
        p_code: code,
        p_chat_id: chatId,
        p_title: typeof chat?.title === "string" ? chat.title : null,
        p_kind: typeof chat?.type === "string" ? chat.type : null,
      });
      if (found.error) throw new DatabaseDown(found.error.message);
      const space = ((found.data ?? []) as { space_name: string; slug: string }[])[0];
      if (!space) return quietly(sendText(chatId, BOT_WORDS.badCode));
      // The line with the code has done its work. It is taken down where the bot is allowed to.
      if (typeof message.message_id === "number") await quietly(deleteMessage(chatId, message.message_id));
      return quietly(sendText(chatId, BOT_WORDS.connected({ name: space.space_name, slug: space.slug }, site)));
    }
    if (inPrivate && isStart(words)) return quietly(sendText(chatId, BOT_WORDS.hello));
    return;
  }

  const membership = record(update.my_chat_member);
  if (membership) {
    const chat = record(membership.chat);
    const status = record(membership.new_chat_member)?.status;
    if (typeof chat?.id === "number" && (status === "left" || status === "kicked")) {
      const noted = await asServer().rpc("telegram_left", { p_chat_id: chat.id });
      if (noted.error) throw new DatabaseDown(noted.error.message);
    }
  }
}
