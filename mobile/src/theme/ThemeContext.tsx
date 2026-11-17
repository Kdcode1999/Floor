import { createContext, useContext, type ReactNode } from "react";

import { themes, type Theme, type ThemeName } from "./themes";

const ThemeContext = createContext<Theme | null>(null);

/** Makes one of the three themes available to everything inside it. */
export function ThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  return <ThemeContext.Provider value={themes[name]}>{children}</ThemeContext.Provider>;
}

/** The theme the screen is drawn in. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside ThemeProvider");
  return theme;
}
