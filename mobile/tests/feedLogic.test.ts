import { describe, expect, it } from "vitest";

import { embedPage, youtubePlayer } from "../src/features/feed/embedPage";
import {
  cleanPair,
  cleanPrice,
  embedProblem,
  embedSource,
  feedMessage,
  filledTargets,
  lockedTitle,
  offerProblems,
  postProblems,
  setupProblems,
  splitLinks,
  targetLabel,
  youtubeId,
  type SetupForm,
} from "../src/features/feed/logic";

const buy: SetupForm = { pair: "eurusd", side: "buy", entry: "1.0850", stop: "1.0810", targets: ["1.0930", "", ""], note: "" };
const sell: SetupForm = { pair: "GBPJPY", side: "sell", entry: "191.40", stop: "192.10", targets: ["189.90", "188.50", ""], note: "" };

describe("a setup in the composer", () => {
  it("tidies what was typed", () => {
    expect(cleanPair(" eur usd ")).toBe("EURUSD");
    expect(cleanPair("xau/usd")).toBe("XAU/USD");
    expect(cleanPrice(" 1,950.50 ")).toBe("1950.50");
    expect(filledTargets(["1.09", " ", "1,100"])).toEqual(["1.09", "1100"]);
  });

  it("passes a Buy and a Sell that make sense", () => {
    expect(setupProblems(buy)).toEqual({});
    expect(setupProblems(sell)).toEqual({});
  });

  it("names each missing or malformed part", () => {
    const problems = setupProblems({ pair: "", side: null, entry: "about 1.08", stop: "", targets: ["", "", ""], note: "" });
    expect(Object.keys(problems).sort()).toEqual(["entry", "pair", "side", "stop", "targets"]);
    expect(setupProblems({ ...buy, targets: ["1.09", "soon", ""] }).targets).toBe("Type each target as a price.");
  });

  it("catches a stop on the wrong side of the entry", () => {
    expect(setupProblems({ ...buy, stop: "1.0900" }).stop).toBe("For a Buy, the stop goes below the entry.");
    expect(setupProblems({ ...sell, stop: "190.00" }).stop).toBe("For a Sell, the stop goes above the entry.");
    expect(setupProblems({ ...buy, stop: "1.0850" }).stop).toBeDefined();
  });

  it("catches a target on the wrong side of the entry", () => {
    expect(setupProblems({ ...buy, targets: ["1.0930", "1.0800", ""] }).targets).toBe("For a Buy, targets go above the entry.");
    expect(setupProblems({ ...sell, targets: ["192.00", "", ""] }).targets).toBe("For a Sell, targets go below the entry.");
  });
});

describe("a link to a video or a social post", () => {
  it("knows the four places it may come from", () => {
    expect(embedSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(embedSource("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(embedSource("https://x.com/kay/status/123")).toBe("x");
    expect(embedSource("https://twitter.com/kay/status/123")).toBe("x");
    expect(embedSource("https://www.instagram.com/p/abc/")).toBe("instagram");
    expect(embedSource("https://m.facebook.com/kay/posts/1")).toBe("facebook");
    expect(embedSource("https://fb.watch/abc/")).toBe("facebook");
  });

  it("turns away everything else, including lookalikes", () => {
    expect(embedSource("https://vimeo.com/123")).toBeNull();
    expect(embedSource("http://youtube.com/watch?v=abc123")).toBeNull();
    expect(embedSource("https://youtube.com.evil.example/watch?v=abc123")).toBeNull();
    expect(embedSource("https://evil.example/youtube.com/watch")).toBeNull();
    expect(embedSource("youtube.com/watch?v=abc123")).toBeNull();
  });

  it("finds the video in each shape a YouTube link takes", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?t=10",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(link)).toBe("dQw4w9WgXcQ");
    }
    expect(youtubeId("https://www.youtube.com/@kingsfx")).toBeNull();
    expect(youtubePlayer("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0");
  });

  it("explains a link that cannot be used", () => {
    expect(embedProblem("")).toBeNull();
    expect(embedProblem("https://vimeo.com/123")).toContain("YouTube, X, Instagram or Facebook");
    expect(embedProblem("https://www.youtube.com/@kingsfx")).toContain("no video");
  });

  it("builds the page with each site's own embed code, and never lets a link break out of it", () => {
    expect(embedPage("youtube", "https://youtu.be/dQw4w9WgXcQ", true)).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&amp;rel=0"');
    expect(embedPage("x", "https://x.com/kay/status/1", true)).toContain('href="https://twitter.com/kay/status/1"');
    expect(embedPage("instagram", "https://www.instagram.com/p/abc/", false)).toContain('data-instgrm-permalink="https://www.instagram.com/p/abc/"');
    expect(embedPage("facebook", "https://www.facebook.com/kay/posts/1", false)).toContain("href=https%3A%2F%2Fwww.facebook.com%2Fkay%2Fposts%2F1");
    const nasty = embedPage("x", 'https://x.com/a"><script>alert(1)</script>', false);
    expect(nasty).not.toContain("<script>alert(1)</script>");
  });
});

describe("a post and an offer in the composer", () => {
  const post = { title: "", body: "", embed: "", hasPicture: false, forEveryone: false };

  it("needs something in it", () => {
    expect(postProblems(post).body).toBe("Write something, or add a picture.");
    expect(postProblems({ ...post, hasPicture: true })).toEqual({});
    expect(postProblems({ ...post, title: "Hello" })).toEqual({});
  });

  it("only lets a video or social post into a post for everyone", () => {
    const link = "https://youtu.be/dQw4w9WgXcQ";
    expect(postProblems({ ...post, embed: link, forEveryone: true })).toEqual({});
    expect(postProblems({ ...post, embed: link }).embed).toContain("only go in a post for everyone");
  });

  it("needs a title and a real link for an offer", () => {
    expect(offerProblems({ title: "Free VIP", body: "", link: "https://broker.example/kay", label: "" })).toEqual({});
    const problems = offerProblems({ title: " ", body: "", link: "broker.example", label: "x".repeat(31) });
    expect(Object.keys(problems).sort()).toEqual(["label", "link", "title"]);
  });
});

describe("what the cards say", () => {
  it("names a locked post without giving anything away", () => {
    expect(lockedTitle({ kind: "setup", title: null, pair: "EURUSD" })).toBe("EURUSD setup");
    expect(lockedTitle({ kind: "post", title: "Why I skipped gold", pair: null })).toBe("Why I skipped gold");
    expect(lockedTitle({ kind: "post", title: null, pair: null })).toBe("A post for VIP members");
  });

  it("numbers targets only when there are several", () => {
    expect(targetLabel(0, 1)).toBe("Target");
    expect(targetLabel(1, 3)).toBe("Target 2");
  });

  it("finds the web addresses in a piece of text", () => {
    expect(splitLinks("Read https://example.com/a?b=1, then come back.")).toEqual([
      { text: "Read ", link: false },
      { text: "https://example.com/a?b=1", link: true },
      { text: ", then come back.", link: false },
    ]);
    expect(splitLinks("No links here.")).toEqual([{ text: "No links here.", link: false }]);
    expect(splitLinks("(see https://example.com/x).")[1]).toEqual({ text: "https://example.com/x", link: true });
  });

  it("turns the database's refusals into sentences", () => {
    expect(feedMessage({ message: "too_many_offers" })).toContain("five offers");
    expect(feedMessage({ message: 'new row for relation "posts" violates check constraint "posts_setup"' })).toBe("Check the pair and the prices.");
    expect(feedMessage({ message: "TypeError: Network request failed" })).toContain("Check your connection");
  });
});
