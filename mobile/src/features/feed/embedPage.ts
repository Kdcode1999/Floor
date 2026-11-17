// The small web page that shows a video or a social post inside a free post. No phone code.

import { youtubeId, type EmbedSource } from "./logic";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The address of YouTube's own player for a video. YouTube's rules require using it. */
export function youtubePlayer(link: string): string | null {
  const id = youtubeId(link);
  return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : null;
}

/** Tells the app how tall the page turned out, so the card can fit it. */
const REPORT_HEIGHT = `
  <script>
    (function () {
      var last = 0;
      function report() {
        var height = Math.ceil(document.documentElement.scrollHeight);
        if (height !== last && window.ReactNativeWebView) { last = height; window.ReactNativeWebView.postMessage(String(height)); }
      }
      new MutationObserver(report).observe(document.body, { childList: true, subtree: true, attributes: true });
      window.addEventListener("load", report);
      setInterval(report, 700);
    })();
  </script>`;

/**
 * A page that holds one embed, using each site's own embed code.
 * `dark` picks the dark version where the site offers one.
 */
export function embedPage(source: EmbedSource, link: string, dark: boolean): string {
  const url = escape(link.trim());
  let inner: string;
  if (source === "youtube") {
    inner = `<div class="video"><iframe src="${escape(youtubePlayer(link) ?? "")}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  } else if (source === "x") {
    inner = `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${dark ? "dark" : "light"}"><a href="${url.replace("//x.com/", "//twitter.com/")}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>`;
  } else if (source === "instagram") {
    inner = `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14" style="margin:0;width:100%;min-width:0"></blockquote><script async src="https://www.instagram.com/embed.js"></script>`;
  } else {
    inner = `<iframe class="facebook" src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(link.trim())}&show_text=true&width=500" scrolling="no" allow="encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      .video { position: relative; width: 100%; padding-top: 56.25%; }
      .video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      .facebook { width: 100%; height: 520px; border: 0; }
      .twitter-tweet, .instagram-media { margin: 0 auto !important; }
    </style>
  </head>
  <body>${inner}${source === "youtube" ? "" : REPORT_HEIGHT}</body>
</html>`;
}
