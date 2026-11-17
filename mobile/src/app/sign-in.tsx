import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { CODE_LENGTH, looksLikeEmail } from "@/auth/messages";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeContext";

/** Sign-in, step one: the person's email. Floor emails them a code. There are no passwords. */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sendCode } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setError("That email address doesn't look right.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await sendCode(address);
    setBusy(false);
    if (problem) setError(problem);
    else router.push({ pathname: "/code", params: { email: address } });
  };

  return (
    <Screen hasNav={false} gap={18}>
      <View style={styles.top}>
        <AppText accessibilityRole="header" size={34} line={40} weight="bold" tracking={-1}>
          Floor
        </AppText>
        <AppText size={15} line={22} color={theme.text2}>
          Sign in to your space.
        </AppText>
      </View>

      <Card radius={28} style={styles.card}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          error={error}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        <Button label="Send code" busy={busy} onPress={submit} />
      </Card>

      <AppText size={13} line={18} color={theme.text3} style={styles.note}>
        {`We'll email you a ${CODE_LENGTH}-digit code. New here? The same code creates your account.`}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 4, paddingTop: 44, paddingHorizontal: 6 },
  card: { gap: 16, padding: 22 },
  note: { paddingHorizontal: 10, textAlign: "center" },
});
