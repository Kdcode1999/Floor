import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

import type { LessonItem, PostItem } from "./types";

/** A written post from the mentor, shown by its title. */
export function PostCard({ item }: { item: PostItem }) {
  const theme = useTheme();
  return (
    <Card style={styles.post}>
      <Title>{item.title}</Title>
      <AppText size={13} line={18} color={theme.text3}>
        Post · {item.when}
      </AppText>
    </Card>
  );
}

/** A note in the Feed that a new lesson is in Learn. */
export function LessonCard({ item }: { item: LessonItem }) {
  const theme = useTheme();
  return (
    <Card style={styles.lesson}>
      <View style={[styles.play, { backgroundColor: theme.iconTile.background }]}>
        <Icon name="play" size={16} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <Title>{item.title}</Title>
        <AppText size={13} line={18} color={theme.text3}>
          New lesson · {item.when}
        </AppText>
      </View>
    </Card>
  );
}

function Title({ children }: { children: string }) {
  return (
    <AppText accessibilityRole="header" size={16} line={22} weight="semibold" tracking={-0.16}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  post: { gap: 2, paddingVertical: 16, paddingHorizontal: 22 },
  lesson: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 22,
  },
  play: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  words: { flex: 1, gap: 2 },
});
