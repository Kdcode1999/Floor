import { Pressable, StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

interface TextLinkProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}

/** A quiet action written as words: "Send a new code", "Use a different email". */
export function TextLink({ label, onPress, disabled = false }: TextLinkProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <AppText size={14} line={20} weight="semibold" color={disabled ? theme.text3 : theme.accent}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  pressed: { opacity: 0.6 },
});
