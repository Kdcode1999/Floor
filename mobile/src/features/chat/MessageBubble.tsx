import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

import { ChatPicture } from "./ChatPicture";
import { clock, roleBadge } from "./logic";
import type { Message } from "./types";

interface MessageBubbleProps {
  message: Message;
  /** True when the same person wrote the message just before: the name is not repeated. */
  joined: boolean;
  /** Opens what can be done with the message. Left out for a deleted message. */
  onPress?: () => void;
}

/** One message in a group. Your own sit on the right, everyone else's on the left under their name. */
export function MessageBubble({ message, joined, onPress }: MessageBubbleProps) {
  const theme = useTheme();
  const badge = roleBadge(message.role);
  const mine = message.mine;
  const ink = mine ? theme.own.foreground : theme.text;
  const quiet = mine ? theme.own.foreground : theme.text3;

  if (message.deleted) {
    return (
      <View style={[styles.line, mine ? styles.right : styles.left, !joined && styles.spaced]}>
        <View style={[styles.bubble, styles.removed, { borderColor: theme.tile.border }]}>
          <AppText size={14} line={20} color={theme.text3}>
            Message removed
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.line, mine ? styles.right : styles.left, !joined && styles.spaced]}>
      {!mine && !joined ? (
        <View style={styles.who}>
          <AppText size={13} line={18} weight="semibold" color={badge ? theme.accent : theme.text} numberOfLines={1} style={styles.name}>
            {message.name}
          </AppText>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }]}>
              <AppText size={11} line={14} weight="semibold">
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mine ? "You" : message.name}: ${message.body ?? "Picture"}`}
        accessibilityHint="Opens what you can do with this message"
        onPress={onPress}
        style={({ pressed }) => [
          styles.bubble,
          mine
            ? { backgroundColor: theme.own.background, borderColor: theme.own.background }
            : { backgroundColor: theme.tile.background, borderColor: theme.tile.border },
          pressed && styles.pressed,
        ]}>
        {message.replyTo && message.replyName ? (
          <View style={[styles.quote, { borderLeftColor: quiet }]}>
            <AppText size={12} line={16} weight="semibold" color={ink} numberOfLines={1}>
              {message.replyName}
            </AppText>
            <AppText size={12} line={16} color={quiet} numberOfLines={1}>
              {message.replyBody ?? "Message removed"}
            </AppText>
          </View>
        ) : null}
        {message.imagePath && message.imageWidth && message.imageHeight ? (
          <ChatPicture path={message.imagePath} width={message.imageWidth} height={message.imageHeight} />
        ) : null}
        {message.body ? (
          <AppText size={15} line={21} color={ink} selectable>
            {message.body}
          </AppText>
        ) : null}
        <AppText size={11} line={14} color={quiet} style={[styles.time, mine && styles.timeMine]}>
          {clock(message.createdAt)}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { maxWidth: "84%", gap: 3, marginTop: 3 },
  spaced: { marginTop: 12 },
  left: { alignSelf: "flex-start", alignItems: "flex-start" },
  right: { alignSelf: "flex-end", alignItems: "flex-end" },
  who: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 },
  name: { flexShrink: 1 },
  badge: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 9, borderWidth: 1 },
  bubble: { gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1 },
  removed: { borderStyle: "dashed" },
  quote: { gap: 1, paddingLeft: 8, borderLeftWidth: 2 },
  time: { alignSelf: "flex-start", opacity: 0.75 },
  timeMine: { alignSelf: "flex-end" },
  pressed: { opacity: 0.75 },
});
