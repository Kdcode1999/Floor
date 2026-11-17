import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { AppText, FONT_FAMILY } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

interface TextFieldProps extends Omit<TextInputProps, "style"> {
  /** The words above the field. Also read out by screen readers. */
  label: string;
  /** Shown under the field when something went wrong. */
  error?: string | null;
  /** A quiet line of help under the field. Gives way to the error. */
  hint?: string;
  /** Large, centred, widely spaced digits, for typing a code. */
  code?: boolean;
}

/** A labelled box to type in, in the theme's glass. */
export function TextField({ label, error, hint, code = false, ...input }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <AppText size={12} line={16} weight="medium" color={theme.text2} style={styles.label}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        keyboardAppearance={theme.dark ? "dark" : "light"}
        selectionColor={theme.accent}
        placeholderTextColor={theme.placeholder}
        {...input}
        style={[
          styles.input,
          code && styles.code,
          input.multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.input.background,
            borderColor: error ? theme.error : theme.input.border,
          },
        ]}
      />
      {error ? (
        <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.error} style={styles.label}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText size={13} line={18} color={theme.text3} style={styles.label}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { paddingHorizontal: 4 },
  input: {
    height: 52,
    paddingVertical: 0,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 16,
  },
  // A tall box for several lines, such as bank details.
  multiline: { height: undefined, minHeight: 112, paddingVertical: 14, textAlignVertical: "top" },
  code: {
    fontFamily: FONT_FAMILY.semibold,
    fontSize: 26,
    letterSpacing: 10,
    textAlign: "center",
  },
});
