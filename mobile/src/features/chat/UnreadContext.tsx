import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { useSpace } from "@/space/SpaceContext";

import { loadGroups } from "./api";
import { totalUnread } from "./logic";
import type { Group } from "./types";

/** How often the app looks for unread messages while the person is on another tab. */
const LOOK_AGAIN_MS = 60_000;

interface UnreadValue {
  /** How many messages are waiting in the groups of the space being shown. */
  unread: number;
  /** The Chat tab has just loaded the groups itself: take the count from there. */
  report: (groups: Group[]) => void;
}

const UnreadContext = createContext<UnreadValue>({ unread: 0, report: () => {} });

/**
 * Knows whether anything is unread in the space's groups, so the Chat tab can show a dot while
 * the person is somewhere else. There are no alerts for chat, so the dot is how they find out.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { sample } = useAuth();
  const { space } = useSpace();
  const client = sample ? null : supabase;
  const [held, setHeld] = useState<{ space: string; count: number } | null>(null);

  useEffect(() => {
    if (!client || !space.id) return;
    let current = true;
    const look = () => {
      // Nothing is asked while the app is in the background.
      if (AppState.currentState !== "active") return;
      loadGroups(client, space.id).then(
        (groups) => current && setHeld({ space: space.id, count: totalUnread(groups) }),
        () => {},
      );
    };
    look();
    const timer = setInterval(look, LOOK_AGAIN_MS);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") look();
    });
    return () => {
      current = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [client, space.id]);

  const value = useMemo<UnreadValue>(
    () => ({
      unread: held && held.space === space.id ? held.count : 0,
      report: (groups) => setHeld({ space: space.id, count: totalUnread(groups) }),
    }),
    [held, space.id],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}
