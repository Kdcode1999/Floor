import { Linking, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeContext";

import { useUpdate } from "./useUpdate";

/** At the top of the Feed when a newer Android app is out. */
export function UpdateCard() {
  const theme = useTheme();
  const { state, release } = useUpdate();
  if (state !== "available" || !release) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.words}>
        <AppText size={16} line={22} weight="semibold" tracking={-0.16}>
          A new version of Floor is ready
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          {release.notes ? `Version ${release.versionName}. ${release.notes}` : `Version ${release.versionName}.`} Download it and tap Install: you stay signed in.
        </AppText>
      </View>
      <Button label="Download the update" size="medium" onPress={() => Linking.openURL(release.url).catch(() => {})} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18 },
  words: { gap: 2 },
});
