import type { FeedItem } from "./types";

// Sample content, so the screens can be seen before the Feed is connected to the database.
export const sampleFeed: FeedItem[] = [
  {
    kind: "live",
    id: "live-1",
    title: "London session",
    note: "Live trading, recorded as it goes.",
  },
  {
    kind: "setup",
    id: "setup-1",
    pair: "EURUSD",
    side: "buy",
    note: "Waiting for the retest of the breakout level.",
    entry: "1.0850",
    stop: "1.0810",
    target: "1.0930",
    when: "12 min ago",
  },
  { kind: "post", id: "post-1", title: "Why I skipped gold today", when: "Yesterday" },
  { kind: "lesson", id: "lesson-1", title: "Stops that make sense", when: "2 days ago" },
  {
    kind: "setup",
    id: "setup-2",
    pair: "GBPJPY",
    side: "sell",
    note: "Sold the rejection at the session high.",
    entry: "191.40",
    stop: "192.10",
    target: "189.90",
    when: "3 days ago",
  },
];
