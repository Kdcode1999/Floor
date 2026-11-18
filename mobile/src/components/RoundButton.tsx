import { Pressable, StyleSheet } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

interface RoundButtonProps {
  icon: IconName;
  /** What the button does, for screen readers. */
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Filled in the theme's main colour, for the one thing the screen is for. */
  primary?: boolean;
}

/** A round button with an icon: the same size and glass as the back button. */
export function RoundButton({ icon, label, onPress, disabled = false, primary = false }: RoundButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: theme.primary.background, borderColor: theme.primary.background }
          : { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={20} color={primary ? theme.primary.foreground : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
});
