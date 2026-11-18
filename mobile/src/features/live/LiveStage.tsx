import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Watermark } from "@/components/Watermark";
import { useTheme } from "@/theme/ThemeContext";

import { watching } from "./logic";
import { useLiveRoom } from "./useLiveRoom";
import { VideoSurface } from "./VideoSurface";

interface LiveStageProps {
  url: string;
  token: string;
  /** This phone sends its camera and microphone. */
  broadcast: boolean;
  /** Sound only, to save data. Viewers only. */
  audioOnly: boolean;
  onAudioOnly: (on: boolean) => void;
  /** The viewer's name, shown faintly over the video. */
  watermark: string | null;
  /** Asks for a fresh pass, after the connection failed. */
  onRetry: () => void;
}

/** The session's video, with what the broadcaster and the viewer can change under it. */
export function LiveStage({ url, token, broadcast, audioOnly, onAudioOnly, watermark, onRetry }: LiveStageProps) {
  const theme = useTheme();
  const live = useLiveRoom({ url, token, broadcast, audioOnly });

  let words: string | null = null;
  if (live.status === "unsupported") words = "Live video needs the installed Floor app. It does not play in Expo Go.";
  else if (live.status === "connecting") words = "Connecting…";
  else if (live.status === "failed") words = "The video could not connect.";
  else if (live.status === "closed") words = "The video has stopped.";
  else if (!live.video) {
    if (broadcast) words = live.cameraOn ? "Starting your camera…" : "Your camera is off. Members hear you.";
    else if (audioOnly) words = "Sound only, to save data.";
    else words = "Waiting for the mentor's video.";
  }

  return (
    <>
      <View style={[styles.frame, { borderColor: theme.tile.border }]}>
        {live.video && live.status !== "closed" ? <VideoSurface track={live.video} mirror={live.ownCamera} /> : null}
        {words ? (
          <View style={styles.centered}>
            <AppText size={14} line={20} color="rgba(255,255,255,0.8)" style={styles.center}>
              {words}
            </AppText>
            {live.status === "failed" || live.status === "closed" ? <Button label="Try again" size="medium" kind="ghost" onPress={onRetry} /> : null}
          </View>
        ) : null}
        {live.status === "reconnecting" ? (
          <View style={styles.badge}>
            <AppText size={12} line={16} weight="medium" color="#FFFFFF">
              Reconnecting…
            </AppText>
          </View>
        ) : null}
        {live.needsTap && !broadcast ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Tap to hear" onPress={live.startAudio} style={styles.tap}>
            <AppText size={14} line={20} weight="semibold" color="#FFFFFF">
              Tap to hear
            </AppText>
          </Pressable>
        ) : null}
        {watermark && live.video ? <Watermark text={watermark} /> : null}
      </View>
      {live.status === "live" || live.status === "reconnecting" ? (
        <View style={styles.row}>
          {broadcast ? (
            <>
              <Toggle label="Microphone" on={live.micOn} onChange={live.setMic} />
              <Toggle label="Camera" on={live.cameraOn} onChange={live.setCamera} />
            </>
          ) : (
            <Toggle label="Sound only" on={audioOnly} onChange={onAudioOnly} />
          )}
          {broadcast ? (
            <AppText size={13} line={18} color={theme.text2} style={styles.count}>
              {watching(live.others)}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** A small switch in a pill: on is filled. */
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={on}
      onPress={() => onChange(!on)}
      style={({ pressed }) => [
        styles.toggle,
        on
          ? { backgroundColor: theme.primary.background, borderColor: theme.primary.background }
          : { backgroundColor: theme.chip.background, borderColor: theme.chip.border },
        pressed && styles.pressed,
      ]}>
      <AppText size={13} line={18} weight="semibold" color={on ? theme.primary.foreground : theme.text}>
        {on ? `${label} on` : `${label} off`}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 20, borderWidth: 1, overflow: "hidden", backgroundColor: "#000000" },
  centered: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 10, padding: 20 },
  center: { textAlign: "center" },
  badge: { position: "absolute", top: 10, left: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.6)" },
  tap: { position: "absolute", bottom: 12, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.7)" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  toggle: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  pressed: { opacity: 0.7 },
  count: { marginLeft: "auto", paddingRight: 6 },
});
