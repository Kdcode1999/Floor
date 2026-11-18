// The values that connect the web app to its Supabase project, from web/.env.local on a
// developer's computer and from the host's settings when deployed. Both are safe to ship to
// the browser. Next.js copies NEXT_PUBLIC_ values in only when written out in full like this.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** False until the two values above are set. Pages that need the backend then say so. */
export const backendConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** The public address of a space's logo, from its place in the "logos" file store. */
export function logoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

/** Where the web app lives, for links people share. No slash at the end. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/**
 * Where the iPhone web app lives (docs/SETUP.md step 12). There are no store pages: iPhone uses
 * the web app, added to the home screen, and Android downloads the app from /download.
 */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

/**
 * Where people write to Floor itself: about a suspended space, their data, or anything a mentor
 * cannot settle. Empty until it is set, and pages then leave the address out.
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
