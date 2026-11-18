// A space's course as the app shows it.

export type VideoStatus = "none" | "uploading" | "processing" | "ready" | "failed";

export interface OutlineLesson {
  id: string;
  title: string;
  /** How long the video is, in seconds. Null when there is no video or it is not ready. */
  duration: number | null;
  hasVideo: boolean;
  /** How the video is doing. Only staff are told. */
  videoStatus: VideoStatus | null;
  published: boolean;
  /** True for someone without VIP: they see the title, and cannot open the lesson. */
  locked: boolean;
  /** How many seconds in the viewer last was. */
  watched: number;
  completed: boolean;
}

export interface OutlineModule {
  id: string;
  title: string;
  lessons: OutlineLesson[];
}

/** One lesson, opened. */
export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  duration: number | null;
  videoStatus: VideoStatus;
  published: boolean;
}
