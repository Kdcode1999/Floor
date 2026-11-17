// The three looks a mentor can choose for their space: Night, Dawn and Smoke.
//
// A theme changes colour and light only. Layout, spacing and type are the same in all three.
// The values come from the approved mockup ("Glass app" page). Change a value here and every
// screen follows.
//
// Rules that hold in every theme
// * Buy stays green and Sell stays red, in a soft shade that suits the theme.
// * Colour marks status only (live, buy, sell, ok). Everything else is the theme's neutrals.
// * A theme must still read well where nothing can blur: see `nav.solid`.

export type ThemeName = "night" | "dawn" | "smoke";

/** A soft light behind the glass. Positions are fractions of the screen, radii are in points. */
export interface Glow {
  /** Centre, 0 to 1 across the screen width. */
  x: number;
  /** Centre, 0 to 1 down the screen height. */
  y: number;
  /** Horizontal radius on a 390 point wide screen. */
  rx: number;
  /** Vertical radius on a 390 point wide screen. */
  ry: number;
  color: string;
  /** How far out the colour has faded to nothing, 0 to 1 of the radius. */
  fade: number;
}

export interface Surface {
  background: string;
  border: string;
}

export interface Theme {
  name: ThemeName;
  /** The name a mentor sees when choosing. */
  label: string;
  /** One short line under the name, on the Space look screen. */
  description: string;
  /** True when the theme is dark, for the status bar and keyboard. */
  dark: boolean;

  /** The colour behind everything. */
  background: string;
  glows: Glow[];

  text: string;
  /** Secondary text: descriptions, helper lines. */
  text2: string;
  /** Quietest text that still passes contrast: times, meta. */
  text3: string;
  placeholder: string;
  link: string;

  /** How strongly the floating navigation blurs what scrolls under it, in points. */
  blur: number;
  /**
   * How much the colour of the lights is lifted. In the design the glass did this to whatever
   * was behind it. The app's cards do not blur, so the lift is applied to the lights instead.
   */
  saturation: number;

  /** The glass card. `shadow` is a CSS box-shadow value, including the inner top highlight. */
  card: Surface & { shadow: string };
  /** The floating pill navigation. */
  nav: Surface & {
    /** The fill where the navigation cannot blur, which is Android. Nearly opaque. */
    solid: string;
    shadow: string;
    foreground: string;
    activeBackground: string;
    activeForeground: string;
  };
  /** A quiet block inside a card: chat bubbles from others, media placeholders. */
  tile: Surface;
  /** A secondary button. */
  ghost: Surface;
  /** Small pills: tags, the back button. */
  chip: Surface;
  input: Surface;
  divider: string;
  /** Unfilled part of a progress bar or switch. */
  track: string;

  /** The main button, the unread badge, a switch that is on. */
  primary: { background: string; foreground: string; shadow: string };
  avatar: Surface & { foreground: string };
  iconTile: { background: string; foreground: string };
  /** The member's own chat bubble. */
  own: { background: string; foreground: string };

  /** Names of staff in chat, small icons that need a little colour. */
  accent: string;
  /** Progress bars, as a two-stop gradient from left to right. */
  accentFill: [string, string];

  /** The dot on "Live now". */
  liveDot: string;
  /** A Buy tag. Green in every theme. */
  buy: Surface & { foreground: string };
  /** A Sell tag. Red in every theme. */
  sell: Surface & { foreground: string };
  /** Something is on or confirmed. */
  ok: string;

}

export const night: Theme = {
  name: "night",
  label: "Night",
  description: "Dark, with cool blue light",
  dark: true,

  background: "#090A12",
  glows: [
    { x: 0.88, y: 0.06, rx: 360, ry: 300, color: "rgba(76,110,255,0.5)", fade: 0.7 },
    { x: 0, y: 0.44, rx: 340, ry: 340, color: "rgba(150,96,255,0.4)", fade: 0.7 },
    { x: 0.95, y: 0.92, rx: 380, ry: 320, color: "rgba(40,190,210,0.26)", fade: 0.7 },
  ],

  text: "#FFFFFF",
  text2: "rgba(255,255,255,0.82)",
  text3: "rgba(255,255,255,0.72)",
  placeholder: "rgba(255,255,255,0.7)",
  link: "#FFFFFF",

  blur: 28,
  saturation: 1.5,

  card: {
    background: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.16)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 24px 48px -24px rgba(0,0,0,0.55)",
  },
  nav: {
    background: "rgba(16,18,32,0.6)",
    solid: "rgba(16,18,32,0.96)",
    border: "rgba(255,255,255,0.16)",
    shadow: "0 24px 48px -16px rgba(0,0,0,0.7)",
    foreground: "rgba(255,255,255,0.72)",
    activeBackground: "rgba(255,255,255,0.18)",
    activeForeground: "#FFFFFF",
  },
  tile: { background: "rgba(255,255,255,0.09)", border: "rgba(255,255,255,0.14)" },
  ghost: { background: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.24)" },
  chip: { background: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)" },
  input: { background: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.16)" },
  divider: "rgba(255,255,255,0.12)",
  track: "rgba(255,255,255,0.14)",

  primary: { background: "#FFFFFF", foreground: "#0B0C14", shadow: "0 14px 28px -14px rgba(255,255,255,0.35)" },
  avatar: { background: "rgba(255,255,255,0.14)", border: "rgba(255,255,255,0.22)", foreground: "#FFFFFF" },
  iconTile: { background: "rgba(255,255,255,0.14)", foreground: "#FFFFFF" },
  own: { background: "rgba(255,255,255,0.94)", foreground: "#0B0C14" },

  accent: "#B8C6FF",
  accentFill: ["#7C96FF", "#B8C6FF"],

  liveDot: "#FF9D8A",
  buy: { background: "rgba(120,240,190,0.18)", border: "rgba(120,240,190,0.36)", foreground: "#C2F9E2" },
  sell: { background: "rgba(255,140,140,0.16)", border: "rgba(255,140,140,0.34)", foreground: "#FFCFCF" },
  ok: "#8FF0C8",
};

export const dawn: Theme = {
  name: "dawn",
  label: "Dawn",
  description: "Light, with soft pastel light",
  dark: false,

  background: "#F2F0F7",
  glows: [
    { x: 0.06, y: 0.04, rx: 340, ry: 300, color: "rgba(255,190,150,0.85)", fade: 0.7 },
    { x: 1, y: 0.22, rx: 380, ry: 340, color: "rgba(160,200,255,0.9)", fade: 0.7 },
    { x: 0.35, y: 1, rx: 440, ry: 380, color: "rgba(200,178,255,0.8)", fade: 0.7 },
  ],

  text: "#15131F",
  text2: "#47445A",
  text3: "#5E5B73",
  placeholder: "#5E5B73",
  link: "#15131F",

  blur: 26,
  saturation: 1.6,

  card: {
    background: "rgba(255,255,255,0.58)",
    border: "rgba(255,255,255,0.95)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 24px 48px -28px rgba(70,60,120,0.35)",
  },
  nav: {
    background: "rgba(255,255,255,0.72)",
    solid: "rgba(255,255,255,0.97)",
    border: "rgba(255,255,255,0.95)",
    shadow: "0 20px 40px -18px rgba(70,60,120,0.4)",
    foreground: "#47445A",
    activeBackground: "#15131F",
    activeForeground: "#FFFFFF",
  },
  tile: { background: "rgba(255,255,255,0.66)", border: "rgba(255,255,255,0.95)" },
  ghost: { background: "rgba(255,255,255,0.6)", border: "rgba(21,19,31,0.16)" },
  chip: { background: "rgba(255,255,255,0.75)", border: "rgba(255,255,255,0.95)" },
  input: { background: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.95)" },
  divider: "rgba(21,19,31,0.09)",
  track: "rgba(21,19,31,0.1)",

  primary: { background: "#15131F", foreground: "#FFFFFF", shadow: "0 14px 28px -12px rgba(21,19,31,0.55)" },
  avatar: { background: "#15131F", border: "#15131F", foreground: "#FFFFFF" },
  iconTile: { background: "#15131F", foreground: "#FFFFFF" },
  own: { background: "#15131F", foreground: "#FFFFFF" },

  accent: "#4B3FD1",
  accentFill: ["#7B6CF0", "#4B3FD1"],

  liveDot: "#F2655A",
  buy: { background: "rgba(16,150,100,0.12)", border: "rgba(16,150,100,0.25)", foreground: "#0B6B45" },
  sell: { background: "rgba(200,50,60,0.1)", border: "rgba(200,50,60,0.22)", foreground: "#A12431" },
  ok: "#0B6B45",
};

export const smoke: Theme = {
  name: "smoke",
  label: "Smoke",
  description: "Dark, with warm amber light",
  dark: true,

  background: "#0D0D0F",
  glows: [
    { x: 0.96, y: 0.02, rx: 440, ry: 360, color: "rgba(245,166,91,0.42)", fade: 0.7 },
    { x: 0, y: 0.72, rx: 400, ry: 360, color: "rgba(232,121,166,0.16)", fade: 0.7 },
  ],

  text: "#F7F3EE",
  text2: "rgba(247,243,238,0.82)",
  text3: "rgba(247,243,238,0.7)",
  placeholder: "rgba(247,243,238,0.7)",
  link: "#FFD9B0",

  blur: 30,
  saturation: 1.4,

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.12)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 48px -24px rgba(0,0,0,0.6)",
  },
  nav: {
    background: "rgba(34,31,28,0.62)",
    solid: "rgba(34,31,28,0.97)",
    border: "rgba(255,255,255,0.14)",
    shadow: "0 24px 48px -16px rgba(0,0,0,0.8)",
    foreground: "rgba(247,243,238,0.72)",
    activeBackground: "rgba(255,255,255,0.14)",
    activeForeground: "#F7F3EE",
  },
  tile: { background: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.12)" },
  ghost: { background: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.2)" },
  chip: { background: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.16)" },
  input: { background: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)" },
  divider: "rgba(255,255,255,0.1)",
  track: "rgba(255,255,255,0.12)",

  primary: { background: "#F7F3EE", foreground: "#141210", shadow: "0 14px 28px -14px rgba(247,243,238,0.3)" },
  avatar: { background: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", foreground: "#F7F3EE" },
  iconTile: { background: "rgba(255,255,255,0.12)", foreground: "#F7F3EE" },
  own: { background: "#F7F3EE", foreground: "#141210" },

  accent: "#FFD9B0",
  accentFill: ["#F5A65B", "#FFD9B0"],

  liveDot: "#F5B97A",
  buy: { background: "rgba(130,220,170,0.14)", border: "rgba(130,220,170,0.3)", foreground: "#BFEFD6" },
  sell: { background: "rgba(240,150,140,0.14)", border: "rgba(240,150,140,0.3)", foreground: "#F6CBC3" },
  ok: "#BFEFD6",
};

export const themes: Record<ThemeName, Theme> = { night, dawn, smoke };

export const themeNames: ThemeName[] = ["night", "dawn", "smoke"];

export const DEFAULT_THEME: ThemeName = "night";

/** The theme for a space, falling back to Night when the stored name is unknown. */
export function themeFor(name: string | null | undefined): Theme {
  return themes[(name ?? "") as ThemeName] ?? themes[DEFAULT_THEME];
}
