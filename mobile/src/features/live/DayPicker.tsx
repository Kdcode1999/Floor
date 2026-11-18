import { Pressable, ScrollView, StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

interface DayPickerProps {
  /** The days on offer, each with the name it is shown by. */
  days: { value: string; label: string }[];
  value: string;
  onChange: (day: string) => void;
}

/** The day a class is on: the next four weeks in one row that slides sideways. */
export function DayPicker({ days, value, onChange }: DayPickerProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      accessibilityRole="radiogroup"
      accessibilityLabel="Day"
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {days.map((day) => {
        const on = day.value === value;
        return (
          <Pressable
            key={day.value}
            accessibilityRole="radio"
            accessibilityLabel={day.label}
            aria-checked={on}
            onPress={() => onChange(day.value)}
            style={({ pressed }) => [
              styles.chip,
              on
                ? { backgroundColor: theme.primary.background, borderColor: theme.primary.background }
                : { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
              pressed && styles.pressed,
            ]}>
            <AppText size={13} line={18} weight="semibold" color={on ? theme.primary.foreground : theme.text}>
              {day.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 8 },
  chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  pressed: { opacity: 0.7 },
});
