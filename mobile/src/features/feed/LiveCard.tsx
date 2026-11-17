import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { useTheme } from "@/theme/ThemeContext";

import type { LiveItem } from "./types";

/** The large card at the top of the Feed while the mentor is live. */
export function LiveCard({ item, onJoin }: { item: LiveItem; onJoin?: () => void }) {
  const theme = useTheme();

  return (
    <Card radius={28} style={styles.card}>
      <Pill
        label="Live now"
        leading={<View style={[styles.dot, { backgroundColor: theme.liveDot }]} />}
        style={styles.tag}
      />
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={30} line={36} weight="bold" tracking={-0.9}>
          {item.title}
        </AppText>
        <AppText size={15} line={22} color={theme.text2}>
          {item.note}
        </AppText>
      </View>
      <Button label="Join session" onPress={onJoin} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18, padding: 22 },
  tag: { alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  words: { gap: 6 },
});
