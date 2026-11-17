import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

interface ChipsProps<T extends string | number> {
  /** What the choice is about, for screen readers. */
  label: string;
  options: { value: T; label: string }[];
  /** The chosen value. Null when none of the options is chosen. */
  value: T | null;
  onChange: (value: T) => void;
}

/** A row of one-tap choices where one can be picked: 7 days, 30 days, 90 days. */
export function Chips<T extends string | number>({ label, options, value, onChange }: ChipsProps<T>) {
  const theme = useTheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: on, checked: on }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              on
                ? { backgroundColor: theme.primary.background, borderColor: theme.primary.background }
                : { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
              pressed && styles.pressed,
            ]}>
            <AppText size={13} line={18} weight="semibold" color={on ? theme.primary.foreground : theme.text}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
});
