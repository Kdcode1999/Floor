import { Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeContext";

import type { Release } from "./logic";

/** Instead of the app, when this build may no longer be used: what to do about it. */
export function RequiredUpdate({ release }: { release: Release }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Card radius={28} style={styles.card}>
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.5}>
          Update Floor to keep going
        </AppText>
        <AppText size={15} line={22} color={theme.text2}>
          This version of the app no longer works. Download version {release.versionName}, tap Install, and open Floor again. You stay signed in, and nothing is lost.
        </AppText>
        <Button label="Download the update" onPress={() => Linking.openURL(release.url).catch(() => {})} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  card: { gap: 16, padding: 24 },
});
