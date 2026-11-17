import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { useTheme } from "@/theme/ThemeContext";

import type { SetupItem } from "./types";

/** A trade idea: the pair, Buy or Sell, a short note, then entry, stop and target. */
export function SetupCard({ item }: { item: SetupItem }) {
  const theme = useTheme();
  const buy = item.side === "buy";
  const tagColor = buy ? theme.buy.foreground : theme.sell.foreground;

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.top}>
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.44}>
          {item.pair}
        </AppText>
        <Pill
          tone={buy ? "buy" : "sell"}
          label={buy ? "Buy" : "Sell"}
          leading={<Icon name={buy ? "arrowUp" : "arrowDown"} size={12} strokeWidth={2.4} color={tagColor} />}
          style={styles.side}
        />
        <AppText size={12} line={16} color={theme.text3} style={styles.when}>
          {item.when}
        </AppText>
      </View>
      <AppText size={14} line={20} color={theme.text2} style={styles.note}>
        {item.note}
      </AppText>
      <Price label="Entry" value={item.entry} />
      <Price label="Stop" value={item.stop} />
      <Price label="Target" value={item.target} />
    </Card>
  );
}

function Price({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.price, { borderTopColor: theme.divider }]}>
      <AppText size={14} line={20} color={theme.text2}>
        {label}
      </AppText>
      <AppText size={16} line={22} weight="semibold" tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 20, paddingHorizontal: 22, paddingBottom: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 },
  side: { gap: 4, paddingVertical: 3, paddingLeft: 8, paddingRight: 10 },
  when: { marginLeft: "auto" },
  note: { paddingBottom: 12 },
  price: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
});
