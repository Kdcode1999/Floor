import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { secureStore } from "@/lib/secureStorage";
import { supabase } from "@/lib/supabase";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

import type { AlertState } from "./logic";
import { alertState, shareAddress, turnOnAlerts } from "./push";

/** Remembers that the person said "Not now", so the card does not come back every day. */
const LATER_KEY = "floor-alerts-later";

/**
 * At the top of the Feed for someone who has not been asked yet: an offer to turn alerts on.
 * The phone's own question only comes after they press the button, so they know what it is for.
 * Once alerts are on, this quietly keeps Floor's copy of the phone's address fresh.
 */
export function AlertsCard() {
  const theme = useTheme();
  const { space } = useSpace();
  const [state, setState] = useState<AlertState | null>(null);
  const [later, setLater] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    alertState().then((found) => {
      setState(found);
      if (found === "on" && supabase) void shareAddress(supabase);
    });
    secureStore.get(LATER_KEY).then(
      (kept) => setLater(kept === "yes"),
      () => setLater(false),
    );
  }, []);

  if (state !== "not_asked" || later !== false || !supabase) return null;
  const client = supabase;

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.bell, { backgroundColor: theme.iconTile.background }]}>
          <Icon name="bell" size={18} color={theme.iconTile.foreground} />
        </View>
        <View style={styles.words}>
          <AppText size={16} line={22} weight="semibold" tracking={-0.16}>
            Don&apos;t miss a setup
          </AppText>
          <AppText size={13} line={18} color={theme.text2}>
            Get an alert the moment {space.name} posts a setup, adds a lesson or goes live.
          </AppText>
        </View>
      </View>
      <View style={styles.row}>
        <Button
          label="Turn on alerts"
          size="medium"
          style={styles.grow}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            setState(await turnOnAlerts(client));
            setBusy(false);
          }}
        />
        <Button
          label="Not now"
          kind="ghost"
          size="medium"
          style={styles.grow}
          onPress={() => {
            setLater(true);
            secureStore.set(LATER_KEY, "yes").catch(() => {});
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  bell: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21 },
  words: { flex: 1, gap: 2 },
  row: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
});
