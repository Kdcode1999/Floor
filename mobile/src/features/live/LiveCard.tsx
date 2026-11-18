import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { useTheme } from "@/theme/ThemeContext";

import { liveFor } from "./logic";
import type { LiveClass } from "./types";

interface LiveCardProps {
  session: LiveClass;
  now: number;
  /** What the button says. Members join, the mentor and admins open the room. */
  action: string;
  onJoin: () => void;
}

/**
 * The large card shown while the mentor is live: at the top of the Feed and of the schedule.
 * Someone without VIP sees that the session is on and that it is for VIP members.
 */
export function LiveCard({ session, now, action, onJoin }: LiveCardProps) {
  const theme = useTheme();

  return (
    <Card radius={28} style={styles.card}>
      <Pill label="Live now" leading={<View style={[styles.dot, { backgroundColor: theme.liveDot }]} />} style={styles.tag} />
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={26} line={32} weight="bold" tracking={-0.7}>
          {session.title}
        </AppText>
        <AppText size={15} line={22} color={theme.text2}>
          {liveFor(session.startedAt, now)}
        </AppText>
      </View>
      {session.locked ? (
        <View style={styles.locked}>
          <Icon name="lock" size={16} color={theme.text3} />
          <AppText size={14} line={20} color={theme.text3}>
            For VIP members
          </AppText>
        </View>
      ) : (
        <Button label={action} onPress={onJoin} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18, padding: 22 },
  tag: { alignSelf: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  words: { gap: 6 },
  locked: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
});
