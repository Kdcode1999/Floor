import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { ProgressBar } from "@/components/ProgressBar";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  deleteLesson,
  loadLesson,
  loadOutline,
  publishLesson,
  refreshVideo,
  requestUpload,
  saveLesson,
  serverMessage,
} from "@/features/learn/api";
import { lengthText, uploadPercent, VIDEO_WORDS } from "@/features/learn/logic";
import type { Lesson, OutlineModule, VideoStatus } from "@/features/learn/types";
import { pickVideo, uploadVideo, type UploadHandle } from "@/features/learn/upload";
import { SampleNote } from "@/features/sample/SampleNote";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * One lesson, for the mentor or an admin: its title and notes, its video, and whether members
 * can see it. Opened with `id` for a lesson that exists, or with `module` to add one there.
 */
export default function LessonEditScreen() {
  const { id, module } = useLocalSearchParams<{ id?: string; module?: string }>();
  const { space, isStaff } = useSpace();
  const lesson = useLoad(id ? () => loadLesson(database, id) : null, `lesson-edit:${id}`);
  const course = useLoad(() => loadOutline(database, space.id), `course:${space.id}`);

  const header = <BackHeader title={id ? "Lesson" : "New lesson"} backLabel="Back" fallback="/manage/learn" />;
  // Only the mentor and admins have this screen. The database keeps what it does to them.
  if (!isStaff) return <Redirect href="/" />;
  if (course.loading || (id !== undefined && lesson.loading)) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (course.error || lesson.error) {
    return (
      <Screen hasNav={false} header={header}>
        <Trouble detail={course.error ?? lesson.error} onRetry={() => { course.reload(); lesson.reload(); }} />
      </Screen>
    );
  }
  if (id && !lesson.data) {
    return (
      <Screen hasNav={false} header={header}>
        <Card style={styles.card}>
          <AppText size={15} line={22}>This lesson is no longer there.</AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen hasNav={false} header={header}>
      <Editor
        // A lesson that has just been created reloads under its new id.
        key={lesson.data?.id ?? "new"}
        lesson={lesson.data ?? null}
        moduleId={lesson.data?.moduleId ?? module ?? course.data?.[0]?.id ?? ""}
        modules={course.data ?? []}
        onReload={lesson.reload}
      />
    </Screen>
  );
}

interface EditorProps {
  lesson: Lesson | null;
  moduleId: string;
  modules: OutlineModule[];
  onReload: () => void;
}

function Editor({ lesson, moduleId, modules, onReload }: EditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack("/manage/learn");
  const act = useAction();

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [notes, setNotes] = useState(lesson?.description ?? "");
  const [inModule, setInModule] = useState(moduleId);
  const [titleProblem, setTitleProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);


  const save = (then: (id: string) => void) => {
    if (title.trim() === "") return setTitleProblem("Give the lesson a title.");
    return act.run("save", async () => {
      const saved = await saveLesson(database, inModule, { title, description: notes }, lesson?.id ?? null);
      if ("problem" in saved) return saved.problem;
      then(saved.id);
      return null;
    });
  };

  const changed = lesson !== null && (title.trim() !== lesson.title || notes.trim() !== (lesson.description ?? "") || inModule !== lesson.moduleId);

  return (
    <>
      <Card radius={28} style={styles.card}>
        <TextField
          label="Title"
          value={title}
          onChangeText={(text) => { setTitle(text); setTitleProblem(null); }}
          error={titleProblem}
          placeholder="Stops that make sense"
          maxLength={120}
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          hint="Optional. Shown under the video: a summary, links, homework."
          multiline
          maxLength={4000}
        />
        {modules.length > 1 ? (
          <View style={styles.group}>
            <AppText size={12} line={16} weight="medium" color={theme.text2} style={styles.label}>
              Module
            </AppText>
            <Chips label="Module" options={modules.map((each) => ({ value: each.id, label: each.title }))} value={inModule} onChange={setInModule} />
          </View>
        ) : null}
        {lesson === null ? (
          <Button
            label="Save and add the video"
            busy={act.busy === "save"}
            onPress={() => save((id) => router.replace({ pathname: "/lesson-edit", params: { id } }))}
          />
        ) : (
          <Button label="Save changes" kind={changed ? "primary" : "ghost"} disabled={!changed} busy={act.busy === "save"} onPress={() => save(onReload)} />
        )}
        {lesson === null ? <ErrorLine text={act.error} /> : null}
      </Card>

      {lesson ? (
        <>
          <VideoCard lesson={lesson} onChanged={onReload} />

          <Card radius={28} style={styles.card}>
            <View style={styles.words}>
              <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
                {lesson.published ? "Published" : "Draft"}
              </AppText>
              <AppText size={13} line={18} color={theme.text2}>
                {lesson.published
                  ? "VIP members can open this lesson."
                  : "Only you and your admins can see a draft. Publishing shows it to VIP members and sends them an alert."}
              </AppText>
            </View>
            {lesson.published ? (
              <Button
                label="Take back to a draft"
                kind="ghost"
                busy={act.busy === "publish"}
                onPress={() => act.run("publish", () => publishLesson(database, lesson.id, false), onReload)}
              />
            ) : (
              <Button
                label="Publish"
                busy={act.busy === "publish"}
                onPress={() => act.run("publish", () => publishLesson(database, lesson.id, true), onReload)}
              />
            )}
          </Card>

          <Card style={styles.card}>
            {confirming ? (
              <>
                <AppText size={14} line={20} color={theme.text2}>
                  Delete this lesson and its video? This cannot be undone.
                </AppText>
                <View style={styles.row}>
                  <Button
                    label="Yes, delete"
                    size="medium"
                    style={styles.grow}
                    busy={act.busy === "delete"}
                    onPress={() => act.run("delete", () => deleteLesson(database, lesson.id), goBack)}
                  />
                  <Button label="Keep it" kind="ghost" size="medium" style={styles.grow} onPress={() => setConfirming(false)} />
                </View>
              </>
            ) : (
              <Button label="Delete this lesson" kind="ghost" onPress={() => setConfirming(true)} />
            )}
          </Card>
          <ErrorLine text={act.error} />
        </>
      ) : null}
    </>
  );
}

/** How often to ask how a video that is being prepared is doing. */
const ASK_EVERY_MS = 8000;

/** The lesson's video: choosing one, sending it to the video host, and waiting for it to be ready. */
function VideoCard({ lesson, onChanged }: { lesson: Lesson; onChanged: () => void }) {
  const theme = useTheme();
  const [status, setStatus] = useState<VideoStatus>(lesson.videoStatus);
  const [seconds, setSeconds] = useState<number | null>(lesson.duration);
  /** Set while a file is on its way: how much has gone. */
  const [sending, setSending] = useState<{ sent: number; total: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<UploadHandle | null>(null);

  // Stop sending if the screen closes. The mentor can choose the file again later.
  useEffect(() => () => upload.current?.stop(), []);

  // While the host prepares the video, ask now and then how it is doing.
  const lessonId = lesson.id;
  useEffect(() => {
    if (status !== "processing") return;
    let current = true;
    const ask = () =>
      refreshVideo(lessonId).then(
        (answer) => {
          if (!current) return;
          setStatus(answer.status);
          setSeconds(answer.seconds);
          if (answer.status !== "processing") onChanged();
        },
        () => {},
      );
    const timer = setInterval(ask, ASK_EVERY_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lessonId]);

  const choose = async () => {
    setError(null);
    let video;
    try {
      video = await pickVideo();
    } catch {
      return setError("Your videos couldn't be opened. Allow Floor to see them in your phone's settings.");
    }
    if (!video) return;

    setStarting(true);
    let ticket;
    try {
      ticket = await requestUpload(lessonId);
    } catch (problem) {
      setStarting(false);
      return setError(serverMessage(problem));
    }
    setStarting(false);
    setStatus("uploading");
    setSending({ sent: 0, total: 1 });
    upload.current = uploadVideo(video, ticket, {
      progress: (sent, total) => setSending({ sent, total }),
      done: () => {
        upload.current = null;
        setSending(null);
        setStatus("processing");
        // Tell the server the file has arrived, so it records that the host is preparing it.
        refreshVideo(lessonId).then((answer) => {
          setStatus(answer.status === "uploading" ? "processing" : answer.status);
          setSeconds(answer.seconds);
          onChanged();
        }, () => {});
      },
      failed: () => {
        upload.current = null;
        setSending(null);
        setError("The upload stopped. Check your connection and choose the video again.");
      },
    });
  };

  const stop = () => {
    upload.current?.stop();
    upload.current = null;
    setSending(null);
  };

  const line =
    status === "ready" && seconds
      ? `Video ready · ${lengthText(seconds)}`
      : status === "uploading" && !sending
        ? "The last upload did not finish. Choose the video again."
        : VIDEO_WORDS[status];

  return (
    <Card radius={28} style={styles.card}>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Video
        </AppText>
        <AppText size={13} line={18} color={status === "failed" ? theme.error : theme.text2}>
          {sending ? `Uploading · ${uploadPercent(sending.sent, sending.total)}` : line}
        </AppText>
      </View>
      {sending ? (
        <>
          <ProgressBar share={sending.total > 0 ? sending.sent / sending.total : 0} label="Upload progress" />
          <AppText size={13} line={18} color={theme.text3}>
            Keep this screen open until it finishes.
          </AppText>
          <Button label="Stop the upload" kind="ghost" size="medium" onPress={stop} />
        </>
      ) : status === "processing" ? (
        <AppText size={13} line={18} color={theme.text3}>
          This takes a few minutes. You can leave this screen: the lesson can be published once the video is ready.
        </AppText>
      ) : (
        <Button
          label={status === "none" ? "Choose a video" : "Replace the video"}
          kind={status === "none" || status === "failed" || status === "uploading" ? "primary" : "ghost"}
          size="medium"
          busy={starting}
          onPress={choose}
        />
      )}
      {status === "ready" && lesson.published ? (
        <AppText size={13} line={18} color={theme.text3}>
          Replacing the video takes the lesson back to a draft until the new one is ready.
        </AppText>
      ) : null}
      <SampleNote text="a video cannot be uploaded here. Every lesson that has one plays the same short film." />
      <ErrorLine text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 22 },
  words: { gap: 4 },
  group: { gap: 6 },
  label: { paddingLeft: 4 },
  row: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
});
