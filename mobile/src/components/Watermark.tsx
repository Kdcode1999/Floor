import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";

/** Where the words sit over the video. They move, so they cannot be cropped out of a recording. */
const SPOTS = [
  { top: "8%", left: "6%" },
  { top: "44%", left: "58%" },
  { top: "76%", left: "10%" },
  { top: "16%", left: "52%" },
  { top: "62%", left: "38%" },
] as const;

/**
 * Words shown faintly over paid video: the viewer's name. Put it inside the video's frame,
 * after the video. It takes no touches and is hidden from screen readers.
 */
export function Watermark({ text }: { text: string }) {
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSpot((current) => (current + 1) % SPOTS.length), 20_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.mark, SPOTS[spot]]}>
      <AppText size={12} line={16} weight="medium" color="rgba(255,255,255,0.38)" numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: "absolute", maxWidth: "70%" },
});
