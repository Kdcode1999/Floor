import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { createCode, loadCodes, revokeCode, type CodeItem } from "@/features/manage/api";
import { codeStanding, DAY_CHOICES } from "@/features/manage/logic";
import { database } from "@/lib/database";
import { days } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Invite codes: a mentor or admin makes a code, hands it to someone, and that person gets VIP at once. */
export default function CodesScreen() {
  const theme = useTheme();
  const { space } = useSpace();
  const codes = useLoad(() => loadCodes(database, space.id), `codes:${space.id}`);
  const [length, setLength] = useState(30);
  const [uses, setUses] = useState("");
  const [usesProblem, setUsesProblem] = useState<string | null>(null);
  const making = useAction();
  const [now] = useState(() => Date.now());

  const make = () => {
    const limit = uses.trim() === "" ? null : Number(uses);
    if (limit !== null && (!/^\d{1,6}$/.test(uses.trim()) || limit < 1)) {
      setUsesProblem("Type a number, or leave it empty for no limit.");
      return;
    }
    void making.run("make", () => createCode(database, space.id, length, limit), () => {
      setUses("");
      codes.reload();
    });
  };

  return (
    <Screen header={<BackHeader title="Invite codes" backLabel="Back to Manage" fallback="/manage" />}>
      <Card radius={28} style={styles.card}>
        <View style={styles.words}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            New code
          </AppText>
          <AppText size={13} line={18} color={theme.text2}>
            Whoever types it on your join page gets VIP at once, with no approval.
          </AppText>
        </View>
        <Chips
          label="How much VIP the code gives"
          options={DAY_CHOICES.map((value) => ({ value, label: days(value) }))}
          value={length}
          onChange={setLength}
        />
        <TextField
          label="How many people can use it"
          value={uses}
          onChangeText={(text) => {
            setUses(text);
            setUsesProblem(null);
          }}
          error={usesProblem}
          hint="Leave empty for no limit."
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button label="Make a code" busy={making.busy === "make"} onPress={make} />
        <ErrorLine text={making.error} />
      </Card>

      {codes.loading ? (
        <Loading />
      ) : codes.error ? (
        <Trouble detail={codes.error} onRetry={codes.reload} />
      ) : (
        codes.data?.map((code) => <CodeCard key={code.id} code={code} now={now} onChanged={codes.reload} />)
      )}
    </Screen>
  );
}

function CodeCard({ code, now, onChanged }: { code: CodeItem; now: number; onChanged: () => void }) {
  const theme = useTheme();
  const act = useAction();
  const [copied, setCopied] = useState(false);
  const { live, label } = codeStanding(code, now);

  return (
    <Card style={[styles.code, !live && styles.spent]}>
      <View style={styles.words}>
        <AppText size={24} line={30} weight="bold" tracking={3} selectable accessibilityLabel={`Code ${code.code.split("").join(" ")}`}>
          {code.code}
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          {label}
        </AppText>
      </View>
      {live ? (
        <View style={styles.actions}>
          <Button
            label={copied ? "Copied" : "Copy"}
            kind="ghost"
            size="medium"
            style={styles.action}
            onPress={async () => {
              await Clipboard.setStringAsync(code.code);
              setCopied(true);
            }}
          />
          <Button label="Share" kind="ghost" size="medium" style={styles.action} onPress={() => Share.share({ message: code.code })} />
          <Button
            label="Switch off"
            kind="ghost"
            size="medium"
            style={styles.action}
            busy={act.busy === "off"}
            onPress={() => act.run("off", () => revokeCode(database, code.id), onChanged)}
          />
        </View>
      ) : null}
      <ErrorLine text={act.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  words: { gap: 2 },
  code: { gap: 12, padding: 18 },
  spent: { opacity: 0.6 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, paddingHorizontal: 8 },
});
