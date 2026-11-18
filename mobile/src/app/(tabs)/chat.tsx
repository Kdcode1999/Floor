import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { TextLink } from "@/components/TextLink";
import { loadGroups } from "@/features/chat/api";
import { GroupRow } from "@/features/chat/GroupRow";
import { sampleGroups } from "@/features/chat/sample";
import { useUnread } from "@/features/chat/UnreadContext";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** How often the list looks for new messages while it is on screen. */
const LOOK_AGAIN_MS = 20_000;

/** Chat: the space's groups, each with its newest message and how many are unread. */
export default function ChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sample } = useAuth();
  const { space, isStaff } = useSpace();
  const client = sample ? null : supabase;
  const loaded = useLoad(client && space.id ? () => loadGroups(client, space.id) : null, `groups:${space.id}`);
  const [now, setNow] = useState(() => Date.now());

  // Look again whenever the person comes back to the list, and every little while they stay.
  const { reload } = loaded;
  useFocusEffect(
    useCallback(() => {
      const look = () => {
        setNow(Date.now());
        reload();
      };
      look();
      // Nothing is asked while the app is in the background.
      const timer = setInterval(() => AppState.currentState === "active" && look(), LOOK_AGAIN_MS);
      return () => clearInterval(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const groups = client ? (loaded.data ?? []) : sampleGroups;

  // The dot on the Chat tab follows what this list has just learned.
  const { report } = useUnread();
  const fresh = loaded.data;
  useEffect(() => {
    if (fresh) report(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  return (
    <Screen header={<SpaceHeader />} onRefresh={client ? reload : undefined} refreshing={loaded.refreshing}>
      {client && loaded.loading ? (
        <Loading />
      ) : client && loaded.error ? (
        <Trouble detail={loaded.error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="chat"
          title="No groups yet"
          detail={isStaff ? "Groups you create will show up here." : "Groups from your mentor will show up here."}
        />
      ) : (
        <Card style={styles.rows}>
          {groups.map((group, index) => (
            <GroupRow
              key={group.id}
              group={group}
              now={now}
              divided={index > 0}
              onPress={client ? () => router.push({ pathname: "/group", params: { id: group.id } }) : undefined}
            />
          ))}
        </Card>
      )}
      {client && isStaff ? (
        <View style={styles.manage}>
          <TextLink label="Manage groups" onPress={() => router.push("/manage/groups")} />
        </View>
      ) : null}
      {!client ? (
        <AppText size={13} line={18} color={theme.text3} style={styles.note}>
          Every space starts with these two groups. You can add more, for everyone, for VIP or by invitation.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { paddingVertical: 2, paddingHorizontal: 16 },
  manage: { alignItems: "center" },
  note: { paddingHorizontal: 10 },
});
