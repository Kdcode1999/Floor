import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeContext";

import { isFinished } from "./logic";

interface LessonPlayerProps {
  /** A signed address for the video, good for a few hours. */
  url: string;
  /** The second to start from. */
  startAt: number;
  /**
   * Plays in a small size, to use less mobile data. Read once, when the player is made: to
   * change it, the screen makes a new player and starts it where this one had got to.
   */
  dataSaver: boolean;
  /** Words shown faintly over the video: the viewer's name. Null shows nothing. */
  watermark: string | null;
  /** Called every few seconds while it plays, and when it ends, with the place it has reached. */
  onProgress: (seconds: number, finished: boolean) => void;
}

/** The size a video is held to with data saver on. Enough to read a chart on a phone. */
const SAVER_SIZE = { width: 640, height: 360 };

/** How often the place in the video is reported, in seconds. */
const REPORT_EVERY = 10;

/** Where the name sits over the video. It moves, so it cannot be cropped out of a recording. */
const SPOTS = [
  { top: "8%", left: "6%" },
  { top: "44%", left: "58%" },
  { top: "76%", left: "10%" },
  { top: "16%", left: "52%" },
  { top: "62%", left: "38%" },
] as const;

/**
 * Plays a lesson's video with the phone's own controls. It cannot be sent to a TV or kept
 * playing in a floating window, both of which would take it outside the app's protection.
 */
export function LessonPlayer({ url, startAt, dataSaver, watermark, onProgress }: LessonPlayerProps) {
  const theme = useTheme();
  const player = useVideoPlayer({ uri: url }, (made) => {
    made.timeUpdateEventInterval = REPORT_EVERY;
    made.allowsExternalPlayback = false;
    made.showNowPlayingNotification = false;
    made.staysActiveInBackground = false;
    made.keepScreenOnWhilePlaying = true;
    made.maxResolution = dataSaver ? SAVER_SIZE : null;
    if (startAt > 0) made.currentTime = startAt;
  });

  // Keep hold of the newest callback without re-subscribing for it.
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    report.current(currentTime, isFinished(currentTime, player.duration));
  });
  useEventListener(player, "playToEnd", () => {
    report.current(player.duration, true);
  });
  // Say where it stopped when the screen closes, so the next visit resumes from there.
  useEffect(
    () => () => {
      try {
        if (player.currentTime > 0) report.current(player.currentTime, isFinished(player.currentTime, player.duration));
      } catch {
        // The player is already gone. The last regular report stands.
      }
    },
    [player],
  );

  const [spot, setSpot] = useState(0);
  useEffect(() => {
    if (!watermark) return;
    const timer = setInterval(() => setSpot((current) => (current + 1) % SPOTS.length), 20_000);
    return () => clearInterval(timer);
  }, [watermark]);

  return (
    <View style={[styles.frame, { backgroundColor: "#000000", borderColor: theme.tile.border }]}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: true }}
        style={StyleSheet.absoluteFill}
      />
      {watermark ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.mark, SPOTS[spot]]}>
          <AppText size={12} line={16} weight="medium" color="rgba(255,255,255,0.38)" numberOfLines={1}>
            {watermark}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  mark: { position: "absolute", maxWidth: "70%" },
});
