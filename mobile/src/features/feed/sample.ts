import type { FeedPost, LessonItem, LiveItem } from "./types";

// Sample content, shown only on the sample space so the screens can be looked at with no setup.

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const blank: Omit<FeedPost, "id" | "kind" | "createdAt"> = {
  audience: "vip",
  locked: false,
  title: null,
  body: null,
  imagePath: null,
  imageWidth: null,
  imageHeight: null,
  embedUrl: null,
  pair: null,
  side: null,
  entry: null,
  stop: null,
  targets: null,
  updateNote: null,
  updateAt: null,
  closed: false,
  linkUrl: null,
  linkLabel: null,
  edited: false,
};

export const sampleLive: LiveItem = {
  id: "live-1",
  title: "London session",
  note: "Live trading, recorded as it goes.",
};

export const sampleLesson: LessonItem = { id: "lesson-1", title: "Stops that make sense", when: "2 days ago" };

export const samplePosts: FeedPost[] = [
  {
    ...blank,
    id: "setup-1",
    kind: "setup",
    pair: "EURUSD",
    side: "buy",
    body: "Waiting for the retest of the breakout level.",
    entry: "1.0850",
    stop: "1.0810",
    targets: ["1.0930"],
    createdAt: ago(12),
  },
  { ...blank, id: "post-1", kind: "post", title: "Why I skipped gold today", createdAt: ago(26 * 60) },
  {
    ...blank,
    id: "setup-2",
    kind: "setup",
    pair: "GBPJPY",
    side: "sell",
    body: "Sold the rejection at the session high.",
    entry: "191.40",
    stop: "192.10",
    targets: ["189.90"],
    createdAt: ago(3 * 24 * 60),
  },
];
