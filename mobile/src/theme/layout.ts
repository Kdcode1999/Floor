import { Platform } from "react-native";

// Sizes shared by more than one component. Colours live in themes.ts.

/** Content never grows wider than this, so the app still looks right on a tablet. */
export const CONTENT_MAX_WIDTH = 560;

/** Space between the edge of the screen and the cards. */
export const SCREEN_PADDING = 16;

/** Height of the floating navigation, in points. */
export const NAV_HEIGHT = 62;

/** How far the navigation floats above the bottom edge of the screen. */
export function navBottomOffset(insetBottom: number): number {
  // iPhone: sit just above the home bar. Android: stay clear of the system buttons.
  if (Platform.OS === "ios") return Math.max(16, insetBottom - 10);
  if (Platform.OS === "android") return Math.max(16, insetBottom + 8);
  return 16;
}
