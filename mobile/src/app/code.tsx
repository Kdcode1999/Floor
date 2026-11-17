import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { cleanCode, CODE_LENGTH } from "@/auth/messages";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { useTheme } from "@/theme/ThemeContext";

/** Supabase sends at most one code a minute to an address. */
const RESEND_WAIT_SECONDS = 60;

/** Sign-in, step two: the code from the email. */
export default function CodeScreen() {
  const theme = useTheme();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { sendCode, verifyCode } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS);

  // Count down to when a new code may be asked for.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // This screen only makes sense with an email to check the code against.
  if (!email) return <Redirect href="/sign-in" />;

  const submit = async (value: string) => {
    if (value.length < CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const problem = await verifyCode(email, value);
    setBusy(false);
    if (problem) {
      setError(problem);
      setCode("");
    }
    // When the code is right the app moves on by itself: see the root layout.
  };

  const typed = (text: string) => {
    const next = cleanCode(text);
    setCode(next);
    setError(null);
    // No need to press the button once the last digit is in.
    if (next.length === CODE_LENGTH) void submit(next);
  };

  const resend = async () => {
    setError(null);
    setNote(null);
    setWait(RESEND_WAIT_SECONDS);
    const problem = await sendCode(email);
    if (problem) setError(problem);
    else setNote("A new code is on its way.");
  };

  return (
    <Screen
      hasNav={false}
      gap={12}
      header={<BackHeader title="Enter your code" backLabel="Back to email" fallback="/sign-in" />}>
      <Card radius={28} style={styles.card}>
        <AppText size={15} line={22} color={theme.text2}>
          We sent a {CODE_LENGTH}-digit code to{" "}
          <AppText size={15} line={22} weight="semibold">
            {email}
          </AppText>
          .
        </AppText>
        <TextField
          code
          label="Code"
          value={code}
          onChangeText={typed}
          error={error}
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          returnKeyType="done"
          onSubmitEditing={() => submit(code)}
        />
        <Button label="Sign in" busy={busy} disabled={code.length < CODE_LENGTH} onPress={() => submit(code)} />
      </Card>

      <View style={styles.after}>
        <TextLink
          label={wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          disabled={wait > 0 || busy}
          onPress={resend}
        />
        {note ? (
          <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.text2}>
            {note}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  after: { alignItems: "center" },
});
