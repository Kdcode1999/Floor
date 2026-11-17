import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { ThemeProvider } from "@/theme/ThemeContext";
import { DEFAULT_THEME, type ThemeName } from "@/theme/themes";

export type Role = "mentor" | "admin" | "member";

/** The mentor's space as the app needs it. Mirrors the `spaces` table. */
export interface Space {
  name: string;
  theme: ThemeName;
}

/** The person using the app, inside this space. Mirrors their row in `memberships`. */
export interface Viewer {
  role: Role;
  /** True while their VIP date is still ahead. */
  vip: boolean;
}

interface SpaceContextValue {
  space: Space;
  viewer: Viewer;
  /** Mentors and admins. They see the Manage tab. */
  isStaff: boolean;
  isMentor: boolean;
  /** Saves a new name or theme for the space. */
  updateSpace: (changes: Partial<Space>) => void;
  /**
   * Shows a theme across the whole app without saving it, so a mentor can try one on.
   * Pass null to go back to the saved theme.
   */
  previewTheme: (name: ThemeName | null) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

// Sample values. They are replaced by the real space and membership once sign-in is built.
// Change the role to "member" to see the app the way a member does.
const SAMPLE_SPACE: Space = { name: "Your Academy", theme: DEFAULT_THEME };
const SAMPLE_VIEWER: Viewer = { role: "mentor", vip: true };

/**
 * Holds the space the app is showing and who is looking at it, and themes everything inside
 * with the space's theme.
 */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState<Space>(SAMPLE_SPACE);
  const [preview, setPreview] = useState<ThemeName | null>(null);
  const viewer = SAMPLE_VIEWER;

  const value = useMemo<SpaceContextValue>(
    () => ({
      space,
      viewer,
      isStaff: viewer.role !== "member",
      isMentor: viewer.role === "mentor",
      updateSpace: (changes) => setSpace((current) => ({ ...current, ...changes })),
      previewTheme: setPreview,
    }),
    [space, viewer],
  );

  return (
    <SpaceContext.Provider value={value}>
      <ThemeProvider name={preview ?? space.theme}>{children}</ThemeProvider>
    </SpaceContext.Provider>
  );
}

export function useSpace(): SpaceContextValue {
  const value = useContext(SpaceContext);
  if (!value) throw new Error("useSpace must be used inside SpaceProvider");
  return value;
}
