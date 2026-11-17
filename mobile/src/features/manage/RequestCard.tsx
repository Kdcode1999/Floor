import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/LoadState";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { days } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";

import type { RequestItem } from "./api";

const KIND_LABEL: Record<RequestItem["kind"], string> = {
  payment: "Payment proof",
  broker: "Broker account",
};

interface RequestCardProps {
  request: RequestItem;
  /** When it was sent, in words: "2 hours ago". */
  sent?: string;
  /** Each resolves with a message to show if it failed, or null. */
  onApprove: () => Promise<string | null>;
  onDecline: (reason: string) => Promise<string | null>;
  /** Opens the proof the member sent. Left out for sample requests. */
  onProof?: () => void;
}

/** One request for VIP in the mentor's queue: who, what they sent, and Approve or Decline. */
export function RequestCard({ request, sent, onApprove, onDecline, onProof }: RequestCardProps) {
  const theme = useTheme();
  /** Null until Decline is pressed. Then the reason being typed. */
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (which: "approve" | "decline", action: () => Promise<string | null>) => {
    setBusy(which);
    setError(null);
    const problem = await action();
    // When it worked the card is taken out of the list, so there is nothing left to update.
    if (problem) {
      setBusy(null);
      setError(problem);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.words}>
        <View style={styles.top}>
          <AppText size={15} line={20} weight="semibold" numberOfLines={1} style={styles.name}>
            {request.name}
          </AppText>
          <AppText size={12} line={16} weight="semibold" color={theme.accent}>
            {KIND_LABEL[request.kind]}
          </AppText>
        </View>
        {request.note ? (
          <AppText size={13} line={18} color={theme.text2}>
            {request.note}
          </AppText>
        ) : null}
        <AppText size={12} line={16} color={theme.text3}>
          {sent ? `${sent} · ` : ""}Approving gives {days(request.days)} of VIP
        </AppText>
      </View>

      {onProof ? (
        <View style={styles.proof}>
          <TextLink label="See what they sent" onPress={onProof} />
        </View>
      ) : null}

      {reason === null ? (
        <View style={styles.actions}>
          <Button label="Approve" size="medium" busy={busy === "approve"} onPress={() => act("approve", onApprove)} style={styles.action} />
          <Button label="Decline" kind="ghost" size="medium" disabled={busy !== null} onPress={() => setReason("")} style={styles.action} />
        </View>
      ) : (
        <View style={styles.declining}>
          <TextField
            label="Why? The member sees this"
            value={reason}
            onChangeText={setReason}
            placeholder="The screenshot is cut off"
            maxLength={200}
            autoFocus
          />
          <View style={styles.actions}>
            <Button label="Decline" size="medium" busy={busy === "decline"} onPress={() => act("decline", () => onDecline(reason))} style={styles.action} />
            <Button label="Back" kind="ghost" size="medium" disabled={busy !== null} onPress={() => setReason(null)} style={styles.action} />
          </View>
        </View>
      )}
      <ErrorLine text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  words: { gap: 2, paddingHorizontal: 4 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flexShrink: 1 },
  proof: { alignItems: "flex-start", marginVertical: -8, marginLeft: -8 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
  declining: { gap: 12 },
});
