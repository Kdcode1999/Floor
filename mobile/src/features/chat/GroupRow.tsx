import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

import { audienceTag, groupLine, lastWhen, unreadBadge } from "./logic";
import type { Group } from "./types";

interface GroupRowProps {
  group: Group;
  /** The moment the list was drawn, for "14:05" or "Yesterday". */
  now: number;
  /** Draws a divider above the row. Use it on every row except the first in a card. */
  divided?: boolean;
  onPress?: () => void;
}

/** A group in the list: its name, the newest message, when that was and how many are unread. */
export function GroupRow({ group, now, divided = false, onPress }: GroupRowProps) {
  const theme = useTheme();
  const tag = audienceTag(group.audience);
  const unread = group.canOpen ? unreadBadge(group.unread) : null;
  const line = groupLine(group);
  const when = group.canOpen && group.lastAt ? lastWhen(group.lastAt, now) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}. ${line}${unread ? `. ${unread} unread` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divided && { borderTopWidth: 1, borderTopColor: theme.divider }, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: theme.iconTile.background }]}>
        <Icon name={group.canOpen ? "chat" : "lock"} size={20} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <View style={styles.top}>
          <AppText size={16} line={22} weight="semibold" tracking={-0.16} numberOfLines={1} style={styles.name}>
            {group.name}
          </AppText>
          {tag ? (
            <View style={[styles.tag, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }]}>
              <AppText size={11} line={14} weight="semibold">
                {tag}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText size={13} line={18} color={unread ? theme.text : theme.text3} weight={unread ? "medium" : "regular"} numberOfLines={1}>
          {line}
        </AppText>
      </View>
      <View style={styles.side}>
        {when ? (
          <AppText size={12} line={16} color={theme.text3} tabular>
            {when}
          </AppText>
        ) : null}
        {unread ? (
          <View style={[styles.unread, { backgroundColor: theme.primary.background }]}>
            <AppText size={12} line={16} weight="semibold" color={theme.primary.foreground} tabular>
              {unread}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingVertical: 10 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  words: { flex: 1, gap: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1 },
  tag: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 9, borderWidth: 1 },
  side: { alignItems: "flex-end", gap: 4 },
  unread: { minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderRadius: 11 },
  pressed: { opacity: 0.6 },
});
