import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeContext";

import type { AccessRequest } from "./sample";

const KIND_LABEL: Record<AccessRequest["kind"], string> = {
  payment: "Payment proof",
  broker: "Broker account",
};

interface RequestCardProps {
  request: AccessRequest;
  onApprove: () => void;
  onDecline: () => void;
}

/** One request for VIP in the mentor's queue, with Approve and Decline. */
export function RequestCard({ request, onApprove, onDecline }: RequestCardProps) {
  const theme = useTheme();

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
        <AppText size={13} line={18} color={theme.text2}>
          {request.detail}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button label="Approve" size="medium" onPress={onApprove} style={styles.action} />
        <Button label="Decline" kind="ghost" size="medium" onPress={onDecline} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  words: { gap: 2, paddingHorizontal: 4 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flexShrink: 1 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
});
