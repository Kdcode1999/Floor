import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthContext";
import { nameMessage } from "@/features/account/name";
import { logoUrl } from "@/lib/env";
import { secureStore } from "@/lib/secureStorage";
import { supabase } from "@/lib/supabase";
import { ThemeProvider } from "@/theme/ThemeContext";
import { DEFAULT_THEME, themeFor, type ThemeName } from "@/theme/themes";

import { canOpen, type Role } from "./access";

export type { Role } from "./access";

/** The mentor's space as the app needs it. Mirrors the `spaces` table. */
export interface Space {
  id: string;
  name: string;
  theme: ThemeName;
  /** The address of the space's logo picture. Null when it has none. */
  logo: string | null;
  /** The mentor's switch: no screenshots or screen recording for members. */
  blockCapture: boolean;
  /** The mentor's switch: the viewer's name is shown on paid video. */
  watermark: boolean;
  /** True while Floor has the space suspended. Only its staff can be looking at it then. */
  suspended: boolean;
}

/** What a mentor can change about the space's look. */
export interface LookChanges {
  name?: string;
  theme?: ThemeName;
  /** Where a newly uploaded logo is in the "logos" store. */
  logoPath?: string;
}

/** The person using the app, inside this space. Mirrors their row in `memberships`. */
export interface Viewer {
  role: Role;
  /** True while their VIP date is still ahead. Staff always count as VIP. */
  vip: boolean;
  /** When their VIP ends, as the database gave it. Null when they never had VIP. */
  vipUntil: string | null;
  /** The name they go by in this app. */
  name: string;
}

/** One space the signed-in person belongs to, with their place in it. */
export interface SpaceEntry {
  id: string;
  name: string;
  theme: ThemeName;
  /** Where the logo is in the "logos" store. On the sample space, a picture on this phone. */
  logoPath: string | null;
  blockCapture: boolean;
  watermark: boolean;
  /** True while Floor has the space suspended. Members cannot open it then. Its staff can. */
  suspended: boolean;
  role: Role;
  vipUntil: string | null;
  /** The name the person goes by. */
  displayName: string;
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
  /** A member of one space, which Floor has suspended. */
  | "suspended"
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
  /** Saves a new name, theme or logo. Resolves with a message to show if it failed, or null. */
  updateSpace: (changes: LookChanges) => Promise<string | null>;
  /** Saves the name the person goes by, in every space. Resolves with a message to show if it failed, or null. */
  rename: (name: string) => Promise<string | null>;
  /** Saves the mentor's two protection switches. Resolves with a message to show if it failed, or null. */
  setProtection: (changes: { blockCapture?: boolean; watermark?: boolean }) => Promise<string | null>;
  /**
   * Shows a theme across the whole app without saving it, so a mentor can try one on.
   * Pass null to go back to the saved theme.
   */
  previewTheme: (name: ThemeName | null) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

// Shown when mobile/.env is not filled in, so the screens can be looked at before any setup.
// Change the role to "member" to see the app the way a member does.
const SAMPLE: SpaceEntry = {
  id: "sample",
  name: "Your Academy",
  theme: DEFAULT_THEME,
  logoPath: null,
  blockCapture: false,
  watermark: false,
  suspended: false,
  role: "mentor",
  vipUntil: null,
  displayName: "You",
};

// Stands in until a space is known: Floor's own name and look.
const BLANK: SpaceEntry = {
  id: "",
  name: "Floor",
  theme: DEFAULT_THEME,
  logoPath: null,
  blockCapture: false,
  watermark: false,
  suspended: false,
  role: "member",
  vipUntil: null,
  displayName: "",
};

const CHOSEN_KEY = "floor-space";

interface SpaceRow {
  id: string;
  name: string;
  theme: string;
  logo_path: string | null;
  status: "active" | "suspended";
  role: Role;
  vip_until: string | null;
  block_capture: boolean;
  watermark: boolean;
  display_name: string;
}

/**
 * The spaces a person belongs to, in the order they joined them. A space Floor has suspended
 * stays on the list, marked, so the app can say why it will not open.
 */
async function loadEntries(client: SupabaseClient): Promise<SpaceEntry[]> {
  const { data, error } = await client.rpc("my_spaces");
  if (error) throw new Error(error.message);
  return ((data ?? []) as SpaceRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    theme: themeFor(row.theme).name,
    logoPath: row.logo_path,
    blockCapture: row.block_capture,
    watermark: row.watermark,
    suspended: row.status === "suspended",
    role: row.role,
    vipUntil: row.vip_until,
    displayName: row.display_name,
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
    loadEntries(supabase).then(
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
      const picked = entries.length === 1 ? entries[0] : (entries.find((each) => each.id === chosenId) ?? null);
      // A member cannot open a space Floor has suspended. Its staff can.
      entry = picked && canOpen(picked) ? picked : null;
      status = entry ? "ready" : entries.length === 1 ? "suspended" : "choose";
    }

    const shown = entry ?? BLANK;
    const isStaff = shown.role !== "member";
    const vip = isStaff || (shown.vipUntil !== null && Date.parse(shown.vipUntil) > now);

    return {
      status,
      detail: mine?.detail ?? null,
      entries,
      space: {
        id: shown.id,
        name: shown.name,
        theme: shown.theme,
        logo: shown.logoPath === null ? null : auth.sample ? shown.logoPath : logoUrl(shown.logoPath),
        blockCapture: shown.blockCapture,
        watermark: shown.watermark,
        suspended: shown.suspended,
      },
      viewer: { role: shown.role, vip, vipUntil: shown.vipUntil, name: shown.displayName },
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
        const row: Record<string, string> = {};
        if (changes.name !== undefined) row.name = changes.name;
        if (changes.theme !== undefined) row.theme = changes.theme;
        if (changes.logoPath !== undefined) row.logo_path = changes.logoPath;
        const { data, error } = await supabase.from("spaces").update(row).eq("id", entry.id).select("id");
        if (error) {
          return error.code === "23514" ? "That name can't be used. Try another." : "Couldn't save. Try again.";
        }
        if (!data || data.length === 0) return "Only the mentor can change the space's look.";
        // The old logo is no longer shown anywhere. Throw it away, and carry on if that fails.
        if (changes.logoPath !== undefined && entry.logoPath && entry.logoPath !== changes.logoPath) {
          void supabase.storage.from("logos").remove([entry.logoPath]).then(undefined, () => {});
        }
        const id = entry.id;
        setLoaded((current) =>
          current && {
            ...current,
            entries: current.entries.map((each) => (each.id === id ? { ...each, ...changes } : each)),
          },
        );
        return null;
      },

      rename: async (name) => {
        const displayName = name.trim().replace(/\s+/g, " ");
        if (auth.sample || !supabase || !userId) {
          setSample((current) => ({ ...current, displayName }));
          return null;
        }
        const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
        if (error) return nameMessage(error);
        // A person has one name, whichever space they are in.
        setLoaded((current) => current && { ...current, entries: current.entries.map((each) => ({ ...each, displayName })) });
        return null;
      },

      setProtection: async (changes) => {
        if (!entry) return "There is no space to change.";
        if (auth.sample || !supabase) {
          setSample((current) => ({ ...current, ...changes }));
          return null;
        }
        const row: Record<string, boolean> = {};
        if (changes.blockCapture !== undefined) row.block_capture = changes.blockCapture;
        if (changes.watermark !== undefined) row.watermark = changes.watermark;
        const { data, error } = await supabase.from("space_settings").update(row).eq("space_id", entry.id).select("space_id");
        if (error) return "Couldn't save. Try again.";
        if (!data || data.length === 0) return "Only the mentor can change this.";
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
