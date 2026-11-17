import * as Application from "expo-application";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { TextLink } from "@/components/TextLink";
import { SITE_URL } from "@/lib/env";
import { useTheme } from "@/theme/ThemeContext";

import { embedPage } from "./embedPage";
import { embedSource, SOURCE_NAME } from "./logic";

// YouTube only plays inside a page that says where it is. An app has no web address of its
// own, so it gives its store id as one, which is what YouTube asks apps to do.
const HOME = Application.applicationId ? `https://${Application.applicationId}` : SITE_URL || "https://floor.app";

/**
 * A video or post from YouTube, X, Instagram or Facebook, shown inside a free post with the
 * site's own player. Under it is a link that opens the original.
 */
export function Embed({ link }: { link: string }) {
  const theme = useTheme();
  const source = embedSource(link);
  // A video keeps its 16:9 shape. Posts report their own height once they have loaded.
  const [height, setHeight] = useState(360);
  if (!source) return null;

  return (
    <View style={styles.block}>
      <View
        style={[
          styles.frame,
          { backgroundColor: theme.tile.background, borderColor: theme.tile.border },
          source === "youtube" ? styles.video : { height },
        ]}>
        <WebView
          originWhitelist={["*"]}
          source={{ html: embedPage(source, link, theme.dark), baseUrl: HOME }}
          style={styles.web}
          scrollEnabled={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            const reported = Number(event.nativeEvent.data);
            if (reported > 0) setHeight(Math.min(Math.max(reported, 160), 900));
          }}
          // A tap on a link inside the embed opens the phone's browser, not this small frame.
          onShouldStartLoadWithRequest={(request) => {
            const inside = request.url === "about:blank" || request.url.startsWith(HOME) || !request.isTopFrame;
            if (!inside) Linking.openURL(request.url).catch(() => {});
            return inside;
          }}
        />
      </View>
      <View style={styles.open}>
        <TextLink label={`Open on ${SOURCE_NAME[source]}`} onPress={() => Linking.openURL(link).catch(() => {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 0 },
  frame: { width: "100%", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  video: { aspectRatio: 16 / 9 },
  web: { flex: 1, backgroundColor: "transparent" },
  open: { alignItems: "flex-start", marginLeft: -12, marginBottom: -8 },
});
