import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlowField } from "@/components/GlowField";
import { CONTENT_MAX_WIDTH, NAV_HEIGHT, navBottomOffset, SCREEN_PADDING } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeContext";

interface ScreenProps {
  /** Stays fixed above the scrolling content. */
  header?: ReactNode;
  children: ReactNode;
  /** Leaves room at the bottom so content can scroll clear of the floating navigation. */
  hasNav?: boolean;
  /** Space between the stacked blocks, in points. */
  gap?: number;
}

/** One screen of the app: the theme's lights, a fixed header, and content that scrolls. */
export function Screen({ header, children, hasNav = true, gap = 14 }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const display = useWindowDimensions();
  // Start from the display size so the lights are there on the first frame, then follow the
  // screen's real size once it has been laid out.
  const [size, setSize] = useState({ width: display.width, height: display.height });

  const bottomSpace = hasNav ? NAV_HEIGHT + navBottomOffset(insets.bottom) + 20 : insets.bottom + 24;

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.background }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}>
      <GlowField theme={theme} width={size.width} height={size.height} />
      <View style={[styles.column, { paddingTop: insets.top }]}>
        {header}
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.content, { gap, paddingBottom: bottomSpace }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  content: { paddingTop: 8, paddingHorizontal: SCREEN_PADDING },
});
