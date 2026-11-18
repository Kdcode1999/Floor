import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { deleteMessage, dismissReports, loadReported, type Reported } from "@/features/chat/api";
import { reportsLine, roleBadge } from "@/features/chat/logic";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Messages members have reported, for the mentor and admins to delete or leave up. */
export default function ReportedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { space } = useSpace();
  const client = supabase;
  const loaded = useLoad(client ? () => loadReported(client, space.id) : null, `reported:${space.id}`);
  const act = useAction();
  const [now] = useState(() => Date.now());

  const { reload } = loaded;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = <BackHeader title="Reported messages" backLabel="Back to Manage" fallback="/manage" />;
  if (!client || loaded.loading) return <Screen header={header}><Loading /></Screen>;
  if (loaded.error) return <Screen header={header}><Trouble detail={loaded.error} onRetry={reload} /></Screen>;

  const reported = loaded.data ?? [];

  return (
    <Screen header={header}>
      {reported.length === 0 ? (
        <Card style={styles.none}>
          <AppText size={14} line={20} color={theme.text2}>
            Nothing is waiting. When a member reports a message, it shows up here.
          </AppText>
        </Card>
      ) : (
        reported.map((item) => (
          <ReportedCard
            key={item.messageId}
            item={item}
            when={timeAgo(item.createdAt, now)}
            busy={act.busy === `delete:${item.messageId}` ? "delete" : act.busy === `keep:${item.messageId}` ? "keep" : null}
            onDelete={() => act.run(`delete:${item.messageId}`, () => deleteMessage(client, item.messageId, item.hasImage), reload)}
            onKeep={() => act.run(`keep:${item.messageId}`, () => dismissReports(client, item.messageId), reload)}
            onOpenGroup={() => router.push({ pathname: "/group", params: { id: item.groupId } })}
            onOpenMember={
              item.role === "member" ? () => router.push({ pathname: "/member", params: { id: item.userId } }) : undefined
            }
          />
        ))
      )}
      <ErrorLine text={act.error} />
    </Screen>
  );
}

interface ReportedCardProps {
  item: Reported;
  /** How long ago the message was written, in words. */
  when: string;
  busy: "delete" | "keep" | null;
  onDelete: () => void;
  onKeep: () => void;
  onOpenGroup: () => void;
  /** Left out when the writer is staff, or has left the space. */
  onOpenMember?: () => void;
}

function ReportedCard({ item, when, busy, onDelete, onKeep, onOpenGroup, onOpenMember }: ReportedCardProps) {
  const theme = useTheme();
  const badge = roleBadge(item.role);
  return (
    <Card style={styles.card}>
      <View style={styles.words}>
        <AppText size={13} line={18} color={theme.text3}>
          {reportsLine(item.reports)} · {item.groupName} · {when}
        </AppText>
        <AppText size={15} line={20} weight="semibold">
          {item.name}
          {badge ? ` (${badge})` : item.role === null ? " (no longer a member)" : ""}
        </AppText>
        <AppText size={15} line={21} color={theme.text2}>
          {item.body ?? (item.hasImage ? "Picture" : "")}
          {item.body && item.hasImage ? " (with a picture)" : ""}
        </AppText>
      </View>
      <View style={styles.pair}>
        <Button label="Delete it" size="medium" style={styles.half} busy={busy === "delete"} onPress={onDelete} />
        <Button label="Leave it up" kind="ghost" size="medium" style={styles.half} busy={busy === "keep"} onPress={onKeep} />
      </View>
      <View style={styles.links}>
        <TextLink label="Open the group" onPress={onOpenGroup} />
        {onOpenMember ? <TextLink label="Mute or remove them" onPress={onOpenMember} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  card: { gap: 14, padding: 20 },
  words: { gap: 4 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginHorizontal: -12, marginVertical: -6 },
});
