import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { TextLink } from "@/components/TextLink";
import { useSpace, type Viewer } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Whose eyes the sample is being looked through, in a few words. */
function lookingAs(viewer: Viewer): string {
  if (viewer.role === "mentor") return "the mentor";
  if (viewer.role === "admin") return "an admin";
  return viewer.vip ? "a VIP member" : "a free member";
}

/**
 * At the top of the Feed while the app runs on its sample space: says that it does, whose eyes
 * it is being looked through, and where to change that. Nothing is shown in a connected app.
 */
export function SampleStrip() {
  const theme = useTheme();
  const router = useRouter();
  const { sample } = useAuth();
  const { viewer } = useSpace();
  if (!sample) return null;

  return (
    <Card radius={20} style={styles.card}>
      <View style={styles.words}>
        <AppText size={14} line={20} weight="semibold">
          This is a sample space
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          Nothing in it is real. You are looking at it as {lookingAs(viewer)}.
        </AppText>
      </View>
      <TextLink label="Change" onPress={() => router.push("/account")} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10, paddingLeft: 16, paddingRight: 6 },
  words: { flex: 1, gap: 1 },
});
