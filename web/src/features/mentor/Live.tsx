"use client";

import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { callServer, kickJobs, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

import type { StaffSpace } from "./MentorApp";

interface ScheduleRow {
  id: string;
  title: string;
  starts_at: string;
  state: "live" | "scheduled" | "ended";
  started_at: string | null;
}

interface Pass {
  title: string;
  groupId: string;
  isHost: boolean;
  url?: string;
  token?: string;
}

interface ChatLine {
  id: string;
  name: string;
  body: string | null;
  created_at: string;
  deleted: boolean;
}

/** How often the broadcaster's page says it is still there. */
const BEAT_MS = 30_000;
/** How often the session's chat is read again. */
const CHAT_MS = 4_000;

const WORDS: Record<string, string> = {
  not_allowed: "Only the mentor and admins can do that.",
  already_live: "A session is already live in this space.",
  session_not_found: "That class is no longer on the schedule.",
  space_unavailable: "This space cannot go live right now.",
  not_live: "This session is not live any more.",
  signed_out: "You have been signed out. Sign in again.",
  offline: "You seem to be offline. Check your connection and try again.",
};
const say = (code: string | undefined) =>
  (code && WORDS[code]) || "That didn't work. Try again.";

/**
 * Live, on a laptop: go live, or start a class from the schedule, and broadcast with the camera,
 * the microphone and the screen, so a chart can be shared. The session's chat runs beside it.
 */
export function Live({ space }: { space: StaffSpace }) {
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [round, setRound] = useState(0);
  const [title, setTitle] = useState("");
  const [record, setRecord] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let current = true;
    supabase
      .rpc("live_schedule", { p_space: space.id })
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setError(failed.message);
        else setSchedule((data ?? []) as ScheduleRow[]);
      });
    return () => {
      current = false;
    };
  }, [space.id, round]);

  const live = schedule?.find((each) => each.state === "live") ?? null;
  const classes = (schedule ?? [])
    .filter((each) => each.state === "scheduled")
    .slice(0, 5);

  const start = async (args: {
    p_title?: string;
    p_session?: string;
    p_record?: boolean;
  }) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.rpc("live_start", {
      p_space: space.id,
      ...args,
    });
    setBusy(false);
    if (failed)
      return setError(
        say(failed.code === "42501" ? "not_allowed" : failed.message),
      );
    kickJobs();
    setTitle("");
    setRound((count) => count + 1);
  };

  if (!schedule) {
    return (
      <Card>
        <p className="body" role="status">
          {error ?? "One moment…"}
        </p>
      </Card>
    );
  }

  if (live)
    return (
      <Broadcast
        key={live.id}
        spaceId={space.id}
        session={live}
        onDone={() => setRound((count) => count + 1)}
      />
    );

  return (
    <div className="stack">
      <Card>
        <h2 className="h2">Go live now</h2>
        <p className="body">
          VIP members get an alert the moment you start. Share your screen to go
          through a chart.
        </p>
        <Field
          label="What it is about"
          value={title}
          maxLength={120}
          placeholder="London open, live"
          onChange={(event) => setTitle(event.target.value)}
        />
        <label className="small">
          <input
            type="checkbox"
            checked={record}
            onChange={(event) => setRecord(event.target.checked)}
          />{" "}
          Keep a recording as a lesson
        </label>
        <Button
          busy={busy}
          disabled={title.trim() === ""}
          onClick={() =>
            void start({ p_title: title.trim(), p_record: record })
          }
        >
          Go live
        </Button>
        {error ? (
          <p className="small error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {classes.length > 0 ? (
        <Card>
          <h2 className="h2">Classes on the schedule</h2>
          <div className="rows">
            {classes.map((each) => (
              <div className="row" key={each.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="body strong clip">{each.title}</p>
                  <p className="small">
                    {new Date(each.starts_at).toLocaleString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Button
                  kind="ghost"
                  busy={busy}
                  onClick={() => void start({ p_session: each.id })}
                >
                  Start
                </Button>
              </div>
            ))}
          </div>
          <p className="small">
            Classes are added and changed in the Floor app, under Manage, Go
            live.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/** The session that is on: the broadcast itself, its controls and its chat. */
function Broadcast({
  spaceId,
  session,
  onDone,
}: {
  spaceId: string;
  session: ScheduleRow;
  onDone: () => void;
}) {
  const [pass, setPass] = useState<Pass | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    callServer<Pass>("/api/live/join", { session: session.id }).then(
      (answer) => current && setPass(answer),
      (failed: unknown) =>
        current &&
        setProblem(
          say(failed instanceof ServerError ? failed.code : undefined),
        ),
    );
    return () => {
      current = false;
    };
  }, [session.id, attempt]);

  const takeOver = async () => {
    if (!supabase) return;
    const { error } = await supabase.rpc("live_start", {
      p_space: spaceId,
      p_session: session.id,
    });
    if (error) return setProblem(say(error.message));
    setPass(null);
    setAttempt((count) => count + 1);
  };

  const end = async () => {
    try {
      await callServer("/api/live/end", { session: session.id });
      onDone();
    } catch (failed) {
      setProblem(say(failed instanceof ServerError ? failed.code : undefined));
    }
  };

  return (
    <div className="stack">
      <Card>
        <p className="small strong">● Live now</p>
        <h2 className="h2">{session.title}</h2>
        {problem ? (
          <p className="small error" role="alert">
            {problem}
          </p>
        ) : null}
        {!pass ? (
          <p className="body" role="status">
            Opening the room…
          </p>
        ) : !pass.url || !pass.token ? (
          <p className="body">
            Live video is not set up in this copy of Floor yet. The
            session&apos;s chat works in the app.
          </p>
        ) : pass.isHost ? (
          <Studio
            url={pass.url}
            token={pass.token}
            sessionId={session.id}
            onTakenOver={() => setAttempt((count) => count + 1)}
            onEnded={onDone}
          />
        ) : (
          <>
            <p className="body">
              This session is being broadcast from another phone or laptop.
            </p>
            <Button onClick={() => void takeOver()}>
              Broadcast from this laptop
            </Button>
          </>
        )}
        <Button kind="ghost" onClick={() => void end()}>
          End session
        </Button>
      </Card>
      {pass ? <Chat groupId={pass.groupId} /> : null}
    </div>
  );
}

/** The broadcast: what is sent, what members see of it, and the switches. */
function Studio({
  url,
  token,
  sessionId,
  onTakenOver,
  onEnded,
}: {
  url: string;
  token: string;
  sessionId: string;
  onTakenOver: () => void;
  onEnded: () => void;
}) {
  const room = useRef<Room | null>(null);
  const preview = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<
    "connecting" | "live" | "reconnecting" | "failed"
  >("connecting");
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [screen, setScreen] = useState(false);
  const [others, setOthers] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const made = new Room({ dynacast: true });
    room.current = made;
    let gone = false;

    /** Shows what members see: the screen when it is shared, else the camera. */
    const show = () => {
      if (gone) return;
      setOthers(made.remoteParticipants.size);
      const shared = made.localParticipant.getTrackPublication(
        Track.Source.ScreenShare,
      )?.videoTrack;
      const own = made.localParticipant.getTrackPublication(
        Track.Source.Camera,
      )?.videoTrack;
      const element = preview.current;
      if (!element) return;
      const track = shared ?? own;
      if (track) track.attach(element);
      else element.srcObject = null;
    };

    made
      .on(RoomEvent.LocalTrackPublished, show)
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) setScreen(false);
        show();
      })
      .on(RoomEvent.ParticipantConnected, show)
      .on(RoomEvent.ParticipantDisconnected, show)
      .on(RoomEvent.ConnectionStateChanged, (next) => {
        if (gone) return;
        if (next === ConnectionState.Connected) setState("live");
        else if (
          next === ConnectionState.Reconnecting ||
          next === ConnectionState.SignalReconnecting
        )
          setState("reconnecting");
      });

    (async () => {
      try {
        await made.connect(url, token);
        await made.localParticipant
          .setMicrophoneEnabled(true)
          .catch(() => setMic(false));
        await made.localParticipant
          .setCameraEnabled(true)
          .catch(() => setCamera(false));
        show();
      } catch {
        if (!gone) setState("failed");
      }
    })();

    // Says this laptop is still broadcasting, and learns if the session was ended or taken over.
    const beat = setInterval(async () => {
      if (!supabase) return;
      const { data } = await supabase.rpc("live_heartbeat", {
        p_session: sessionId,
      });
      if (data === "taken_over") onTakenOver();
      else if (data === "ended" || data === "cancelled") onEnded();
    }, BEAT_MS);

    return () => {
      gone = true;
      clearInterval(beat);
      made.disconnect();
      room.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token, sessionId]);

  const flip = async (what: "mic" | "camera" | "screen", on: boolean) => {
    const local = room.current?.localParticipant;
    if (!local) return;
    setProblem(null);
    try {
      if (what === "mic") await local.setMicrophoneEnabled(on);
      if (what === "camera") await local.setCameraEnabled(on);
      if (what === "screen")
        await local.setScreenShareEnabled(on, { audio: false });
      (what === "mic" ? setMic : what === "camera" ? setCamera : setScreen)(on);
    } catch {
      setProblem(
        what === "screen"
          ? "The screen was not shared. Your browser may have asked for permission."
          : "Your browser did not allow that. Check its permissions for this page.",
      );
    }
  };

  return (
    <div className="stack">
      <video
        ref={preview}
        autoPlay
        playsInline
        muted
        aria-label="What your members see"
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          background: "#000",
          borderRadius: 16,
        }}
      />
      <p className="small" role="status">
        {state === "connecting"
          ? "Connecting…"
          : state === "reconnecting"
            ? "Reconnecting…"
            : state === "failed"
              ? "The video could not connect."
              : others === 0
                ? "Nobody is watching yet"
                : `${others} watching`}
      </p>
      <div className="choices">
        <button
          type="button"
          className={mic ? "choice chosen" : "choice"}
          aria-pressed={mic}
          onClick={() => void flip("mic", !mic)}
        >
          {mic ? "Microphone on" : "Microphone off"}
        </button>
        <button
          type="button"
          className={camera ? "choice chosen" : "choice"}
          aria-pressed={camera}
          onClick={() => void flip("camera", !camera)}
        >
          {camera ? "Camera on" : "Camera off"}
        </button>
        <button
          type="button"
          className={screen ? "choice chosen" : "choice"}
          aria-pressed={screen}
          onClick={() => void flip("screen", !screen)}
        >
          {screen ? "Stop sharing" : "Share screen"}
        </button>
      </div>
      {problem ? (
        <p className="small error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** The session's chat, read beside the broadcast. Members write in it from the app. */
function Chat({ groupId }: { groupId: string }) {
  const [lines, setLines] = useState<ChatLine[]>([]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let current = true;
    const read = () =>
      client
        .rpc("chat_page", { p_group: groupId, p_limit: 30 })
        .then(({ data }) => {
          if (current && data)
            setLines(
              [...(data as ChatLine[])].sort((a, b) =>
                a.created_at.localeCompare(b.created_at),
              ),
            );
        });
    void read();
    const timer = setInterval(() => void read(), CHAT_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [groupId]);

  return (
    <Card>
      <h2 className="h2">Chat</h2>
      {lines.length === 0 ? (
        <p className="small">Nothing yet. Members write here from the app.</p>
      ) : (
        <div className="rows" aria-live="polite">
          {lines.map((line) => (
            <div className="row" key={line.id}>
              <p className="body">
                <span className="strong">{line.name}</span>{" "}
                {line.deleted ? (
                  <span className="small">Message removed</span>
                ) : (
                  line.body
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
