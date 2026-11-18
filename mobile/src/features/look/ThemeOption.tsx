import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { GlowField } from "@/components/GlowField";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";
import type { Theme } from "@/theme/themes";

const SWATCH = 60;

interface ThemeOptionProps {
  /** The theme this row offers. */
  option: Theme;
  selected: boolean;
  onSelect: () => void;
}

/** One theme a mentor can pick: a small picture of it, its name, and a mark when it is chosen. */
export function ThemeOption({ option, selected, onSelect }: ThemeOptionProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${option.label}. ${option.description}`}
      aria-checked={selected}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.card.background,
          borderColor: theme.card.border,
          boxShadow: theme.card.shadow,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.swatch, { backgroundColor: option.background }]}>
        <GlowField theme={option} width={SWATCH} height={SWATCH} swatch />
        <View
          style={[styles.bar, { backgroundColor: option.chip.background, borderColor: option.chip.border }]}
        />
      </View>
      <View style={styles.words}>
        <AppText size={16} line={22} weight="semibold">
          {option.label}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          {option.description}
        </AppText>
      </View>
      {selected ? (
        <View style={[styles.radio, { backgroundColor: theme.primary.background }]}>
          <Icon name="check" size={14} strokeWidth={3} color={theme.primary.foreground} />
        </View>
      ) : (
        <View style={[styles.radio, styles.radioOff, { borderColor: theme.text3 }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.4)",
  },
  bar: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 16,
    borderRadius: 7,
    borderWidth: 1,
  },
  words: { flex: 1, gap: 2 },
  radio: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  radioOff: { borderWidth: 2 },
  pressed: { opacity: 0.8 },
});
