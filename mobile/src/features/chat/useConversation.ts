import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { loadChanges, loadPage, markRead, PAGE } from "./api";
import { listen } from "./live";
import { askSince, mergeMessages, waitFor, withoutWriter } from "./logic";
import type { Message } from "./types";

/** How often an open group looks at the clock to decide whether to ask for changes. */
const TICK_MS = 1000;

interface Held {
  group: string;
  /** Oldest first. */
  messages: Message[];
  /** True once the first message ever sent in the group has been loaded. */
  start: boolean;
}

/**
 * One group's conversation, kept up to date while the screen is open. It loads the newest
 * messages, then keeps asking the database what is new or changed: at once when another phone
 * nudges, and every few seconds otherwise. Everything it shows came from the database, which
 * decides what this person may see.
 */
export function useConversation(client: SupabaseClient | null, groupId: string | null) {
  const [held, setHeld] = useState<Held | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [openedAt] = useState(() => new Date().toISOString());

  const mine = held && held.group === groupId ? held : null;
  const ready = mine !== null;

  /** The newest list, for the code that runs outside a render. */
  const latest = useRef<Message[]>([]);
  useEffect(() => {
    latest.current = mine?.messages ?? [];
  });
  const askNow = useRef<() => void>(() => {});
  const nudge = useRef<() => void>(() => {});
  /** True while a page of older messages is on its way, so a second is not asked for alongside it. */
  const fetchingOlder = useRef(false);

  // The newest page.
  useEffect(() => {
    if (!client || !groupId) return;
    let current = true;
    loadPage(client, groupId).then(
      (page) => {
        if (!current) return;
        setHeld({ group: groupId, messages: mergeMessages([], page), start: page.length < PAGE });
        setTrouble(null);
        markRead(client, groupId);
      },
      (error: Error) => current && setTrouble(error.message),
    );
    return () => {
      current = false;
    };
  }, [client, groupId, round]);

  // What is new or changed, from then on.
  useEffect(() => {
    if (!client || !groupId || !ready) return;
    let current = true;
    let lastAsked = Date.now();
    /** How many times in a row the answer was "nothing new". The quieter the group, the less often it is asked. */
    let quietRounds = 0;
    /** True when another phone has said something changed and the question has not gone out yet. */
    let nudged = false;

    const ask = () => {
      lastAsked = Date.now();
      nudged = false;
      loadChanges(client, groupId, askSince(latest.current, openedAt)).then(
        (arrived) => {
          if (!current) return;
          if (arrived.length === 0) {
            quietRounds += 1;
            return;
          }
          quietRounds = 0;
          setHeld((now) => (now && now.group === groupId ? { ...now, messages: mergeMessages(now.messages, arrived) } : now));
          const known = new Set(latest.current.map((message) => message.id));
          if (arrived.some((message) => !message.mine && !message.deleted && !known.has(message.id))) markRead(client, groupId);
        },
        () => {},
      );
    };

    const nudges = listen(client, groupId, () => {
      if (AppState.currentState !== "active") return;
      // Asked at once, unless the last question went out under a second ago: then the timer asks.
      if (Date.now() - lastAsked >= waitFor(true, true, 0)) ask();
      else nudged = true;
    });
    const timer = setInterval(() => {
      // A phone with the app in the background asks nothing. It catches up when it comes back.
      if (AppState.currentState !== "active") return;
      const waited = Date.now() - lastAsked;
      if (waited >= waitFor(nudged, nudges.live(), quietRounds)) ask();
    }, TICK_MS);

    askNow.current = () => {
      quietRounds = 0;
      ask();
    };
    nudge.current = nudges.send;
    return () => {
      current = false;
      clearInterval(timer);
      nudges.close();
      askNow.current = () => {};
      nudge.current = () => {};
    };
  }, [client, groupId, ready, openedAt]);

  return {
    /** Oldest first. Null while the first page is on its way. */
    messages: mine?.messages ?? null,
    /** The server's own words when the first page could not be loaded. */
    trouble: ready ? null : trouble,
    reachedStart: mine?.start ?? false,
    loadingOlder,

    retry: () => setRound((count) => count + 1),

    /** Call after this phone changed something: it looks at once, and tells the other phones to. */
    changed: () => {
      askNow.current();
      nudge.current();
    },

    /** Takes one person's messages off the screen, when they have just been blocked. */
    hide: (userId: string) => setHeld((now) => (now && now.group === groupId ? { ...now, messages: withoutWriter(now.messages, userId) } : now)),

    /** Loads the page before the oldest message on screen. */
    loadOlder: async () => {
      if (!client || !groupId || !mine || mine.start || fetchingOlder.current) return;
      const oldest = mine.messages[0];
      if (!oldest) return;
      fetchingOlder.current = true;
      setLoadingOlder(true);
      try {
        const page = await loadPage(client, groupId, oldest.createdAt);
        // Once the start has been reached it stays reached, whatever order answers arrive in.
        setHeld((now) =>
          now && now.group === groupId ? { ...now, messages: mergeMessages(now.messages, page), start: now.start || page.length < PAGE } : now,
        );
      } catch {
        // The next scroll to the top tries again.
      }
      fetchingOlder.current = false;
      setLoadingOlder(false);
    },
  };
}
