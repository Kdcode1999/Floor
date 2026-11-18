import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

import { classWhen, startsIn } from "./logic";
import type { LiveClass } from "./types";

interface ClassCardProps {
  item: LiveClass;
  now: number;
  /** A small line above the title, such as "Next class" on the Feed. */
  label?: string;
  /** Shows what the class is about under its time, where there is room for it. */
  detailed?: boolean;
  /** Makes the whole card a button. */
  onPress?: () => void;
  /** Buttons for the mentor and admins, under the words. */
  children?: ReactNode;
}

/**
 * A class that is coming: its title and when it is, in the phone's own time. Someone without
 * VIP sees that much and that it is for VIP members.
 */
export function ClassCard({ item, now, label, detailed = false, onPress, children }: ClassCardProps) {
  const theme = useTheme();
  const when = classWhen(item.startsAt, now);
  const soon = startsIn(item.startsAt, now);

  const top = (
    <View style={styles.top}>
      <View style={[styles.tile, { backgroundColor: theme.iconTile.background }]}>
        <Icon name={item.locked ? "lock" : "calendar"} size={18} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        {label ? (
          <AppText size={12} line={16} weight="semibold" color={theme.accent}>
            {label}
          </AppText>
        ) : null}
        <AppText size={16} line={22} weight="semibold" tracking={-0.16} numberOfLines={2}>
          {item.title}
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          {when}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          {item.locked ? `For VIP members · ${soon}` : soon}
        </AppText>
        {detailed && item.about ? (
          <AppText size={14} line={20} color={theme.text2} style={styles.about}>
            {item.about}
          </AppText>
        ) : null}
      </View>
      {onPress ? <Icon name="chevronRight" size={18} color={theme.text3} /> : null}
    </View>
  );

  return (
    <Card style={styles.card}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label ? `${label}. ` : ""}${item.title}. ${when}. ${soon}`}
          onPress={onPress}
          style={({ pressed }) => pressed && styles.pressed}>
          {top}
        </Pressable>
      ) : (
        top
      )}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 14, paddingLeft: 14, paddingRight: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  tile: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, alignSelf: "flex-start" },
  words: { flex: 1, gap: 1 },
  about: { paddingTop: 6 },
  pressed: { opacity: 0.7 },
});
