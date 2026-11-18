import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { loadGroups, reorderGroups } from "@/features/chat/api";
import { groupSummary, moved } from "@/features/chat/logic";
import { database } from "@/lib/database";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** How many groups a space can have. The database holds the same number. */
const MOST = 30;

/** Groups: every group in the space, in the order members see them, and the way to add one. */
export default function GroupsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { space } = useSpace();
  const loaded = useLoad(() => loadGroups(database, space.id), `groups:${space.id}`);
  const act = useAction();

  const { reload } = loaded;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = <BackHeader title="Groups" backLabel="Back to Manage" fallback="/manage" />;
  if (loaded.loading) return <Screen header={header}><Loading /></Screen>;
  if (loaded.error) return <Screen header={header}><Trouble detail={loaded.error} onRetry={reload} /></Screen>;

  const groups = loaded.data ?? [];
  const move = (index: number, by: -1 | 1) => {
    const order = moved(groups, index, by).map((group) => group.id);
    act.run(`move:${groups[index].id}`, () => reorderGroups(database, space.id, order), reload);
  };

  return (
    <Screen header={header}>
      <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
        Members only ever talk in groups, where you and your admins can see everything. There are no private messages.
      </AppText>

      {groups.length === 0 ? (
        <Card style={styles.none}>
          <AppText size={14} line={20} color={theme.text2}>
            There are no groups. Add one so your members have somewhere to talk.
          </AppText>
        </Card>
      ) : (
        <Card style={styles.rows}>
          {groups.map((group, index) => (
            <View key={group.id} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${group.name}. ${groupSummary(group)}`}
                onPress={() => router.push({ pathname: "/group-settings", params: { id: group.id } })}
                style={({ pressed }) => [styles.words, pressed && styles.pressed]}>
                <AppText size={15} line={20} weight="semibold" numberOfLines={1}>
                  {group.name}
                </AppText>
                <AppText size={13} line={18} color={theme.text3} numberOfLines={1}>
                  {groupSummary(group)}
                </AppText>
              </Pressable>
              <Arrow
                icon="arrowUp"
                label={`Move ${group.name} up`}
                disabled={index === 0 || act.busy !== null}
                onPress={() => move(index, -1)}
              />
              <Arrow
                icon="arrowDown"
                label={`Move ${group.name} down`}
                disabled={index === groups.length - 1 || act.busy !== null}
                onPress={() => move(index, 1)}
              />
            </View>
          ))}
        </Card>
      )}
      <ErrorLine text={act.error} />

      {groups.length < MOST ? (
        <Button label="New group" onPress={() => router.push("/group-settings")} />
      ) : (
        <AppText size={13} line={18} color={theme.text3} style={styles.aside}>
          A space can have {MOST} groups. Delete one to add another.
        </AppText>
      )}
    </Screen>
  );
}

function Arrow({ icon, label, disabled, onPress }: { icon: "arrowUp" | "arrowDown"; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.arrow,
        { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aside: { paddingHorizontal: 6 },
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  rows: { paddingVertical: 2, paddingHorizontal: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 60, paddingVertical: 8 },
  words: { flex: 1, minHeight: 44, justifyContent: "center" },
  arrow: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
