// The web build's version of push.ts. A browser gets no alerts from Floor: the web build is
// only for checking screens. Every function here says so and does nothing.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AlertState } from "./logic";

export function setUpAlerts(): void {}

export async function alertState(): Promise<AlertState> {
  return "unsupported";
}

export async function shareAddress(_client: SupabaseClient): Promise<boolean> {
  return false;
}

export async function turnOnAlerts(_client: SupabaseClient): Promise<AlertState> {
  return "unsupported";
}

/** Tells Floor to stop alerting this account, when the person signs out. Never holds sign-out up. */
export async function forgetAddress(client: SupabaseClient): Promise<void> {
  const call = Promise.resolve(client.rpc("remove_push_token")).then(
    () => {},
    () => {},
  );
  await Promise.race([call, new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
}
