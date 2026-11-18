import "server-only";

// Settings only Floor's server may read. They come from web/.env.local on a developer's
// computer and from the project's settings on Vercel. None of them ever reaches a browser or
// a phone: this file cannot be imported from code that runs there.

/** Supabase's secret key. With it the server passes every access rule, so it is used sparingly. */
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/** The video host for lessons: a Bunny Stream library. */
export const BUNNY = {
  /** Where Bunny's API lives. Only the walk-throughs point this somewhere else. */
  api: (process.env.BUNNY_STREAM_API_URL ?? "https://video.bunnycdn.com").replace(/\/+$/, ""),
  libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? "",
  /** The library's own API key, from Stream > the library > API. */
  apiKey: process.env.BUNNY_STREAM_API_KEY ?? "",
  /** The library's delivery address, such as https://vz-1a2b3c4d-5e6.b-cdn.net. */
  cdn: withScheme(process.env.BUNNY_STREAM_CDN_HOST ?? ""),
  /** The key that signs playback addresses, from the library's Security page. */
  tokenKey: process.env.BUNNY_STREAM_TOKEN_KEY ?? "",
  /** A long random word of our own. Bunny's webhook address ends with it. */
  webhookKey: process.env.BUNNY_STREAM_WEBHOOK_KEY ?? "",
};

export const videoConfigured = BUNNY.libraryId !== "" && BUNNY.apiKey !== "" && BUNNY.cdn !== "" && BUNNY.tokenKey !== "";

/**
 * A long random word of our own. Vercel sends it with every run of the timer that sweeps the
 * job queue, which is how the route knows the call is Vercel's.
 */
export const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** "vz-1.b-cdn.net" and "https://vz-1.b-cdn.net/" both become "https://vz-1.b-cdn.net". */
function withScheme(host: string): string {
  const clean = host.trim().replace(/\/+$/, "");
  if (clean === "") return "";
  return /^https?:\/\//.test(clean) ? clean : `https://${clean}`;
}
