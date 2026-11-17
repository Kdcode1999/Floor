import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { MENTOR_TERMS_VERSION } from "@/features/create/rules";
import { MENTOR_TERMS } from "@/features/create/terms";
import { useTheme } from "@/theme/ThemeContext";

/** The Mentor Terms in full, for a mentor to read before agreeing. */
export default function MentorTermsScreen() {
  const theme = useTheme();

  return (
    <Screen hasNav={false} header={<BackHeader title="Mentor Terms" backLabel="Back" fallback="/create" />}>
      <AppText size={14} line={20} color={theme.text2} style={styles.intro}>
        What every mentor agrees to when they open a space on Floor.
      </AppText>
      <Card radius={28} style={styles.card}>
        {MENTOR_TERMS.map((term, index) => (
          <View
            key={term.title}
            style={[styles.term, index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
            <AppText accessibilityRole="header" size={16} line={22} weight="semibold">
              {index + 1}. {term.title}
            </AppText>
            <AppText size={14} line={20} color={theme.text2}>
              {term.text}
            </AppText>
          </View>
        ))}
      </Card>
      <AppText size={12} line={16} color={theme.text3} style={styles.intro}>
        Version {MENTOR_TERMS_VERSION}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 8 },
  card: { paddingVertical: 6, paddingHorizontal: 22 },
  term: { gap: 4, paddingVertical: 14 },
});
