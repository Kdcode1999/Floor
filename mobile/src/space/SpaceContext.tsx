import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthContext";
import { secureStore } from "@/lib/secureStorage";
import { supabase } from "@/lib/supabase";
import { ThemeProvider } from "@/theme/ThemeContext";
import { DEFAULT_THEME, themeFor, type ThemeName } from "@/theme/themes";

export type Role = "mentor" | "admin" | "member";

/** The mentor's space as the app needs it. Mirrors the `spaces` table. */
export interface Space {
  id: string;
  name: string;
  theme: ThemeName;
}

/** The person using the app, inside this space. Mirrors their row in `memberships`. */
export interface Viewer {
  role: Role;
  /** True while their VIP date is still ahead. Staff always count as VIP. */
  vip: boolean;
  /** When their VIP ends, as the database gave it. Null when they never had VIP. */
  vipUntil: string | null;
}

/** One space the signed-in person belongs to, with their place in it. */
export interface SpaceEntry extends Space {
  role: Role;
  vipUntil: string | null;
}

export type SpaceStatus =
  /** Nobody is signed in yet, so there is nothing to load. */
  | "idle"
  | "loading"
  /** The spaces could not be loaded. */
  | "trouble"
  /** Signed in, but not a member of any space. */
  | "none"
  /** A member of several spaces, and none is picked yet. */
  | "choose"
  | "ready";

interface SpaceContextValue {
  status: SpaceStatus;
  /** The server's own words when status is "trouble". */
  detail: string | null;
  /** Every space the signed-in person belongs to. */
  entries: SpaceEntry[];
  /** The space being shown. Before one is known this is a blank stand-in in Floor's own look. */
  space: Space;
  viewer: Viewer;
  /** Mentors and admins. They see the Manage tab. */
  isStaff: boolean;
  isMentor: boolean;
  /** Loads the person's spaces again. */
  reload: () => void;
  /** Opens one of the person's spaces. */
  choose: (id: string) => void;
  /** Goes back to the list of spaces. */
  switchSpace: () => void;
  /** Saves a new name or theme. Resolves with a message to show if it failed, or null. */
  updateSpace: (changes: Partial<Pick<Space, "name" | "theme">>) => Promise<string | null>;
  /**
   * Shows a theme across the whole app without saving it, so a mentor can try one on.
   * Pass null to go back to the saved theme.
   */
  previewTheme: (name: ThemeName | null) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

// Shown when mobile/.env is not filled in, so the screens can be looked at before any setup.
// Change the role to "member" to see the app the way a member does.
const SAMPLE: SpaceEntry = { id: "sample", name: "Your Academy", theme: DEFAULT_THEME, role: "mentor", vipUntil: null };

// Stands in until a space is known: Floor's own name and look.
const BLANK: SpaceEntry = { id: "", name: "Floor", theme: DEFAULT_THEME, role: "member", vipUntil: null };

const CHOSEN_KEY = "floor-space";

interface MembershipRow {
  role: Role;
  vip_until: string | null;
  space: { id: string; name: string; theme: string };
}

/** The spaces a person belongs to and may open: active membership, and a space they can see. */
async function loadEntries(client: SupabaseClient, userId: string): Promise<SpaceEntry[]> {
  const { data, error } = await client
    .from("memberships")
    .select("role, vip_until, space:spaces!inner(id, name, theme)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MembershipRow[]).map((row) => ({
    id: row.space.id,
    name: row.space.name,
    theme: themeFor(row.space.theme).name,
    role: row.role,
    vipUntil: row.vip_until,
  }));
}

interface Loaded {
  userId: string;
  entries: SpaceEntry[];
  detail: string | null;
}

/**
 * Holds the space the app is showing and who is looking at it, and themes everything inside
 * with that space's theme.
 */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const userId = auth.status === "ready" ? (auth.user?.id ?? null) : null;

  const [sample, setSample] = useState<SpaceEntry>(SAMPLE);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** The space last opened on this phone. Undefined until it has been read from storage. */
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<ThemeName | null>(null);
  // VIP ends by itself when its date passes, so the app looks at the clock once a minute.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    secureStore.get(CHOSEN_KEY).then(
      (id) => setChosenId(id),
      () => setChosenId(null),
    );
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    let current = true;
    loadEntries(supabase, userId).then(
      (entries) => current && setLoaded({ userId, entries, detail: null }),
      (error: Error) => current && setLoaded({ userId, entries: [], detail: error.message }),
    );
    return () => {
      current = false;
    };
  }, [userId, attempt]);

  const value = useMemo<SpaceContextValue>(() => {
    const mine = loaded && loaded.userId === userId ? loaded : null;
    const entries = auth.sample ? [sample] : (mine?.entries ?? []);

    let status: SpaceStatus;
    let entry: SpaceEntry | null = null;
    if (auth.sample) {
      status = "ready";
      entry = sample;
    } else if (!userId) status = "idle";
    else if (!mine || chosenId === undefined) status = "loading";
    else if (mine.detail) status = "trouble";
    else if (entries.length === 0) status = "none";
    else {
      entry = entries.length === 1 ? entries[0] : (entries.find((each) => each.id === chosenId) ?? null);
      status = entry ? "ready" : "choose";
    }

    const shown = entry ?? BLANK;
    const isStaff = shown.role !== "member";
    const vip = isStaff || (shown.vipUntil !== null && Date.parse(shown.vipUntil) > now);

    return {
      status,
      detail: mine?.detail ?? null,
      entries,
      space: { id: shown.id, name: shown.name, theme: shown.theme },
      viewer: { role: shown.role, vip, vipUntil: shown.vipUntil },
      isStaff,
      isMentor: shown.role === "mentor",

      reload: () => {
        setLoaded(null);
        setAttempt((count) => count + 1);
      },

      choose: (id) => {
        setChosenId(id);
        secureStore.set(CHOSEN_KEY, id).catch(() => {});
      },

      switchSpace: () => {
        setChosenId(null);
        setPreview(null);
        secureStore.remove(CHOSEN_KEY).catch(() => {});
      },

      updateSpace: async (changes) => {
        if (!entry) return "There is no space to change.";
        if (auth.sample || !supabase) {
          setSample((current) => ({ ...current, ...changes }));
          return null;
        }
        // Asking for the row back shows whether anything was changed: the database quietly
        // changes nothing when the person is not this space's mentor.
        const { data, error } = await supabase.from("spaces").update(changes).eq("id", entry.id).select("id");
        if (error) {
          return error.code === "23514" ? "That name can't be used. Try another." : "Couldn't save. Try again.";
        }
        if (!data || data.length === 0) return "Only the mentor can change the space's look.";
        const id = entry.id;
        setLoaded((current) =>
          current && {
            ...current,
            entries: current.entries.map((each) => (each.id === id ? { ...each, ...changes } : each)),
          },
        );
        return null;
      },

      previewTheme: setPreview,
    };
  }, [auth.sample, userId, sample, loaded, chosenId, now]);

  return (
    <SpaceContext.Provider value={value}>
      <ThemeProvider name={preview ?? value.space.theme}>{children}</ThemeProvider>
    </SpaceContext.Provider>
  );
}

export function useSpace(): SpaceContextValue {
  const value = useContext(SpaceContext);
  if (!value) throw new Error("useSpace must be used inside SpaceProvider");
  return value;
}
