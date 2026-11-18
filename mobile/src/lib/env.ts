import { Platform } from "react-native";

// The two values that connect the app to its Supabase project. They come from mobile/.env on a
// developer's computer and from the build settings for store builds. Both are safe to ship.
//
// Expo copies EXPO_PUBLIC_ values into the app when it is built, and only when they are
// written out in full like this.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * False until mobile/.env is filled in. The app then runs on sample content with no sign-in,
 * so the screens can be looked at before any setup.
 */
export const backendConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** Where the web app lives, with no slash at the end. Join links are built from it. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/**
 * Where people write to Floor itself: about a suspended space, their data, or anything a mentor
 * cannot settle. Empty until it is set, and screens then leave the address out.
 */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "";

/**
 * The public half of Floor's key for alerts to the web app. A browser needs it to subscribe.
 * Empty until set, and the web app then says alerts are not available.
 */
export const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** A space's join link: the address a mentor shares. */
export function joinLink(slug: string): string {
  return `${SITE_URL || "https://your-floor-address"}/${slug}`;
}

/** The public address of a space's logo, from its place in the "logos" file store. */
export function logoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

/**
 * True for a phone build made for release without its settings. Such a build must never reach
 * people running on sample content, so it shows an error instead. The web build is only used
 * for checking screens, so it may run on samples.
 */
export const missingSettings = !backendConfigured && !__DEV__ && Platform.OS !== "web";
