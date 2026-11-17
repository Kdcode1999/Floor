import { useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import type { Theme } from "@/theme/themes";

interface GlowFieldProps {
  theme: Theme;
  width: number;
  height: number;
  /** Draws the lights stronger, for the small theme pictures on the Space look screen. */
  swatch?: boolean;
}

type Rgb = [number, number, number];

/** Reads "#RRGGBB" or "rgba(r,g,b,a)" into its channels and opacity. */
function parseColor(color: string): { rgb: Rgb; alpha: number } {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return { rgb: [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)], alpha: 1 };
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!match) return { rgb: [0, 0, 0], alpha: 0 };
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** The same sum a CSS `saturate()` filter does. Results can fall outside 0 to 255. */
function saturate([r, g, b]: Rgb, amount: number): Rgb {
  const grey = 0.213 * r + 0.715 * g + 0.072 * b;
  return [grey + amount * (r - grey), grey + amount * (g - grey), grey + amount * (b - grey)];
}

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/**
 * Works out the colour and opacity to paint a glow with so that, laid over the base colour,
 * it looks like the glow after its colour has been lifted. A lifted colour can ask for more
 * than a screen can show (blue above 255), so the colour is pulled back into range and the
 * opacity raised to make up for it.
 */
function liftGlow(glow: Rgb, alpha: number, base: Rgb, amount: number): { rgb: Rgb; alpha: number } {
  const lifted = saturate(glow, amount);
  let stretch = 1;
  for (let channel = 0; channel < 3; channel++) {
    const from = base[channel];
    const to = lifted[channel];
    if (to > 255) stretch = Math.max(stretch, (to - from) / (255 - from));
    if (to < 0) stretch = Math.max(stretch, (from - to) / from);
  }
  stretch = Math.min(stretch, 1 / alpha);
  const rgb = lifted.map((to, channel) =>
    Math.min(255, Math.max(0, base[channel] + (to - base[channel]) / stretch)),
  ) as Rgb;
  return { rgb, alpha: alpha * stretch };
}

/**
 * The soft lights behind the glass: the theme's base colour with a few large glows that fade
 * to nothing. This is what gives each theme its mood.
 *
 * The colours are lifted by the theme's `saturation`. In the design that lift came from the
 * glass itself, which the app's cards do not have (see Card), so it is put into the light
 * instead. Through a card the result is the same.
 */
export function GlowField({ theme, width, height, swatch = false }: GlowFieldProps) {
  // Gradient ids are shared across a whole web page, so every field needs its own.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (width <= 0 || height <= 0) return null;

  // Glow sizes are given for a 390 point wide phone. Keep them in step with the screen, within
  // reason, so a tablet does not turn the lights into one flat wash.
  const scale = Math.min(width / 390, 1.6) * (swatch ? 1.1 : 1);
  const strength = swatch ? 1.6 : 1;

  const base = saturate(parseColor(theme.background).rgb, theme.saturation).map((channel) =>
    Math.min(255, Math.max(0, channel)),
  ) as Rgb;
  const glows = theme.glows.map((glow) => {
    const { rgb, alpha } = parseColor(glow.color);
    return { ...glow, ...liftGlow(rgb, Math.min(1, alpha * strength), base, theme.saturation) };
  });

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {glows.map((glow, index) => (
          // The gradient fills the box of the shape it paints, so an oval box gives an oval glow.
          <RadialGradient key={index} id={`glow${id}${index}`} cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={css(glow.rgb)} stopOpacity={glow.alpha} />
            <Stop offset={glow.fade} stopColor={css(glow.rgb)} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={css(base)} />
      {glows.map((glow, index) => {
        const rx = glow.rx * scale;
        const ry = glow.ry * scale;
        return (
          <Rect
            key={index}
            x={glow.x * width - rx}
            y={glow.y * height - ry}
            width={rx * 2}
            height={ry * 2}
            fill={`url(#glow${id}${index})`}
          />
        );
      })}
    </Svg>
  );
}
