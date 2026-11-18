import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { stateLine, type AlertState } from "@/features/alerts/logic";
import { alertState, turnOnAlerts } from "@/features/alerts/push";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useAuth } from "@/auth/AuthContext";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

interface Switches {
  setups: boolean;
  live: boolean;
  lessons: boolean;
}

/** Alerts: whether this phone shows them, and which ones the person wants from this space. */
export default function AlertsScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const { space } = useSpace();
  const client = supabase;
  const userId = auth.user?.id;

  const [state, setState] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    alertState().then(setState);
  }, []);

  const loaded = useLoad(
    client && userId && space.id
      ? async (): Promise<Switches> => {
          const { data, error } = await client
            .from("memberships")
            .select("alert_setups, alert_live, alert_lessons")
            .eq("space_id", space.id)
            .eq("user_id", userId)
            .limit(1);
          if (error) throw new Error(error.message);
          const row = (data ?? [])[0] as { alert_setups: boolean; alert_live: boolean; alert_lessons: boolean } | undefined;
          return { setups: row?.alert_setups ?? true, live: row?.alert_live ?? true, lessons: row?.alert_lessons ?? true };
        }
      : null,
    `alerts:${space.id}:${userId}`,
  );
  /** What the person has changed on this visit, on top of what was loaded. */
  const [changed, setChanged] = useState<Partial<Switches>>({});
  const [error, setError] = useState<string | null>(null);
  const switches = loaded.data ? { ...loaded.data, ...changed } : null;

  const set = async (which: keyof Switches, on: boolean) => {
    if (!client) return;
    setError(null);
    setChanged((current) => ({ ...current, [which]: on }));
    const { error: failed } = await client.rpc("set_alerts", {
      p_space: space.id,
      p_setups: which === "setups" ? on : null,
      p_live: which === "live" ? on : null,
      p_lessons: which === "lessons" ? on : null,
    });
    if (failed) {
      setChanged((current) => ({ ...current, [which]: !on }));
      setError("That didn't save. Check your connection and try again.");
    }
  };

  return (
    <Screen hasNav={false} header={<BackHeader title="Alerts" backLabel="Back" fallback="/account" />}>
      <Card radius={28} style={styles.card}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          This phone
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          {state ? stateLine(state) : "Checking…"}
        </AppText>
        {state === "not_asked" && client ? (
          <Button
            label="Turn on alerts"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              setState(await turnOnAlerts(client));
              setBusy(false);
            }}
          />
        ) : state === "refused" ? (
          <Button label="Open phone settings" kind="ghost" onPress={() => Linking.openSettings().catch(() => {})} />
        ) : null}
      </Card>

      {!client || loaded.loading ? (
        <Loading />
      ) : loaded.error || !switches ? (
        <Trouble detail={loaded.error} onRetry={loaded.reload} />
      ) : (
        <Card radius={28} style={styles.card}>
          <View style={styles.words}>
            <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
              From {space.name}
            </AppText>
            <AppText size={13} line={18} color={theme.text2}>
              Choose what you want to hear about. You are only alerted about what you can open.
            </AppText>
          </View>
          <Checkbox label="New trade setups" checked={switches.setups} onChange={(on) => set("setups", on)} />
          <Checkbox label="Live sessions and new classes" checked={switches.live} onChange={(on) => set("live", on)} />
          <Checkbox label="New lessons" checked={switches.lessons} onChange={(on) => set("lessons", on)} />
          <ErrorLine text={error} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 22 },
  words: { gap: 4 },
});
