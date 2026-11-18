import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Pill } from "@/components/Pill";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { cancelClass, endSession, goLive, loadSchedule } from "@/features/live/api";
import { ClassCard } from "@/features/live/ClassCard";
import { dayName, ended, lasted, liveFor, liveNow, missed, recordingLine, TITLE_MAX, upcoming } from "@/features/live/logic";
import type { LiveClass } from "@/features/live/types";
import { SampleNote } from "@/features/sample/SampleNote";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useNow } from "@/lib/useNow";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Live, for the mentor and admins: go live now, put classes on the schedule and start them,
 * and see what became of the sessions that are over.
 */
export default function ManageLiveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { space } = useSpace();
  const now = useNow();
  const schedule = useLoad(() => loadSchedule(database, space.id), `classes:${space.id}`);

  const { reload } = schedule;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const all = schedule.data ?? [];
  const live = liveNow(all);
  const classes = [...missed(all, now), ...upcoming(all, now)];
  const past = ended(all);
  const openRoom = (id: string) => router.push({ pathname: "/live", params: { id } });

  return (
    <Screen header={<BackHeader title="Live" backLabel="Back to Manage" fallback="/manage" />} gap={16} onRefresh={reload} refreshing={schedule.refreshing}>
      {schedule.loading ? (
        <Loading />
      ) : schedule.error ? (
        <Trouble detail={schedule.error} onRetry={reload} />
      ) : (
        <>
          {live ? <OnNow session={live} now={now} onOpen={() => openRoom(live.id)} onEnded={reload} /> : <GoLive spaceId={space.id} onLive={openRoom} />}
          <SampleNote text="nothing is broadcast here. A short film stands in for your camera and screen." />

          <View style={styles.section}>
            <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.heading}>
              Classes
            </AppText>
            {classes.length === 0 ? (
              <Card style={styles.none}>
                <AppText size={14} line={20} color={theme.text2}>
                  Nothing is scheduled. Put a class on the schedule and VIP members are reminded 15 minutes before it starts.
                </AppText>
              </Card>
            ) : (
              classes.map((item) => (
                <ScheduledClass key={item.id} spaceId={space.id} item={item} now={now} canStart={!live} onStarted={openRoom} onChanged={reload} />
              ))
            )}
            <Button label="Schedule a class" kind="ghost" onPress={() => router.push("/class-edit")} />
          </View>

          {past.length > 0 ? (
            <View style={styles.section}>
              <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.heading}>
                Recent sessions
              </AppText>
              {past.map((item) => (
                <Card key={item.id} style={styles.past}>
                  <AppText size={16} line={22} weight="semibold" tracking={-0.16} numberOfLines={2}>
                    {item.title}
                  </AppText>
                  <AppText size={13} line={18} color={theme.text2}>
                    {[dayName(item.startedAt ?? item.startsAt, now), lasted(item.startedAt, item.endedAt)].filter(Boolean).join(" · ")}
                  </AppText>
                  <AppText size={13} line={18} color={theme.text3}>
                    {recordingLine(item.recordingStatus, item.record)}
                  </AppText>
                  {item.lessonId ? (
                    <View style={styles.start}>
                      <TextLink label="Open the lesson" onPress={() => router.push({ pathname: "/lesson-edit", params: { id: item.lessonId ?? "" } })} />
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** The session that is on: open its room, or end it. */
function OnNow({ session, now, onOpen, onEnded }: { session: LiveClass; now: number; onOpen: () => void; onEnded: () => void }) {
  const theme = useTheme();
  const act = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card radius={28} style={styles.card}>
      <Pill label="Live now" leading={<View style={[styles.dot, { backgroundColor: theme.liveDot }]} />} style={styles.tag} />
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.5}>
          {session.title}
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          {liveFor(session.startedAt, now)}
        </AppText>
      </View>
      {confirming ? (
        <>
          <AppText size={14} line={20} color={theme.text2}>
            End the session for everyone?
          </AppText>
          <View style={styles.row}>
            <Button
              label="Yes, end it"
              size="medium"
              style={styles.grow}
              busy={act.busy === "end"}
              onPress={() => act.run("end", () => endSession(session.id), onEnded)}
            />
            <Button label="Keep it on" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(false)} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Button label="Open the room" size="medium" style={styles.grow} onPress={onOpen} />
          <Button label="End session" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(true)} />
        </View>
      )}
      <ErrorLine text={act.error} />
    </Card>
  );
}

/** Going live with nothing scheduled: a title, and whether to keep a recording. */
function GoLive({ spaceId, onLive }: { spaceId: string; onLive: (id: string) => void }) {
  const theme = useTheme();
  const act = useAction();
  const [title, setTitle] = useState("");
  const [record, setRecord] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const start = () => {
    if (title.trim() === "") return setProblem("Say what the session is about.");
    return act.run("live", async () => {
      const started = await goLive(database, spaceId, { title, record });
      if ("problem" in started) return started.problem;
      setTitle("");
      onLive(started.id);
      return null;
    });
  };

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Go live now
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          VIP members get an alert the moment you start.
        </AppText>
      </View>
      <TextField
        label="What it is about"
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setProblem(null);
        }}
        error={problem}
        placeholder="London open, live"
        maxLength={TITLE_MAX}
      />
      <Checkbox label="Keep a recording as a lesson" checked={record} onChange={setRecord} />
      <Button label="Go live" busy={act.busy === "live"} onPress={start} />
      <ErrorLine text={act.error} />
    </Card>
  );
}

interface ScheduledClassProps {
  spaceId: string;
  item: LiveClass;
  now: number;
  /** False while another session is on. */
  canStart: boolean;
  onStarted: (id: string) => void;
  onChanged: () => void;
}

/** A class on the schedule, with what the mentor can do with it: start it, change it, cancel it. */
function ScheduledClass({ spaceId, item, now, canStart, onStarted, onChanged }: ScheduledClassProps) {
  const theme = useTheme();
  const router = useRouter();
  const act = useAction();
  const [confirming, setConfirming] = useState(false);

  const start = () =>
    act.run("start", async () => {
      const started = await goLive(database, spaceId, { sessionId: item.id });
      if ("problem" in started) return started.problem;
      onStarted(started.id);
      return null;
    });

  return (
    <ClassCard item={item} now={now} detailed>
      {confirming ? (
        <>
          <AppText size={14} line={20} color={theme.text2}>
            Take this class off the schedule?
          </AppText>
          <View style={styles.row}>
            <Button
              label="Yes, cancel it"
              size="medium"
              style={styles.grow}
              busy={act.busy === "cancel"}
              onPress={() => act.run("cancel", () => cancelClass(database, item.id), onChanged)}
            />
            <Button label="Keep it" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(false)} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          {canStart ? <Button label="Start" size="medium" style={styles.grow} busy={act.busy === "start"} onPress={start} /> : null}
          <Button label="Edit" kind="ghost" size="medium" style={styles.grow} onPress={() => router.push({ pathname: "/class-edit", params: { id: item.id } })} />
          <Button label="Cancel" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(true)} />
        </View>
      )}
      <ErrorLine text={act.error} />
    </ClassCard>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { paddingHorizontal: 6 },
  card: { gap: 16, padding: 22 },
  words: { gap: 2 },
  tag: { alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  row: { flexDirection: "row", gap: 8 },
  grow: { flex: 1, paddingHorizontal: 8 },
  past: { gap: 2, paddingVertical: 14, paddingHorizontal: 18 },
  start: { alignItems: "flex-start", marginLeft: -12 },
});
