// Telegram teasers, in the sample space. Each function follows the database's own of the same
// name: see web/supabase/migrations/…_telegram.sql.
//
// There is no Telegram here. Where the real thing waits for the mentor to post a line in their
// channel, the sample connects by itself a few seconds after the code is shown, so the next
// screen can be seen. The screen says so.

import { isMentor, notAllowed, randomCode, Refusal, type Ctx } from "../rules";
import { iso, type TelegramRow } from "../world";

/** How long a code to connect lasts. */
const CODE_LASTS_MS = 30 * 60_000;

/** How long after a code is made the sample's channel connects by itself. */
export const CONNECTS_AFTER_MS = 10_000;

function linkFor(ctx: Ctx, space: string, make: boolean): TelegramRow | undefined {
  const found = ctx.world.telegram_links.find((each) => each.space_id === space);
  if (found || !make) return found;
  const made: TelegramRow = {
    space_id: space,
    chat_id: null,
    chat_title: null,
    chat_kind: null,
    connected_at: null,
    connect_code: null,
    code_expires_at: null,
    tease_setups: true,
    tease_posts: true,
    tease_lessons: true,
    tease_live: true,
    last_sent_at: null,
    last_error: null,
    last_error_at: null,
  };
  ctx.world.telegram_links.push(made);
  return made;
}

/**
 * Notes that a notice went to the channel, when one is connected and that kind is switched on.
 * The real database queues the notice and Floor's server posts it.
 */
export function teased(ctx: Ctx, space: string, which: "tease_setups" | "tease_posts" | "tease_lessons"): void {
  const link = linkFor(ctx, space, false);
  if (link && link.chat_id !== null && link[which]) link.last_sent_at = iso(ctx.now);
}

const mentorOnly = (ctx: Ctx, space: string) => {
  if (!isMentor(ctx, space)) throw notAllowed();
};

export const telegramFunctions = {
  /** Makes a new code for the mentor to post in their channel. */
  telegram_start(ctx: Ctx, args: { p_space: string }) {
    mentorOnly(ctx, args.p_space);
    const link = linkFor(ctx, args.p_space, true);
    if (!link) throw notAllowed();
    link.connect_code = randomCode();
    link.code_expires_at = iso(ctx.now + CODE_LASTS_MS);
    return [{ code: link.connect_code, expires_at: link.code_expires_at }];
  },

  telegram_status(ctx: Ctx, args: { p_space: string }) {
    mentorOnly(ctx, args.p_space);
    const link = linkFor(ctx, args.p_space, false);
    // Stands in for the mentor posting the line in their channel.
    if (link && link.chat_id === null && link.connect_code && link.code_expires_at) {
      const shown = Date.parse(link.code_expires_at) - CODE_LASTS_MS;
      if (ctx.now - shown >= CONNECTS_AFTER_MS) {
        const space = ctx.world.spaces.find((each) => each.id === args.p_space);
        Object.assign(link, {
          chat_id: -1000000000002,
          chat_title: `${space?.name ?? "Sample"} Signals`,
          chat_kind: "channel",
          connected_at: iso(ctx.now),
          connect_code: null,
          code_expires_at: null,
          last_error: null,
          last_error_at: null,
        } satisfies Partial<TelegramRow>);
      }
    }
    const waiting = link?.code_expires_at != null && Date.parse(link.code_expires_at) > ctx.now;
    return [
      {
        connected: link != null && link.chat_id !== null,
        chat_title: link?.chat_title ?? null,
        chat_kind: link?.chat_kind ?? null,
        connected_at: link?.connected_at ?? null,
        code: waiting ? (link?.connect_code ?? null) : null,
        code_expires_at: waiting ? (link?.code_expires_at ?? null) : null,
        tease_setups: link?.tease_setups ?? true,
        tease_posts: link?.tease_posts ?? true,
        tease_lessons: link?.tease_lessons ?? true,
        tease_live: link?.tease_live ?? true,
        last_sent_at: link?.last_sent_at ?? null,
        last_error: link?.last_error ?? null,
        last_error_at: link?.last_error_at ?? null,
      },
    ];
  },

  telegram_set(ctx: Ctx, args: { p_space: string; p_setups?: boolean | null; p_posts?: boolean | null; p_lessons?: boolean | null; p_live?: boolean | null }) {
    mentorOnly(ctx, args.p_space);
    const link = linkFor(ctx, args.p_space, true);
    if (!link) throw notAllowed();
    link.tease_setups = args.p_setups ?? true;
    link.tease_posts = args.p_posts ?? true;
    link.tease_lessons = args.p_lessons ?? true;
    link.tease_live = args.p_live ?? true;
    return null;
  },

  telegram_disconnect(ctx: Ctx, args: { p_space: string }) {
    mentorOnly(ctx, args.p_space);
    const link = linkFor(ctx, args.p_space, false);
    if (link) {
      Object.assign(link, {
        chat_id: null,
        chat_title: null,
        chat_kind: null,
        connected_at: null,
        connect_code: null,
        code_expires_at: null,
        last_error: null,
        last_error_at: null,
      } satisfies Partial<TelegramRow>);
    }
    return null;
  },

  /** Has the bot post one line now, so the mentor can see that it works. */
  telegram_test(ctx: Ctx, args: { p_space: string }) {
    mentorOnly(ctx, args.p_space);
    const link = linkFor(ctx, args.p_space, false);
    if (!link || link.chat_id === null) throw new Refusal("not_connected");
    link.last_sent_at = iso(ctx.now);
    return null;
  },
};
