import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { Watermark } from "@/components/Watermark";
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
      {watermark ? <Watermark text={watermark} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
});
