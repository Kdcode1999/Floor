import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { deleteModule, loadOutline, reorderLessons, reorderModules, saveModule } from "@/features/learn/api";
import { lessonLine, moved } from "@/features/learn/logic";
import type { OutlineModule } from "@/features/learn/types";
import { SITE_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Where the mentor or an admin builds the course: modules, the lessons in each, and their order. */
export default function CourseScreen() {
  const theme = useTheme();
  const { space } = useSpace();
  const client = supabase;
  const course = useLoad(client ? () => loadOutline(client, space.id) : null, `course:${space.id}`);
  const { reload } = course;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const act = useAction();
  const [title, setTitle] = useState("");
  const modules = course.data ?? [];

  const addModule = () => {
    if (!client) return;
    if (title.trim() === "") return;
    void act.run("add", () => saveModule(client, space.id, title), () => {
      setTitle("");
      reload();
    });
  };

  const moveModule = (index: number, by: -1 | 1) => {
    if (!client) return;
    const order = moved(modules, index, by).map((module) => module.id);
    void act.run(`module:${modules[index].id}`, () => reorderModules(client, space.id, order), reload);
  };

  return (
    <Screen header={<BackHeader title="Course" backLabel="Back to Manage" fallback="/manage" />}>
      {!client || course.loading ? (
        <Loading />
      ) : course.error ? (
        <Trouble detail={course.error} onRetry={reload} />
      ) : (
        <>
          {modules.length === 0 ? (
            <AppText size={14} line={20} color={theme.text2} style={styles.aside}>
              A course is made of modules, and each module holds lessons. Start with a module, such as &quot;The basics&quot;.
            </AppText>
          ) : null}
          {modules.map((module, index) => (
            <ModuleEditor
              key={module.id}
              module={module}
              first={index === 0}
              last={index === modules.length - 1}
              busy={act.busy === `module:${module.id}`}
              onMove={(by) => moveModule(index, by)}
              onChanged={reload}
            />
          ))}

          <Card radius={28} style={styles.card}>
            <TextField
              label="New module"
              value={title}
              onChangeText={setTitle}
              placeholder="The basics"
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={addModule}
            />
            <Button label="Add module" kind="ghost" size="medium" disabled={title.trim() === ""} busy={act.busy === "add"} onPress={addModule} />
            <ErrorLine text={act.error} />
          </Card>

          {SITE_URL ? (
            <AppText size={13} line={18} color={theme.text3} style={styles.aside}>
              A long video uploads faster from a laptop. Open {SITE_URL}/mentor there and sign in with the same email.
            </AppText>
          ) : null}
        </>
      )}
    </Screen>
  );
}

interface ModuleEditorProps {
  module: OutlineModule;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (by: -1 | 1) => void;
  onChanged: () => void;
}

function ModuleEditor({ module, first, last, busy, onMove, onChanged }: ModuleEditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const { space } = useSpace();
  const act = useAction();
  /** Null until Rename is pressed. Then the new title being typed. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const client = supabase;
  if (!client) return null;

  const rename = () => {
    if (renaming === null || renaming.trim() === "") return;
    void act.run("rename", () => saveModule(client, space.id, renaming, module.id), () => {
      setRenaming(null);
      onChanged();
    });
  };

  const moveLesson = (index: number, by: -1 | 1) => {
    const order = moved(module.lessons, index, by).map((lesson) => lesson.id);
    void act.run(`lesson:${module.lessons[index].id}`, () => reorderLessons(client, module.id, order), onChanged);
  };

  return (
    <Card radius={28} style={styles.module}>
      {renaming === null ? (
        <View style={styles.head}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.grow}>
            {module.title}
          </AppText>
          <IconButton icon="arrowUp" label={`Move ${module.title} up`} disabled={first || busy} onPress={() => onMove(-1)} />
          <IconButton icon="arrowDown" label={`Move ${module.title} down`} disabled={last || busy} onPress={() => onMove(1)} />
        </View>
      ) : (
        <View style={styles.renaming}>
          <TextField label="Module title" value={renaming} onChangeText={setRenaming} maxLength={80} autoFocus returnKeyType="done" onSubmitEditing={rename} />
          <View style={styles.row}>
            <Button label="Save" size="medium" style={styles.grow} busy={act.busy === "rename"} onPress={rename} />
            <Button label="Cancel" kind="ghost" size="medium" style={styles.grow} onPress={() => setRenaming(null)} />
          </View>
        </View>
      )}

      {module.lessons.map((lesson, index) => (
        <View key={lesson.id} style={[styles.lesson, { borderTopColor: theme.divider }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${lesson.title}`}
            onPress={() => router.push({ pathname: "/manage/lesson", params: { id: lesson.id } })}
            style={({ pressed }) => [styles.grow, pressed && styles.pressed]}>
            <AppText size={15} line={20} weight="semibold" numberOfLines={2}>
              {lesson.title}
            </AppText>
            <AppText size={13} line={18} color={theme.text3}>
              {lessonLine(lesson, true) || "Published"}
            </AppText>
          </Pressable>
          <IconButton
            icon="arrowUp"
            label={`Move ${lesson.title} up`}
            disabled={index === 0 || act.busy !== null}
            onPress={() => moveLesson(index, -1)}
          />
          <IconButton
            icon="arrowDown"
            label={`Move ${lesson.title} down`}
            disabled={index === module.lessons.length - 1 || act.busy !== null}
            onPress={() => moveLesson(index, 1)}
          />
        </View>
      ))}

      <View style={[styles.foot, { borderTopColor: theme.divider }]}>
        <Button
          label="Add a lesson"
          kind="ghost"
          size="medium"
          onPress={() => router.push({ pathname: "/manage/lesson", params: { module: module.id } })}
        />
        {confirming ? (
          <View style={styles.confirm}>
            <AppText size={13} line={18} color={theme.text2}>
              {module.lessons.length === 0
                ? "Delete this module?"
                : `Delete this module and its ${module.lessons.length === 1 ? "lesson" : `${module.lessons.length} lessons`}? Their videos are deleted too. This cannot be undone.`}
            </AppText>
            <View style={styles.row}>
              <Button
                label="Yes, delete"
                size="medium"
                style={styles.grow}
                busy={act.busy === "delete"}
                onPress={() => act.run("delete", () => deleteModule(client, module.id), onChanged)}
              />
              <Button label="Keep it" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : renaming === null ? (
          <View style={styles.links}>
            <TextLink label="Rename module" onPress={() => setRenaming(module.title)} />
            <TextLink label="Delete module" onPress={() => setConfirming(true)} />
          </View>
        ) : null}
        <ErrorLine text={act.error} />
      </View>
    </Card>
  );
}

function IconButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} strokeWidth={2.2} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aside: { paddingHorizontal: 6 },
  card: { gap: 14, padding: 22 },
  module: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 14 },
  renaming: { gap: 12, paddingBottom: 14 },
  row: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  lesson: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 60, paddingVertical: 10, borderTopWidth: 1 },
  foot: { gap: 4, paddingTop: 14, borderTopWidth: 1 },
  confirm: { gap: 10, paddingTop: 8 },
  links: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: -12 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
