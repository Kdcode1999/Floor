// The values that connect the web app to its Supabase project, from web/.env.local on a
// developer's computer and from the host's settings when deployed. Both are safe to ship to
// the browser. Next.js copies NEXT_PUBLIC_ values in only when written out in full like this.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** False until the two values above are set. Pages that need the backend then say so. */
export const backendConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** Where the web app lives, for links people share. No slash at the end. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

/** Store pages for the phone app. Empty until the app is in the stores. */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "";
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? "";
