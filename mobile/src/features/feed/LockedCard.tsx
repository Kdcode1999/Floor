import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeContext";

import { lockedTitle } from "./logic";
import type { FeedPost } from "./types";

/**
 * A VIP post, as someone without VIP sees it: that it exists, what kind it is and when it was
 * posted. Nothing from inside the post ever reaches this phone.
 */
export function LockedCard({ post, when }: { post: FeedPost; when: string }) {
  const theme = useTheme();
  return (
    <Card style={styles.card} accessible accessibilityLabel={`${lockedTitle(post)}. For VIP members. ${when}`}>
      <View style={[styles.lock, { backgroundColor: theme.iconTile.background }]}>
        <Icon name="lock" size={18} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <AppText size={16} line={22} weight="semibold" tracking={-0.16} numberOfLines={2}>
          {lockedTitle(post)}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          For VIP members · {when}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingLeft: 14, paddingRight: 22 },
  lock: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21 },
  words: { flex: 1, gap: 2 },
});
