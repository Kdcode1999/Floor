import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { database } from "@/lib/database";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme/ThemeContext";

import { pictureUrl } from "./api";

interface ChatPictureProps {
  /** Where the picture is in the "chat" file store. */
  path: string;
  width: number;
  height: number;
}

/** A picture in a message. Tapping it opens it full screen, where it can be zoomed. */
export function ChatPicture({ path, width, height }: ChatPictureProps) {
  const theme = useTheme();
  const router = useRouter();
  // The address is short-lived and only given to someone who can open the group.
  const url = useLoad(() => pictureUrl(database, path), `chat-picture:${path}`);
  const shape = Math.min(Math.max(width / height, 0.75), 2);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Picture. Open it full screen"
      disabled={!url.data}
      onPress={() => router.push({ pathname: "/picture", params: { path, shape: String(width / height), store: "chat" } })}
      style={[styles.frame, { aspectRatio: shape, backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
      {url.data ? <Image source={{ uri: url.data, cacheKey: path }} contentFit="cover" transition={150} style={StyleSheet.absoluteFill} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: 232, maxWidth: "100%", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
});
