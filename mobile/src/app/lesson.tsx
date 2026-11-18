import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { Loading, Trouble } from "@/components/LoadState";
import { RichText } from "@/components/RichText";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { loadLesson, loadOutline, requestPlayback, saveProgress, serverMessage } from "@/features/learn/api";
import { LessonPlayer } from "@/features/learn/LessonPlayer";
import { lengthText, nextLesson, resumeAt, VIDEO_WORDS } from "@/features/learn/logic";
import { secureStore } from "@/lib/secureStorage";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Whether this phone plays lessons in a small size to use less data. Remembered between visits. */
const SAVER_KEY = "floor-data-saver";

/** One lesson: its video, the mentor's notes, and the way to the next one. */
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Going on to the next lesson keeps this screen open, so everything in it starts afresh.
  return <LessonView key={id} id={id} />;
}

function LessonView({ id }: { id?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { space, viewer, isStaff } = useSpace();
  const client = supabase;

  const lesson = useLoad(client && id ? () => loadLesson(client, id) : null, `lesson:${id}`);
  const course = useLoad(client && space.id ? () => loadOutline(client, space.id) : null, `learn:${space.id}`);
  const hasVideo = lesson.data?.videoStatus === "ready";
  const video = useLoad(
    hasVideo && id ? () => requestPlayback(id).catch((error) => Promise.reject(new Error(serverMessage(error)))) : null,
    `play:${id}`,
  );

  const [saver, setSaver] = useState<boolean | null>(null);
  /** Where the video has got to on this visit. */
  const reached = useRef<number | null>(null);
  /** Set when a new player has to carry on from where the last one had got to. */
  const [startAt, setStartAt] = useState<number | null>(null);
  useEffect(() => {
    secureStore.get(SAVER_KEY).then(
      (kept) => setSaver(kept === "on"),
      () => setSaver(false),
    );
  }, []);
  const chooseSaver = (on: boolean) => {
    // The new player carries on from where this one has got to.
    if (reached.current !== null) setStartAt(reached.current);
    setSaver(on);
    (on ? secureStore.set(SAVER_KEY, "on") : secureStore.remove(SAVER_KEY)).catch(() => {});
  };

  const [markedDone, setMarkedDone] = useState(false);

  const found = lesson.data;
  const mine = course.data?.flatMap((module) => module.lessons).find((each) => each.id === id);
  const next = course.data && id ? nextLesson(course.data, id) : null;
  const done = markedDone || (mine?.completed ?? false);
  // The viewer's name and address sit faintly over the video, so a recording says whose it is.
  const mark = space.watermark && !isStaff ? [viewer.name, auth.user?.email].filter(Boolean).join(" · ") : null;

  const resume = resumeAt(mine?.watched ?? 0, found?.duration ?? null, mine?.completed ?? false);

  const header = <BackHeader title={found?.title ?? "Lesson"} backLabel="Back" fallback="/learn" />;

  if (!client || lesson.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (lesson.error) return <Screen hasNav={false} header={header}><Trouble detail={lesson.error} onRetry={lesson.reload} /></Screen>;
  if (!found || !id) {
    return (
      <Screen hasNav={false} header={header}>
        <Card style={styles.card}>
          <AppText size={15} line={22} color={theme.text2}>
            This lesson can&apos;t be opened. It may have been removed, or your VIP may have ended.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen hasNav={false} header={header}>
      {found.videoStatus === "ready" ? (
        video.loading || saver === null || course.loading ? (
          <View style={[styles.waiting, { backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
            <Loading />
          </View>
        ) : video.error || !video.data ? (
          <Trouble detail={video.error} onRetry={video.reload} />
        ) : (
          <>
            <LessonPlayer
              // Switching data saver makes a new player, which starts where the old one had got to.
              key={saver ? "small" : "full"}
              url={video.data.url}
              startAt={startAt ?? resume}
              dataSaver={saver}
              watermark={mark}
              onProgress={(seconds, finished) => {
                reached.current = seconds;
                if (finished) setMarkedDone(true);
                void saveProgress(client, id, seconds, finished).catch(() => {});
              }}
            />
            <Card style={styles.saver}>
              <Checkbox label="Data saver" checked={saver} onChange={chooseSaver} />
              <AppText size={13} line={18} color={theme.text3}>
                Plays in a smaller size, which uses much less mobile data.
              </AppText>
            </Card>
          </>
        )
      ) : found.videoStatus !== "none" ? (
        <Card style={styles.card}>
          <AppText size={15} line={22} color={theme.text2}>
            {VIDEO_WORDS[found.videoStatus]}.
          </AppText>
        </Card>
      ) : null}

      <Card radius={28} style={styles.card}>
        <View style={styles.words}>
          <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.44}>
            {found.title}
          </AppText>
          <AppText size={13} line={18} color={theme.text3}>
            {[!found.published ? "Draft" : null, found.duration ? lengthText(found.duration) : null, done ? "Done" : null]
              .filter(Boolean)
              .join(" · ") || "Lesson"}
          </AppText>
        </View>
        {found.description ? <RichText text={found.description} size={15} line={23} color={theme.text2} selectable /> : null}
        {found.videoStatus === "none" && !done ? (
          <Button
            label="Mark as done"
            kind="ghost"
            size="medium"
            onPress={() => {
              setMarkedDone(true);
              void saveProgress(client, id, 0, true).catch(() => {});
            }}
          />
        ) : null}
      </Card>

      {next ? (
        <Button label={`Next: ${next.title}`} onPress={() => router.replace({ pathname: "/lesson", params: { id: next.id } })} />
      ) : null}
      {isStaff ? (
        <View style={styles.edit}>
          <TextLink label="Edit this lesson" onPress={() => router.push({ pathname: "/manage/lesson", params: { id } })} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 22 },
  words: { gap: 4 },
  waiting: { width: "100%", aspectRatio: 16 / 9, justifyContent: "center", borderRadius: 20, borderWidth: 1 },
  saver: { gap: 6, paddingVertical: 14, paddingHorizontal: 20 },
  edit: { alignItems: "center" },
});
