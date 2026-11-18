// What the apps know about classes and live sessions. Mirrors what the database's live
// functions give.

/** "scheduled" is a class to come. "live" is on right now. "ended" is over. */
export type ClassState = "live" | "scheduled" | "ended";

/** How keeping a session as a lesson is going. */
export type RecordingStatus = "none" | "recording" | "saving" | "saved" | "failed";

/** A class on the schedule, or a session that is on or over, as this person may see it. */
export interface LiveClass {
  id: string;
  title: string;
  /** What the class is about. Null when the mentor wrote nothing, and for someone without VIP. */
  about: string | null;
  /** When it is due. For a session started with nothing scheduled, when it started. */
  startsAt: string;
  state: ClassState;
  startedAt: string | null;
  endedAt: string | null;
  /** True for someone without VIP: they see that it is on, and cannot go in. */
  locked: boolean;
  /** Whether the mentor wants the session kept as a lesson. */
  record: boolean;
  /** Only the mentor and admins are told. */
  recordingStatus: RecordingStatus | null;
  /** The draft lesson the recording became. Only the mentor and admins are told. */
  lessonId: string | null;
}

/** What someone gets when the live room opens for them. */
export interface RoomPass {
  title: string;
  startedAt: string;
  /** The session's own chat. */
  groupId: string;
  /** True for the person broadcasting. */
  isHost: boolean;
  isStaff: boolean;
  /** True while the session is being recorded, which everyone in the room is told. */
  recorded: boolean;
  /** The name shown faintly over the video. */
  viewerName: string;
  /** Where the video service is and the key to this one room. Null in the sample space. */
  video: { url: string; token: string } | null;
  /** In the sample space, the short film that stands in for the stream. */
  sampleFilm: string | null;
}
