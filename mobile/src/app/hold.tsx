import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { holdFor, type Hold } from "@/auth/stage";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { missingSettings } from "@/lib/env";
import { useSpace, type SpaceEntry } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

const WORDS: Record<Exclude<Hold, "loading" | "choose">, { title: string; text: string }> = {
  elsewhere: {
    title: "Signed in on another phone",
    text: "Floor works on one phone at a time, and your account is now open on another one.",
  },
  device_limit: {
    title: "This account can't move again yet",
    text: "An account can move to a new phone twice in 30 days. Yours has, so it stays on the other phone for now.",
  },
  trouble: {
    title: "Can't reach Floor",
    text: "Check your internet connection, then try again.",
  },
  space_trouble: {
    title: "Couldn't load your space",
    text: "Check your internet connection, then try again.",
  },
  none: {
    title: "You're not in a space yet",
    text: "Open your mentor's join link to join their space, then come back and check again.",
  },
};

/**
 * Shown whenever someone is signed in but the app cannot open yet: the login moved to another
 * phone, the phone limit was reached, the server cannot be reached, they are in no space, or
 * they are in several and have to pick one. Also the short wait while things load.
 */
export default function HoldScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const space = useSpace();
  const [busy, setBusy] = useState(false);

  // A release build made without its Supabase settings. Say so plainly instead of showing samples.
  if (missingSettings) {
    return (
      <Notice title="This build is missing its settings" text="It was made without the details that connect it to Floor." />
    );
  }

  const hold = holdFor(auth.status, space.status);

  if (hold === "loading") {
    return (
      <Screen hasNav={false}>
        <View style={styles.waiting}>
          <ActivityIndicator accessibilityLabel="Loading" color={theme.text} />
        </View>
      </Screen>
    );
  }

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const signOut = <Button label="Sign out" kind="ghost" onPress={auth.signOut} />;

  if (hold === "choose") {
    return (
      <Screen hasNav={false} gap={12}>
        <View style={styles.top}>
          <AppText accessibilityRole="header" size={28} line={34} weight="bold" tracking={-0.6}>
            Choose a space
          </AppText>
          <AppText size={15} line={22} color={theme.text2}>
            You belong to more than one.
          </AppText>
        </View>
        {space.entries.map((entry) => (
          <SpaceRow key={entry.id} entry={entry} onPress={() => space.choose(entry.id)} />
        ))}
        <View style={styles.below}>{signOut}</View>
      </Screen>
    );
  }

  const words = WORDS[hold];
  const detail = hold === "trouble" ? auth.detail : hold === "space_trouble" ? space.detail : null;

  return (
    <Notice title={words.title} text={words.text} detail={detail}>
      {hold === "elsewhere" ? (
        <Button label="Use this phone" busy={busy} onPress={run(auth.useThisPhone)} />
      ) : null}
      {hold === "trouble" ? <Button label="Try again" busy={busy} onPress={run(auth.useThisPhone)} /> : null}
      {hold === "space_trouble" ? <Button label="Try again" onPress={space.reload} /> : null}
      {hold === "none" ? <Button label="Check again" onPress={space.reload} /> : null}
      {signOut}
    </Notice>
  );
}

interface NoticeProps {
  title: string;
  text: string;
  /** The server's own words, small, for whoever has to fix it. */
  detail?: string | null;
  /** The buttons. */
  children?: React.ReactNode;
}

function Notice({ title, text, detail, children }: NoticeProps) {
  const theme = useTheme();
  return (
    <Screen hasNav={false}>
      <View style={styles.top}>
        <AppText size={17} line={22} weight="bold" tracking={-0.3} color={theme.text2}>
          Floor
        </AppText>
      </View>
      <Card radius={28} style={styles.card}>
        <View style={styles.words}>
          <AppText accessibilityRole="header" size={24} line={30} weight="bold" tracking={-0.5}>
            {title}
          </AppText>
          <AppText size={15} line={22} color={theme.text2}>
            {text}
          </AppText>
          {detail ? (
            <AppText size={12} line={16} color={theme.text3}>
              {detail}
            </AppText>
          ) : null}
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </Card>
    </Screen>
  );
}

function SpaceRow({ entry, onPress }: { entry: SpaceEntry; onPress: () => void }) {
  const theme = useTheme();
  const place = entry.role === "mentor" ? "Your space" : entry.role === "admin" ? "You're an admin" : "Member";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}. ${place}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card.background, borderColor: theme.card.border, boxShadow: theme.card.shadow },
        pressed && styles.pressed,
      ]}>
      <Avatar name={entry.name} size={44} />
      <View style={styles.rowWords}>
        <AppText size={16} line={22} weight="semibold" numberOfLines={1}>
          {entry.name}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          {place}
        </AppText>
      </View>
      <Icon name="chevronRight" size={18} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  waiting: { paddingTop: 160, alignItems: "center" },
  top: { gap: 4, paddingTop: 44, paddingHorizontal: 6 },
  card: { gap: 20, padding: 22 },
  words: { gap: 8 },
  actions: { gap: 10 },
  below: { paddingTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingRight: 18,
    borderRadius: 24,
    borderWidth: 1,
  },
  rowWords: { flex: 1, gap: 2 },
  pressed: { opacity: 0.8 },
});
