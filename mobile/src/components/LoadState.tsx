import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeContext";

/** A spinner, for the moment a screen's content is on its way. */
export function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator accessibilityLabel="Loading" color={theme.text} />
    </View>
  );
}

interface TroubleProps {
  /** The server's own words, small, for whoever has to fix it. */
  detail?: string | null;
  onRetry: () => void;
}

/** Shown when a screen's content could not be loaded. */
export function Trouble({ detail, onRetry }: TroubleProps) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          This couldn&apos;t be loaded
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          Check your internet connection, then try again.
        </AppText>
        {detail ? (
          <AppText size={12} line={16} color={theme.text3}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <Button label="Try again" size="medium" onPress={onRetry} />
    </Card>
  );
}

/** One line of words under a form or a set of buttons, when something went wrong. */
export function ErrorLine({ text }: { text: string | null }) {
  const theme = useTheme();
  if (!text) return null;
  return (
    <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.error} style={styles.error}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 48, alignItems: "center" },
  card: { gap: 14, padding: 20 },
  words: { gap: 4 },
  error: { paddingHorizontal: 4 },
});
