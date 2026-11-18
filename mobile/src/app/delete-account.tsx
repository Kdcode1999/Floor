import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { deleteMessage, nameMatches, whatGoes, type AccountSummary } from "@/features/account/logic";
import { callServer, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Deleting your own account, from inside the app. Open to anyone signed in, whether or not a
 * space is open: the hold screen links here too. Floor's server does the deleting, after the
 * database has said who is asking.
 */
export default function DeleteAccountScreen() {
  const client = supabase;
  const summary = useLoad(
    client
      ? async () => {
          const { data, error } = await client.rpc("account_summary");
          if (error) throw new Error(error.message);
          const found = ((data ?? []) as AccountSummary[])[0];
          if (!found) throw new Error("Your account could not be read.");
          return found;
        }
      : null,
    "account-summary",
  );

  return (
    <Screen hasNav={false} header={<BackHeader title="Delete account" backLabel="Back" fallback="/" />}>
      {!client || summary.loading ? (
        <Loading />
      ) : summary.error || !summary.data ? (
        <Trouble detail={summary.error} onRetry={summary.reload} />
      ) : (
        <DeleteForm summary={summary.data} />
      )}
    </Screen>
  );
}

function DeleteForm({ summary }: { summary: AccountSummary }) {
  const theme = useTheme();
  const auth = useAuth();
  const goBack = useGoBack("/");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownsSpace = summary.space_id !== null;

  const remove = async () => {
    if (ownsSpace && !nameMatches(typed, summary.space_name)) return setError(deleteMessage("name_needed"));
    setBusy(true);
    setError(null);
    try {
      await callServer("/api/account/delete", { spaceName: typed });
    } catch (failure) {
      setBusy(false);
      return setError(deleteMessage(failure instanceof ServerError ? failure.code : null));
    }
    // The account is gone. Signing out clears this phone and returns to the first screen.
    await auth.signOut();
  };

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.words}>
        <AppText size={13} line={18} color={theme.text3}>
          Signed in as
        </AppText>
        <AppText size={16} line={22} weight="semibold" numberOfLines={1}>
          {summary.email}
        </AppText>
      </View>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          This cannot be undone
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          Deleting your account deletes:
        </AppText>
      </View>
      <View style={styles.list}>
        {whatGoes(summary).map((line) => (
          <View key={line} style={styles.item}>
            <View style={[styles.bullet, { backgroundColor: theme.text3 }]} />
            <AppText size={14} line={20} style={styles.itemWords}>
              {line}
            </AppText>
          </View>
        ))}
      </View>
      <AppText size={13} line={18} color={theme.text3}>
        Money you paid a mentor stays with the mentor. Floor never held it, so Floor cannot return it: ask the mentor.
      </AppText>
      {ownsSpace ? (
        <TextField
          label={`Type "${summary.space_name}" to confirm`}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setError(null);
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : null}
      <View style={styles.actions}>
        <Button label="Delete my account for good" busy={busy} onPress={remove} />
        <Button label="Keep my account" kind="ghost" onPress={goBack} />
        <ErrorLine text={error} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  words: { gap: 2 },
  list: { gap: 8 },
  item: { flexDirection: "row", gap: 10 },
  bullet: { width: 6, height: 6, marginTop: 7, borderRadius: 3 },
  itemWords: { flex: 1 },
  actions: { gap: 10 },
});
