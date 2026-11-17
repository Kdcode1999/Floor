import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme/ThemeContext";

import { pictureUrl } from "./api";

interface PostPictureProps {
  /** Where the picture is in the "posts" file store. */
  path: string;
  width: number;
  height: number;
}

/**
 * The picture in a post. It keeps its own shape, within limits, so a tall screenshot does not
 * fill the whole Feed. Tapping it opens it full screen, where it can be zoomed.
 */
export function PostPicture({ path, width, height }: PostPictureProps) {
  const theme = useTheme();
  const router = useRouter();
  const client = supabase;
  // The address is short-lived and only given to someone who may open the post.
  const url = useLoad(client ? () => pictureUrl(client, path) : null, `picture:${path}`);
  const shape = Math.min(Math.max(width / height, 0.8), 2.4);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Picture. Open it full screen"
      disabled={!url.data}
      onPress={() => router.push({ pathname: "/picture", params: { path, shape: String(width / height) } })}
      style={[styles.frame, { aspectRatio: shape, backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
      {url.data ? (
        // The cache key is the file's place, so the picture is kept even as its address changes.
        <Image source={{ uri: url.data, cacheKey: path }} contentFit="cover" transition={150} style={StyleSheet.absoluteFill} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
});
