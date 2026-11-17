import { Text, type TextProps, type TextStyle } from "react-native";

import { useTheme } from "@/theme/ThemeContext";

export type Weight = "regular" | "medium" | "semibold" | "bold";

// Custom fonts need one family per weight: Android cannot fake a weight from another file.
export const FONT_FAMILY: Record<Weight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export interface AppTextProps extends TextProps {
  /** Font size in points. */
  size?: number;
  /** Line height in points. */
  line?: number;
  weight?: Weight;
  /** Text colour. Defaults to the theme's main text colour. */
  color?: string;
  /** Letter spacing in points. */
  tracking?: number;
  /** Line digits up in columns, for prices and times. */
  tabular?: boolean;
}

/** All text in the app goes through here, so type stays consistent and themed. */
export function AppText({
  size = 15,
  line,
  weight = "regular",
  color,
  tracking,
  tabular,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const base: TextStyle = {
    fontFamily: FONT_FAMILY[weight],
    fontSize: size,
    lineHeight: line ?? Math.round(size * 1.4),
    color: color ?? theme.text,
    letterSpacing: tracking,
    fontVariant: tabular ? ["tabular-nums"] : undefined,
  };
  return <Text {...rest} style={[base, style]} />;
}
