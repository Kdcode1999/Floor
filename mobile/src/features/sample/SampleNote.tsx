import { StyleSheet } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

/**
 * A line that only shows while the app runs on its sample space, where the sample cannot do
 * what the real thing does, or does it differently. It says so, in place.
 */
export function SampleNote({ text }: { text: string }) {
  const theme = useTheme();
  const { sample } = useAuth();
  if (!sample) return null;

  return (
    <AppText size={13} line={18} color={theme.text3} style={styles.note}>
      Sample space: {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: 6 },
});
