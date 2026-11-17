import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { RichText } from "@/components/RichText";
import { useTheme } from "@/theme/ThemeContext";

import { targetLabel } from "./logic";
import { ManageButton } from "./ManageButton";
import type { FeedPost } from "./types";

interface SetupCardProps {
  post: FeedPost;
  /** When it was posted, in words: "12 min ago". */
  when: string;
  /** When the mentor last added their word on it. */
  updated?: string;
  /** Says who can see it. Shown to the mentor and admins only. */
  audience?: string;
  /** Opens the screen that manages the post. Staff only. */
  onManage?: () => void;
}

/** A trade idea: the pair, Buy or Sell, a short note, then entry, stop and targets. */
export function SetupCard({ post, when, updated, audience, onManage }: SetupCardProps) {
  const theme = useTheme();
  const buy = post.side === "buy";
  const tagColor = buy ? theme.buy.foreground : theme.sell.foreground;
  const targets = post.targets ?? [];

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.top}>
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.44}>
          {post.pair}
        </AppText>
        <Pill
          tone={buy ? "buy" : "sell"}
          label={buy ? "Buy" : "Sell"}
          leading={<Icon name={buy ? "arrowUp" : "arrowDown"} size={12} strokeWidth={2.4} color={tagColor} />}
          style={styles.side}
        />
        {post.closed ? <Pill label="Closed" style={styles.closed} /> : null}
        {/* Staff also see who it is for, which needs a line of its own. */}
        {audience ? (
          <View style={styles.spacer} />
        ) : (
          <AppText size={12} line={16} color={theme.text3} style={styles.when} numberOfLines={1}>
            {when}
          </AppText>
        )}
        {onManage ? <ManageButton onPress={onManage} /> : null}
      </View>
      {audience ? (
        <AppText size={12} line={16} color={theme.text3} style={styles.meta}>
          {audience} · {when}
        </AppText>
      ) : null}
      {post.body ? <RichText text={post.body} size={14} line={20} color={theme.text2} style={styles.note} /> : <View style={styles.noNote} />}
      <Price label="Entry" value={post.entry ?? ""} />
      <Price label="Stop" value={post.stop ?? ""} />
      {targets.map((target, index) => (
        <Price key={index} label={targetLabel(index, targets.length)} value={target} />
      ))}
      {post.updateNote ? (
        <View style={[styles.update, { backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
          <AppText size={12} line={16} weight="semibold" color={theme.text3}>
            {updated ? `Update · ${updated}` : "Update"}
          </AppText>
          <RichText text={post.updateNote} size={14} line={20} />
        </View>
      ) : null}
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
      <AppText size={16} line={22} weight="semibold" tabular selectable>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 20, paddingHorizontal: 22, paddingBottom: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 },
  side: { gap: 4, paddingVertical: 3, paddingLeft: 8, paddingRight: 10 },
  closed: { paddingVertical: 3, paddingHorizontal: 10 },
  when: { marginLeft: "auto", flexShrink: 1 },
  spacer: { flex: 1 },
  meta: { paddingBottom: 6 },
  note: { paddingBottom: 12 },
  noNote: { height: 6 },
  price: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  update: { gap: 2, marginTop: 4, marginBottom: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
});
