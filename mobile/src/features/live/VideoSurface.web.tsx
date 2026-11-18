import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";
import { useEffect, useRef } from "react";

/** One video track, filling the frame it is put in. In a browser, and the iPhone web app. */
export function VideoSurface({ track, mirror }: { track: LocalVideoTrack | RemoteVideoTrack; mirror: boolean }) {
  const element = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track]);
  return (
    <video
      ref={element}
      autoPlay
      playsInline
      muted
      aria-label="Live video"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", transform: mirror ? "scaleX(-1)" : undefined }}
    />
  );
}
