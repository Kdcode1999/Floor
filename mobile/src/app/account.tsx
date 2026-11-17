import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { useSpace, type Viewer } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** "12 Dec 2026", in the phone's own language. */
function day(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The person's place in the space, in a few words. */
function placeIn(viewer: Viewer): string {
  if (viewer.role === "mentor") return "Mentor";
  if (viewer.role === "admin") return "Admin";
  if (viewer.vip && viewer.vipUntil) return `VIP until ${day(viewer.vipUntil)}`;
  return "Free member";
}

/** The person's own corner: who they are signed in as, their place in the space, and sign out. */
export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { space, viewer, entries, switchSpace } = useSpace();
  const ownsSpace = entries.some((entry) => entry.role === "mentor");

  return (
    <Screen hasNav={false} header={<BackHeader title="Account" backLabel="Back" fallback="/" />}>
      <Card style={styles.card}>
        <Line label="Signed in as" value={auth.sample ? "Nobody yet" : (auth.user?.email ?? "")} />
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <Line label={space.name} value={placeIn(viewer)} />
      </Card>

      {auth.sample ? (
        <AppText size={13} line={18} color={theme.text3} style={styles.note}>
          This is a sample space. Sign-in starts once the app is connected to Supabase.
        </AppText>
      ) : (
        <View style={styles.actions}>
          {entries.length > 1 ? <Button label="Switch space" kind="ghost" onPress={switchSpace} /> : null}
          {ownsSpace ? null : (
            <Button label="Start your own space" kind="ghost" onPress={() => router.push("/create")} />
          )}
          <Button label="Sign out" kind="ghost" onPress={auth.signOut} />
        </View>
      )}
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <AppText size={13} line={18} color={theme.text3} numberOfLines={1}>
        {label}
      </AppText>
      <AppText size={16} line={22} weight="semibold" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 6, paddingHorizontal: 20 },
  line: { gap: 2, paddingVertical: 12 },
  divider: { height: 1 },
  actions: { gap: 10, paddingTop: 4 },
  note: { paddingHorizontal: 10 },
});
