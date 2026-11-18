import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loading, Trouble } from "@/components/LoadState";
import { RoundButton } from "@/components/RoundButton";
import { database } from "@/lib/database";
import { fittedJpeg, pictureBytes, type Picture } from "@/lib/pictures";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

import { blockMember, deleteMessage, muteMember, removePicture, reportMessage, sendMessage, uploadPicture } from "./api";
import { Composer } from "./Composer";
import { chatRows, MUTE_CHOICES, UNNAMED, type ChatRow } from "./logic";
import { MessageActions, type MessageAction } from "./MessageActions";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "./types";
import { useConversation } from "./useConversation";

/** The longest side of a picture in a message, in pixels. */
const PICTURE_MAX = 1600;

interface ConversationProps {
  /** The group whose messages these are. The database decides whether this person may read them. */
  groupId: string;
  /** What the very top says once every message is loaded: "The start of General". */
  startLabel: string;
  /** Whether this person may write here: the group's rule, their place in the space, a mute. */
  canPost: boolean;
  /** Why they cannot write, as a sentence shown where the box would be. Null when they can. */
  cannotWrite: string | null;
  /** Called when the database refuses a message: a mute or the group's rule may have changed. */
  onRefused?: () => void;
}

/**
 * What has been said in one group, kept up to date, with the box to write in and everything a
 * person can do with a message. It fills the space it is given, under whatever the screen puts
 * above it: a group's header, or the live room's video.
 */
export function Conversation({ groupId, startLabel, canPost, cannotWrite, onRefused }: ConversationProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { space, viewer, isStaff } = useSpace();
  const talk = useConversation(database, groupId);

  const [picked, setPicked] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [now] = useState(() => Date.now());
  const list = useRef<FlatList<ChatRow>>(null);

  // A notice says its piece and goes.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = async (body: string, picture: Picture | null): Promise<string | null> => {
    let sent: { path: string; width: number; height: number } | null = null;
    if (picture) {
      try {
        const ready = await fittedJpeg(picture, PICTURE_MAX);
        const path = await uploadPicture(database, space.id, groupId, await pictureBytes(ready.uri), Crypto.randomUUID());
        sent = { path, width: ready.width, height: ready.height };
      } catch {
        return "The picture couldn't be uploaded. Check your connection and try again.";
      }
    }
    const refused = await sendMessage(database, groupId, body, replyingTo?.id ?? null, sent);
    if (refused) {
      if (sent) removePicture(database, sent.path);
      // Something may have changed since the screen opened: a mute, or who may write here.
      onRefused?.();
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
    if (!message) return;
    if (action.kind === "reply") return setReplyingTo(message);
    if (action.kind === "reportSpace") return router.push("/report");
    if (action.kind === "member") return router.push({ pathname: "/member", params: { id: message.userId } });
    if (action.kind === "copy") {
      await Clipboard.setStringAsync(message.body ?? "").catch(() => {});
      return setNotice("Copied.");
    }
    if (action.kind === "report") {
      return setNotice((await reportMessage(database, message.id)) ?? "Reported. The mentor and admins will take a look.");
    }
    if (action.kind === "block") {
      const refused = await blockMember(database, message.userId);
      if (refused) return setNotice(refused);
      talk.hide(message.userId);
      if (replyingTo?.userId === message.userId) setReplyingTo(null);
      return setNotice(`${message.name} is blocked. You won't see their messages.`);
    }
    if (action.kind === "delete") {
      const refused = await deleteMessage(database, message.id, message.imagePath !== null);
      if (refused) return setNotice(refused);
      if (replyingTo?.id === message.id) setReplyingTo(null);
      return talk.changed();
    }
    if (action.kind !== "mute") return;
    const refused = await muteMember(database, space.id, message.userId, action.hours);
    const length = MUTE_CHOICES.find((choice) => choice.hours === action.hours)?.label ?? `${action.hours} hours`;
    setNotice(refused ?? `${message.name} is muted for ${length}.`);
  };

  if (talk.trouble) {
    return (
      <View style={styles.padded}>
        <Trouble detail={talk.trouble} onRetry={talk.retry} />
      </View>
    );
  }
  if (talk.messages === null) return <Loading />;

  // Newest first, because the list is drawn from the bottom up.
  const rows = chatRows(talk.messages, now).reverse();

  return (
    <>
      <View style={styles.fill}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={14} line={20} color={theme.text3} style={styles.center}>
              {canPost ? "Nothing here yet. Say the first word." : "Nothing here yet."}
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
            ListFooterComponent={talk.loadingOlder ? <Loading /> : talk.reachedStart ? <DayLine label={startLabel} /> : undefined}
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
        {cannotWrite ? (
          <AppText size={13} line={18} color={theme.text3} style={[styles.center, styles.cannot]}>
            {cannotWrite}
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

      {picked ? (
        <MessageActions
          key={picked.id}
          message={picked}
          viewer={viewer.role}
          canReply={canPost && viewer.name !== UNNAMED}
          onPick={act}
          onClose={() => setPicked(null)}
        />
      ) : null}
    </>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
});
