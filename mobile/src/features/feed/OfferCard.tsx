import { Linking, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { RichText } from "@/components/RichText";
import { useTheme } from "@/theme/ThemeContext";

import { ManageButton } from "./ManageButton";
import type { FeedPost } from "./types";

/** A deal the mentor pinned to the top of the Feed: a title, a few words and a link. */
export function OfferCard({ post, onManage }: { post: FeedPost; onManage?: () => void }) {
  const theme = useTheme();
  const link = post.linkUrl;

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.pinned}>
          <Icon name="pin" size={14} color={theme.accent} />
          <AppText size={12} line={16} weight="semibold" color={theme.accent}>
            Pinned by your mentor
          </AppText>
        </View>
        {onManage ? <ManageButton onPress={onManage} /> : null}
      </View>
      <View style={styles.words}>
        <AppText accessibilityRole="header" size={16} line={22} weight="semibold" tracking={-0.16}>
          {post.title}
        </AppText>
        {post.body ? <RichText text={post.body} size={14} line={20} color={theme.text2} /> : null}
      </View>
      {link ? (
        <Button
          label={post.linkLabel ?? "Open"}
          kind="ghost"
          size="medium"
          onPress={() => Linking.openURL(link).catch(() => {})}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 16, paddingHorizontal: 22 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  pinned: { flexDirection: "row", alignItems: "center", gap: 6 },
  words: { gap: 4 },
});
