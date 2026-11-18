import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet } from "react-native";

/**
 * What the live room shows in the sample space: the short film that comes with the app, going
 * round and round where the mentor's camera and screen would be. It fills the frame it is put in.
 */
export function SampleStage({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (made) => {
    made.loop = true;
    // The film has no sound. Saying so lets it start by itself in a browser too.
    made.muted = true;
    made.allowsExternalPlayback = false;
    made.showNowPlayingNotification = false;
    made.staysActiveInBackground = false;
    made.play();
  });

  return <VideoView player={player} nativeControls={false} contentFit="contain" allowsPictureInPicture={false} style={StyleSheet.absoluteFill} />;
}
