import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { secureStore } from "@/lib/secureStorage";
import { useTheme } from "@/theme/ThemeContext";

import { isAppleMobile, isHomeScreenApp } from "./push.web";

/** Remembers that the person put it off, so the card does not come back every time. */
const LATER_KEY = "floor-install-later";

/**
 * At the top of the Feed on an iPhone in Safari: how to put Floor on the Home Screen. From
 * there it opens as an app of its own, full screen, and can send alerts. Safari has no button
 * that does it for them, so the card says where to tap.
 */
export function InstallCard() {
  const theme = useTheme();
  const [later, setLater] = useState<boolean | null>(null);
  const wanted = isAppleMobile() && !isHomeScreenApp();

  useEffect(() => {
    if (!wanted) return;
    secureStore.get(LATER_KEY).then(
      (kept) => setLater(kept === "yes"),
      () => setLater(false),
    );
  }, [wanted]);

  if (!wanted || later !== false) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: theme.iconTile.background }]}>
          <Icon name="bell" size={18} color={theme.iconTile.foreground} />
        </View>
        <View style={styles.words}>
          <AppText size={16} line={22} weight="semibold" tracking={-0.16}>
            Put Floor on your Home Screen
          </AppText>
          <AppText size={13} line={18} color={theme.text2}>
            Tap Share at the bottom of Safari, then Add to Home Screen. Open Floor from there: it runs full screen and can alert you the moment a setup is posted.
          </AppText>
        </View>
      </View>
      <Button
        label="Not now"
        kind="ghost"
        size="medium"
        onPress={() => {
          setLater(true);
          secureStore.set(LATER_KEY, "yes").catch(() => {});
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18 },
  top: { flexDirection: "row", gap: 12 },
  tile: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21 },
  words: { flex: 1, gap: 2 },
});
