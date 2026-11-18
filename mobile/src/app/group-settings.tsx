import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { deleteGroup, loadGroups, saveGroup } from "@/features/chat/api";
import { AUDIENCE_WORDS, groupProblems, POSTING_WORDS, type GroupProblems } from "@/features/chat/logic";
import type { Audience, Group, GroupForm, Posting } from "@/features/chat/types";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/lib/useAction";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

const AUDIENCES = (Object.keys(AUDIENCE_WORDS) as Audience[]).map((value) => ({ value, label: AUDIENCE_WORDS[value].label }));
const POSTINGS = (Object.keys(POSTING_WORDS) as Posting[]).map((value) => ({ value, label: POSTING_WORDS[value].label }));

const NEW_GROUP: GroupForm = { name: "", about: "", audience: "everyone", posting: "all" };

/**
 * A new group, or the settings of one that exists. A full screen of its own, because it opens
 * from the list of groups and from a conversation, and has to go back to whichever it came from.
 */
export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { space, isStaff } = useSpace();
  const client = supabase;
  const loaded = useLoad(client && id ? () => loadGroups(client, space.id) : null, `groups:${space.id}`);

  const header = <BackHeader title={id ? "Group settings" : "New group"} backLabel="Back" fallback="/manage/groups" />;
  // Only the mentor and admins run groups. The database keeps the same rule.
  if (!isStaff) return <Redirect href="/" />;
  if (!id) return <Screen hasNav={false} header={header}><GroupFormCard group={null} /></Screen>;
  if (!client || loaded.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (loaded.error) return <Screen hasNav={false} header={header}><Trouble detail={loaded.error} onRetry={loaded.reload} /></Screen>;

  const group = loaded.data?.find((each) => each.id === id) ?? null;
  if (!group) {
    return (
      <Screen hasNav={false} header={header}>
        <Card style={styles.card}>
          <AppText size={15} line={22}>
            This group is no longer here.
          </AppText>
        </Card>
      </Screen>
    );
  }
  // Keyed by the group, so the boxes start from what is saved.
  return <Screen hasNav={false} header={header}><GroupFormCard key={group.id} group={group} /></Screen>;
}

function GroupFormCard({ group }: { group: Group | null }) {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack("/manage/groups");
  const { space, isMentor } = useSpace();
  const client = supabase;
  const act = useAction();

  const [form, setForm] = useState<GroupForm>(
    group ? { name: group.name, about: group.about ?? "", audience: group.audience, posting: group.posting } : NEW_GROUP,
  );
  const [wrong, setWrong] = useState<GroupProblems>({});
  const [confirming, setConfirming] = useState(false);

  const set = (changes: Partial<GroupForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setWrong({});
    act.clearError();
  };

  const save = () => {
    const found = groupProblems(form);
    setWrong(found);
    if (!client || Object.keys(found).length > 0) return;
    act.run("save", async () => {
      const saved = await saveGroup(client, space.id, form, group?.id ?? null);
      if (saved.problem !== null) return saved.problem;
      // A new group by invitation has nobody in it yet, so choosing them comes next.
      if (!group && form.audience === "invited") {
        router.replace({ pathname: "/group-members", params: { id: saved.id, name: form.name.trim() } });
      } else goBack();
      return null;
    });
  };

  return (
    <>
      <Card radius={28} style={styles.card}>
        <TextField
          label="Name"
          value={form.name}
          onChangeText={(name) => set({ name })}
          error={wrong.name}
          placeholder="Gold traders"
          maxLength={40}
        />
        <TextField
          label="What it is for"
          value={form.about}
          onChangeText={(about) => set({ about })}
          error={wrong.about}
          hint="Optional. Members see this until someone writes."
          maxLength={200}
        />
      </Card>

      <Card radius={28} style={styles.card}>
        <View style={styles.choice}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Who can open it
          </AppText>
          <Chips label="Who can open it" options={AUDIENCES} value={form.audience} onChange={(audience: Audience) => set({ audience })} />
          <AppText size={13} line={18} color={theme.text2}>
            {AUDIENCE_WORDS[form.audience].detail}
          </AppText>
        </View>
        <View style={styles.choice}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Who can write
          </AppText>
          <Chips label="Who can write" options={POSTINGS} value={form.posting} onChange={(posting: Posting) => set({ posting })} />
          <AppText size={13} line={18} color={theme.text2}>
            {POSTING_WORDS[form.posting].detail}
          </AppText>
        </View>
      </Card>

      {group && group.audience === "invited" ? (
        <Button
          label="Choose who is in it"
          kind="ghost"
          onPress={() => router.push({ pathname: "/group-members", params: { id: group.id, name: group.name } })}
        />
      ) : null}
      {!group && form.audience === "invited" ? (
        <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
          Next, you choose who is in it.
        </AppText>
      ) : null}

      <View style={styles.finish}>
        <Button label={group ? "Save" : "Create group"} busy={act.busy === "save"} onPress={save} />
        <ErrorLine text={act.error} />
      </View>

      {group && isMentor && client ? (
        <Card style={styles.card}>
          {confirming ? (
            <>
              <AppText size={14} line={20} color={theme.text2}>
                Delete {group.name} and everything said in it? It cannot be brought back.
              </AppText>
              <View style={styles.pair}>
                <Button
                  label="Yes, delete"
                  size="medium"
                  style={styles.half}
                  busy={act.busy === "delete"}
                  onPress={() => act.run("delete", () => deleteGroup(client, group.id), goBack)}
                />
                <Button label="Keep it" kind="ghost" size="medium" style={styles.half} onPress={() => setConfirming(false)} />
              </View>
            </>
          ) : (
            <Button label="Delete this group" kind="ghost" onPress={() => setConfirming(true)} />
          )}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  choice: { gap: 10 },
  aside: { paddingHorizontal: 6 },
  finish: { gap: 8 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
});
