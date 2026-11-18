import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { TextLink } from "@/components/TextLink";
import { useTheme } from "@/theme/ThemeContext";

import { choiceLabel, messageChoices, MUTE_CHOICES, type MessageChoice } from "./logic";
import type { ChatRole, Message } from "./types";

/** What the person decided to do. Blocking and deleting arrive here only once confirmed. */
export type MessageAction =
  | { kind: "reply" | "copy" | "report" | "reportSpace" | "block" | "delete" | "member" }
  | { kind: "mute"; hours: number };

interface MessageActionsProps {
  /** The message the choices are for. */
  message: Message;
  /** The place in the space of the person looking. */
  viewer: ChatRole;
  /** False where the person may not write, so Reply is left out. */
  canReply: boolean;
  onPick: (action: MessageAction) => void;
  onClose: () => void;
}

/**
 * What can be done with a message, as a sheet from the bottom of the screen. Blocking, muting
 * and deleting ask once more on the same sheet before anything happens.
 *
 * Give it `key={message.id}` so it starts over for each message.
 */
export function MessageActions({ message, viewer, canReply, onPick, onClose }: MessageActionsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [asking, setAsking] = useState<"block" | "delete" | "mute" | null>(null);

  const choices = messageChoices(message, viewer, canReply);
  const choose = (choice: MessageChoice) => {
    if (choice === "block" || choice === "delete" || choice === "mute") setAsking(choice);
    else onPick({ kind: choice });
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.dim} onPress={onClose} />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { paddingBottom: insets.bottom + 12, backgroundColor: theme.background, borderColor: theme.card.border }]}>
        {/* The sheet is solid, so the conversation does not show through it, with the card's tint on top. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: theme.card.background }]} />
        <AppText size={13} line={18} color={theme.text3} numberOfLines={2} style={styles.about}>
          {message.mine ? "You" : message.name}: {message.body ?? "Picture"}
        </AppText>

        {asking === "block" ? (
          <View style={styles.ask}>
            <AppText size={15} line={21} color={theme.text2}>
              Block {message.name}? You will stop seeing their messages in every group. You can undo this from your Account.
            </AppText>
            <View style={styles.pair}>
              <Button label="Block" size="medium" style={styles.half} onPress={() => onPick({ kind: "block" })} />
              <Button label="Cancel" kind="ghost" size="medium" style={styles.half} onPress={onClose} />
            </View>
          </View>
        ) : asking === "delete" ? (
          <View style={styles.ask}>
            <AppText size={15} line={21} color={theme.text2}>
              {message.mine ? "Delete this message? It goes for everyone." : `Delete ${message.name}'s message for everyone?`} It cannot be brought back.
            </AppText>
            <View style={styles.pair}>
              <Button label="Yes, delete" size="medium" style={styles.half} onPress={() => onPick({ kind: "delete" })} />
              <Button label="Keep it" kind="ghost" size="medium" style={styles.half} onPress={onClose} />
            </View>
          </View>
        ) : asking === "mute" ? (
          <View style={styles.ask}>
            <AppText size={15} line={21} color={theme.text2}>
              Mute {message.name}? They can still read, but cannot write in any group until it ends.
            </AppText>
            <View style={styles.pair}>
              {MUTE_CHOICES.map((choice) => (
                <Button
                  key={choice.hours}
                  label={choice.label}
                  kind="ghost"
                  size="medium"
                  style={styles.half}
                  onPress={() => onPick({ kind: "mute", hours: choice.hours })}
                />
              ))}
            </View>
            <View style={styles.links}>
              <TextLink label={`Open ${message.name} in Members`} onPress={() => onPick({ kind: "member" })} />
              <TextLink label="Cancel" onPress={onClose} />
            </View>
          </View>
        ) : (
          <>
            {choices.map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityLabel={choiceLabel(choice, message)}
                onPress={() => choose(choice)}
                style={({ pressed }) => [styles.action, { borderTopColor: theme.divider }, pressed && styles.pressed]}>
                <AppText size={16} line={22} weight="medium" color={choice === "delete" ? theme.error : theme.text}>
                  {choiceLabel(choice, message)}
                </AppText>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onClose}
              style={({ pressed }) => [styles.action, { borderTopColor: theme.divider }, pressed && styles.pressed]}>
              <AppText size={16} line={22} weight="semibold" color={theme.text2}>
                Cancel
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  tint: { borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  about: { paddingBottom: 10 },
  action: { minHeight: 52, justifyContent: "center", borderTopWidth: 1 },
  ask: { gap: 14, paddingTop: 4, paddingBottom: 8 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1, paddingHorizontal: 8 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  pressed: { opacity: 0.6 },
});
