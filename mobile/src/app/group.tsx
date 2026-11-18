import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { GlowField } from "@/components/GlowField";
import { Loading, Trouble } from "@/components/LoadState";
import { RoundButton } from "@/components/RoundButton";
import { loadGroups, loadMute } from "@/features/chat/api";
import { Conversation } from "@/features/chat/Conversation";
import { cannotWrite, groupHeaderLine } from "@/features/chat/logic";
import { database } from "@/lib/database";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { CONTENT_MAX_WIDTH } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeContext";

/** How often an open group checks whether the person may still write in it. */
const LOOK_AGAIN_MS = 60_000;

/** One group: what has been said in it, and the box to write in. */
export default function GroupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const display = useWindowDimensions();
  const router = useRouter();
  const auth = useAuth();
  const { space, isStaff } = useSpace();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = auth.user?.id ?? null;

  // The group as this person may use it: whether it opens for them and whether they may write.
  const groups = useLoad(space.id ? () => loadGroups(database, space.id) : null, `groups:${space.id}`);
  const group = groups.data?.find((each) => each.id === id) ?? null;
  const mute = useLoad(userId && !isStaff ? () => loadMute(database, space.id, userId) : null, `mute:${space.id}:${userId}`);

  const [size, setSize] = useState({ width: display.width, height: display.height });
  const [now] = useState(() => Date.now());

  // A mute, a change of VIP or a change to the group can happen while the screen is open.
  const reloadGroup = groups.reload;
  const reloadMute = mute.reload;
  useFocusEffect(
    useCallback(() => {
      reloadGroup();
      reloadMute();
      const timer = setInterval(() => {
        if (AppState.currentState !== "active") return;
        reloadGroup();
        reloadMute();
      }, LOOK_AGAIN_MS);
      return () => clearInterval(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <BackHeader
      title={group?.name ?? "Group"}
      detail={group ? groupHeaderLine(group) : undefined}
      backLabel="Back to Chat"
      fallback="/chat"
      action={
        isStaff && group ? (
          <RoundButton icon="pencil" label="Group settings" onPress={() => router.push({ pathname: "/group-settings", params: { id: group.id } })} />
        ) : undefined
      }
    />
  );

  let body;
  if (groups.loading) body = <Loading />;
  else if (groups.error) body = <Padded><Trouble detail={groups.error} onRetry={groups.reload} /></Padded>;
  else if (!group) body = <Note text="This group is no longer here." />;
  else if (!group.canOpen) body = <Note text="This group is for VIP members. It opens here once you have VIP." />;
  else {
    body = (
      <Conversation
        groupId={group.id}
        startLabel={`The start of ${group.name}`}
        canPost={group.canPost}
        cannotWrite={cannotWrite(group, isStaff, mute.data ?? null, now)}
        onRefused={() => {
          reloadGroup();
          reloadMute();
        }}
      />
    );
  }

  return (
    <View
      style={[styles.fill, { backgroundColor: theme.background }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}>
      <GlowField theme={theme} width={size.width} height={size.height} />
      {/*
        Lifts the box to type in clear of the keyboard, the same way on both kinds of phone. The
        box keeps its own space for the phone's bottom edge, so that much less lift is needed.
      */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={-insets.bottom} style={[styles.column, { paddingTop: insets.top }]}>
        {header}
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

function Padded({ children }: { children: React.ReactNode }) {
  return <View style={styles.padded}>{children}</View>;
}

function Note({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Padded>
      <Card style={styles.note}>
        <AppText size={15} line={22} color={theme.text2}>
          {text}
        </AppText>
      </Card>
    </Padded>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  padded: { paddingTop: 8, paddingHorizontal: 16 },
  note: { padding: 20 },
});
