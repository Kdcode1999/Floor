import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { loadMemberCounts, loadMembers, type MemberItem } from "@/features/manage/api";
import { countsLine, standing } from "@/features/manage/logic";
import { database } from "@/lib/database";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

const PAGE = 50;

/** Members: everyone in the space, who is VIP, and whose VIP is about to end. */
export default function MembersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { space } = useSpace();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [now] = useState(() => Date.now());

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const members = useLoad(
    () => loadMembers(database, space.id, search, limit),
    `members:${space.id}:${search}:${limit}`,
  );
  const counts = useLoad(() => loadMemberCounts(database, space.id), `counts:${space.id}`);
  const { reload } = members;
  const reloadCounts = counts.reload;
  useFocusEffect(
    useCallback(() => {
      reload();
      reloadCounts();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // The database sends them in the order a mentor wants: VIP about to end comes first.
  const sorted = (members.data ?? []).map((member) => ({ member, where: standing(member, now) }));

  const open = (member: MemberItem) => router.push({ pathname: "/member", params: { id: member.userId } });

  return (
    <Screen header={<BackHeader title="Members" backLabel="Back to Manage" fallback="/manage" />}>
      {counts.data ? (
        <AppText size={13} line={18} color={theme.text2} style={styles.counts}>
          {countsLine(counts.data)}
        </AppText>
      ) : null}
      <TextField label="Find someone" value={typed} onChangeText={setTyped} placeholder="Name" autoCorrect={false} returnKeyType="search" />
      {members.loading && !members.data ? (
        <Loading />
      ) : members.error ? (
        <Trouble detail={members.error} onRetry={reload} />
      ) : sorted.length === 0 ? (
        <Card style={styles.none}>
          <AppText size={14} line={20} color={theme.text2}>
            {search ? "Nobody by that name." : "Nobody has joined yet. Share your join link."}
          </AppText>
        </Card>
      ) : (
        <Card style={styles.rows}>
          {sorted.map(({ member, where }, index) => (
            <Pressable
              key={member.userId}
              accessibilityRole="button"
              accessibilityLabel={`${member.name}. ${where.label}`}
              onPress={() => open(member)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider },
                pressed && styles.pressed,
              ]}>
              <View style={styles.words}>
                <AppText size={15} line={20} weight="semibold" numberOfLines={1}>
                  {member.name}
                </AppText>
                <AppText size={13} line={18} color={where.kind === "expiring" ? theme.accent : theme.text3}>
                  {where.label}
                </AppText>
              </View>
              <Icon name="chevronRight" size={18} color={theme.text} />
            </Pressable>
          ))}
        </Card>
      )}
      {(members.data?.length ?? 0) >= limit ? (
        <View style={styles.more}>
          <TextLink label="Show more" onPress={() => setLimit((current) => current + PAGE)} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: { paddingHorizontal: 6 },
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  rows: { paddingVertical: 2, paddingHorizontal: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 },
  words: { flex: 1 },
  more: { alignItems: "center" },
  pressed: { opacity: 0.6 },
});
