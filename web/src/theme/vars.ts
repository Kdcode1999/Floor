import type { CSSProperties } from "react";

import type { Theme } from "@/theme/themes";

/**
 * Turns one of the three themes into the CSS variables the stylesheet reads, so a page can be
 * drawn in a space's own look by setting them on its outermost element.
 */
export function themeVars(theme: Theme): CSSProperties {
  // Each light is sized for a phone 390 points wide and grows with the window, up to a point.
  const lights = theme.glows
    .map((glow) => {
      const size = (points: number) => `min(${Math.round(points * 1.6)}px, ${((points / 390) * 100).toFixed(1)}vw)`;
      const clear = glow.color.replace(/,\s*[\d.]+\)$/, ",0)");
      return `radial-gradient(${size(glow.rx)} ${size(glow.ry)} at ${glow.x * 100}% ${glow.y * 100}%, ${glow.color}, ${clear} ${glow.fade * 100}%)`;
    })
    .join(", ");

  return {
    "--bg": theme.background,
    "--lights": lights,
    "--text": theme.text,
    "--text2": theme.text2,
    "--text3": theme.text3,
    "--placeholder": theme.placeholder,
    "--blur": `${theme.blur}px`,
    "--lift": String(theme.saturation),
    "--card-bg": theme.card.background,
    "--card-border": theme.card.border,
    "--card-shadow": theme.card.shadow,
    "--chip-bg": theme.chip.background,
    "--chip-border": theme.chip.border,
    "--tile-bg": theme.tile.background,
    "--tile-border": theme.tile.border,
    "--ghost-bg": theme.ghost.background,
    "--ghost-border": theme.ghost.border,
    "--input-bg": theme.input.background,
    "--input-border": theme.input.border,
    "--divider": theme.divider,
    "--primary-bg": theme.primary.background,
    "--primary-fg": theme.primary.foreground,
    "--primary-shadow": theme.primary.shadow,
    "--avatar-bg": theme.avatar.background,
    "--avatar-border": theme.avatar.border,
    "--avatar-fg": theme.avatar.foreground,
    "--accent": theme.accent,
    "--ok": theme.ok,
    "--error": theme.error,
    colorScheme: theme.dark ? "dark" : "light",
  } as CSSProperties;
}
