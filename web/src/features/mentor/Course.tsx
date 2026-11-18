"use client";

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";

import { Button, Card, Field } from "@/components/ui";
import { groupOutline, learnMessage, lengthText, uploadPercent, VIDEO_WORDS, type OutlineRow } from "@/features/learn/logic";
import type { OutlineLesson, OutlineModule, VideoStatus } from "@/features/learn/types";
import { callServer, kickJobs, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

import type { StaffSpace } from "./MentorApp";

interface UploadTicket {
  videoId: string;
  endpoint: string;
  headers: Record<string, string>;
}

const serverMessage = (error: unknown) => learnMessage({ code: error instanceof ServerError ? error.code : null });

/** How often to ask how a video that is being prepared is doing. */
const ASK_EVERY_MS = 8000;

/** The course, on a laptop: modules, lessons, and each lesson's video. */
export function Course({ space }: { space: StaffSpace }) {
  const [modules, setModules] = useState<OutlineModule[] | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [newModule, setNewModule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Counts up each time the course should be read again. */
  const [round, setRound] = useState(0);
  const reload = () => setRound((count) => count + 1);

  useEffect(() => {
    if (!supabase) return;
    let current = true;
    supabase.rpc("learn_outline", { p_space: space.id }).then(({ data, error: failed }) => {
      if (!current) return;
      if (failed) setTrouble(failed.message);
      else {
        setTrouble(null);
        setModules(groupOutline((data ?? []) as OutlineRow[]));
      }
    });
    return () => {
      current = false;
    };
  }, [space.id, round]);

  // While any video is being prepared, look again now and then.
  const preparing = modules?.some((module) => module.lessons.some((lesson) => lesson.videoStatus === "processing")) ?? false;
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => setRound((count) => count + 1), ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [preparing]);

  const addModule = async () => {
    if (!supabase || newModule.trim() === "") return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.rpc("save_module", { p_space: space.id, p_title: newModule });
    setBusy(false);
    if (failed) return setError(learnMessage({ message: failed.message }));
    setNewModule("");
    reload();
  };

  if (trouble) {
    return (
      <Card>
        <h2 className="h2">The course couldn&apos;t be loaded</h2>
        <p className="small">{trouble}</p>
        <Button onClick={reload}>Try again</Button>
      </Card>
    );
  }
  if (!modules) {
    return (
      <Card>
        <p className="body" role="status">
          One moment…
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <h2 className="h2">Course</h2>
        <p className="body">
          Add lessons and upload their videos here. A video uploads in pieces, so a dropped connection only costs the piece
          that was on its way. Renaming, sorting and deleting are in the Floor app, under Manage.
        </p>
      </Card>

      {modules.map((module) => (
        <ModuleCard key={module.id} module={module} onChanged={reload} />
      ))}

      <Card>
        <form
          noValidate
          className="stack"
          style={{ gap: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            void addModule();
          }}>
          <Field
            label="New module"
            placeholder="The basics"
            maxLength={80}
            value={newModule}
            error={error}
            hint={modules.length === 0 ? "A course is made of modules, and each module holds lessons. Start with a module." : undefined}
            onChange={(event) => {
              setNewModule(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" kind="ghost" busy={busy} disabled={newModule.trim() === ""}>
            Add module
          </Button>
        </form>
      </Card>
    </>
  );
}

function ModuleCard({ module, onChanged }: { module: OutlineModule; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLesson = async () => {
    if (!supabase) return;
    if (title.trim() === "") return setError("Give the lesson a title.");
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.rpc("save_lesson", {
      p_module: module.id,
      p_title: title,
      p_description: notes.trim() || null,
    });
    setBusy(false);
    if (failed) return setError(learnMessage({ message: failed.message }));
    setTitle("");
    setNotes("");
    setAdding(false);
    onChanged();
  };

  return (
    <Card>
      <h2 className="h3">{module.title}</h2>
      {module.lessons.length === 0 ? <p className="body">No lessons in this module yet.</p> : null}
      <div className="rows">
        {module.lessons.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} onChanged={onChanged} />
        ))}
      </div>
      {adding ? (
        <form
          noValidate
          className="stack"
          style={{ gap: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            void addLesson();
          }}>
          <Field
            label="Lesson title"
            placeholder="Stops that make sense"
            maxLength={120}
            autoFocus
            value={title}
            error={error}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
          />
          <div className="field">
            <label className="label" htmlFor={`notes-${module.id}`}>
              Notes
            </label>
            <textarea
              id={`notes-${module.id}`}
              className="input textarea"
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <p className="small">Optional. Shown under the video: a summary, links, homework.</p>
          </div>
          <div className="pair">
            <Button type="submit" busy={busy}>
              Save lesson
            </Button>
            <Button kind="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button kind="ghost" onClick={() => setAdding(true)} aria-label={`Add a lesson to ${module.title}`}>
          Add a lesson
        </Button>
      )}
    </Card>
  );
}

function LessonRow({ lesson, onChanged }: { lesson: OutlineLesson; onChanged: () => void }) {
  const [status, setStatus] = useState<VideoStatus>(lesson.videoStatus ?? "none");
  const [seconds, setSeconds] = useState<number | null>(lesson.duration);
  /** Set while a file is on its way: how much has gone. */
  const [sending, setSending] = useState<{ sent: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<tus.Upload | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // What the server last said wins over what this row guessed, once it arrives.
  const [seen, setSeen] = useState(lesson.videoStatus);
  if (lesson.videoStatus !== seen) {
    setSeen(lesson.videoStatus);
    if (!sending) {
      setStatus(lesson.videoStatus ?? "none");
      setSeconds(lesson.duration);
    }
  }

  // Stop sending if the page is left.
  useEffect(() => () => void upload.current?.abort(), []);

  const send = async (file: File) => {
    setError(null);
    setBusy("upload");
    let ticket: UploadTicket;
    try {
      ticket = await callServer<UploadTicket>("/api/video/upload", { lessonId: lesson.id });
    } catch (problem) {
      setBusy(null);
      return setError(serverMessage(problem));
    }
    setBusy(null);
    setStatus("uploading");
    setSending({ sent: 0, total: file.size });
    upload.current = new tus.Upload(file, {
      endpoint: ticket.endpoint,
      headers: ticket.headers,
      metadata: { filetype: file.type, title: file.name },
      chunkSize: 10 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000],
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => setSending({ sent, total }),
      onSuccess: () => {
        upload.current = null;
        setSending(null);
        setStatus("processing");
        // Tell the server the file has arrived, so it records that the host is preparing it.
        callServer<{ status: VideoStatus; seconds: number | null }>("/api/video/status", { lessonId: lesson.id })
          .catch(() => null)
          .then(onChanged);
      },
      onError: () => {
        upload.current = null;
        setSending(null);
        setError("The upload stopped. Check your connection and choose the video again.");
      },
    });
    upload.current.start();
  };

  // While the host prepares this video, ask the server to check on it. The course reloads on its own timer.
  useEffect(() => {
    if (status !== "processing") return;
    const timer = setInterval(() => {
      callServer<{ status: VideoStatus; seconds: number | null }>("/api/video/status", { lessonId: lesson.id }).then(
        (answer) => {
          setStatus(answer.status);
          setSeconds(answer.seconds);
          if (answer.status !== "processing") onChanged();
        },
        () => {},
      );
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lesson.id]);

  const act = async (name: string, call: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) => {
    setBusy(name);
    setError(null);
    const { error: failed } = await call();
    setBusy(null);
    if (failed) return setError(learnMessage({ message: failed.message }));
    after?.();
    onChanged();
  };

  const client = supabase;
  if (!client) return null;

  const videoLine = sending
    ? `Uploading · ${uploadPercent(sending.sent, sending.total)}`
    : status === "ready" && seconds
      ? `Video ready · ${lengthText(seconds)}`
      : status === "uploading"
        ? "The last upload did not finish. Choose the video again."
        : VIDEO_WORDS[status];

  return (
    <div className="row lesson">
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="strong body clip">{lesson.title}</p>
        <p className="small">{[lesson.published ? "Published" : "Draft", videoLine].join(" · ")}</p>
        {sending ? (
          <progress className="progress" max={sending.total} value={sending.sent} aria-label={`Upload progress for ${lesson.title}`} />
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="actions">
        <input
          ref={picker}
          type="file"
          accept="video/*"
          hidden
          aria-label={`Video file for ${lesson.title}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void send(file);
          }}
        />
        {sending ? (
          <Button
            kind="ghost"
            onClick={() => {
              void upload.current?.abort();
              upload.current = null;
              setSending(null);
            }}>
            Stop
          </Button>
        ) : status === "processing" ? null : (
          <Button kind="ghost" busy={busy === "upload"} onClick={() => picker.current?.click()} aria-label={`${status === "none" ? "Upload a video" : "Replace the video"} for ${lesson.title}`}>
            {status === "none" ? "Upload video" : "Replace video"}
          </Button>
        )}
        {lesson.published ? (
          <Button
            kind="ghost"
            busy={busy === "publish"}
            aria-label={`Take ${lesson.title} back to a draft`}
            onClick={() => void act("publish", () => client.rpc("publish_lesson", { p_lesson: lesson.id, p_published: false }))}>
            Unpublish
          </Button>
        ) : (
          <Button
            busy={busy === "publish"}
            disabled={sending !== null || status === "processing" || status === "uploading"}
            aria-label={`Publish ${lesson.title}`}
            onClick={() => void act("publish", () => client.rpc("publish_lesson", { p_lesson: lesson.id, p_published: true }), kickJobs)}>
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}
