// What the Telegram teasers screen asks of the database and of Floor's server. Only the
// mentor may ask, and the database is what holds that.

import type { SupabaseClient } from "@supabase/supabase-js";

import { callServer, kickJobs, ServerError } from "@/lib/server";

import { teaserMessage, type TeaserStatus, type TeaserSwitch } from "./logic";

interface StatusRow {
  connected: boolean;
  chat_title: string | null;
  chat_kind: TeaserStatus["chatKind"];
  code: string | null;
  code_expires_at: string | null;
  tease_setups: boolean;
  tease_posts: boolean;
  tease_lessons: boolean;
  tease_live: boolean;
  last_sent_at: string | null;
  last_error: string | null;
}

export async function loadTeasers(client: SupabaseClient, spaceId: string): Promise<TeaserStatus> {
  const { data, error } = await client.rpc("telegram_status", { p_space: spaceId });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as StatusRow[])[0];
  if (!row) throw new Error("The space could not be read.");
  return {
    connected: row.connected,
    chatTitle: row.chat_title,
    chatKind: row.chat_kind,
    code: row.code,
    codeExpiresAt: row.code_expires_at,
    setups: row.tease_setups,
    posts: row.tease_posts,
    lessons: row.tease_lessons,
    live: row.tease_live,
    lastSentAt: row.last_sent_at,
    lastError: row.last_error,
  };
}

/** What a mentor needs to connect their channel: the bot to add, and the code to post. */
export interface ConnectSteps {
  bot: string;
  code: string;
  expiresAt: string;
}

/**
 * Asks the server for the bot's name and a code. The code already waiting is given again
 * unless `renew` asks for a new one. Throws a sentence to show when it cannot be had.
 */
export async function startConnect(spaceId: string, renew: boolean): Promise<ConnectSteps> {
  try {
    return await callServer<ConnectSteps>("/api/telegram/start", { space: spaceId, renew });
  } catch (error) {
    throw new Error(teaserMessage(error instanceof ServerError ? error.code : null));
  }
}

const done = (error: { message: string; code?: string } | null): string | null =>
  error ? teaserMessage(error.code === "42501" ? "not_allowed" : error.message) : null;

/** Saves which kinds of notice the bot posts. Resolves with a sentence to show if it failed, or null. */
export async function saveSwitches(client: SupabaseClient, spaceId: string, status: TeaserStatus, change: Partial<Record<TeaserSwitch, boolean>>): Promise<string | null> {
  const next = { setups: status.setups, posts: status.posts, lessons: status.lessons, live: status.live, ...change };
  const { error } = await client.rpc("telegram_set", {
    p_space: spaceId,
    p_setups: next.setups,
    p_posts: next.posts,
    p_lessons: next.lessons,
    p_live: next.live,
  });
  return done(error);
}

/** Has the bot post one line in the chat, now, so the mentor can see that it works. */
export async function sendTest(client: SupabaseClient, spaceId: string): Promise<string | null> {
  const { error } = await client.rpc("telegram_test", { p_space: spaceId });
  if (!error) kickJobs();
  return done(error);
}

export async function disconnect(client: SupabaseClient, spaceId: string): Promise<string | null> {
  const { error } = await client.rpc("telegram_disconnect", { p_space: spaceId });
  return done(error);
}
