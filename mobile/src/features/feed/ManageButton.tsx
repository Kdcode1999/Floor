import { Pressable, StyleSheet } from "react-native";

import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

/** The three dots on a card that the mentor and admins see. Opens the screen that manages the post. */
export function ManageButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Manage this post"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name="more" size={20} color={theme.text3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.5 },
});
