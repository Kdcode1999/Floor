import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme/ThemeContext";

interface ProgressBarProps {
  /** How much is done, from 0 to 1. */
  share: number;
  /** What the bar measures, for screen readers: "Course progress". */
  label: string;
}

/** A thin bar that fills from the left in the theme's accent. */
export function ProgressBar({ share, label }: ProgressBarProps) {
  const theme = useTheme();
  const id = useId();
  const filled = Math.min(Math.max(share, 0), 1);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled * 100) }}
      style={[styles.track, { backgroundColor: theme.track }]}>
      <View style={[styles.fill, { width: `${filled * 100}%` }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.accentFill[0]} />
              <Stop offset="1" stopColor={theme.accentFill[1]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, overflow: "hidden" },
});
