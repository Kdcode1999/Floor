import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { useSpace } from "@/space/SpaceContext";

/** The top of every tab: the space's picture and name, and what the viewer is in this space. */
export function SpaceHeader() {
  const { space, viewer } = useSpace();

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
      {viewer.role === "mentor" ? <Pill tone="primary" label="Mentor" /> : null}
      {viewer.role === "admin" ? <Pill tone="primary" label="Admin" /> : null}
      {viewer.role === "member" && viewer.vip ? <Pill label="VIP" /> : null}
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
});
