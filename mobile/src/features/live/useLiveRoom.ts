import { ConnectionState, Room, RoomEvent, Track, type LocalVideoTrack, type RemoteVideoTrack } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { LiveKitNative, prepareNative, releaseNative } from "./native";

export type RoomStatus = "connecting" | "live" | "reconnecting" | "closed" | "failed" | "unsupported";

export interface LiveRoom {
  status: RoomStatus;
  /** What to show: the broadcaster's screen if shared, else their camera. Null while there is none. */
  video: LocalVideoTrack | RemoteVideoTrack | null;
  /** True when the video shown is this phone's own camera, which reads better mirrored. */
  ownCamera: boolean;
  /** How many others are in the room. */
  others: number;
  /** A browser that will not play sound until it is tapped. */
  needsTap: boolean;
  startAudio: () => void;
  /** The broadcaster's own microphone and camera. */
  micOn: boolean;
  cameraOn: boolean;
  setMic: (on: boolean) => void;
  setCamera: (on: boolean) => void;
}

interface Options {
  url: string;
  token: string;
  /** Sends this phone's camera and microphone. Only the broadcaster's pass allows it. */
  broadcast: boolean;
  /** Takes sound only, to save data. */
  audioOnly: boolean;
}

/** True where live video can run: the installed app, or a browser. Not Expo Go. */
export const liveVideoHere = Platform.OS === "web" || LiveKitNative !== null;

/** Joins a session's video room and keeps up with what is in it. Leaves when the screen goes. */
export function useLiveRoom({ url, token, broadcast, audioOnly }: Options): LiveRoom {
  const room = useRef<Room | null>(null);
  const [status, setStatus] = useState<RoomStatus>(liveVideoHere ? "connecting" : "unsupported");
  const [video, setVideo] = useState<LocalVideoTrack | RemoteVideoTrack | null>(null);
  const [ownCamera, setOwnCamera] = useState(false);
  const [others, setOthers] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const [micOn, setMicOn] = useState(broadcast);
  const [cameraOn, setCameraOn] = useState(broadcast);
  const audioOnlyNow = useRef(audioOnly);

  useEffect(() => {
    if (!liveVideoHere) return;
    let gone = false;
    const made = new Room({ adaptiveStream: true, dynacast: true });
    room.current = made;

    /** Picks what to show from what is in the room now. */
    const look = () => {
      if (gone) return;
      setOthers(made.remoteParticipants.size);
      if (broadcast) {
        const own = made.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
        setVideo(own ?? null);
        setOwnCamera(Boolean(own));
        return;
      }
      let screen: RemoteVideoTrack | null = null;
      let camera: RemoteVideoTrack | null = null;
      for (const person of made.remoteParticipants.values()) {
        for (const shared of person.videoTrackPublications.values()) {
          // Sound only: the pictures are not fetched at all.
          if (shared.isSubscribed === audioOnlyNow.current) shared.setSubscribed(!audioOnlyNow.current);
          const track = shared.videoTrack as RemoteVideoTrack | undefined;
          if (!track) continue;
          if (shared.source === Track.Source.ScreenShare) screen = track;
          else camera ??= track;
        }
      }
      setVideo(audioOnlyNow.current ? null : (screen ?? camera));
      setOwnCamera(false);
    };

    // A browser plays sound only through an element on the page. A phone plays it by itself.
    const hear = (track: Track) => {
      if (Platform.OS !== "web" || track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.setAttribute("data-live-sound", "");
      document.body.appendChild(element);
    };
    const unhear = (track: Track) => {
      if (Platform.OS !== "web" || track.kind !== Track.Kind.Audio) return;
      for (const element of track.detach()) element.remove();
    };

    made
      .on(RoomEvent.TrackSubscribed, (track) => {
        hear(track);
        look();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        unhear(track);
        look();
      })
      .on(RoomEvent.TrackPublished, look)
      .on(RoomEvent.TrackUnpublished, look)
      .on(RoomEvent.LocalTrackPublished, look)
      .on(RoomEvent.LocalTrackUnpublished, look)
      .on(RoomEvent.ParticipantConnected, look)
      .on(RoomEvent.ParticipantDisconnected, look)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => !gone && setNeedsTap(!made.canPlaybackAudio))
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (gone) return;
        if (state === ConnectionState.Connected) setStatus("live");
        else if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) setStatus("reconnecting");
        else if (state === ConnectionState.Disconnected) setStatus("closed");
      });

    (async () => {
      try {
        await prepareNative();
        await made.connect(url, token, { autoSubscribe: true });
        if (broadcast) {
          await made.localParticipant.setMicrophoneEnabled(true);
          await made.localParticipant.setCameraEnabled(true);
        }
        if (!gone) {
          setNeedsTap(!made.canPlaybackAudio);
          look();
        }
      } catch {
        if (!gone) setStatus("failed");
      }
    })();

    return () => {
      gone = true;
      room.current = null;
      made.disconnect();
      releaseNative();
    };
  }, [url, token, broadcast]);

  // Turning the data saver on or off fetches the pictures again, or stops them.
  useEffect(() => {
    audioOnlyNow.current = audioOnly;
    const made = room.current;
    if (!made || broadcast) return;
    for (const person of made.remoteParticipants.values()) {
      for (const shared of person.videoTrackPublications.values()) shared.setSubscribed(!audioOnly);
    }
  }, [audioOnly, broadcast]);

  return {
    status,
    video: audioOnly && !broadcast ? null : video,
    ownCamera,
    others,
    needsTap,
    startAudio: () => {
      room.current?.startAudio().then(() => setNeedsTap(false), () => {});
    },
    micOn,
    cameraOn,
    setMic: (on) => {
      setMicOn(on);
      room.current?.localParticipant.setMicrophoneEnabled(on).catch(() => setMicOn(!on));
    },
    setCamera: (on) => {
      setCameraOn(on);
      room.current?.localParticipant
        .setCameraEnabled(on)
        .then(() => {
          const own = room.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
          setVideo(on ? (own ?? null) : null);
        })
        .catch(() => setCameraOn(!on));
    },
  };
}
