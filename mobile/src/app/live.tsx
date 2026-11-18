import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GlowField } from "@/components/GlowField";
import { Icon } from "@/components/Icon";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Watermark } from "@/components/Watermark";
import { loadMute } from "@/features/chat/api";
import { Conversation } from "@/features/chat/Conversation";
import { cannotWrite } from "@/features/chat/logic";
import { endSession, goLive, heartbeat, loadSchedule, openRoom } from "@/features/live/api";
import { classWhen, liveFor, recordingLine, startsIn } from "@/features/live/logic";
import { SampleStage } from "@/features/live/SampleStage";
import type { LiveClass, RoomPass } from "@/features/live/types";
import { SampleNote } from "@/features/sample/SampleNote";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useNow } from "@/lib/useNow";
import { useSpace } from "@/space/SpaceContext";
import { CONTENT_MAX_WIDTH } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeContext";

/** How often an open room asks whether the session is still on. */
const LOOK_AGAIN_MS = 20_000;
/** How often the broadcaster's app says it is still there. */
const BEAT_MS = 30_000;

/**
 * The live room: the mentor's video with the session's chat under it. It opens for VIP members
 * and for staff while the session is on. Before that it waits, and after it says it is over.
 * Opened with the session's `id`.
 */
export default function LiveScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const display = useWindowDimensions();
  const goBack = useGoBack("/");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { space, isStaff } = useSpace();
  const now = useNow(15_000);
  const [size, setSize] = useState({ width: display.width, height: display.height });

  // The schedule says where the session stands: coming, on, or over. It is asked again every
  // few seconds. One answer lost to a bad connection does not end the room: the last one stands.
  const lastKnown = useRef<LiveClass[] | null>(null);
  const schedule = useLoad(
    space.id
      ? () =>
          loadSchedule(database, space.id).then(
            (list) => (lastKnown.current = list),
            (error: Error) => {
              if (lastKnown.current) return lastKnown.current;
              throw error;
            },
          )
      : null,
    `live-room:${space.id}`,
  );
  const session = schedule.data?.find((each) => each.id === id) ?? null;
  const open = session?.state === "live" && !session.locked;
  // The way in, asked for once the session is on. It is kept after the session ends, so the
  // chat can still be read.
  const pass = useLoad(open && id ? () => openRoom(id) : null, `room:${id}`);

  const reload = schedule.reload;
  useFocusEffect(
    useCallback(() => {
      reload();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") reload();
      }, LOOK_AGAIN_MS);
      return () => clearInterval(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <BackHeader
      title={session?.title ?? pass.data?.title ?? "Live"}
      detail={session?.state === "live" ? liveFor(session.startedAt, now) : undefined}
      backLabel="Back"
      fallback="/"
    />
  );

  let body;
  if (pass.data && id) {
    body = <Room sessionId={id} pass={pass.data} session={session} onChanged={reload} />;
  } else if (schedule.loading) body = <Loading />;
  else if (schedule.error) body = <Padded><Trouble detail={schedule.error} onRetry={reload} /></Padded>;
  else if (!session || session.state === "ended") {
    body = (
      <Note
        title="This session is over"
        detail={session && isStaff ? recordingLine(session.recordingStatus, session.record) : "When the next one starts you will find it at the top of the Feed."}
        action={<Button label="Back" kind="ghost" onPress={goBack} />}
      />
    );
  } else if (session.state === "scheduled") body = <Waiting session={session} now={now} onStarted={reload} />;
  else if (session.locked) {
    body = <Note icon="lock" title="This session is for VIP members" detail="It opens here once you have VIP." action={<Button label="Back" kind="ghost" onPress={goBack} />} />;
  } else if (pass.error) body = <Padded><Trouble detail={pass.error} onRetry={pass.reload} /></Padded>;
  else body = <Loading />;

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.background }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}>
      <GlowField theme={theme} width={size.width} height={size.height} />
      {/* Lifts the box to type in clear of the keyboard, as a group's conversation does. */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={-insets.bottom} style={[styles.column, { paddingTop: insets.top }]}>
        {header}
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

interface RoomProps {
  sessionId: string;
  pass: RoomPass;
  /** The session as the schedule has it now. Null once it is no longer listed. */
  session: LiveClass | null;
  /** Asks the schedule again, after something this screen did changed it. */
  onChanged: () => void;
}

/** The room itself: the video, what staff can do, and the chat. */
function Room({ sessionId, pass, session, onChanged }: RoomProps) {
  const theme = useTheme();
  const auth = useAuth();
  const { space, viewer, isStaff } = useSpace();
  const act = useAction();
  const [now] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  /** Set when the broadcast was taken over from another phone or laptop. */
  const [takenOver, setTakenOver] = useState(false);

  const over = session?.state !== "live";
  const userId = auth.user?.id ?? null;
  const mute = useLoad(userId && !isStaff ? () => loadMute(database, space.id, userId) : null, `mute:${space.id}:${userId}`);

  // The broadcaster's app says it is still there, and learns if the session was ended or
  // taken over from somewhere else.
  const hosting = pass.isHost && !over && !takenOver;
  useEffect(() => {
    if (!hosting) return;
    const beat = async () => {
      const standing = await heartbeat(database, sessionId);
      if (standing === "taken_over") setTakenOver(true);
      else if (standing === "ended") onChanged();
    };
    const timer = setInterval(beat, BEAT_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosting, sessionId]);

  // The viewer's name over the video, when the mentor has that switched on.
  const mark = space.watermark && !isStaff ? [viewer.name, auth.user?.email].filter(Boolean).join(" · ") : null;
  const closed = over && !isStaff;
  const reloadMute = mute.reload;

  return (
    <>
      <View style={styles.top}>
        <View style={[styles.frame, { borderColor: theme.tile.border }]}>
          {over ? (
            <View style={styles.centered}>
              <AppText size={16} line={22} weight="semibold" color="#FFFFFF">
                This session has ended
              </AppText>
              {isStaff && session ? (
                <AppText size={13} line={18} color="rgba(255,255,255,0.7)" style={styles.center}>
                  {recordingLine(session.recordingStatus, session.record)}
                </AppText>
              ) : null}
            </View>
          ) : pass.sampleFilm ? (
            <SampleStage uri={pass.sampleFilm} />
          ) : (
            <View style={styles.centered}>
              <AppText size={14} line={20} color="rgba(255,255,255,0.7)" style={styles.center}>
                Live video is not switched on in this copy of Floor yet.
              </AppText>
            </View>
          )}
          {mark && !over ? <Watermark text={mark} /> : null}
        </View>
        {over ? null : <SampleNote text="a short film stands in for the mentor's camera and screen." />}
        {takenOver ? (
          <AppText size={13} line={18} color={theme.text2} style={styles.line}>
            This session is now being broadcast from another phone or laptop.
          </AppText>
        ) : null}
        {isStaff && !over ? (
          confirming ? (
            <View style={styles.ask}>
              <AppText size={14} line={20} color={theme.text2} style={styles.line}>
                End the session for everyone?
              </AppText>
              <View style={styles.row}>
                <Button
                  label="Yes, end it"
                  size="medium"
                  style={styles.grow}
                  busy={act.busy === "end"}
                  onPress={() =>
                    act.run("end", () => endSession(sessionId), () => {
                      setConfirming(false);
                      onChanged();
                    })
                  }
                />
                <Button label="Keep it on" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(false)} />
              </View>
            </View>
          ) : (
            <Button label="End session" kind="ghost" size="medium" onPress={() => setConfirming(true)} />
          )
        ) : null}
        <ErrorLine text={act.error} />
      </View>
      <Conversation
        groupId={pass.groupId}
        startLabel="The start of this session's chat"
        canPost={!closed}
        cannotWrite={closed ? "The session has ended, so its chat is closed." : cannotWrite({ posting: "all", canPost: isStaff || !(mute.data && Date.parse(mute.data) > now) }, isStaff, mute.data ?? null, now)}
        onRefused={() => {
          onChanged();
          reloadMute();
        }}
      />
    </>
  );
}

/** A class that has not started: when it is, and for staff the button that starts it. */
function Waiting({ session, now, onStarted }: { session: LiveClass; now: number; onStarted: () => void }) {
  const theme = useTheme();
  const { space, isStaff } = useSpace();
  const act = useAction();

  const start = () =>
    act.run("start", async () => {
      const started = await goLive(database, space.id, { sessionId: session.id });
      return "problem" in started ? started.problem : null;
    }, onStarted);

  return (
    <Padded>
      <Card radius={28} style={styles.waiting}>
        <View style={styles.words}>
          <AppText size={12} line={16} weight="semibold" color={theme.accent}>
            Not started yet
          </AppText>
          <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.5}>
            {session.title}
          </AppText>
          <AppText size={14} line={20} color={theme.text2}>
            {classWhen(session.startsAt, now)} · {startsIn(session.startsAt, now)}
          </AppText>
        </View>
        {session.about ? (
          <AppText size={14} line={20} color={theme.text2}>
            {session.about}
          </AppText>
        ) : null}
        {isStaff ? (
          <>
            <Button label="Start now" busy={act.busy === "start"} onPress={start} />
            <ErrorLine text={act.error} />
          </>
        ) : (
          <AppText size={13} line={18} color={theme.text3}>
            {session.locked ? "This class is for VIP members." : "The room opens here when your mentor starts. You will get an alert."}
          </AppText>
        )}
      </Card>
    </Padded>
  );
}

function Padded({ children }: { children: React.ReactNode }) {
  return <View style={styles.padded}>{children}</View>;
}

function Note({ icon, title, detail, action }: { icon?: "lock"; title: string; detail: string; action?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Padded>
      <Card style={styles.note}>
        <View style={styles.noteTop}>
          {icon ? <Icon name={icon} size={18} color={theme.text2} /> : null}
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17} style={styles.grow}>
            {title}
          </AppText>
        </View>
        <AppText size={14} line={20} color={theme.text2}>
          {detail}
        </AppText>
        {action}
      </Card>
    </Padded>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  top: { gap: 8, paddingTop: 4, paddingHorizontal: 12 },
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 20, borderWidth: 1, overflow: "hidden", backgroundColor: "#000000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 20 },
  center: { textAlign: "center" },
  line: { paddingHorizontal: 6 },
  ask: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  padded: { paddingTop: 8, paddingHorizontal: 16 },
  waiting: { gap: 16, padding: 22 },
  words: { gap: 4 },
  note: { gap: 12, padding: 20 },
  noteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
});
