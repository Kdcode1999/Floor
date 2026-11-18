import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { DETAILS_MAX, REPORT_REASONS, reportMessage, reportProblem, type ReportReason } from "@/features/safety/logic";
import { database } from "@/lib/database";
import { useGoBack } from "@/lib/useGoBack";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * A member tells Floor that this space breaks the rules. The report goes to Floor, not to the
 * mentor, and the mentor is never told who sent it.
 */
export default function ReportScreen() {
  const theme = useTheme();
  const goBack = useGoBack("/account");
  const { space } = useSpace();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    const problem = reportProblem(reason, details);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error: failed } = await database.rpc("report_space", { p_space: space.id, p_reason: reason, p_details: details.trim() || null });
    setBusy(false);
    if (failed) return setError(reportMessage(failed));
    setSent(true);
  };

  if (sent) {
    return (
      <Screen hasNav={false} header={<BackHeader title="Report sent" backLabel="Back" fallback="/account" />}>
        <Card radius={28} style={styles.card}>
          <AppText accessibilityRole="header" size={20} line={26} weight="bold" tracking={-0.3}>
            Thank you
          </AppText>
          <AppText size={15} line={22} color={theme.text2}>
            Floor will look at {space.name}. You do not need to do anything else, and {space.name} is not told who
            reported it.
          </AppText>
          <Button label="Done" onPress={goBack} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen hasNav={false} header={<BackHeader title="Report this space" backLabel="Back" fallback="/account" />}>
      <Card radius={28} style={styles.card}>
        <View style={styles.words}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            What is wrong with {space.name}?
          </AppText>
          <AppText size={13} line={18} color={theme.text2}>
            This goes to Floor, not to the mentor. They are never told who reported them.
          </AppText>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="What is wrong">
          {REPORT_REASONS.map((each, index) => {
            const on = reason === each.value;
            return (
              <Pressable
                key={each.value}
                accessibilityRole="radio"
                accessibilityLabel={each.label}
                aria-checked={on}
                onPress={() => {
                  setReason(each.value);
                  setError(null);
                }}
                style={({ pressed }) => [styles.reason, index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }, pressed && styles.pressed]}>
                <View style={[styles.dot, { borderColor: on ? theme.primary.background : theme.text3 }]}>
                  {on ? <View style={[styles.dotOn, { backgroundColor: theme.primary.background }]} /> : null}
                </View>
                <View style={styles.reasonWords}>
                  <AppText size={15} line={20} weight="semibold">
                    {each.label}
                  </AppText>
                  <AppText size={13} line={18} color={theme.text3}>
                    {each.detail}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <TextField
          label="What happened"
          value={details}
          onChangeText={(text) => {
            setDetails(text);
            setError(null);
          }}
          hint="Optional, but it helps: what was said or done, and when."
          multiline
          maxLength={DETAILS_MAX}
        />
        <Button label="Send report" busy={busy} onPress={send} />
        <ErrorLine text={error} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  words: { gap: 2 },
  reason: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 10 },
  reasonWords: { flex: 1, gap: 1 },
  dot: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 2 },
  dotOn: { width: 10, height: 10, borderRadius: 5 },
  pressed: { opacity: 0.6 },
});
