import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { loadSchedule, saveClass } from "@/features/live/api";
import { DayPicker } from "@/features/live/DayPicker";
import { ABOUT_MAX, classProblems, dayChoices, dayKey, dayName, readBack, startFor, timeText, TITLE_MAX, type ClassProblems } from "@/features/live/logic";
import type { LiveClass } from "@/features/live/types";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * A class, for the mentor or an admin: what it is, when it is and whether to keep a recording.
 * Opened with `id` to change a class that is on the schedule, or with nothing to add one.
 */
export default function ClassEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { space, isStaff } = useSpace();
  const schedule = useLoad(id ? () => loadSchedule(database, space.id) : null, `class-edit:${space.id}:${id}`);

  const header = <BackHeader title={id ? "Class" : "New class"} backLabel="Back" fallback="/manage/live" />;
  // Only the mentor and admins have this screen. The database keeps what it does to them.
  if (!isStaff) return <Redirect href="/" />;
  if (id && schedule.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (schedule.error) return <Screen hasNav={false} header={header}><Trouble detail={schedule.error} onRetry={schedule.reload} /></Screen>;

  const found = id ? (schedule.data?.find((each) => each.id === id && each.state === "scheduled") ?? null) : null;
  if (id && !found) {
    return (
      <Screen hasNav={false} header={header}>
        <Card style={styles.card}>
          <AppText size={15} line={22}>This class is no longer on the schedule.</AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen hasNav={false} header={header}>
      <Editor key={found?.id ?? "new"} spaceId={space.id} item={found} />
    </Screen>
  );
}

function Editor({ spaceId, item }: { spaceId: string; item: LiveClass | null }) {
  const theme = useTheme();
  const goBack = useGoBack("/manage/live");
  const act = useAction();
  const [now] = useState(() => Date.now());

  const before = item ? new Date(item.startsAt) : null;
  const [title, setTitle] = useState(item?.title ?? "");
  const [about, setAbout] = useState(item?.about ?? "");
  const [day, setDay] = useState(() => dayKey(before ? before.getTime() : now));
  const [time, setTime] = useState(() => (before ? timeText(before.getHours() * 60 + before.getMinutes()) : ""));
  const [record, setRecord] = useState(item?.record ?? true);
  const [problems, setProblems] = useState<ClassProblems>({});

  // The days on offer, with the class's own day added if it is further off than they reach.
  const offered = dayChoices(now);
  const days = offered.some((each) => each.value === day) || !before ? offered : [...offered, { value: day, label: dayName(before.getTime(), now) }];

  const form = { title, about, day, time };
  const save = () => {
    const found = classProblems(form, now);
    setProblems(found);
    const startsAt = startFor(day, time);
    if (Object.keys(found).length > 0 || !startsAt) return;
    return act.run("save", async () => {
      const saved = await saveClass(database, spaceId, { title, about, startsAt, record }, item?.id ?? null);
      return "problem" in saved ? saved.problem : null;
    }, goBack);
  };

  return (
    <Card radius={28} style={styles.card}>
      <TextField
        label="Title"
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setProblems((held) => ({ ...held, title: undefined }));
        }}
        error={problems.title}
        placeholder="London open, live"
        maxLength={TITLE_MAX}
      />
      <TextField
        label="What it is about"
        value={about}
        onChangeText={(text) => {
          setAbout(text);
          setProblems((held) => ({ ...held, about: undefined }));
        }}
        error={problems.about}
        hint="Optional. VIP members see this on the schedule."
        multiline
        maxLength={ABOUT_MAX}
      />
      <View style={styles.group}>
        <AppText size={12} line={16} weight="medium" color={theme.text2} style={styles.label}>
          Day
        </AppText>
        <DayPicker days={days} value={day} onChange={setDay} />
      </View>
      <TextField
        label="Time it starts"
        value={time}
        onChangeText={(text) => {
          setTime(text);
          setProblems((held) => ({ ...held, time: undefined }));
        }}
        error={problems.time}
        hint={readBack(form) ?? "Your own time, like 7:30 pm or 19:30. Members see it in theirs."}
        placeholder="7:30 pm"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={10}
      />
      <Checkbox label="Keep a recording as a lesson" checked={record} onChange={setRecord} />
      <Button label={item ? "Save changes" : "Put it on the schedule"} busy={act.busy === "save"} onPress={save} />
      <ErrorLine text={act.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  group: { gap: 6 },
  label: { paddingHorizontal: 4 },
});
