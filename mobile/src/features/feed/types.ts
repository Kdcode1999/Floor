// What can appear in a space's Feed.

export type Side = "buy" | "sell";

/** The mentor is live right now. Always shown first. */
export interface LiveItem {
  kind: "live";
  id: string;
  title: string;
  note: string;
}

/** A trade idea: the pair, the direction and the three prices. */
export interface SetupItem {
  kind: "setup";
  id: string;
  pair: string;
  side: Side;
  note: string;
  entry: string;
  stop: string;
  target: string;
  /** When it was posted, already worded for display: "12 min ago". */
  when: string;
}

export interface PostItem {
  kind: "post";
  id: string;
  title: string;
  when: string;
}

/** A new lesson was added to Learn. */
export interface LessonItem {
  kind: "lesson";
  id: string;
  title: string;
  when: string;
}

export type FeedItem = LiveItem | SetupItem | PostItem | LessonItem;
