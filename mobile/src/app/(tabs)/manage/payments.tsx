import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { loadCardTrouble, loadPayments } from "@/features/manage/api";
import { cardProblem, mentorPage, paymentLine } from "@/features/manage/logic";
import { SITE_URL } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Card payments: who paid by card and what it gave them. These members got VIP by themselves,
 * so this list is how the mentor and admins see that it happened.
 */
export default function PaymentsScreen() {
  const theme = useTheme();
  const { space, isMentor } = useSpace();
  const client = supabase;
  const payments = useLoad(client ? () => loadPayments(client, space.id) : null, `payments:${space.id}`);
  const trouble = useLoad(client && isMentor ? () => loadCardTrouble(client, space.id) : null, `card-trouble:${space.id}`);
  const [now] = useState(() => Date.now());
  const problem = trouble.data ? cardProblem(trouble.data.problem, trouble.data.provider, SITE_URL) : null;

  return (
    <Screen
      header={<BackHeader title="Card payments" backLabel="Back to Manage" fallback="/manage" />}
      onRefresh={() => {
        payments.reload();
        trouble.reload();
      }}
      refreshing={payments.refreshing}>
      {problem ? (
        <Card radius={28} style={styles.none}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} color={theme.error}>
            {problem.title}
          </AppText>
          <AppText size={14} line={20} color={theme.text2} selectable>
            {problem.detail}
          </AppText>
        </Card>
      ) : null}
      {!client || payments.loading ? (
        <Loading />
      ) : payments.error ? (
        <Trouble detail={payments.error} onRetry={payments.reload} />
      ) : payments.data && payments.data.length > 0 ? (
        <Card style={styles.list}>
          {payments.data.map((payment, index) => (
            <View key={payment.id} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
              <View style={styles.top}>
                <AppText size={15} line={20} weight="semibold" numberOfLines={1} style={styles.name}>
                  {payment.name}
                </AppText>
                <AppText size={15} line={20} weight="semibold" tabular>
                  {formatPrice(payment.amount_cents, payment.currency)}
                </AppText>
              </View>
              <AppText size={13} line={18} color={theme.text3}>
                {paymentLine(payment, now)}
              </AppText>
            </View>
          ))}
        </Card>
      ) : (
        <Card radius={28} style={styles.none}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            No card payments yet
          </AppText>
          <AppText size={14} line={20} color={theme.text2} selectable>
            {isMentor
              ? `When a member pays by card on your join page, they get VIP at once and the payment shows here. Card payments are connected at ${mentorPage(SITE_URL)}, in a browser.`
              : "When a member pays by card on the join page, they get VIP at once and the payment shows here."}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 2, paddingHorizontal: 18 },
  row: { gap: 2, paddingVertical: 12 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { flex: 1 },
  none: { gap: 8, padding: 22 },
});
