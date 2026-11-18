// A nudge between phones: "something changed in this group, look now". Nothing else travels
// this way. No message, no name. A phone that gets the nudge asks the database as usual, and
// the database decides what it may see. If the nudge never arrives, the phone still asks every
// few seconds, so chat works without it, a little slower.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Nudges {
  /** Tells the other phones in the group to look now. */
  send: () => void;
  /** True while nudges can arrive, so the phone need not ask as often. */
  live: () => boolean;
  close: () => void;
}

/** Listens for nudges in a group. `onNudge` runs each time another phone sends one. */
export function listen(client: SupabaseClient, groupId: string, onNudge: () => void): Nudges {
  const channel = client.channel(`group:${groupId}`);
  let joined = false;
  channel.on("broadcast", { event: "changed" }, onNudge).subscribe((status) => {
    joined = status === "SUBSCRIBED";
  });
  return {
    send: () => {
      if (joined) channel.send({ type: "broadcast", event: "changed", payload: {} }).catch(() => {});
    },
    live: () => joined,
    close: () => {
      client.removeChannel(channel).catch(() => {});
    },
  };
}
