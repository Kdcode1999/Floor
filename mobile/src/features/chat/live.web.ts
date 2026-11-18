// The web build's version of live.ts. The web build is only used for checking screens, on a
// backend with no live connection, so a group here simply asks for changes every few seconds.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Nudges {
  send: () => void;
  live: () => boolean;
  close: () => void;
}

export function listen(_client: SupabaseClient, _groupId: string, _onNudge: () => void): Nudges {
  return { send: () => {}, live: () => false, close: () => {} };
}
