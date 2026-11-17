import { createElement } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { TextLink } from "@/components/TextLink";
import { useTheme } from "@/theme/ThemeContext";

import { youtubePlayer } from "./embedPage";
import { embedSource, SOURCE_NAME } from "./logic";

/**
 * The web build's version of an embed, used only for checking screens. A YouTube video plays
 * in place. The other sites are shown as a link: their embed code needs a real phone.
 */
export function Embed({ link }: { link: string }) {
  const theme = useTheme();
  const source = embedSource(link);
  if (!source) return null;
  const player = source === "youtube" ? youtubePlayer(link) : null;

  return (
    <View>
      {player ? (
        <View style={[styles.frame, { backgroundColor: theme.tile.background, borderColor: theme.tile.border }]}>
          {createElement("iframe", {
            src: player,
            title: "YouTube video",
            allowFullScreen: true,
            referrerPolicy: "strict-origin-when-cross-origin",
            style: { width: "100%", height: "100%", border: 0 },
          })}
        </View>
      ) : null}
      <View style={styles.open}>
        <TextLink label={`Open on ${SOURCE_NAME[source]}`} onPress={() => Linking.openURL(link).catch(() => {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  open: { alignItems: "flex-start", marginLeft: -12, marginBottom: -8 },
});
