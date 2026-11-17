// What can appear in a space's Feed.

export type Side = "buy" | "sell";

/**
 * A post as the database gives it to the person asking. A VIP post comes back `locked` for
 * someone without VIP: then only its kind, its time, a post's title or a setup's pair are set.
 */
export interface FeedPost {
  id: string;
  /** "post" is words and maybe a picture. "setup" is a trade idea. "offer" is a pinned deal. */
  kind: "post" | "setup" | "offer";
  audience: "everyone" | "vip";
  locked: boolean;
  title: string | null;
  body: string | null;
  /** Where the picture is in the "posts" file store. */
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** A video or post from YouTube, X, Instagram or Facebook. Free posts only. */
  embedUrl: string | null;
  pair: string | null;
  side: Side | null;
  /** Prices exactly as the mentor typed them. */
  entry: string | null;
  stop: string | null;
  targets: string[] | null;
  /** The mentor's own word on how a setup went. */
  updateNote: string | null;
  updateAt: string | null;
  closed: boolean;
  /** An offer's link. */
  linkUrl: string | null;
  linkLabel: string | null;
  createdAt: string;
  edited: boolean;
}

/** The mentor is live right now. Always shown first. */
export interface LiveItem {
  id: string;
  title: string;
  note: string;
}

/** A new lesson was added to Learn. */
export interface LessonItem {
  id: string;
  title: string;
  /** When it was added, already worded for display: "2 days ago". */
  when: string;
}
