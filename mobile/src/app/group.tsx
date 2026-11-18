import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GlowField } from "@/components/GlowField";
import { Loading, Trouble } from "@/components/LoadState";
import { RoundButton } from "@/components/RoundButton";
import {
  blockMember,
  deleteMessage,
  loadGroups,
  loadMute,
  muteMember,
  removePicture,
  reportMessage,
  sendMessage,
  uploadPicture,
} from "@/features/chat/api";
import { Composer } from "@/features/chat/Composer";
import { cannotWrite, chatRows, groupHeaderLine, MUTE_CHOICES, UNNAMED, type ChatRow } from "@/features/chat/logic";
import { MessageActions, type MessageAction } from "@/features/chat/MessageActions";
import { MessageBubble } from "@/features/chat/MessageBubble";
import type { Message } from "@/features/chat/types";
import { useConversation } from "@/features/chat/useConversation";
import { fittedJpeg, pictureBytes, type Picture } from "@/lib/pictures";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { CONTENT_MAX_WIDTH } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeContext";

/** The longest side of a picture in a message, in pixels. */
const PICTURE_MAX = 1600;
/** How often an open group checks whether the person may still write in it. */
const LOOK_AGAIN_MS = 60_000;

/** One group: what has been said in it, and the box to write in. */
export default function GroupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const display = useWindowDimensions();
  const router = useRouter();
  const auth = useAuth();
  const { space, viewer, isStaff } = useSpace();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const client = auth.sample ? null : supabase;
  const userId = auth.user?.id ?? null;

  // The group as this person may use it: whether it opens for them and whether they may write.
  const groups = useLoad(client && space.id ? () => loadGroups(client, space.id) : null, `groups:${space.id}`);
  const group = groups.data?.find((each) => each.id === id) ?? null;
  const canOpen = group?.canOpen === true;
  const mute = useLoad(client && userId && !isStaff ? () => loadMute(client, space.id, userId) : null, `mute:${space.id}:${userId}`);
  const talk = useConversation(canOpen ? client : null, canOpen && id ? id : null);

  const [picked, setPicked] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [size, setSize] = useState({ width: display.width, height: display.height });
  const [now] = useState(() => Date.now());
  const list = useRef<FlatList<ChatRow>>(null);

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

  // A notice says its piece and goes.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = async (body: string, picture: Picture | null): Promise<string | null> => {
    if (!client || !id) return "Sending needs the app to be connected.";
    let sent: { path: string; width: number; height: number } | null = null;
    if (picture) {
      try {
        const ready = await fittedJpeg(picture, PICTURE_MAX);
        const path = await uploadPicture(client, space.id, id, await pictureBytes(ready.uri), Crypto.randomUUID());
        sent = { path, width: ready.width, height: ready.height };
      } catch {
        return "The picture couldn't be uploaded. Check your connection and try again.";
      }
    }
    const refused = await sendMessage(client, id, body, replyingTo?.id ?? null, sent);
    if (refused) {
      if (sent) removePicture(client, sent.path);
      // Something may have changed since the screen opened: a mute, or who may write here.
      reloadGroup();
      reloadMute();
      return refused;
    }
    setReplyingTo(null);
    talk.changed();
    list.current?.scrollToOffset({ offset: 0, animated: true });
    return null;
  };

  const act = async (action: MessageAction) => {
    const message = picked;
    setPicked(null);
    if (!message || !client) return;
    if (action.kind === "reply") return setReplyingTo(message);
    if (action.kind === "reportSpace") return router.push("/report");
    if (action.kind === "member") return router.push({ pathname: "/member", params: { id: message.userId } });
    if (action.kind === "copy") {
      await Clipboard.setStringAsync(message.body ?? "").catch(() => {});
      return setNotice("Copied.");
    }
    if (action.kind === "report") {
      return setNotice((await reportMessage(client, message.id)) ?? "Reported. The mentor and admins will take a look.");
    }
    if (action.kind === "block") {
      const refused = await blockMember(client, message.userId);
      if (refused) return setNotice(refused);
      talk.hide(message.userId);
      if (replyingTo?.userId === message.userId) setReplyingTo(null);
      return setNotice(`${message.name} is blocked. You won't see their messages.`);
    }
    if (action.kind === "delete") {
      const refused = await deleteMessage(client, message.id, message.imagePath !== null);
      if (refused) return setNotice(refused);
      if (replyingTo?.id === message.id) setReplyingTo(null);
      return talk.changed();
    }
    if (action.kind !== "mute") return;
    const refused = await muteMember(client, space.id, message.userId, action.hours);
    const length = MUTE_CHOICES.find((choice) => choice.hours === action.hours)?.label ?? `${action.hours} hours`;
    setNotice(refused ?? `${message.name} is muted for ${length}.`);
  };

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

  // Newest first, because the list is drawn from the bottom up.
  const rows = talk.messages ? chatRows(talk.messages, now).reverse() : [];
  const blocked = group ? cannotWrite(group, isStaff, mute.data ?? null, now) : null;

  let body;
  if (!client) body = <Note text="Groups open once the app is connected. This is the sample space." />;
  else if (groups.loading) body = <Loading />;
  else if (groups.error) body = <Padded><Trouble detail={groups.error} onRetry={groups.reload} /></Padded>;
  else if (!group) body = <Note text="This group is no longer here." />;
  else if (!group.canOpen) body = <Note text="This group is for VIP members. It opens here once you have VIP." />;
  else if (talk.trouble) body = <Padded><Trouble detail={talk.trouble} onRetry={talk.retry} /></Padded>;
  else if (talk.messages === null) body = <Loading />;
  else {
    body = (
      <>
        <View style={styles.fill}>
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <AppText size={14} line={20} color={theme.text3} style={styles.center}>
                {group.canPost ? "Nothing here yet. Say the first word." : "Nothing here yet."}
              </AppText>
            </View>
          ) : (
            <FlatList
              ref={list}
              inverted
              data={rows}
              keyExtractor={(row) => row.key}
              renderItem={({ item }) =>
                item.kind === "day" ? (
                  <DayLine label={item.label} />
                ) : (
                  <MessageBubble
                    message={item.message}
                    joined={item.joined}
                    onPress={item.message.deleted ? undefined : () => setPicked(item.message)}
                  />
                )
              }
              onEndReached={talk.loadOlder}
              onEndReachedThreshold={0.4}
              // In a list drawn from the bottom up, the footer is what sits at the very top.
              ListFooterComponent={talk.loadingOlder ? <Loading /> : talk.reachedStart ? <DayLine label={`The start of ${group.name}`} /> : undefined}
              // New messages come in at the bottom without moving what is being read further up.
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
              onScroll={(event) => setScrolledUp(event.nativeEvent.contentOffset.y > 240)}
              scrollEventThrottle={64}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
            />
          )}
          {scrolledUp ? (
            <View style={styles.jump}>
              <RoundButton
                icon="arrowDown"
                label="Go to the newest messages"
                onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 8 }]}>
          {notice ? (
            <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.text2} style={styles.notice}>
              {notice}
            </AppText>
          ) : null}
          {blocked ? (
            <AppText size={13} line={18} color={theme.text3} style={[styles.center, styles.cannot]}>
              {blocked}
            </AppText>
          ) : viewer.name === UNNAMED ? (
            <Card radius={20} style={styles.name}>
              <AppText size={14} line={20} color={theme.text2}>
                Choose the name people here will see before you write.
              </AppText>
              <Button label="Choose a name" size="medium" onPress={() => router.push("/name")} />
            </Card>
          ) : (
            <Composer staff={isStaff} replyingTo={replyingTo} onCancelReply={() => setReplyingTo(null)} onSend={send} />
          )}
        </View>
      </>
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
      {picked ? (
        <MessageActions
          key={picked.id}
          message={picked}
          viewer={viewer.role}
          canReply={group?.canPost === true && viewer.name !== UNNAMED}
          onPick={act}
          onClose={() => setPicked(null)}
        />
      ) : null}
    </View>
  );
}

/** A quiet line across the conversation: where a day starts, and where the group does. */
function DayLine({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.day}>
      <View style={[styles.dayPill, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }]}>
        <AppText size={12} line={16} weight="medium" color={theme.text2}>
          {label}
        </AppText>
      </View>
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
  list: { paddingHorizontal: 14, paddingVertical: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  center: { textAlign: "center" },
  jump: { position: "absolute", right: 14, bottom: 10 },
  bottom: { gap: 8, paddingTop: 8, paddingHorizontal: 12 },
  notice: { paddingHorizontal: 6 },
  cannot: { paddingVertical: 12, paddingHorizontal: 12 },
  name: { gap: 12, padding: 16 },
  day: { alignItems: "center", paddingVertical: 10 },
  dayPill: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
  padded: { paddingTop: 8, paddingHorizontal: 16 },
  note: { padding: 20 },
});
