import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { loadSchedule } from "@/features/live/api";
import { ClassCard } from "@/features/live/ClassCard";
import { LiveCard } from "@/features/live/LiveCard";
import { liveNow, upcoming } from "@/features/live/logic";
import { database } from "@/lib/database";
import { useLoad } from "@/lib/useLoad";
import { useNow } from "@/lib/useNow";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** The schedule: the session that is live, then the classes to come, in the phone's own time. */
export default function ClassesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { space, isStaff } = useSpace();
  const now = useNow();
  const schedule = useLoad(space.id ? () => loadSchedule(database, space.id) : null, `classes:${space.id}`);

  const { reload } = schedule;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const live = liveNow(schedule.data ?? []);
  const coming = upcoming(schedule.data ?? [], now);

  return (
    <Screen
      hasNav={false}
      header={<BackHeader title="Classes" backLabel="Back" fallback="/" />}
      onRefresh={reload}
      refreshing={schedule.refreshing}>
      {schedule.loading ? (
        <Loading />
      ) : schedule.error ? (
        <Trouble detail={schedule.error} onRetry={reload} />
      ) : (
        <>
          {live ? (
            <LiveCard
              session={live}
              now={now}
              action={isStaff ? "Open the room" : "Join session"}
              onJoin={() => router.push({ pathname: "/live", params: { id: live.id } })}
          onGetVip={() => router.push("/vip")}
            />
          ) : null}
          {coming.length === 0 ? (
            live ? null : (
              <EmptyState
                icon="calendar"
                title="No classes scheduled"
                detail={isStaff ? "Schedule one and your VIP members are reminded before it starts." : "When your mentor schedules a class it will show here."}
              />
            )
          ) : (
            <View style={styles.list}>
              <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.heading}>
                Coming up
              </AppText>
              {coming.map((item) => (
                <ClassCard key={item.id} item={item} now={now} detailed />
              ))}
              <AppText size={13} line={18} color={theme.text3} style={styles.heading}>
                Times are in your phone&apos;s own time.
              </AppText>
            </View>
          )}
          {isStaff ? (
            <View style={styles.center}>
              <TextLink label="Manage classes" onPress={() => router.push("/manage/live", { withAnchor: true })} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  heading: { paddingHorizontal: 6 },
  center: { alignItems: "center" },
});
