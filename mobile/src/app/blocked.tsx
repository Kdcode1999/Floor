import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { loadBlocks, unblockMember } from "@/features/chat/api";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme/ThemeContext";

/** The people this person has blocked, and the way to unblock them. */
export default function BlockedScreen() {
  const theme = useTheme();
  const loaded = useLoad(() => loadBlocks(database), "blocks");
  const act = useAction();

  const header = <BackHeader title="Blocked people" backLabel="Back" fallback="/account" />;
  if (loaded.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (loaded.error) return <Screen hasNav={false} header={header}><Trouble detail={loaded.error} onRetry={loaded.reload} /></Screen>;

  const blocked = loaded.data ?? [];

  return (
    <Screen hasNav={false} header={header}>
      {blocked.length === 0 ? (
        <Card style={styles.none}>
          <AppText size={14} line={20} color={theme.text2}>
            You haven&apos;t blocked anyone. To block a member, tap one of their messages in a group.
          </AppText>
        </Card>
      ) : (
        <>
          <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
            You don&apos;t see messages from these people in any group.
          </AppText>
          <Card style={styles.rows}>
            {blocked.map((person, index) => (
              <View key={person.userId} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
                <AppText size={15} line={20} weight="semibold" numberOfLines={1} style={styles.name}>
                  {person.name}
                </AppText>
                <TextLink
                  label={act.busy === person.userId ? "Unblocking…" : "Unblock"}
                  disabled={act.busy !== null}
                  onPress={() => act.run(person.userId, () => unblockMember(database, person.userId), loaded.reload)}
                />
              </View>
            ))}
          </Card>
        </>
      )}
      <ErrorLine text={act.error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  aside: { paddingHorizontal: 6 },
  rows: { paddingVertical: 2, paddingLeft: 18, paddingRight: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  name: { flex: 1 },
});
