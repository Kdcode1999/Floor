import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { SAMPLE_PEOPLE, sampleSession } from "@/sample/session";
import { useTheme } from "@/theme/ThemeContext";

/**
 * On the Account screen while the app runs on its sample space: says what the sample is, and
 * lets it be looked at as the mentor, as a VIP member or as someone who has not paid. Changing
 * that goes back to the Feed, as that person. Nothing is shown in a connected app.
 */
export function SampleCard() {
  const theme = useTheme();
  const auth = useAuth();
  if (!auth.sample) return null;
  const person = SAMPLE_PEOPLE.find((each) => each.id === auth.user?.id) ?? SAMPLE_PEOPLE[0];

  return (
    <Card radius={24} style={styles.card}>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          This is a sample space
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          The people, posts and payments in it are made up, and nothing you do here is kept: it all starts again
          when the app is closed. Look at it as:
        </AppText>
      </View>
      <Chips
        label="Who to look at the sample space as"
        options={SAMPLE_PEOPLE.map((each) => ({ value: each.persona, label: each.label }))}
        value={person.persona}
        onChange={sampleSession.become}
      />
      <AppText size={13} line={18} color={theme.text3}>
        {person.detail}.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 20 },
  words: { gap: 4 },
});
