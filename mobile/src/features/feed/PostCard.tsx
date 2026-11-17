import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { RichText } from "@/components/RichText";
import { TextLink } from "@/components/TextLink";
import { useTheme } from "@/theme/ThemeContext";

import { Embed } from "./Embed";
import { ManageButton } from "./ManageButton";
import { PostPicture } from "./PostPicture";
import type { FeedPost, LessonItem } from "./types";

/** A long post is cut off after this many letters until "Read more" is tapped. */
const FOLD = 420;

interface PostCardProps {
  post: FeedPost;
  when: string;
  /** Says who can see it. Shown to the mentor and admins only. */
  audience?: string;
  onManage?: () => void;
}

/** A written post from the mentor: a title, the words, and maybe a picture or a video. */
export function PostCard({ post, when, audience, onManage }: PostCardProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const body = post.body ?? "";
  const long = body.length > FOLD;
  const shown = long && !open ? `${body.slice(0, FOLD).trimEnd()}…` : body;
  const meta = ["Post", audience, when, post.edited ? "Edited" : null].filter(Boolean).join(" · ");

  return (
    <Card style={styles.post}>
      <View style={styles.top}>
        <View style={styles.words}>
          {post.title ? <Title>{post.title}</Title> : null}
          <AppText size={13} line={18} color={theme.text3}>
            {meta}
          </AppText>
        </View>
        {onManage ? <ManageButton onPress={onManage} /> : null}
      </View>
      {shown ? <RichText text={shown} size={15} line={22} color={theme.text2} selectable /> : null}
      {long ? (
        <View style={styles.more}>
          <TextLink label={open ? "Show less" : "Read more"} onPress={() => setOpen(!open)} />
        </View>
      ) : null}
      {post.imagePath && post.imageWidth && post.imageHeight ? (
        <PostPicture path={post.imagePath} width={post.imageWidth} height={post.imageHeight} />
      ) : null}
      {post.embedUrl ? <Embed link={post.embedUrl} /> : null}
    </Card>
  );
}

/** A note in the Feed that a new lesson is in Learn. */
export function LessonCard({ item }: { item: LessonItem }) {
  const theme = useTheme();
  return (
    <Card style={styles.lesson}>
      <View style={[styles.play, { backgroundColor: theme.iconTile.background }]}>
        <Icon name="play" size={16} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <Title>{item.title}</Title>
        <AppText size={13} line={18} color={theme.text3}>
          New lesson · {item.when}
        </AppText>
      </View>
    </Card>
  );
}

function Title({ children }: { children: string }) {
  return (
    <AppText accessibilityRole="header" size={16} line={22} weight="semibold" tracking={-0.16}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  post: { gap: 10, paddingVertical: 16, paddingHorizontal: 22 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  words: { flex: 1, gap: 2 },
  more: { alignItems: "flex-start", marginVertical: -10, marginLeft: -12 },
  lesson: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 22,
  },
  play: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
});
