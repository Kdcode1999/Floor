import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Loading, Trouble } from "@/components/LoadState";
import { ProgressBar } from "@/components/ProgressBar";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { loadOutline } from "@/features/learn/api";
import { doneShare, doneText } from "@/features/learn/logic";
import { ModuleCard } from "@/features/learn/ModuleCard";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Learn: the mentor's course. Modules, their lessons, and how far the viewer has got. */
export default function LearnScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sample } = useAuth();
  const { space, viewer, isStaff } = useSpace();
  const client = sample ? null : supabase;

  const course = useLoad(client && space.id ? () => loadOutline(client, space.id) : null, `learn:${space.id}`);
  const { reload } = course;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const modules = course.data ?? [];
  const lessons = modules.flatMap((module) => module.lessons);
  const open = lessons.filter((lesson) => !lesson.locked);
  const empty = lessons.length === 0 && !(isStaff && modules.length > 0);

  return (
    <Screen header={<SpaceHeader />} onRefresh={client ? reload : undefined} refreshing={course.refreshing}>
      {isStaff && client ? (
        <Button label="Edit the course" kind="ghost" size="medium" onPress={() => router.push("/manage/learn")} />
      ) : null}

      {!client ? (
        <EmptyState
          icon="learn"
          title="No lessons yet"
          detail={isStaff ? "Lessons you add will show up here." : "Lessons from your mentor will show up here."}
        />
      ) : course.loading ? (
        <Loading />
      ) : course.error ? (
        <Trouble detail={course.error} onRetry={reload} />
      ) : empty ? (
        <EmptyState
          icon="learn"
          title="No lessons yet"
          detail={isStaff ? "Lessons you add will show up here." : "Lessons from your mentor will show up here."}
        />
      ) : (
        <>
          {!viewer.vip ? (
            <Card style={styles.note}>
              <AppText size={15} line={20} weight="semibold">
                Lessons are for VIP members
              </AppText>
              <AppText size={13} line={18} color={theme.text2}>
                This is what the course holds. Each lesson opens once you are VIP.
              </AppText>
            </Card>
          ) : open.length > 1 && !isStaff ? (
            <Card style={styles.note}>
              <View style={styles.progress}>
                <AppText size={15} line={20} weight="semibold">
                  Your progress
                </AppText>
                <AppText size={13} line={18} color={theme.text3}>
                  {doneText(open)}
                </AppText>
              </View>
              <ProgressBar share={doneShare(open)} label="Course progress" />
            </Card>
          ) : null}
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              staff={isStaff}
              onOpen={(lesson) => router.push({ pathname: "/lesson", params: { id: lesson.id } })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 8, paddingVertical: 16, paddingHorizontal: 20 },
  progress: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
});
