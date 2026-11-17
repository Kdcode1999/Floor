import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { useSpace, type Viewer } from "@/space/SpaceContext";

/** What the viewer is in this space, in one word. */
function badge(viewer: Viewer): string {
  if (viewer.role === "mentor") return "Mentor";
  if (viewer.role === "admin") return "Admin";
  return viewer.vip ? "VIP" : "Member";
}

/**
 * The top of every tab: the space's picture and name, and what the viewer is in this space.
 * That badge is also the way into the Account screen.
 */
export function SpaceHeader() {
  const router = useRouter();
  const { space, viewer } = useSpace();
  const label = badge(viewer);

  return (
    <View style={styles.header}>
      <Avatar name={space.name} size={40} />
      <AppText
        accessibilityRole="header"
        size={17}
        line={22}
        weight="semibold"
        tracking={-0.17}
        numberOfLines={1}
        style={styles.name}>
        {space.name}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Account. You are: ${label}`}
        hitSlop={10}
        onPress={() => router.push("/account")}
        style={({ pressed }) => pressed && styles.pressed}>
        <Pill tone={viewer.role === "member" ? "neutral" : "primary"} label={label} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  name: { flex: 1 },
  pressed: { opacity: 0.6 },
});
