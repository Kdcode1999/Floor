import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

export type PillTone = "neutral" | "primary" | "buy" | "sell";

interface PillProps {
  label: string;
  tone?: PillTone;
  /** A dot or small icon shown before the label. */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A small rounded tag: "VIP", "Mentor", "Live now", "Buy". */
export function Pill({ label, tone = "neutral", leading, style }: PillProps) {
  const theme = useTheme();

  const look = {
    neutral: { background: theme.chip.background, border: theme.chip.border, foreground: theme.text },
    primary: {
      background: theme.primary.background,
      border: theme.primary.background,
      foreground: theme.primary.foreground,
    },
    buy: theme.buy,
    sell: theme.sell,
  }[tone];

  return (
    <View
      style={[
        styles.pill,
        leading ? styles.withLeading : null,
        { backgroundColor: look.background, borderColor: look.border },
        style,
      ]}>
      {leading}
      <AppText size={12} line={16} weight="semibold" color={look.foreground}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 99,
    borderWidth: 1,
  },
  withLeading: { gap: 8, paddingLeft: 10 },
});
