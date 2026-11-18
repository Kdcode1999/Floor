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

/** The notification service: Expo's, which passes alerts on to Apple and Google. */
export const PUSH = {
  /** Where the service lives. Only the walk-throughs point this somewhere else. */
  api: (process.env.EXPO_PUSH_URL ?? "https://exp.host/--/api/v2/push").replace(/\/+$/, ""),
  /** Optional. Set it if "enhanced security for push notifications" is switched on in the Expo account. */
  accessToken: process.env.EXPO_ACCESS_TOKEN ?? "",
};

/**
 * A long random secret of our own, 32 characters or more. Mentors' card processor keys are
 * encrypted with it before they are stored. If it is ever changed, every mentor has to
 * connect their processor again.
 */
export const PAYMENT_KEYS_SECRET = process.env.PAYMENT_KEYS_SECRET ?? "";

/**
 * Test keys take pretend cards, so a space connected with one gives VIP away. Refused unless
 * this is "true", which is for trying payments out before launch.
 */
export const PAYMENTS_ALLOW_TEST_KEYS = process.env.PAYMENTS_ALLOW_TEST_KEYS === "true";

/** Where the card processors' APIs live. Only the walk-throughs point these somewhere else. */
export const PAYSTACK_API = (process.env.PAYSTACK_API_URL ?? "https://api.paystack.co").replace(/\/+$/, "");
export const FLUTTERWAVE_API = (process.env.FLUTTERWAVE_API_URL ?? "https://api.flutterwave.com").replace(/\/+$/, "");

/** Floor's Telegram bot, which posts notices in mentors' channels. */
export const TELEGRAM = {
  /** Where Telegram's API lives. Only the walk-throughs point this somewhere else. */
  api: (process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/+$/, ""),
  /** The bot's token, from @BotFather. Whoever holds it can post as the bot. */
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
};

export const telegramConfigured = TELEGRAM.token !== "";

/**
 * The live video server: LiveKit, run by Floor on a machine it rents (or LiveKit Cloud, which
 * takes the same settings). The key and secret sign the passes that let one person into one room.
 */
export const LIVEKIT = {
  /** Where phones and browsers reach it, such as wss://live.floor.example. */
  url: (process.env.LIVEKIT_URL ?? "").trim().replace(/\/+$/, ""),
  apiKey: process.env.LIVEKIT_API_KEY ?? "",
  apiSecret: process.env.LIVEKIT_API_SECRET ?? "",
};

export const liveConfigured = LIVEKIT.url !== "" && LIVEKIT.apiKey !== "" && LIVEKIT.apiSecret !== "";

/**
 * Where live sessions are recorded: Supabase's file store, through its S3 door (Storage,
 * Settings, S3 Connection). The recorder writes each session to the private `recordings`
 * store, and the file is removed once the video host has it. Leave these empty and sessions
 * are not recorded.
 */
export const RECORDINGS = {
  /** Such as https://abcdefgh.supabase.co/storage/v1/s3 */
  endpoint: (process.env.RECORDINGS_S3_ENDPOINT ?? "").trim(),
  region: process.env.RECORDINGS_S3_REGION ?? "",
  accessKey: process.env.RECORDINGS_S3_ACCESS_KEY ?? "",
  secret: process.env.RECORDINGS_S3_SECRET ?? "",
  bucket: "recordings",
};

export const recordingConfigured = RECORDINGS.endpoint !== "" && RECORDINGS.region !== "" && RECORDINGS.accessKey !== "" && RECORDINGS.secret !== "";

/** The same server's address for Floor's own server to call: https:// in place of wss://. */
export const livekitApi = () => LIVEKIT.url.replace(/^ws(s?):\/\//, "http$1://");

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
