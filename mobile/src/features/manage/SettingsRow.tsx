import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

interface SettingsRowProps {
  title: string;
  /** One short line saying what is behind the row. */
  detail: string;
  /** Draws a divider above the row. Use it on every row except the first in a card. */
  divided?: boolean;
  onPress?: () => void;
}

/** A row in a list of places to go: a title, one line of detail and a chevron. */
export function SettingsRow({ title, detail, divided = false, onPress }: SettingsRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divided && { borderTopWidth: 1, borderTopColor: theme.divider },
        pressed && styles.pressed,
      ]}>
      <View style={styles.words}>
        <AppText size={15} line={20} weight="semibold">
          {title}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          {detail}
        </AppText>
      </View>
      <Icon name="chevronRight" size={18} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  words: { flex: 1 },
  pressed: { opacity: 0.6 },
});
