import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, FONT_FAMILY } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { ErrorLine } from "@/components/LoadState";
import { pickPicture, type Picture } from "@/lib/pictures";
import { useTheme } from "@/theme/ThemeContext";

import { MESSAGE_MAX, sendProblem } from "./logic";
import type { Message } from "./types";

interface ComposerProps {
  /** True for the mentor and admins, who can post pictures, links and phone numbers. */
  staff: boolean;
  /** The message being answered, shown above the box. */
  replyingTo: Message | null;
  onCancelReply: () => void;
  /** Sends the message. Resolves with a sentence to show if it was refused, or null when it went. */
  onSend: (body: string, picture: Picture | null) => Promise<string | null>;
}

/** Where a message is written: the box, Send, and for staff a button to add a picture. */
export function Composer({ staff, replyingTo, onCancelReply, onSend }: ComposerProps) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nothingToSend = text.trim() === "" && !picture;

  const choosePicture = async () => {
    setError(null);
    try {
      const chosen = await pickPicture();
      if (chosen) setPicture(chosen);
    } catch {
      setError("Your pictures couldn't be opened. Allow Floor to see them in your phone's settings.");
    }
  };

  const send = async () => {
    if (sending || nothingToSend) return;
    // A picture can go without words. Words are checked before anything is sent.
    const problem = picture && text.trim() === "" ? null : sendProblem(text, staff);
    if (problem) return setError(problem);
    setSending(true);
    setError(null);
    const refused = await onSend(text, picture);
    setSending(false);
    if (refused) return setError(refused);
    setText("");
    setPicture(null);
  };

  return (
    <View style={styles.composer}>
      <ErrorLine text={error} />

      {replyingTo ? (
        <View style={[styles.reply, { backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
          <View style={[styles.replyBar, { backgroundColor: theme.accent }]} />
          <View style={styles.replyWords}>
            <AppText size={12} line={16} weight="semibold" numberOfLines={1}>
              Replying to {replyingTo.mine ? "yourself" : replyingTo.name}
            </AppText>
            <AppText size={12} line={16} color={theme.text3} numberOfLines={1}>
              {replyingTo.body ?? "Picture"}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop replying" hitSlop={10} onPress={onCancelReply} style={styles.small}>
            <Icon name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      ) : null}

      {picture ? (
        <View style={[styles.reply, { backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
          <Image source={{ uri: picture.uri }} accessibilityLabel="The picture you chose" contentFit="cover" style={styles.thumb} />
          <AppText size={13} line={18} color={theme.text2} style={styles.replyWords}>
            Picture ready to send
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove the picture" hitSlop={10} onPress={() => setPicture(null)} style={styles.small}>
            <Icon name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
        {staff ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a picture"
            disabled={sending}
            onPress={choosePicture}
            style={({ pressed }) => [styles.round, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }, pressed && styles.pressed]}>
            <Icon name="image" size={20} color={theme.text} />
          </Pressable>
        ) : null}
        <TextInput
          accessibilityLabel="Message"
          placeholder="Message"
          value={text}
          onChangeText={(next) => {
            setText(next);
            setError(null);
          }}
          multiline
          rows={1}
          maxLength={MESSAGE_MAX}
          keyboardAppearance={theme.dark ? "dark" : "light"}
          selectionColor={theme.accent}
          placeholderTextColor={theme.placeholder}
          style={[styles.input, { color: theme.text, backgroundColor: theme.input.background, borderColor: theme.input.border }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          aria-disabled={nothingToSend || sending}
          disabled={nothingToSend || sending}
          onPress={send}
          style={({ pressed }) => [
            styles.round,
            { backgroundColor: theme.primary.background, borderColor: theme.primary.background },
            nothingToSend && styles.idle,
            pressed && styles.pressed,
          ]}>
          {sending ? <ActivityIndicator color={theme.primary.foreground} /> : <Icon name="send" size={20} color={theme.primary.foreground} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingTop: 11,
    paddingBottom: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    fontFamily: FONT_FAMILY.regular,
    fontSize: 16,
    lineHeight: 21,
    textAlignVertical: "center",
  },
  round: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, borderWidth: 1 },
  idle: { opacity: 0.45 },
  reply: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 10, paddingRight: 6, borderRadius: 14, borderWidth: 1 },
  replyBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  replyWords: { flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  small: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
