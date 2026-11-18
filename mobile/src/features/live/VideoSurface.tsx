import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";
import { StyleSheet } from "react-native";

import { LiveKitNative } from "./native";

/** One video track, filling the frame it is put in. On a phone with the installed app. */
export function VideoSurface({ track, mirror }: { track: LocalVideoTrack | RemoteVideoTrack; mirror: boolean }) {
  if (!LiveKitNative) return null;
  const { VideoView } = LiveKitNative;
  return <VideoView videoTrack={track} objectFit="contain" mirror={mirror} style={StyleSheet.absoluteFill} />;
}
