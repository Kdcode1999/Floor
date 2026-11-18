import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

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
  /** Shows a spinner in place of the label and ignores presses, while the action is under way. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  kind = "primary",
  size = "large",
  disabled = false,
  busy = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const primary = kind === "primary";
  const foreground = primary ? theme.primary.foreground : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
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
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <AppText size={15} line={20} weight={primary ? "semibold" : "medium"} color={foreground} numberOfLines={1}>
          {label}
        </AppText>
      )}
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
