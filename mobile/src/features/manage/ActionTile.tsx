import { Pressable, StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

interface ActionTileProps {
  icon: IconName;
  label: string;
  /** The one tile that stands out. On Mentor home that is "Go live". */
  primary?: boolean;
  onPress?: () => void;
}

/** A square shortcut at the top of Mentor home: New post, Go live, Add lesson. */
export function ActionTile({ icon, label, primary = false, onPress }: ActionTileProps) {
  const theme = useTheme();
  const color = primary ? theme.primary.foreground : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        primary
          ? { backgroundColor: theme.primary.background, boxShadow: theme.primary.shadow }
          : {
              backgroundColor: theme.card.background,
              borderWidth: 1,
              borderColor: theme.card.border,
              boxShadow: theme.card.shadow,
            },
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={22} color={color} />
      <AppText size={14} line={18} weight="semibold" color={color} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
  },
  pressed: { opacity: 0.8 },
});
