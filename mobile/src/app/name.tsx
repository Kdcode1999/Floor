import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { NAME_MAX, nameProblem } from "@/features/account/name";
import { UNNAMED } from "@/features/chat/logic";
import { useGoBack } from "@/lib/useGoBack";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** The name a person goes by: what others see beside their messages. */
export default function NameScreen() {
  const theme = useTheme();
  const goBack = useGoBack("/account");
  const { viewer, isStaff, rename } = useSpace();
  const [name, setName] = useState(viewer.name === UNNAMED ? "" : viewer.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    setBusy(true);
    const refused = await rename(name);
    setBusy(false);
    if (refused) setError(refused);
    else goBack();
  };

  return (
    <Screen hasNav={false} header={<BackHeader title="Your name" backLabel="Back" fallback="/account" />}>
      <Card radius={28} style={styles.card}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          error={error}
          placeholder="The name people know you by"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={NAME_MAX}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <View style={styles.words}>
          <AppText size={13} line={18} color={theme.text2}>
            This is what people see beside your messages in groups.
          </AppText>
          <AppText size={13} line={18} color={theme.text2}>
            {isStaff
              ? "Your badge shows next to it, so members can always tell it is really you."
              : "Only the mentor and admins carry a badge. Anyone without one is a member like you, whatever their name says."}
          </AppText>
        </View>
        <Button label="Save" busy={busy} onPress={save} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  words: { gap: 6 },
});
