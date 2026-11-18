import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/** A box to tick, with its words beside it. The whole row can be pressed. */
export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={checked}
      onPress={() => onChange(!checked)}
      hitSlop={6}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {checked ? (
        <View style={[styles.box, { backgroundColor: theme.primary.background }]}>
          <Icon name="check" size={14} strokeWidth={3} color={theme.primary.foreground} />
        </View>
      ) : (
        <View style={[styles.box, styles.off, { borderColor: theme.text3 }]} />
      )}
      <AppText size={15} line={22} weight="medium" style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  box: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  off: { borderWidth: 2 },
  label: { flex: 1 },
  pressed: { opacity: 0.6 },
});
