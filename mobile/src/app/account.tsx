import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { UNNAMED } from "@/features/chat/logic";
import { SampleCard } from "@/features/sample/SampleCard";
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

/**
 * The person's own corner: who they are signed in as, their place in the space, and sign out.
 * On the sample space nobody is signed in, and this is where to choose whose eyes to look through.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { space, viewer, entries, switchSpace } = useSpace();
  const ownsSpace = entries.some((entry) => entry.role === "mentor");

  return (
    <Screen hasNav={false} header={<BackHeader title="Account" backLabel="Back" fallback="/" />}>
      <Card style={styles.card}>
        <Line label="Signed in as" value={auth.user?.email ?? ""} />
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <Line label={space.name} value={placeIn(viewer)} />
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <Line label="Your name in groups" value={viewer.name === UNNAMED ? "Not chosen yet" : viewer.name} />
      </Card>

      <SampleCard />

      <View style={styles.actions}>
        <Button label={viewer.name === UNNAMED ? "Choose your name" : "Change your name"} kind="ghost" onPress={() => router.push("/name")} />
        {viewer.role === "member" ? (
          <Button label={viewer.vip ? "Add more VIP time" : "Get VIP"} onPress={() => router.push("/vip")} />
        ) : null}
        <Button label="Alerts" kind="ghost" onPress={() => router.push("/alerts")} />
        {entries.length > 1 ? <Button label="Switch space" kind="ghost" onPress={switchSpace} /> : null}
        {ownsSpace ? null : (
          <Button label="Start your own space" kind="ghost" onPress={() => router.push("/create")} />
        )}
        {/* Nobody is signed in on the sample space, so there is nothing to sign out of. */}
        {auth.sample ? null : <Button label="Sign out" kind="ghost" onPress={auth.signOut} />}
        <View style={styles.quiet}>
          {/* Staff do not report their own space. Anyone can delete their account. */}
          {viewer.role === "member" ? <TextLink label="Blocked people" onPress={() => router.push("/blocked")} /> : null}
          {viewer.role === "member" ? <TextLink label="Report this space" onPress={() => router.push("/report")} /> : null}
          <TextLink label="Delete account" onPress={() => router.push("/delete-account")} />
        </View>
      </View>
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
  quiet: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", paddingTop: 4 },
});
