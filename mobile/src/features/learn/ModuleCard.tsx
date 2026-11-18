import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { ProgressBar } from "@/components/ProgressBar";
import { useTheme } from "@/theme/ThemeContext";

import { doneShare, doneText, lessonLine } from "./logic";
import type { OutlineLesson, OutlineModule } from "./types";

interface ModuleCardProps {
  module: OutlineModule;
  /** Staff see drafts and how each video is doing. */
  staff: boolean;
  onOpen: (lesson: OutlineLesson) => void;
}

/** One module of the course: its title, how far the viewer is through it, and its lessons. */
export function ModuleCard({ module, staff, onOpen }: ModuleCardProps) {
  const theme = useTheme();
  const open = module.lessons.filter((lesson) => !lesson.locked);

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.title}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.name}>
            {module.title}
          </AppText>
          {open.length > 0 ? (
            <AppText size={12} line={16} color={theme.text3}>
              {doneText(open)}
            </AppText>
          ) : null}
        </View>
        {open.length > 0 ? <ProgressBar share={doneShare(open)} label={`${module.title} progress`} /> : null}
      </View>

      {module.lessons.length === 0 ? (
        <AppText size={14} line={20} color={theme.text2} style={styles.none}>
          No lessons in this module yet.
        </AppText>
      ) : (
        module.lessons.map((lesson) => (
          <Pressable
            key={lesson.id}
            accessibilityRole="button"
            accessibilityLabel={lesson.locked ? `${lesson.title}. For VIP members` : `${lesson.title}. ${lessonLine(lesson, staff)}`}
            disabled={lesson.locked}
            onPress={() => onOpen(lesson)}
            style={({ pressed }) => [styles.row, { borderTopColor: theme.divider }, pressed && styles.pressed]}>
            <View style={[styles.badge, { backgroundColor: theme.iconTile.background }]}>
              <Icon
                name={lesson.locked ? "lock" : lesson.completed ? "check" : "play"}
                size={lesson.locked ? 16 : 14}
                strokeWidth={2.4}
                color={theme.iconTile.foreground}
              />
            </View>
            <View style={styles.words}>
              <AppText size={15} line={20} weight="semibold" numberOfLines={2}>
                {lesson.title}
              </AppText>
              <AppText size={13} line={18} color={theme.text3}>
                {lesson.locked ? ["For VIP members", lessonLine(lesson, false)].filter(Boolean).join(" · ") : lessonLine(lesson, staff)}
              </AppText>
            </View>
            {lesson.locked ? null : <Icon name="chevronRight" size={18} color={theme.text} />}
          </Pressable>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 6 },
  head: { gap: 10, paddingBottom: 14 },
  title: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  name: { flex: 1 },
  none: { paddingBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, borderTopWidth: 1 },
  badge: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  words: { flex: 1, gap: 1 },
  pressed: { opacity: 0.6 },
});
