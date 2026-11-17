import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** "primary" is the one main action on a screen or card. "ghost" is the quieter choice. */
  kind?: "primary" | "ghost";
  /** "large" is 50 points high and lifts off the page. "medium" is 44 and sits flat. */
  size?: "large" | "medium";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  kind = "primary",
  size = "large",
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const primary = kind === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: size === "large" ? 50 : 44 },
        primary
          ? {
              backgroundColor: theme.primary.background,
              boxShadow: size === "large" && !disabled ? theme.primary.shadow : undefined,
            }
          : {
              backgroundColor: theme.ghost.background,
              borderWidth: 1,
              borderColor: theme.ghost.border,
            },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      <AppText
        size={15}
        line={20}
        weight={primary ? "semibold" : "medium"}
        color={primary ? theme.primary.foreground : theme.text}
        numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 99,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
