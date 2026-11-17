import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  /** One sentence saying what will appear here. */
  detail: string;
}

/** Shown where a list has nothing in it yet. */
export function EmptyState({ icon, title, detail }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <Card radius={28} style={styles.card}>
      <View style={[styles.icon, { backgroundColor: theme.iconTile.background }]}>
        <Icon name={icon} size={22} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.center}>
          {title}
        </AppText>
        <AppText size={14} line={20} color={theme.text2} style={styles.center}>
          {detail}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 14, paddingVertical: 32, paddingHorizontal: 24 },
  icon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
  },
  words: { gap: 4 },
  center: { textAlign: "center" },
});
