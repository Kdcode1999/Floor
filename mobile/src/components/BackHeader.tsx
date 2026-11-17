import type { Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { useGoBack } from "@/lib/useGoBack";
import { useTheme } from "@/theme/ThemeContext";

interface BackHeaderProps {
  title: string;
  /** What the back button is called for screen readers, for example "Back to Manage". */
  backLabel: string;
  /** Where to go when there is no earlier screen to return to. */
  fallback: Href;
}

/** The top of a screen that was opened from another one: a round back button and a title. */
export function BackHeader({ title, backLabel, fallback }: BackHeaderProps) {
  const theme = useTheme();
  const goBack = useGoBack(fallback);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={goBack}
        hitSlop={4}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
          pressed && styles.pressed,
        ]}>
        <Icon name="chevronLeft" size={20} strokeWidth={2.2} color={theme.text} />
      </Pressable>
      <AppText
        accessibilityRole="header"
        size={17}
        line={22}
        weight="semibold"
        tracking={-0.17}
        numberOfLines={1}
        style={styles.title}>
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
  },
  title: { flex: 1 },
  pressed: { opacity: 0.6 },
});
