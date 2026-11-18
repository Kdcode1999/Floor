import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { loadGroupMemberIds, setGroupMembers } from "@/features/chat/api";
import { loadMembers } from "@/features/manage/api";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

const PAGE = 50;

/** Who is in a group that is by invitation. Ticking a member puts them in at once. */
export default function GroupMembersScreen() {
  const theme = useTheme();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { space, isStaff } = useSpace();
  const client = supabase;

  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  /** What the person has ticked or unticked since the list loaded. */
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const members = useLoad(client ? () => loadMembers(client, space.id, search, limit) : null, `members:${space.id}:${search}:${limit}`);
  const inGroup = useLoad(client && id ? () => loadGroupMemberIds(client, id) : null, `group-members:${id}`);

  const header = (
    <BackHeader title={name ? `In ${name}` : "In this group"} backLabel="Back" fallback="/manage/groups" />
  );
  if (!isStaff) return <Redirect href="/" />;
  if (!client || !id || inGroup.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (inGroup.error) return <Screen hasNav={false} header={header}><Trouble detail={inGroup.error} onRetry={inGroup.reload} /></Screen>;

  const saved = new Set(inGroup.data ?? []);
  const isIn = (userId: string) => changed[userId] ?? saved.has(userId);
  // The mentor and admins open every group, so only members are listed. Someone removed from
  // the space is in no group.
  const people = (members.data ?? []).filter((member) => member.role === "member" && member.status === "active");
  const count = [...new Set([...saved, ...Object.keys(changed)])].filter(isIn).length;

  const toggle = async (userId: string, next: boolean) => {
    setError(null);
    setChanged((current) => ({ ...current, [userId]: next }));
    const refused = await setGroupMembers(client, id, next ? [userId] : [], next ? [] : [userId]);
    if (refused) {
      // Put the tick back the way the database has it.
      setChanged((current) => ({ ...current, [userId]: !next }));
      setError(refused);
    }
  };

  return (
    <Screen hasNav={false} header={header}>
      <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
        {count === 1 ? "1 member is in this group." : `${count} members are in this group.`} You and your admins are always in it.
      </AppText>
      <TextField label="Find someone" value={typed} onChangeText={setTyped} placeholder="Name" autoCorrect={false} returnKeyType="search" />
      {members.loading && !members.data ? (
        <Loading />
      ) : members.error ? (
        <Trouble detail={members.error} onRetry={members.reload} />
      ) : people.length === 0 ? (
        <Card style={styles.none}>
          <AppText size={14} line={20} color={theme.text2}>
            {search ? "No member by that name." : "No members yet. Share your join link first."}
          </AppText>
        </Card>
      ) : (
        <Card style={styles.rows}>
          {people.map((member, index) => (
            <View key={member.userId} style={index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }}>
              <Checkbox label={member.name} checked={isIn(member.userId)} onChange={(next) => toggle(member.userId, next)} />
            </View>
          ))}
        </Card>
      )}
      <ErrorLine text={error} />
      {(members.data?.length ?? 0) >= limit ? (
        <View style={styles.more}>
          <TextLink label="Show more" onPress={() => setLimit((current) => current + PAGE)} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  aside: { paddingHorizontal: 6 },
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  rows: { paddingVertical: 6, paddingHorizontal: 18 },
  more: { alignItems: "center" },
});
